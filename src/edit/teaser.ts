import { execSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";
import { DATA_DIR, assertDataDir } from "../config.js";
import { newId } from "../store.js";
import type { BrandKey } from "../brands.js";
import { generateEditManifest } from "./manifest.js";

export interface TeaserJob {
  id: string;
  inputPath: string;
  outputPath: string;
  durationSec: number;
  hookText: string;
  status: "done" | "failed" | "plan_only";
}

function hasFfmpeg(): boolean {
  try {
    execSync("ffmpeg -version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** 12s teaser — hook only, for community post or quote-tweet preview. */
export async function renderTeaser(
  inputPath: string,
  brand: BrandKey,
  hookText?: string,
): Promise<TeaserJob> {
  if (!existsSync(inputPath)) throw new Error(`Input not found: ${inputPath}`);

  const manifest = await generateEditManifest({
    brand,
    durationSec: 12,
    topic: "teaser hook only",
  });
  const hook = hookText ?? manifest.captions[0]?.text ?? "Watch this.";
  const durationSec = 12;

  assertDataDir();
  const outDir = join(DATA_DIR, "exports");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  const id = newId("teaser");
  const outputPath = join(outDir, `${basename(inputPath, ".mp4")}_${brand}_teaser.mp4`);

  const job: TeaserJob = {
    id,
    inputPath,
    outputPath,
    durationSec,
    hookText: hook,
    status: "plan_only",
  };

  if (!hasFfmpeg()) {
    writeFileSync(join(outDir, `${id}.json`), JSON.stringify(job, null, 2));
    return job;
  }

  const vf = `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,drawtext=text='${hook.replace(/'/g, "")}':fontsize=48:fontcolor=white:x=(w-text_w)/2:y=h-200`;
  const proc = spawnSync(
    "ffmpeg",
    ["-y", "-i", inputPath, "-t", "12", "-vf", vf, "-c:v", "libx264", "-preset", "fast", "-an", outputPath],
    { encoding: "utf8" },
  );

  job.status = proc.status === 0 ? "done" : "failed";
  writeFileSync(join(outDir, `${id}.json`), JSON.stringify(job, null, 2));
  return job;
}
