import { execSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, unlinkSync } from "node:fs";
import { join, extname } from "node:path";

export interface VideoProbe {
  durationSec: number;
  width: number;
  height: number;
  fps: number;
}

export function hasFfmpeg(): boolean {
  try {
    execSync("ffmpeg -version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export function probeDuration(input: string): number {
  try {
    const out = execSync(
      `ffprobe -v error -show_entries format=duration -of csv=p=0 "${input}"`,
      { encoding: "utf8" },
    );
    return Math.max(0.5, parseFloat(out.trim()) || 30);
  } catch {
    return 30;
  }
}

export function probeVideo(input: string): VideoProbe {
  const durationSec = probeDuration(input);
  let width = 1080;
  let height = 1920;
  let fps = 30;
  try {
    const out = execSync(
      `ffprobe -v error -select_streams v:0 -show_entries stream=width,height,r_frame_rate -of csv=p=0 "${input}"`,
      { encoding: "utf8" },
    );
    const [w, h, rate] = out.trim().split(",");
    width = parseInt(w, 10) || width;
    height = parseInt(h, 10) || height;
    if (rate?.includes("/")) {
      const [n, d] = rate.split("/").map(Number);
      if (d) fps = Math.round(n / d) || fps;
    }
  } catch {
    /* defaults */
  }
  return { durationSec, width, height, fps };
}

export function runFfmpeg(args: string[], label = "ffmpeg"): void {
  const proc = spawnSync("ffmpeg", args, {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  if (proc.status !== 0) {
    const tail = proc.stderr?.slice(-2000) ?? "unknown error";
    throw new Error(`${label} failed: ${tail}`);
  }
}

export function escFilterPath(p: string): string {
  return p.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

export function hasAudioStream(input: string): boolean {
  try {
    const out = execSync(
      `ffprobe -v error -select_streams a:0 -show_entries stream=codec_type -of csv=p=0 "${input}"`,
      { encoding: "utf8" },
    );
    return out.trim().length > 0;
  } catch {
    return false;
  }
}

/** Normalize webm/mov → h264 mp4 working copy. */
export function normalizeToMp4(input: string, output: string): void {
  const audioArgs = hasAudioStream(input)
    ? (["-c:a", "aac", "-b:a", "192k"] as const)
    : (["-an"] as const);
  runFfmpeg(
    [
      "-y",
      "-i",
      input,
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-crf",
      "20",
      ...audioArgs,
      "-movflags",
      "+faststart",
      output,
    ],
    "normalize",
  );
}

export function extractAudio(input: string, outputWav: string): void {
  runFfmpeg(
    [
      "-y",
      "-i",
      input,
      "-vn",
      "-acodec",
      "pcm_s16le",
      "-ar",
      "16000",
      "-ac",
      "1",
      outputWav,
    ],
    "extract-audio",
  );
}

export function extractFrame(input: string, atSec: number, outputPng: string): void {
  runFfmpeg(
    ["-y", "-ss", String(Math.max(0, atSec)), "-i", input, "-frames:v", "1", "-q:v", "2", outputPng],
    "extract-frame",
  );
}

export interface SilenceGap {
  start: number;
  end: number;
  duration: number;
}

/** Parse ffmpeg silencedetect stderr output. */
export function detectSilences(
  input: string,
  opts?: { noiseDb?: number; minDurationSec?: number },
): SilenceGap[] {
  if (!hasAudioStream(input)) return [];
  const noise = opts?.noiseDb ?? -35;
  const minDur = opts?.minDurationSec ?? 0.55;
  const proc = spawnSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-i",
      input,
      "-af",
      `silencedetect=noise=${noise}dB:d=${minDur}`,
      "-f",
      "null",
      "-",
    ],
    { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
  );
  const log = [proc.stderr, proc.stdout].filter(Boolean).join("\n");
  const gaps: SilenceGap[] = [];
  let start: number | null = null;
  for (const line of log.split("\n")) {
    const s = line.match(/silence_start:\s*([\d.]+)/);
    const e = line.match(/silence_end:\s*([\d.]+)/);
    if (s) start = parseFloat(s[1]);
    if (e && start !== null) {
      const end = parseFloat(e[1]);
      gaps.push({ start, end, duration: end - start });
      start = null;
    }
  }
  return gaps;
}

export function ensureWorkDir(base: string, jobId: string): string {
  const dir = join(base, "edit", jobId);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

export function isVideoFile(p: string): boolean {
  return [".mp4", ".webm", ".mov", ".mkv"].includes(extname(p).toLowerCase());
}

/** Concat demuxer — segments must share codec params (re-encode if needed). */
export function concatSegments(segmentPaths: string[], output: string, withAudio = true): void {
  const listPath = output + ".concat.txt";
  writeFileSync(
    listPath,
    segmentPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n"),
  );
  const audioArgs = withAudio
    ? (["-c:a", "aac", "-b:a", "192k"] as const)
    : (["-an"] as const);
  try {
    runFfmpeg(
      [
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        listPath,
        "-c:v",
        "libx264",
        "-preset",
        "fast",
        "-crf",
        "20",
        ...audioArgs,
        "-movflags",
        "+faststart",
        output,
      ],
      "concat",
    );
  } finally {
    try {
      unlinkSync(listPath);
    } catch {
      /* ok */
    }
  }
}
