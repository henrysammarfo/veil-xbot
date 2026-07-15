/**
 * Venice AI multimodal studio — budget-aware launch packs for any project.
 */
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR, assertDataDir } from "../config.js";
import { getProject } from "../projects/registry.js";
import { chatCompletion } from "../ai/router.js";
import {
  hasVenice,
  veniceGenerateImage,
  veniceTextToSpeech,
  veniceGenerateVideo,
  listVeniceModels,
  formatVeniceStatus,
  veniceQuoteVideo,
} from "../integrations/venice.js";
import {
  formatBudgetReport,
  ledgerRemainingUsd,
  loadLedger,
  estimateTextUsd,
  recordSpend,
} from "../integrations/venice-credits.js";
import {
  VENICE_LAUNCH_PRESETS,
  resolveLaunchTier,
  resolveVideoModel,
  resolveImageModel,
  type VeniceLaunchTier,
} from "../integrations/venice-presets.js";
import { defaultLaunchBrief } from "../studio/eddy-launch.js";

export interface VeniceLaunchAssets {
  projectId: string;
  tier: VeniceLaunchTier;
  hook: string;
  script30s: string;
  imagePath?: string;
  audioPath?: string;
  videoPath?: string;
  spentUsd: number;
  outputDir: string;
  models: { text: string; image: string; tts: string; video?: string };
}

function launchBriefForProject(projectId: string, proofLine?: string) {
  const p = getProject(projectId);
  return defaultLaunchBrief({
    outcomeLine: p.tagline,
    problemLine:
      p.vertical === "web2"
        ? "Teams waste hours on work that should be automatic."
        : "Large orders leak alpha. Everyone sees you coming.",
    solutionLine: p.pillars[0] ?? p.tagline,
    proofShots: proofLine ? [proofLine] : [p.ugcAngle],
    ctaLine: `Try it — ${p.primaryUrl}`,
  });
}

/** Generate launch assets — quotes video before spend, logs to credit ledger. */
export async function produceVeniceLaunch(opts: {
  projectId: string;
  proofLine?: string;
  tier?: VeniceLaunchTier | string;
  image?: boolean;
  audio?: boolean;
  video?: boolean;
  force?: boolean;
  imageModel?: string;
  videoModel?: string;
}): Promise<VeniceLaunchAssets> {
  if (!hasVenice()) {
    throw new Error("Set VENICE_API_KEY (or VERNICE_API_KEY) — https://venice.ai");
  }

  const preset = VENICE_LAUNCH_PRESETS[resolveLaunchTier(opts.tier)];
  const imageModel = resolveImageModel(opts.imageModel, preset);
  const videoModel = resolveVideoModel(opts.videoModel, preset);
  const wantVideo = opts.video ?? preset.includeVideo;

  const project = getProject(opts.projectId);
  const brief = launchBriefForProject(opts.projectId, opts.proofLine);
  const spentBefore = loadLedger().spentUsd;

  const llm = await chatCompletion(
    "launch",
    JSON.stringify({
      project: project.name,
      tagline: project.tagline,
      vertical: project.vertical ?? "other",
      pillars: project.pillars,
      structure: "Hook 3s → Problem → Solution → Proof → CTA",
      task: "Return JSON: hook3s, script30s (spoken VO), imagePrompt, videoPrompt",
    }),
    { context: project.name, provider: "venice" },
  );

  recordSpend(estimateTextUsd(preset.textModel), {
    modality: "text",
    model: preset.textModel,
    note: "launch script",
    projectId: opts.projectId,
  });

  let parsed: {
    hook3s?: string;
    script30s?: string;
    imagePrompt?: string;
    videoPrompt?: string;
  } = {};
  try {
    parsed = JSON.parse(llm.content);
  } catch {
    parsed = {
      hook3s: brief.outcomeLine,
      script30s: `${brief.outcomeLine}. ${brief.problemLine} ${brief.ctaLine}`,
      imagePrompt: `${project.name} launch poster — ${project.tagline}`,
    };
  }

  const hook = parsed.hook3s ?? brief.outcomeLine;
  const script30s = parsed.script30s ?? hook;

  assertDataDir();
  const outputDir = join(DATA_DIR, "studio", "venice", opts.projectId);
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

  const out: VeniceLaunchAssets = {
    projectId: opts.projectId,
    tier: preset.tier,
    hook,
    script30s,
    spentUsd: 0,
    outputDir,
    models: {
      text: preset.textModel,
      image: imageModel,
      tts: preset.ttsModel,
      video: wantVideo ? videoModel : undefined,
    },
  };

  if (opts.image !== false) {
    const imgPrompt =
      parsed.imagePrompt ??
      `Launch poster for ${project.name}: ${hook}. Editorial, outcome-first, no logo splash.`;
    const img = await veniceGenerateImage(imgPrompt, {
      model: imageModel,
      outName: `${opts.projectId}-hook.png`,
      force: opts.force,
      projectId: opts.projectId,
    });
    out.imagePath = img.path;
  }

  if (opts.audio !== false) {
    const tts = await veniceTextToSpeech(script30s.slice(0, 500), {
      model: preset.ttsModel,
      outName: `${opts.projectId}-vo.mp3`,
      force: opts.force,
      projectId: opts.projectId,
    });
    out.audioPath = tts.path;
  }

  if (wantVideo) {
    const vidPrompt =
      parsed.videoPrompt ??
      `Product launch b-roll, opens with on-screen text: ${hook}, authentic screen-recording feel`;
    const vid = await veniceGenerateVideo(vidPrompt, {
      model: videoModel,
      duration: preset.videoDuration,
      resolution: preset.videoResolution,
      force: opts.force,
      projectId: opts.projectId,
    });
    out.videoPath = vid.path;
  }

  out.spentUsd = loadLedger().spentUsd - spentBefore;

  writeFileSync(
    join(outputDir, "manifest.json"),
    JSON.stringify(
      {
        ...out,
        brief,
        preset: preset.label,
        provider: llm.provider,
        model: llm.model,
        ledgerRemaining: ledgerRemainingUsd(),
      },
      null,
      2,
    ),
  );
  writeFileSync(join(outputDir, "LAUNCH-ASSETS.md"), formatVeniceLaunchMd(out, project.name));

  return out;
}

