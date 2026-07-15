/**
 * OpenShorts-inspired viral clip extractor + 9:16 reframe.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";
import { DATA_DIR, assertDataDir, hasOpenAI, requireEnv } from "../config.js";
import { newId } from "../store.js";
import {
  hasFfmpeg,
  probeDuration,
  runFfmpeg,
  detectSilences,
} from "./ffmpeg-util.js";
import { transcribeVideo } from "./transcribe.js";
import { ensureWorkDir } from "./ffmpeg-util.js";
import OpenAI from "openai";

export interface ViralMoment {
  startSec: number;
  endSec: number;
  score: number;
  hook: string;
  reason: string;
}

export interface ViralClipJob {
  id: string;
  source: string;
  moments: ViralMoment[];
  clips: Array<{ path: string; moment: ViralMoment; aspect: "9:16" | "16:9" }>;
  status: "done" | "failed";
  log: string[];
}

async function detectMomentsLlm(
  transcript: string,
  durationSec: number,
): Promise<ViralMoment[]> {
  if (!hasOpenAI() || !transcript.trim()) return heuristicMoments(durationSec);
  try {
    const openai = new OpenAI({ apiKey: requireEnv("OPENAI_API_KEY") });
    const res = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are OpenShorts-style viral moment detector. Return JSON:
{"moments":[{"startSec":n,"endSec":n,"score":0-100,"hook":"≤8 words","reason":"..."}]}
Pick 3-6 moments, each 12-45s, within 0..${durationSec}. Prefer proof/hooks/controversy.`,
        },
        { role: "user", content: `Duration ${durationSec}s\n\nTranscript:\n${transcript.slice(0, 6000)}` },
      ],
    });
    const raw = res.choices[0]?.message?.content;
    if (!raw) return heuristicMoments(durationSec);
    const parsed = JSON.parse(raw) as { moments?: ViralMoment[] };
    const moments = (parsed.moments ?? [])
      .filter((m) => m.endSec > m.startSec && m.startSec >= 0 && m.endSec <= durationSec + 1)
      .slice(0, 6);
    return moments.length ? moments : heuristicMoments(durationSec);
  } catch {
    return heuristicMoments(durationSec);
  }
}

function heuristicMoments(durationSec: number): ViralMoment[] {
  const len = Math.min(30, Math.max(12, durationSec * 0.25));
  const out: ViralMoment[] = [
    {
      startSec: 0,
      endSec: Math.min(len, durationSec),
      score: 80,
      hook: "OPENING HOOK",
      reason: "First beat",
    },
  ];
  if (durationSec > len * 2) {
    const mid = durationSec / 2 - len / 2;
    out.push({
      startSec: Math.max(0, mid),
      endSec: Math.min(durationSec, mid + len),
      score: 70,
      hook: "MID PROOF",
      reason: "Center energy",
    });
  }
  if (durationSec > len * 2.5) {
    out.push({
      startSec: Math.max(0, durationSec - len),
      endSec: durationSec,
      score: 65,
      hook: "CLOSING CTA",
      reason: "End punch",
    });
  }
  return out;
}

/** Center-crop / pad to 9:16 (OpenShorts GENERAL reframe). */
export function reframeTo916(input: string, output: string): void {
  runFfmpeg(
    [
      "-y",
      "-i",
      input,
      "-vf",
      "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920",
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-crf",
      "20",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-movflags",
      "+faststart",
      output,
    ],
    "reframe-9x16",
  );
}

export async function extractViralClips(
  inputPath: string,
  opts?: { maxClips?: number; brand?: string },
): Promise<ViralClipJob> {
  const id = newId("clips");
  const log: string[] = [];
  if (!existsSync(inputPath)) {
    return { id, source: inputPath, moments: [], clips: [], status: "failed", log: ["Input missing"] };
  }
  if (!hasFfmpeg()) {
    return { id, source: inputPath, moments: [], clips: [], status: "failed", log: ["ffmpeg required"] };
  }

  assertDataDir();
  const workDir = ensureWorkDir(DATA_DIR, `clips-${id}`);
  const outDir = join(DATA_DIR, "exports", "shorts");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  const durationSec = probeDuration(inputPath);
  log.push(`Source ${durationSec.toFixed(1)}s`);

  let transcriptText = "";
  try {
    const t = await transcribeVideo(inputPath, workDir);
    transcriptText = t?.text ?? "";
    log.push(`Transcript: ${transcriptText ? "yes" : "empty"}`);
  } catch (e) {
    log.push(`Transcript skip: ${e instanceof Error ? e.message : e}`);
  }

  // Scene-ish: silence boundaries as soft cut hints
  try {
    const sil = detectSilences(inputPath, { noiseDb: -32, minDurationSec: 0.4 });
    log.push(`Silence gaps: ${sil.length}`);
  } catch {
    /* optional */
  }

  const moments = (await detectMomentsLlm(transcriptText, durationSec)).slice(
    0,
    opts?.maxClips ?? 4,
  );
  log.push(`Moments: ${moments.length}`);

  const clips: ViralClipJob["clips"] = [];
  const base = basename(inputPath).replace(/\.[^.]+$/, "");

  for (let i = 0; i < moments.length; i++) {
    const m = moments[i];
    const raw = join(workDir, `raw-${i}.mp4`);
    runFfmpeg(
      [
        "-y",
        "-ss",
        String(m.startSec),
        "-to",
        String(m.endSec),
        "-i",
        inputPath,
        "-c:v",
        "libx264",
        "-preset",
        "fast",
        "-crf",
        "20",
        "-c:a",
        "aac",
        raw,
      ],
      `clip-cut-${i}`,
    );
    const vert = join(outDir, `${base}_short${i}_${id}.mp4`);
    reframeTo916(raw, vert);
    clips.push({ path: vert, moment: m, aspect: "9:16" });
    log.push(`Clip ${i}: ${vert} · ${m.hook}`);
  }

  const report = { id, source: inputPath, moments, clips: clips.map((c) => c.path), log };
  writeFileSync(join(outDir, `${id}.json`), JSON.stringify(report, null, 2));

  return { id, source: inputPath, moments, clips, status: clips.length ? "done" : "failed", log };
}

export function formatViralClips(job: ViralClipJob): string {
  return [
    `# OpenShorts-style clips — ${job.status}`,
    ...job.log,
    "",
    "## Moments",
    ...job.moments.map(
      (m) => `- ${m.startSec.toFixed(1)}–${m.endSec.toFixed(1)}s (${m.score}) ${m.hook} — ${m.reason}`,
    ),
    "",
    "## Files",
    ...job.clips.map((c) => `- ${c.path}`),
  ].join("\n");
}
