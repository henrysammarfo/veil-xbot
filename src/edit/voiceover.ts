/**
 * Venice TTS voiceover — judge-ready narration, segmented sync for 3-min demos.
 */
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { hasVenice, veniceTextToSpeech } from "../integrations/venice.js";
import { hasOpenAI, requireEnv } from "../config.js";
import OpenAI from "openai";
import type { EditManifest } from "./manifest.js";
import type { SortedLaunch } from "../studio/sort-launch.js";
import type { VeilDemoBeat } from "../studio/veil-3min-script.js";
import { probeDuration, runFfmpeg } from "./ffmpeg-util.js";

export interface VoiceoverPlan {
  script: string;
  path?: string;
  usd?: number;
  segments?: Array<{ startSec: number; path: string; durationSec: number }>;
}

export function buildVoiceoverScript(
  manifest: EditManifest,
  launch?: SortedLaunch | null,
): string {
  const hook =
    launch?.script30s?.hook3s ??
    manifest.hookLine ??
    manifest.captions.find((c) => c.style === "hook")?.text ??
    "";
  const cta =
    launch?.script30s?.cta ??
    manifest.captions.find((c) => c.style === "cta")?.text ??
    "Link in bio.";

  const beats = launch?.script30s?.beats?.slice(0, 4) ?? [];
  const body = beats.length
    ? beats.map((b) => b.onScreen ?? b.visual).filter(Boolean).join(". ")
    : "Real screen recording. Live product. No mockups.";

  const dur = Math.round(manifest.durationSec);
  if (dur <= 15) {
    return `${hook}. ${body}. ${cta}`.replace(/\s+/g, " ").trim();
  }
  if (dur >= 120) {
    return `${hook}. ${body}. This is the real Veil app on Sui testnet — stealth execution, Kelly sizing, TEE-attested fills, live DeepBook Predict mint. ${cta}`.replace(
      /\s+/g,
      " ",
    );
  }
  return `${hook}. ${body}. This is the real app on testnet. ${cta}`.replace(/\s+/g, " ").trim();
}

export async function generateVoiceover(
  manifest: EditManifest,
  workDir: string,
  launch?: SortedLaunch | null,
  opts?: { force?: boolean; projectId?: string },
): Promise<VoiceoverPlan> {
  const script = buildVoiceoverScript(manifest, launch);

  // Prefer Voicebox local TTS when configured
  try {
    const { hasVoicebox, voiceboxTextToSpeech } = await import("../integrations/voicebox.js");
    if (hasVoicebox()) {
      const vb = await voiceboxTextToSpeech(script, { outName: `vo-vb-${manifest.id}.mp3` });
      return { script, path: vb.path };
    }
  } catch (e) {
    console.warn("Voicebox:", e instanceof Error ? e.message : e);
  }

  if (!hasVenice()) {
    return { script };
  }

  try {
    const { path, usd } = await veniceTextToSpeech(script, {
      outName: `vo-${manifest.id}.mp3`,
      force: opts?.force,
      projectId: opts?.projectId,
    });
    return { script, path, usd };
  } catch (e) {
    console.warn("Voiceover TTS:", e instanceof Error ? e.message : e);
    return { script };
  }
}

/** Per-beat TTS — each segment aligned to timeline startSec. */
async function ttsSegment(
  text: string,
  outName: string,
  opts?: { force?: boolean; projectId?: string },
): Promise<{ path: string; usd: number }> {
  if (hasVenice()) {
    try {
      return await veniceTextToSpeech(text, {
        outName,
        force: opts?.force,
        projectId: opts?.projectId,
      });
    } catch (e) {
      console.warn("Venice TTS fallback:", e instanceof Error ? e.message : e);
    }
  }
  if (!hasOpenAI()) throw new Error("No TTS provider");
  const openai = new OpenAI({ apiKey: requireEnv("OPENAI_API_KEY") });
  const res = await openai.audio.speech.create({
    model: "tts-1-hd",
    voice: "onyx",
    input: text,
  });
  const buf = Buffer.from(await res.arrayBuffer());
  const { DATA_DIR, assertDataDir } = await import("../config.js");
  assertDataDir();
  const dir = join(DATA_DIR, "exports", "venice");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const path = join(dir, outName);
  writeFileSync(path, buf);
  return { path, usd: 0.015 };
}

