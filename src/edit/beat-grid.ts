import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import type { CutPoint } from "./manifest.js";
import type { EditStyleDef } from "./styles.js";
import { hasAudioStream } from "./ffmpeg-util.js";

/** Beat timestamps from BPM — CapCut-style grid. */
export function bpmBeatGrid(durationSec: number, bpm: number, offsetSec = 0): number[] {
  const interval = 60 / bpm;
  const beats: number[] = [];
  for (let t = Math.max(0, offsetSec); t < durationSec - 0.15; t += interval) {
    beats.push(Number(t.toFixed(3)));
  }
  return beats;
}

/** Parse ffmpeg silencedetect in reverse — loud peaks ≈ beat hits. */
export function detectLoudPeaks(inputPath: string, durationSec: number): number[] {
  if (!hasAudioStream(inputPath)) return [];
  try {
    const stderr = execSync(
      `ffmpeg -hide_banner -i "${inputPath}" -af silencedetect=noise=-28dB:d=0.08 -f null -`,
      { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
    );
    const ends: number[] = [];
    for (const line of stderr.split("\n")) {
      const m = line.match(/silence_end:\s*([\d.]+)/);
      if (m) ends.push(parseFloat(m[1]));
    }
    const peaks = ends.filter((t) => t > 0.2 && t < durationSec - 0.2);
    if (peaks.length >= 3) return peaks.slice(0, 24);
  } catch {
    /* no audio peaks */
  }
  return [];
}

export interface BeatGridPlan {
  bpm: number;
  beats: number[];
  source: "bpm" | "audio" | "hybrid";
}

export function planBeatGrid(
  inputPath: string,
  durationSec: number,
  style: EditStyleDef,
): BeatGridPlan {
  const bpmBeats = bpmBeatGrid(durationSec, style.bpm);
  const audioPeaks = existsSync(inputPath) ? detectLoudPeaks(inputPath, durationSec) : [];

  if (!audioPeaks.length) {
    return { bpm: style.bpm, beats: bpmBeats, source: "bpm" };
  }

  const hybrid: number[] = [0];
  const interval = 60 / style.bpm;
  for (let t = 0; t < durationSec; t += interval) {
    const nearest = audioPeaks.find((p) => Math.abs(p - t) < interval * 0.35);
    hybrid.push(nearest ?? t);
  }
  const unique = [...new Set(hybrid.map((b) => Number(b.toFixed(2))))].sort((a, b) => a - b);
  return { bpm: style.bpm, beats: unique, source: "hybrid" };
}

/** Replace fixed-interval cuts with beat-locked CapCut-style punches. */
export function cutsFromBeatGrid(beats: number[], style: EditStyleDef, durationSec: number): CutPoint[] {
  const cuts: CutPoint[] = [
    {
      atSec: 0,
      type: "zoom-punch",
      scale: style.id === "anime-hype" || style.id === "magmos-forge" ? 1.18 : 1.14,
      note: "hook punch",
    },
  ];

  beats.forEach((t, i) => {
    if (t < 0.35 || t >= durationSec - 1.2) return;
    if (cuts.some((c) => Math.abs(c.atSec - t) < 0.25)) return;

    const type =
      i % 6 === 0
        ? "flash-frame"
        : i % 4 === 0
          ? "speed-ramp"
          : i % 2 === 0
            ? "zoom-punch"
            : "hard-cut";

    cuts.push({
      atSec: t,
      type,
      scale: type === "zoom-punch" ? 1.1 + (i % 3) * 0.02 : undefined,
      durationSec: type === "speed-ramp" ? 0.4 : type === "flash-frame" ? 0.05 : undefined,
      note: `beat ${i + 1}`,
    });
  });

  return cuts.sort((a, b) => a.atSec - b.atSec);
}
