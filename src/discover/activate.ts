/**
 * Full stack activation — wire every OSS path, adopt skills, seed brain, probe health.
 * Usage: npm run activate  |  npm run activate magmos --full
 */
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR, assertDataDir, XBOT_ROOT, hasOpenAI, env } from "../config.js";
import { ensureGooseVendorBootstrap, gooseStackReady, resolveGooseRoot, videoFormatSkillDir, gooseGraphicsScreenshotPath } from "../skills/paths.js";
import { rebuildSkillCatalog, adoptSkillsIntoBrain } from "../skills/catalog.js";
import { activateGoldmine } from "./goldmine.js";
import { probeLiveOssStackAsync, formatOssStack } from "./oss-stack.js";
import { wireFullOssStack, formatOssWire, probeOssWires } from "./oss-wire.js";
import { probeStack, formatStackProbe } from "../studio/goose-stack.js";
import { hasFfmpeg } from "../edit/ffmpeg-util.js";
import { hasVenice } from "../integrations/venice.js";
import { hasTinyfish } from "../research/tinyfish.js";
import { hasHeyGen } from "../integrations/heygen.js";
import { hasFal } from "../integrations/fal.js";
import { hasVoicebox } from "../integrations/voicebox.js";
import { prepareUnifiedSystem } from "../brain/unified-context.js";
import { seedGrowthBrain } from "../brain/seed.js";
import { learn } from "../brain/self-learn.js";
import { seedCinematicCraft } from "../studio/cinematic-craft.js";
import { evolveHarness } from "../brain/evolve.js";
import { formatCapabilityReport } from "../brain/capabilities.js";

export interface ActivateResult {
  projectId: string;
  gooseRoot: string | null;
  gooseReady: boolean;
  skillsAdopted: number;
  skillCount: number;
  goldminePath: string;
  videoFormats: Record<string, boolean>;
  graphicsShot: boolean;
  oss: Array<{ id: string; status: string; notes: string }>;
  wireLog: string[];
  reportPath: string;
  log: string[];
}