/** Trim or speed up a segment so it fits its beat window — prevents VO overlap. */
function fitSegmentToWindow(input: string, output: string, maxSec: number): number {
  const dur = probeDuration(input);
  if (dur <= maxSec + 0.05) {
    runFfmpeg(["-y", "-i", input, "-c", "copy", output], "vo-fit-copy");
    return dur;
  }
  if (dur / maxSec <= 2.0) {
    runFfmpeg(
      ["-y", "-i", input, "-filter:a", `atempo=${(dur / maxSec).toFixed(4)}`, output],
      "vo-fit-atempo",
    );
    return probeDuration(output);
  }
  runFfmpeg(["-y", "-i", input, "-t", maxSec.toFixed(3), "-c", "copy", output], "vo-fit-trim");
  return probeDuration(output);
}

export async function generateSegmentedVoiceover(
  beats: VeilDemoBeat[],
  workDir: string,
  opts?: { force?: boolean; projectId?: string; targetDurationSec?: number },
): Promise<VoiceoverPlan> {
  const script = beats.map((b) => b.narration).join(" ");
  if (!hasVenice() && !hasOpenAI()) {
    return { script };
  }

  if (!existsSync(workDir)) mkdirSync(workDir, { recursive: true });
  const segments: Array<{ startSec: number; path: string; durationSec: number }> = [];
  let totalUsd = 0;
  const totalSec = opts?.targetDurationSec ?? beats[beats.length - 1]?.endSec ?? 180;

  for (let i = 0; i < beats.length; i++) {
    const b = beats[i];
    const nextStart = beats[i + 1]?.startSec ?? totalSec;
    const windowSec = Math.max(1.2, nextStart - b.startSec - 0.55);

    try {
      const { path, usd } = await ttsSegment(b.narration, `vo-seg-${i}.mp3`, {
        force: opts?.force,
        projectId: opts?.projectId,
      });
      const rawPath = join(workDir, `vo-seg-${i}-raw.mp3`);
      const segPath = join(workDir, `vo-seg-${i}.mp3`);
      if (path !== rawPath && existsSync(path)) {
        writeFileSync(rawPath, readFileSync(path));
      } else if (existsSync(path)) {
        writeFileSync(rawPath, readFileSync(path));
      }
      let fittedDur = fitSegmentToWindow(
        existsSync(rawPath) ? rawPath : path,
        segPath,
        windowSec,
      );
      fittedDur = Math.min(fittedDur, windowSec);
      totalUsd += usd;
      segments.push({ startSec: b.startSec, path: segPath, durationSec: fittedDur });
      console.log(
        `  VO segment ${i + 1}/${beats.length} @${b.startSec.toFixed(1)}s (${fittedDur.toFixed(1)}s / ${windowSec.toFixed(1)}s window)`,
      );
    } catch (e) {
      console.warn(`VO segment ${i}:`, e instanceof Error ? e.message : e);
    }
  }

  if (!segments.length) {
    return { script };
  }

  const combined = join(workDir, "voiceover-combined.mp3");
  mixSegmentsToTimeline(segments, combined, totalSec);

  return { script, path: combined, usd: totalUsd, segments };
}

/** Mix timed segments onto silent bed with adelay. */
function mixSegmentsToTimeline(
  segments: Array<{ startSec: number; path: string; durationSec: number }>,
  output: string,
  totalSec: number,
): void {
  const inputs = segments.flatMap((s) => ["-i", s.path]);
  const chains: string[] = [];
  const mixLabels: string[] = [];

  segments.forEach((s, i) => {
    const delayMs = Math.round(s.startSec * 1000);
    const maxDur = Math.max(0.5, s.durationSec).toFixed(3);
    chains.push(
      `[${i}:a]atrim=0:${maxDur},asetpts=PTS-STARTPTS,adelay=${delayMs}|${delayMs},volume=1.0[v${i}]`,
    );
    mixLabels.push(`[v${i}]`);
  });

  const filter =
    chains.join(";") +
    `;${mixLabels.join("")}amix=inputs=${segments.length}:duration=first:dropout_transition=0:normalize=0,apad=pad_dur=${totalSec}[aout]`;

  const proc = spawnSync(
    "ffmpeg",
    ["-y", ...inputs, "-filter_complex", filter, "-map", "[aout]", "-t", String(totalSec), output],
    { encoding: "utf8" },
  );
  if (proc.status !== 0) {
    throw new Error(`VO mix failed: ${proc.stderr?.slice(-800)}`);
  }
}
