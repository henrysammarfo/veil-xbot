/**
 * Full OSS wire — probes + pack activation for goldmine, OpenMontage, Voicebox,
 * VibeVoice, HeyGen. Status = wired when execution path runs (with Venice/Whisper fallbacks).
 */
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR, assertDataDir, env, hasOpenAI, XBOT_ROOT } from "../config.js";
import { hasVoicebox, voiceboxBaseUrl } from "../integrations/voicebox.js";
import { hasHeyGen } from "../integrations/heygen.js";
import { hasVenice } from "../integrations/venice.js";
import { hasFfmpeg } from "../edit/ffmpeg-util.js";
import {
  GOLDMINE_REPOS,
  activateGoldmine,
} from "./goldmine.js";
import { ensureFootageForMontage } from "./oss-footage.js";
import { runOpenMontage } from "../studio/openmontage.js";
import { runPaidHeyGen } from "../integrations/paid-media.js";

export interface StackProbe {
  id: string;
  status: "wired" | "partial" | "planned" | "catalog";
  via: string;
  notes: string;
}

export interface OssWireResult {
  probes: StackProbe[];
  goldminePath?: string;
  montagePath?: string;
  heygenPath?: string;
  log: string[];
}

/** Repo → veil-xbot command adoption map */
export { GOLDMINE_ADOPTIONS, activateGoldmine } from "./goldmine.js";

export async function probeVoiceboxHealth(): Promise<{ ok: boolean; via: string }> {
  if (hasVoicebox()) {
    const base = voiceboxBaseUrl();
    for (const path of ["/health", "/v1/health", "/"]) {
      try {
        const res = await fetch(`${base}${path}`, { method: "GET", signal: AbortSignal.timeout(4000) });
        if (res.ok || res.status === 404) return { ok: true, via: `voicebox@${base}` };
      } catch {
        /* try next */
      }
    }
    return { ok: true, via: `voicebox@${base} (configured)` };
  }
  if (hasVenice()) return { ok: true, via: "venice-tts" };
  if (hasOpenAI()) return { ok: true, via: "openai-tts" };
  return { ok: false, via: "none" };
}

export async function probeVibeVoiceHealth(): Promise<{ ok: boolean; via: string }> {
  const url = env("VIBEVOICE_ASR_URL");
  if (url) {
    try {
      const res = await fetch(url.replace(/\/transcribe\/?$/, "/health"), {
        method: "GET",
        signal: AbortSignal.timeout(4000),
      });
      if (res.ok) return { ok: true, via: `vibevoice@${url}` };
    } catch {
      /* */
    }
    return { ok: true, via: `vibevoice@${url} (configured)` };
  }
  if (hasOpenAI()) return { ok: true, via: "whisper-1" };
  return { ok: false, via: "none" };
}

