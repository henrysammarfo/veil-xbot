import { execSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";
import { DATA_DIR, assertDataDir } from "../config.js";
import { loadLatestEditRecipe, type EditRecipe } from "../discover/auto-learn.js";
import { newId } from "../store.js";
import { queueSunoMusic } from "../media/providers.js";

export interface EditJob {
  id: string;
  inputPath: string;
  outputPath: string;
  recipe: EditRecipe;
  status: "done" | "failed" | "recipe_only";
  log: string;
}

function hasFfmpeg(): boolean {
  try {
    execSync("ffmpeg -version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function buildSrt(recipe: EditRecipe, durationSec: number): string {
  const lines: string[] = [];
  const hooks = recipe.overlayTemplates.length ? recipe.overlayTemplates : recipe.steps;
  let t = 0;
  let i = 0;
  while (t < durationSec - 1 && i < hooks.length) {
    const end = Math.min(t + recipe.hookSeconds, durationSec);
    lines.push(String(i + 1));
    lines.push(`${fmtTime(t)} --> ${fmtTime(end)}`);
    lines.push(hooks[i % hooks.length]);
    lines.push("");
    t = end;
    i++;
  }
  return lines.join("\n");
}

function fmtTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.floor((sec % 1) * 1000);
  return `${pad(h)}:${pad(m)}:${pad(s)},${String(ms).padStart(3, "0")}`;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function probeDuration(input: string): number {
  try {
    const out = execSync(
      `ffprobe -v error -show_entries format=duration -of csv=p=0 "${input}"`,
      { encoding: "utf8" },
    );
    return Math.max(5, parseFloat(out.trim()) || 30);
  } catch {
    return 30;
  }
}

/** Auto-edit screen recording → 9:16 X clip with captions from learned recipe. */
export function autoEdit(inputPath: string, brand: "veil" | "magmos" = "veil"): EditJob {
  if (!existsSync(inputPath)) throw new Error(`Input not found: ${inputPath}`);

  const recipe =
    loadLatestEditRecipe() ?? {
      version: 1,
      aspectRatio: "9:16" as const,
      hookSeconds: 2.5,
      avgCutSeconds: 3,
      captionStyle: "bold lower-third",
      musicMood: "dark cyber minimal",
      overlayTemplates: [
        brand === "veil" ? "Your size is visible on-chain" : "Composable yield-dollar on Sui",
        "Real testnet · not a mockup",
      ],
      steps: ["hook", "demo", "proof", "CTA"],
    };

  assertDataDir();
  const outDir = join(DATA_DIR, "exports");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  const id = newId("edit");
  const srtPath = join(outDir, `${id}.srt`);
  const outputPath = join(outDir, `${basename(inputPath, ".mp4")}_${brand}_x.mp4`);
  const duration = probeDuration(inputPath);
  writeFileSync(srtPath, buildSrt(recipe, Math.min(duration, 45)));

  queueSunoMusic(recipe.musicMood);

  const log: string[] = [`Recipe v${recipe.version}`, `Duration: ${duration}s`, `SRT: ${srtPath}`];

  if (!hasFfmpeg()) {
    log.push("ffmpeg not installed — recipe + SRT saved. Install ffmpeg for auto-render.");
    const job: EditJob = {
      id,
      inputPath,
      outputPath,
      recipe,
      status: "recipe_only",
      log: log.join("\n"),
    };
    writeFileSync(join(DATA_DIR, "exports", `${id}.json`), JSON.stringify(job, null, 2));
    return job;
  }

  // 9:16 crop scale + burned captions + max 45s trim
  const vf = `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,subtitles='${srtPath.replace(/\\/g, "/").replace(/:/g, "\\:")}'`;
  const args = [
    "-y",
    "-i",
    inputPath,
    "-t",
    "45",
    "-vf",
    vf,
    "-c:v",
    "libx264",
    "-preset",
    "fast",
    "-crf",
    "23",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    outputPath,
  ];

  const proc = spawnSync("ffmpeg", args, { encoding: "utf8" });
  if (proc.status !== 0) {
    log.push(proc.stderr?.slice(-800) ?? "ffmpeg failed");
    const job: EditJob = {
      id,
      inputPath,
      outputPath,
      recipe,
      status: "failed",
      log: log.join("\n"),
    };
    writeFileSync(join(DATA_DIR, "exports", `${id}.json`), JSON.stringify(job, null, 2));
    return job;
  }

  log.push(`Output: ${outputPath}`);
  const job: EditJob = {
    id,
    inputPath,
    outputPath,
    recipe,
    status: "done",
    log: log.join("\n"),
  };
  writeFileSync(join(DATA_DIR, "exports", `${id}.json`), JSON.stringify(job, null, 2));
  return job;
}
