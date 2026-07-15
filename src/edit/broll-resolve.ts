import { existsSync, readdirSync, mkdirSync } from "node:fs";
import { join, basename } from "node:path";
import { XBOT_ROOT, DATA_DIR } from "../config.js";
import { extractFrame, runFfmpeg } from "./ffmpeg-util.js";
import type { BrollSlot } from "./manifest.js";
import {
  generateVeniceBrollClip,
  slotUsesVenice,
  type VeniceBrollOpts,
} from "./venice-broll.js";
import { hasVenice } from "../integrations/venice.js";

export interface ResolvedBroll {
  slot: BrollSlot;
  path: string;
  source: "asset" | "generated" | "hyperframes" | "venice";
}

const VIDEO_EXTS = [".mp4", ".webm", ".mov", ".mkv"];

function listStockClips(): string[] {
  const dirs = [
    join(XBOT_ROOT, "assets", "broll"),
    join(DATA_DIR, "media", "broll"),
    join(DATA_DIR, "media", "broll", "venice"),
    join(DATA_DIR, "clips"),
    join(DATA_DIR, "exports", "venice"),
  ];
  const out: string[] = [];
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      if (VIDEO_EXTS.some((e) => f.toLowerCase().endsWith(e))) {
        out.push(join(dir, f));
      }
    }
  }
  return out;
}

export function generateKenBurnsBroll(
  framePng: string,
  durationSec: number,
  output: string,
  fps = 30,
): void {
  const frames = Math.max(8, Math.ceil(durationSec * fps));
  runFfmpeg(
    [
      "-y",
      "-loop",
      "1",
      "-i",
      framePng,
      "-vf",
      `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,zoompan=z='min(zoom+0.0015,1.25)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=1080x1920:fps=${fps}`,
      "-t",
      String(durationSec),
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-crf",
      "22",
      "-pix_fmt",
      "yuv420p",
      output,
    ],
    "ken-burns",
  );
}

function prepBrollClip(src: string, durationSec: number, output: string): void {
  runFfmpeg(
    [
      "-y",
      "-i",
      src,
      "-t",
      String(durationSec),
      "-vf",
      "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30",
      "-an",
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-crf",
      "22",
      output,
    ],
    "prep-broll",
  );
}

/** Sync resolve — stock / ken-burns only (no Venice API calls). */
export function resolveBrollClips(
  slots: BrollSlot[],
  sourceVideo: string,
  workDir: string,
  hyperframesMp4?: string,
): ResolvedBroll[] {
  if (!existsSync(workDir)) mkdirSync(workDir, { recursive: true });
  const stock = listStockClips();
  let stockIdx = 0;
  const resolved: ResolvedBroll[] = [];

  slots.forEach((slot, i) => {
    const out = join(workDir, `broll-${i}.mp4`);
    if (hyperframesMp4 && existsSync(hyperframesMp4) && i === 0) {
      prepBrollClip(hyperframesMp4, slot.durationSec, out);
      resolved.push({ slot, path: out, source: "hyperframes" });
      return;
    }
    if (stockIdx < stock.length && !slotUsesVenice(slot)) {
      prepBrollClip(stock[stockIdx], slot.durationSec, out);
      stockIdx++;
      resolved.push({ slot, path: out, source: "asset" });
      return;
    }
    const frame = join(workDir, `broll-frame-${i}.png`);
    extractFrame(sourceVideo, slot.atSec + 0.3, frame);
    generateKenBurnsBroll(frame, slot.durationSec, out);
    resolved.push({ slot, path: out, source: "generated" });
  });

  return resolved;
}

/** Async resolve — Venice Kling/Veo/Seedance when configured + credit budget. */
export async function resolveBrollClipsAsync(
  slots: BrollSlot[],
  sourceVideo: string,
  workDir: string,
  opts?: {
    hyperframesMp4?: string;
    venice?: VeniceBrollOpts;
  },
): Promise<ResolvedBroll[]> {
  if (!existsSync(workDir)) mkdirSync(workDir, { recursive: true });
  const stock = listStockClips();
  let stockIdx = 0;
  const resolved: ResolvedBroll[] = [];

  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    const out = join(workDir, `broll-${i}.mp4`);

    if (opts?.hyperframesMp4 && existsSync(opts.hyperframesMp4) && i === 0) {
      prepBrollClip(opts.hyperframesMp4, slot.durationSec, out);
      resolved.push({ slot, path: out, source: "hyperframes" });
      continue;
    }

    if (hasVenice() && slotUsesVenice(slot)) {
      const venicePath = await generateVeniceBrollClip(slot, workDir, i, opts?.venice);
      if (venicePath && existsSync(venicePath)) {
        prepBrollClip(venicePath, slot.durationSec, out);
        resolved.push({ slot, path: out, source: "venice" });
        continue;
      }
    }

    if (stockIdx < stock.length) {
      prepBrollClip(stock[stockIdx], slot.durationSec, out);
      stockIdx++;
      resolved.push({ slot, path: out, source: "asset" });
      continue;
    }

    const frame = join(workDir, `broll-frame-${i}.png`);
    extractFrame(sourceVideo, slot.atSec + 0.3, frame);
    generateKenBurnsBroll(frame, slot.durationSec, out);
    resolved.push({ slot, path: out, source: "generated" });
  }

  return resolved;
}

export function listBrollSources(): string[] {
  return listStockClips().map((p) => basename(p));
}