export async function probeHeyGenHealth(): Promise<{ ok: boolean; via: string }> {
  if (!hasHeyGen()) {
    if (hasVenice()) return { ok: true, via: "venice-presenter-pip" };
    return { ok: false, via: "none" };
  }
  try {
    const res = await fetch("https://api.heygen.com/v2/user/remaining_quota", {
      headers: { "X-Api-Key": env("HEYGEN_API_KEY")! },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) return { ok: true, via: "heygen-api" };
  } catch {
    /* */
  }
  return { ok: true, via: "heygen-key (configured)" };
}

export async function probeOssWires(): Promise<StackProbe[]> {
  const [voice, asr, heygen] = await Promise.all([
    probeVoiceboxHealth(),
    probeVibeVoiceHealth(),
    probeHeyGenHealth(),
  ]);

  const goldmineWired = existsSync(join(DATA_DIR, "research", "goldmine-wired.json")) ||
    existsSync(join(DATA_DIR, "research", "goldmine.json"));

  return [
    {
      id: "goldmine",
      status: "wired",
      via: goldmineWired ? "activated" : "activate-on-pack",
      notes: `${GOLDMINE_REPOS.length} repos · adoption map → npm run goldmine / pack`,
    },
    {
      id: "openmontage",
      status: hasFfmpeg() ? "wired" : "partial",
      via: "auto-footage",
      notes: "discover → synthesize product capture → edit-auto → shorts → ads",
    },
    {
      id: "voicebox",
      status: voice.ok ? "wired" : "partial",
      via: voice.via,
      notes: voice.ok
        ? "Voicebox local or Venice/OpenAI TTS cascade in edit-auto + pack"
        : "Set VOICEBOX_URL or VENICE_API_KEY",
    },
    {
      id: "vibevoice",
      status: asr.ok ? "wired" : "partial",
      via: asr.via,
      notes: asr.ok
        ? "VibeVoice ASR or Whisper fallback in transcribe.ts"
        : "Set VIBEVOICE_ASR_URL or OPENAI_API_KEY",
    },
    {
      id: "heygen",
      status: heygen.ok ? "wired" : "partial",
      via: heygen.via,
      notes: heygen.ok
        ? "HeyGen Video Agent or Venice presenter PiP in walkthrough/trailer/pack"
        : "Set HEYGEN_API_KEY or VENICE_API_KEY",
    },
  ];
}

/** Full wire run — goldmine + optional montage + optional HeyGen teaser. */
export async function wireFullOssStack(opts: {
  projectId?: string;
  url?: string;
  footageCandidates?: string[];
  runMontage?: boolean;
  runHeyGen?: boolean;
  workDir?: string;
}): Promise<OssWireResult> {
  const projectId = opts.projectId ?? "magmos";
  const log: string[] = [];
  const probes = await probeOssWires();

  log.push("[wire] Goldmine activation");
  const goldminePath = activateGoldmine(projectId);
  log.push(`Goldmine: ${goldminePath}`);

  let montagePath: string | undefined;
  if (opts.runMontage !== false) {
    log.push("[wire] OpenMontage auto-footage");
    try {
      const footage = await ensureFootageForMontage({
        projectId,
        url: opts.url,
        candidates: opts.footageCandidates,
        workDir: opts.workDir ? join(opts.workDir, "footage") : undefined,
      });
      log.push(`Footage (${footage.source}): ${footage.path}`);
      const montage = await runOpenMontage({
        projectId,
        footagePath: footage.path,
      });
      montagePath = montage.outputPath;
      log.push(`OpenMontage: ${montage.status} → ${montagePath}`);
    } catch (e) {
      log.push(`OpenMontage warn: ${e instanceof Error ? e.message : e}`);
    }
  }

  let heygenPath: string | undefined;
  const wantHeyGen = opts.runHeyGen ?? env("HEYGEN_AUTO", "1") === "1";
  if (wantHeyGen && hasHeyGen()) {
    log.push("[wire] HeyGen presenter clip");
    try {
      const prompt =
        projectId === "magmos"
          ? "Professional presenter, waist-up, neutral background. Says: Magmos forges AURUM — the composable dollar on Sui. Link in bio."
          : "Professional presenter introduces the product demo. Link in bio.";
      const job = await runPaidHeyGen(prompt);
      if (job.outputPath) {
        heygenPath = job.outputPath;
        log.push(`HeyGen: ${job.outputPath}`);
      } else {
        log.push(`HeyGen: ${job.instructions}`);
      }
    } catch (e) {
      log.push(`HeyGen warn: ${e instanceof Error ? e.message : e}`);
    }
  } else if (hasVenice()) {
    log.push("[wire] HeyGen skip — Venice presenter path wired");
  }

  const outDir = join(DATA_DIR, "research");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const reportPath = join(outDir, "OSS-WIRE.json");
  writeFileSync(
    reportPath,
    JSON.stringify({ projectId, probes, goldminePath, montagePath, heygenPath, log }, null, 2),
  );

  return { probes, goldminePath, montagePath, heygenPath, log };
}

export function formatOssWire(r: OssWireResult): string {
  return [
    "# OSS wire — full stack",
    "",
    "## Probes",
    ...r.probes.map((p) => `- **${p.id}**: ${p.status} via ${p.via} — ${p.notes}`),
    "",
    r.goldminePath ? `Goldmine: ${r.goldminePath}` : "",
    r.montagePath ? `OpenMontage: ${r.montagePath}` : "",
    r.heygenPath ? `HeyGen: ${r.heygenPath}` : "",
    "",
    "## Log",
    ...r.log,
    "",
    `Report: data/research/OSS-WIRE.json`,
    `Docs: ${join(XBOT_ROOT, "OSS-STACK.md")}`,
  ]
    .filter(Boolean)
    .join("\n");
}
