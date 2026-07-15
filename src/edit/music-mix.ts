import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runFfmpeg, probeDuration, hasAudioStream } from "./ffmpeg-util.js";
import type { EditStyleId } from "./styles.js";
import { getMusicPlan } from "../generate/music.js";

const xbotRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

export function resolveMusicPath(styleId: EditStyleId): string | null {
  const musicDir = join(xbotRoot, "assets", "music");
  const candidates = [
    join(musicDir, `${styleId}.mp3`),
    join(musicDir, "beat.mp3"),
    join(musicDir, "magmos-forge.mp3"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  if (existsSync(musicDir)) {
    const any = readdirSync(musicDir).find((f) => /\.(mp3|wav|m4a)$/i.test(f));
    if (any) return join(musicDir, any);
  }
  return null;
}

export interface MusicMixOpts {
  musicVolume?: number;
  duckUnderVoice?: number;
  fadeInSec?: number;
  fadeOutSec?: number;
}

/** CapCut-style bed: loop/trim track, duck under VO, fade in/out. */
export function mixBackgroundMusic(
  videoPath: string,
  musicPath: string,
  outputPath: string,
  opts: MusicMixOpts = {},
): void {
  const vol = opts.musicVolume ?? 0.32;
  const duck = opts.duckUnderVoice ?? 0.18;
  const fadeIn = opts.fadeInSec ?? 0.4;
  const fadeOut = opts.fadeOutSec ?? 1.2;
  const dur = probeDuration(videoPath);
  const hasVo = hasAudioStream(videoPath);

  if (!hasVo) {
    runFfmpeg(
      [
        "-y",
        "-i",
        videoPath,
        "-stream_loop",
        "-1",
        "-i",
        musicPath,
        "-filter_complex",
        `[1:a]atrim=0:${dur.toFixed(3)},asetpts=PTS-STARTPTS,volume=${vol},afade=t=in:st=0:d=${fadeIn},afade=t=out:st=${Math.max(0, dur - fadeOut).toFixed(3)}:d=${fadeOut}[mus];[mus]anull[aout]`,
        "-map",
        "0:v",
        "-map",
        "[aout]",
        "-c:v",
        "copy",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-shortest",
        outputPath,
      ],
      "music-only-bed",
    );
    return;
  }

  runFfmpeg(
    [
      "-y",
      "-i",
      videoPath,
      "-stream_loop",
      "-1",
      "-i",
      musicPath,
      "-filter_complex",
      `[1:a]atrim=0:${dur.toFixed(3)},asetpts=PTS-STARTPTS,volume=${vol},afade=t=in:st=0:d=${fadeIn},afade=t=out:st=${Math.max(0, dur - fadeOut).toFixed(3)}:d=${fadeOut}[mus];[0:a]volume=${duck}[vo];[mus][vo]amix=inputs=2:duration=first:dropout_transition=2[aout]`,
      "-map",
      "0:v",
      "-map",
      "[aout]",
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-shortest",
      outputPath,
    ],
    "music-duck-mix",
  );
}

export function ensureMusicDir(): string {
  const dir = join(xbotRoot, "assets", "music");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

export function queueMusicIfMissing(styleId: EditStyleId): { path: string | null; queued: boolean } {
  const existing = resolveMusicPath(styleId);
  if (existing) return { path: existing, queued: false };
  getMusicPlan(styleId);
  return { path: null, queued: true };
}
