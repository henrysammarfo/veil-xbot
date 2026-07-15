import { existsSync } from "node:fs";
import { loadLatestEditRecipe } from "../discover/auto-learn.js";
import type { BrandKey } from "../brands.js";
import type { EditStyleId } from "./styles.js";
import {
  buildManifestFromFootage,
  saveManifest,
  formatManifestForHuman,
  generateEditManifest,
  type EditManifest,
} from "./manifest.js";
import { renderEditorV2 } from "./render.js";
import { analyzeFootage } from "./analyze-footage.js";
import { ensureWorkDir, hasFfmpeg, isVideoFile } from "./ffmpeg-util.js";
import { DATA_DIR, assertDataDir } from "../config.js";
import { estimateBrollPackUsd } from "./venice-broll.js";
import { generateVoiceover } from "./voiceover.js";
import type { SortedLaunch } from "../studio/sort-launch.js";
import { hasVenice } from "../integrations/venice.js";

export interface EditJob {
  id: string;
  inputPath: string;
  outputPath: string;
  manifest: EditManifest;
  status: "done" | "failed";
  log: string;
  analysisPath?: string;
  voiceoverScript?: string;
  veniceBrollUsd?: number;
}

export interface AutoEditOptions {
  hyperframesMp4?: string;
  skipAnalysis?: boolean;
  /** Venice Kling/Veo/Seedance b-roll */
  veniceBroll?: boolean;
  veniceTier?: string;
  veniceVideoModel?: string;
  veniceForce?: boolean;
  /** Venice TTS voiceover */
  voiceover?: boolean;
  voiceoverForce?: boolean;
  launchBrief?: SortedLaunch | null;
  projectId?: string;
}

export async function planEdit(
  brand: BrandKey,
  style?: EditStyleId,
  topic?: string,
): Promise<EditManifest> {
  return generateEditManifest({ brand, style, durationSec: 45, topic });
}

/**
 * Editor v2 — Whisper → dead-space → Venice b-roll + VO → zoom/captions/SFX → MP4.
 */
export async function autoEdit(
  inputPath: string,
  brand: BrandKey = "veil",
  style?: EditStyleId,
  opts?: AutoEditOptions,
): Promise<EditJob> {
  if (!existsSync(inputPath)) throw new Error(`Input not found: ${inputPath}`);
  if (!isVideoFile(inputPath)) throw new Error(`Not a video file: ${inputPath}`);
  if (!hasFfmpeg()) {
    throw new Error("ffmpeg required for Editor v2 — install ffmpeg and add to PATH");
  }

  assertDataDir();
  const recipe = loadLatestEditRecipe() ?? undefined;
  const workDir = ensureWorkDir(DATA_DIR, `job-${Date.now()}`);

  const analysis = await analyzeFootage(inputPath, workDir, brand);
  const manifest = buildManifestFromFootage(analysis, brand, style, inputPath);
  saveManifest(manifest);

  const useVeniceBroll = opts?.veniceBroll !== false && hasVenice();
  let veniceBrollUsd = 0;
  if (useVeniceBroll && manifest.broll.length) {
    veniceBrollUsd = await estimateBrollPackUsd(manifest.broll, {
      projectId: opts?.projectId ?? brand,
      tier: opts?.veniceTier,
      videoModel: opts?.veniceVideoModel,
    });
    console.log(`Venice b-roll estimate: ~$${veniceBrollUsd.toFixed(2)} (${manifest.broll.length} slots)`);
  }

  let voiceoverPath: string | undefined;
  let voiceoverScript: string | undefined;
  if (opts?.voiceover !== false && hasVenice()) {
    const vo = await generateVoiceover(manifest, workDir, opts?.launchBrief, {
      force: opts?.voiceoverForce,
      projectId: opts?.projectId ?? brand,
    });
    voiceoverScript = vo.script;
    voiceoverPath = vo.path;
    if (vo.path) console.log(`Voiceover: ${vo.path} (~$${vo.usd?.toFixed(3) ?? "?"})`);
  }

  const render = await renderEditorV2(inputPath, {
    analysis,
    manifest,
    recipe,
    hyperframesMp4: opts?.hyperframesMp4,
    veniceBroll: useVeniceBroll
      ? {
          projectId: opts?.projectId ?? brand,
          tier: opts?.veniceTier,
          videoModel: opts?.veniceVideoModel,
          force: opts?.veniceForce,
          aspectRatio: "9:16",
        }
      : undefined,
    voiceoverPath,
  });

  const log = [formatManifestForHuman(manifest), "---", render.log].join("\n");

  return {
    id: render.id,
    inputPath,
    outputPath: render.outputPath,
    manifest,
    status: render.status === "done" ? "done" : "failed",
    log,
    analysisPath: workDir,
    voiceoverScript,
    veniceBrollUsd: useVeniceBroll ? veniceBrollUsd : undefined,
  };
}

export { formatManifestForHuman };