export async function activateFullStack(opts?: {
  projectId?: string;
  fullWire?: boolean;
  adoptLimit?: number;
}): Promise<ActivateResult> {
  assertDataDir();
  const projectId = opts?.projectId ?? "magmos";
  const log: string[] = [];

  log.push("[1/7] Goose vendor bootstrap (ROOT + formats + index)");
  const boot = ensureGooseVendorBootstrap();
  log.push(`  vendor=${boot.vendor}`);
  log.push(`  root=${boot.root ?? "(none)"}`);
  log.push(`  formats=${boot.formatsPath}`);
  log.push(`  index=${existsSync(boot.indexPath) ? "yes" : "missing (agents still work)"}`);
  log.push(`  gooseReady=${gooseStackReady()}`);

  log.push("[2/7] Rebuild skill catalog + adopt into brain");
  const catalog = rebuildSkillCatalog();
  const { adopted } = adoptSkillsIntoBrain(opts?.adoptLimit ?? 100);
  log.push(`  skills=${catalog.count} · adopted=${adopted}`);

  log.push("[3/7] Seed Magmos brain facts + cinematic craft");
  try {
    const s = seedGrowthBrain();
    log.push(`  brain seed OK · ${s.counted} memories`);
  } catch (e) {
    log.push(`  brain seed warn: ${e instanceof Error ? e.message : e}`);
  }
  try {
    const craft = seedCinematicCraft(projectId);
    log.push(`  Higgsfield→Venice craft: ${craft}`);
  } catch (e) {
    log.push(`  craft warn: ${e instanceof Error ? e.message : e}`);
  }

  log.push("[4/7] Goldmine activation");
  const goldminePath = activateGoldmine(projectId);
  log.push(`  ${goldminePath}`);

  log.push("[5/7] Unified context warm");
  try {
    const u = prepareUnifiedSystem({ projectId, task: "activate", feature: "global" });
    log.push(`  skills=${u.skillCatalogCount} brain=${u.brainSeeded} lessons=${u.lessons.length}`);
  } catch (e) {
    log.push(`  unified warn: ${e instanceof Error ? e.message : e}`);
  }

  log.push("[6/7] Live OSS probe + evolve");
  const live = await probeLiveOssStackAsync();
  const wires = await probeOssWires();
  const stack = probeStack();
  try {
    const er = await evolveHarness({ projectId });
    log.push(`  evolve promoted=${er.promoted} scored=${er.consolidated}`);
  } catch (e) {
    log.push(`  evolve warn: ${e instanceof Error ? e.message : e}`);
  }
  log.push(formatCapabilityReport().split("\n").join(" | ").slice(0, 400));

  let wireLog: string[] = [];
  if (opts?.fullWire) {
    log.push("[7/7] Full OSS wire (goldmine + montage optional)");
    const wire = await wireFullOssStack({
      projectId,
      runMontage: env("OPENMONTAGE_AUTO", "1") === "1",
      runHeyGen: env("HEYGEN_AUTO", "0") === "1",
    });
    wireLog = wire.log;
    log.push(...wire.log.map((l) => `  ${l}`));
  } else {
    log.push("[7/7] Quick wire only (use --full for montage/heygen)");
    wireLog = wires.map((w) => `${w.id}: ${w.status} via ${w.via}`);
  }

  const videoFormats = {
    imessage: Boolean(videoFormatSkillDir("imessage")),
    chatgpt: Boolean(videoFormatSkillDir("chatgpt")),
    "apple-notes": Boolean(videoFormatSkillDir("apple-notes")),
  };

  learn({
    projectId,
    feature: "global",
    outcome: "success",
    summary: "Stack activated — goose flat skills + goldmine + formats wired",
    lessons: [
      `gooseRoot=${resolveGooseRoot()} skills=${catalog.count} formats=${Object.values(videoFormats).filter(Boolean).length}/3`,
      "Use npm run pack / ship after activate; never CapCut junk hooks",
    ],
  });

  const result: ActivateResult = {
    projectId,
    gooseRoot: resolveGooseRoot(),
    gooseReady: gooseStackReady(),
    skillsAdopted: adopted,
    skillCount: catalog.count,
    goldminePath,
    videoFormats,
    graphicsShot: Boolean(gooseGraphicsScreenshotPath()),
    oss: live.map((i) => ({ id: i.id, status: i.status, notes: i.notes })),
    wireLog,
    reportPath: "",
    log,
  };

  const outDir = join(DATA_DIR, "research");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const reportPath = join(outDir, "ACTIVATED.json");
  writeFileSync(
    reportPath,
    JSON.stringify(
      {
        ...result,
        at: Date.now(),
        keys: {
          venice: hasVenice(),
          openai: hasOpenAI(),
          tinyfish: hasTinyfish(),
          heygen: hasHeyGen(),
          fal: hasFal(),
          voicebox: hasVoicebox(),
          ffmpeg: hasFfmpeg(),
        },
        stack: {
          gooseRoot: stack.gooseRoot,
          formats: stack.formats,
          skillBodies: stack.skillBodies,
          editEngines: stack.editEngines,
          referenceAds: stack.referenceAds.length,
        },
        docs: join(XBOT_ROOT, "OSS-STACK.md"),
      },
      null,
      2,
    ),
  );
  result.reportPath = reportPath;

  const md = [
    "# Kiln stack — ACTIVATED",
    "",
    `_ ${new Date().toISOString()} · project **${projectId}**_`,
    "",
    `## Goose`,
    `- Root: \`${result.gooseRoot}\``,
    `- Ready: **${result.gooseReady}**`,
    `- goose-graphics screenshot: ${result.graphicsShot}`,
    `- Video formats: iMessage=${videoFormats.imessage} ChatGPT=${videoFormats.chatgpt} Apple Notes=${videoFormats["apple-notes"]}`,
    "",
    `## Skills`,
    `- Catalog: **${result.skillCount}**`,
    `- Adopted into brain: **${result.skillsAdopted}**`,
    "",
    `## Goldmine`,
    `- ${result.goldminePath}`,
    "",
    `## OSS status`,
    ...result.oss.map((o) => `- **${o.id}**: ${o.status} — ${o.notes}`),
    "",
    `## Keys`,
    `- Venice: ${hasVenice()} · OpenAI: ${hasOpenAI()} · TinyFish: ${hasTinyfish()}`,
    `- FFmpeg: ${hasFfmpeg()} · HeyGen: ${hasHeyGen()} · FAL: ${hasFal()} · Voicebox: ${hasVoicebox()}`,
    "",
    `## Log`,
    ...result.log.map((l) => `- ${l}`),
    "",
    "```bash",
    "npm run serve",
    "npm run pack magmos",
    "npm run ship magmos",
    "```",
  ].join("\n");
  writeFileSync(join(outDir, "ACTIVATED.md"), md);

  return result;
}

export function formatActivate(r: ActivateResult): string {
  const lines = [
    "# Stack ACTIVATE — fully wired",
    "",
    `Goose root: ${r.gooseRoot ?? "(missing)"}`,
    `Goose ready: **${r.gooseReady}**`,
    `Skills: ${r.skillCount} indexed · ${r.skillsAdopted} adopted`,
    `Goldmine: ${r.goldminePath}`,
    `goose-graphics: ${r.graphicsShot}`,
    `Video formats: ${JSON.stringify(r.videoFormats)}`,
    "",
    "## OSS",
    ...r.oss.map((o) => `- **${o.id}**: ${o.status}`),
    "",
    "## Log",
    ...r.log,
    "",
    `Report: ${r.reportPath}`,
    `Markdown: data/research/ACTIVATED.md`,
    "",
    formatStackProbe(probeStack()).slice(0, 800),
  ];
  return lines.join("\n");
}

// re-export table for activate console
export { formatOssStack };
