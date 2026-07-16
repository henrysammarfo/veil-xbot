/**
 * Footage discovery + synthesis for OpenMontage / pack — no manual recording required.
 */
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { DATA_DIR, assertDataDir } from "../config.js";
import { getProject } from "../projects/registry.js";
import { captureProductScreenshot } from "../studio/local-ad-compositor.js";
import { hasFfmpeg, runFfmpeg } from "../edit/ffmpeg-util.js";

const VIDEO_EXT = new Set([".mp4", ".webm", ".mov"]);

function walkVideos(dir: string, out: string[]): void {
  if (!existsSync(dir)) return;
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    const p = join(dir, name);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (name === "node_modules" || name.startsWith(".")) continue;
      walkVideos(p, out);
    } else if (VIDEO_EXT.has(extname(name).toLowerCase()) && st.size > 50_000) {
      out.push(p);
    }
  }
}

/** Newest screen recording / export under data/ (or explicit candidates). */
export function discoverLatestFootage(candidates?: string[]): string | undefined {
  const paths: Array<{ path: string; mtime: number }> = [];

  if (candidates?.length) {
    for (const c of candidates) {
      if (c && existsSync(c)) {
        try {
          paths.push({ path: c, mtime: statSync(c).mtimeMs });
        } catch {
          /* */
        }
      }
    }
  }

  const roots = [join(DATA_DIR, "exports"), join(DATA_DIR, "edit"), join(DATA_DIR, "studio"), join(DATA_DIR, "media")];
  const found: string[] = [];
  for (const r of roots) walkVideos(r, found);
  for (const p of found) {
    try {
      paths.push({ path: p, mtime: statSync(p).mtimeMs });
    } catch {
      /* */
    }
  }

  if (!paths.length) return undefined;
  paths.sort((a, b) => b.mtime - a.mtime);
  return paths[0].path;
}

/** Screenshot → 12s silent MP4 for montage when no recording exists. */
export async function synthesizeProductFootage(opts: {
  projectId: string;
  url?: string;
  outPath: string;
  durationSec?: number;
}): Promise<string> {
  assertDataDir();
  const project = getProject(opts.projectId);
  const url = opts.url || project.primaryUrl;
  const dir = join(DATA_DIR, "studio", "footage");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const png = join(dir, `synth-${opts.projectId}-${Date.now()}.png`);
  await captureProductScreenshot({ url, outPath: png, width: 1280, height: 720, waitMs: 3000 });

  if (!hasFfmpeg()) return png;

  const mp4 = opts.outPath;
  const dur = opts.durationSec ?? 12;
  runFfmpeg(
    [
      "-y",
      "-loop",
      "1",
      "-i",
      png,
      "-vf",
      "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,format=yuv420p",
      "-c:v",
      "libx264",
      "-t",
      String(dur),
      "-pix_fmt",
      "yuv420p",
      mp4,
    ],
    "synth-footage",
  );
  return mp4;
}

/** Resolve footage: candidates → data scan → synthesize product capture. */
export async function ensureFootageForMontage(opts: {
  projectId: string;
  url?: string;
  candidates?: string[];
  workDir?: string;
}): Promise<{ path: string; source: "provided" | "discovered" | "synthesized" }> {
  const discovered = discoverLatestFootage(opts.candidates);
  if (discovered) return { path: discovered, source: "discovered" };

  assertDataDir();
  const dir = opts.workDir ?? join(DATA_DIR, "studio", "footage");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const out = join(dir, `montage-${opts.projectId}-${Date.now()}.mp4`);
  const path = await synthesizeProductFootage({
    projectId: opts.projectId,
    url: opts.url,
    outPath: out,
  });
  return { path, source: path.endsWith(".mp4") ? "synthesized" : "synthesized" };
}
