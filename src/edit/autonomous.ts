/**
 * Autonomous Editor — CapCut-class short-form, zero handoff.
 * Whisper → beat-grid cuts → dead-space → music bed → VO → b-roll → captions → MP4.
 */
import { existsSync } from "node:fs";
import type { BrandKey } from "../brands.js";
import type { EditStyleId } from "./styles.js";
import { styleForBrand } from "./styles.js";
import {
  buildManifestFromFootage,
  saveManifest,
  formatManifestForHuman,
  type EditManifest,
} from "./manifest.js";
import { analyzeFootage } from "./analyze-footage.js";
import { planBeatGrid, cutsFromBeatGrid } from "./beat-grid.js";
import { renderEditorV2 } from "./render.js";
import { ensureWorkDir, hasFfmpeg, isVideoFile } from "./ffmpeg-util.js";
import { DATA_DIR, assertDataDir } from "../config.js";
import { loadLatestEditRecipe } from "../discover/auto-learn.js";
import { generateVoiceover } from "./voiceover.js";
import { estimateBrollPackUsd } from "./venice-broll.js";
import { hasVenice } from "../integrations/venice.js";
import { resolveMusicPath, queueMusicIfMissing } from "./music-mix.js";
import { buildEdl, saveEdl, formatEdl } from "./edl.js";
import { selfEvalRender, formatSelfEval } from "./self-eval.js";
import { hasVoicebox } from "../integrations/voicebox.js";
import { join } from "node:path";
import type { AutoEditOptions, EditJob } from "./pipeline.js";

export interface AutonomousEditOptions extends AutoEditOptions {
  beatSync?: boolean;
  autoMusic?: boolean;
  musicVolume?: number;
}

function applyBeatSync(manifest: EditManifest, inputPath: string, styleId?: EditStyleId): EditManifest {
  const style = styleForBrand(manifest.brand, styleId ?? manifest.style);
  const grid = planBeatGrid(inputPath, manifest.durationSec, style);
  const beatCuts = cutsFromBeatGrid(grid.beats, style, manifest.durationSec);

  const energyCuts = manifest.cuts.filter((c) => c.note?.includes("energy"));
  manifest.cuts = [...beatCuts, ...energyCuts].sort((a, b) => a.atSec - b.atSec);
  manifest.bpm = grid.bpm;
  manifest.renderNotes.push(`Beat grid: ${grid.source} · ${grid.beats.length} beats @ ${grid.bpm} BPM`);
  return manifest;
}

/**
 * Full autonomous edit — better than CapCut for screen POV: no timeline babysitting.
 */
export async function autonomousEdit(
  inputPath: string,
  brand: BrandKey = "magmos",
  style?: EditStyleId,
  opts?: AutonomousEditOptions,
): Promise<EditJob> {
  if (!existsSync(inputPath)) throw new Error(`Input not found: ${inputPath}`);
  if (!isVideoFile(inputPath)) throw new Error(`Not a video file: ${inputPath}`);
  if (!hasFfmpeg()) throw new Error("ffmpeg required — install and add to PATH");

  assertDataDir();
  const recipe = loadLatestEditRecipe() ?? undefined;
  const workDir = ensureWorkDir(DATA_DIR, `auto-${Date.now()}`);

  const analysis = await analyzeFootage(inputPath, workDir, brand);
  let manifest = buildManifestFromFootage(analysis, brand, style, inputPath);

  if (opts?.beatSync !== false) {
    manifest = applyBeatSync(manifest, inputPath, style);
  }

  saveManifest(manifest);

  const useVeniceBroll = opts?.veniceBroll !== false && hasVenice();
  let veniceBrollUsd = 0;
  if (useVeniceBroll && manifest.broll.length) {
    veniceBrollUsd = await estimateBrollPackUsd(manifest.broll, {
      projectId: opts?.projectId ?? brand,
      tier: opts?.veniceTier,
      videoModel: opts?.veniceVideoModel,
    });
  }

  let voiceoverPath: string | undefined;
  let voiceoverScript: string | undefined;
  if (opts?.voiceover !== false && (hasVenice() || hasVoicebox())) {
    const vo = await generateVoiceover(manifest, workDir, opts?.launchBrief, {
      force: opts?.voiceoverForce,
      projectId: opts?.projectId ?? brand,
    });
    voiceoverScript = vo.script;
    voiceoverPath = vo.path;
  }

  const edl = buildEdl({
    analysis,
    manifest,
    keepSegments: analysis.keepSegments,
    fillersRemoved: analysis.fillersRemoved,
  });
  const edlPath = saveEdl(edl);

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
    musicPath: opts?.autoMusic !== false ? resolveMusicPath(manifest.style) ?? undefined : undefined,
    musicVolume: opts?.musicVolume,
  });

  if (opts?.autoMusic !== false && !resolveMusicPath(manifest.style)) {
    const { queued } = queueMusicIfMissing(manifest.style);
    if (queued) {
      render.log += "\nMusic: Suno prompt queued — drop beat at assets/music/beat.mp3 and re-run";
    }
  }

  const evalResult = selfEvalRender(render.outputPath, edl);
  const log = [
    formatManifestForHuman(manifest),
    "---",
    formatEdl(edl),
    `EDL: ${edlPath}`,
    "---",
    render.log,
    "---",
    formatSelfEval(evalResult),
  ].join("\n");

  return {
    id: render.id,
    inputPath,
    outputPath: render.outputPath,
    manifest,
    status: render.status === "done" && evalResult.ok ? "done" : render.status === "done" ? "done" : "failed",
    log,
    analysisPath: workDir,
    voiceoverScript,
    veniceBrollUsd: useVeniceBroll ? veniceBrollUsd : undefined,
  };
}

/** Re-render from saved manifest — fast revise loop without re-analyzing. */
export async function renderFromSavedManifest(
  inputPath: string,
  manifest: EditManifest,
): Promise<EditJob> {
  assertDataDir();
  const workDir = ensureWorkDir(DATA_DIR, `revise-${Date.now()}`);
  const analysis = await analyzeFootage(inputPath, workDir, manifest.brand);

  const render = await renderEditorV2(inputPath, {
    analysis,
    manifest,
    musicPath: resolveMusicPath(manifest.style) ?? undefined,
  });

  return {
    id: render.id,
    inputPath,
    outputPath: render.outputPath,
    manifest,
    status: render.status === "done" ? "done" : "failed",
    log: render.log,
    analysisPath: workDir,
  };
}