export function formatVeniceLaunchMd(a: VeniceLaunchAssets, name: string): string {
  return [
    `# Venice launch assets — ${name}`,
    formatVeniceStatus(),
    formatBudgetReport(),
    "",
    `Tier: **${a.tier}**`,
    `This run: ~$${a.spentUsd.toFixed(2)}`,
    "",
    `## Hook (first 3s)`,
    a.hook,
    "",
    `## 30s VO script`,
    a.script30s,
    "",
    `## Models`,
    `- Text: ${a.models.text}`,
    `- Image: ${a.models.image}`,
    `- TTS: ${a.models.tts}`,
    a.models.video ? `- Video: ${a.models.video}` : "- Video: skipped",
    "",
    `## Files`,
    a.imagePath ? `- Image: ${a.imagePath}` : "- Image: skipped",
    a.audioPath ? `- Audio: ${a.audioPath}` : "- Audio: skipped",
    a.videoPath ? `- Video: ${a.videoPath}` : "- Video: skipped",
    "",
    `Output dir: ${a.outputDir}`,
  ].join("\n");
}

export async function quoteLaunchPackUsd(opts: {
  tier?: VeniceLaunchTier | string;
  videoModel?: string;
  imageModel?: string;
  includeVideo?: boolean;
}): Promise<{ totalUsd: number; lines: string[] }> {
  const preset = VENICE_LAUNCH_PRESETS[resolveLaunchTier(opts.tier)];
  const imageModel = resolveImageModel(opts.imageModel, preset);
  const videoModel = resolveVideoModel(opts.videoModel, preset);
  const lines: string[] = [];
  let total = 0;

  const textEst = estimateTextUsd(preset.textModel);
  lines.push(`Text (${preset.textModel}): ~$${textEst.toFixed(3)}`);
  total += textEst;

  const { estimateImageUsd, estimateTtsUsd, quoteVideoUsd } = await import(
    "../integrations/venice-credits.js"
  );
  const imgEst = estimateImageUsd(imageModel);
  lines.push(`Image (${imageModel}): ~$${imgEst.toFixed(2)}`);
  total += imgEst;

  const ttsEst = estimateTtsUsd("x".repeat(400), preset.ttsModel);
  lines.push(`TTS (~400 chars): ~$${ttsEst.toFixed(3)}`);
  total += ttsEst;

  if (opts.includeVideo ?? preset.includeVideo) {
    const vid = await quoteVideoUsd({
      model: videoModel,
      duration: preset.videoDuration,
      resolution: preset.videoResolution,
    });
    lines.push(`Video (${videoModel} ${preset.videoDuration}): $${vid.toFixed(2)} (quoted)`);
    total += vid;
  }

  lines.push(`**Estimated total: $${total.toFixed(2)}**`);
  return { totalUsd: total, lines };
}

export { listVeniceModels, formatVeniceStatus, hasVenice, VENICE_LAUNCH_PRESETS, veniceQuoteVideo };
