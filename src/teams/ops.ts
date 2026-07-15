import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR, assertDataDir } from "../config.js";
import { getProject } from "../projects/registry.js";
import { newId } from "../store.js";
import { buildLaunchPack } from "../generate/launch-pack.js";
import { buildCampaign } from "./marketing.js";
import { generateCreative } from "./creative.js";
import { discoverHashtags } from "../discover/hashtags.js";
import { generateEngageFromTrends } from "../generate/engage.js";
import { discoverTrending } from "../discover/trending.js";
import { autoLearn } from "../discover/auto-learn.js";
import { hasTinyfish } from "../research/tinyfish.js";
import { isBrandKey } from "../projects/registry.js";
import type { BrandKey } from "../brands.js";
import { tierReport } from "../studio/tiers.js";
import { adStyleForBrand } from "../edit/styles.js";
import { buildPaidGrowthPack } from "../growth/paid-growth.js";
import { seedGrowthBrain } from "../brain/seed.js";
import { searchSkills, adoptSkillsIntoBrain, ensureGooseVendorLink } from "../skills/catalog.js";
import { learn } from "../brain/self-learn.js";
import { smartCritique, smartStatus } from "../brain/smart.js";

export interface OpsRun {
  id: string;
  projectId: string;
  at: number;
  phases: string[];
  outputPath: string;
}

/**
 * Full growth OS run — marketing + GTM + distribution + creative in one pass.
 * This IS your marketing team for the day.
 */
export async function runGrowthOps(projectId: string): Promise<OpsRun> {
  ensureGooseVendorLink();
  seedGrowthBrain();
  adoptSkillsIntoBrain(100);

  const project = getProject(projectId);
  const phases: string[] = [];
  const skillHits = [
    ...searchSkills("ugc ads meta", 4),
    ...searchSkills("x content launch", 3),
    ...searchSkills("brand research", 2),
  ];
  const sections: string[] = [
    `# GROWTH OPS — ${project.name}`,
    `_${new Date().toISOString()}_`,
    "",
    "## Teams activated",
    "- Marketing (campaign)",
    "- GTM (launch)",
    "- Distribution (trends, engage, hashtags)",
    "- Creative (UGC + clip brief)",
    "- Skills runtime (Goose + HyperFrames catalog)",
    "- Q&A knowledge loaded",
    "",
    "## Skills the bot is using this run",
    ...skillHits.map((s) => `- **${s.slug}** — ${s.description.slice(0, 120)}`),
    "",
  ];

  phases.push("marketing");
  const campaign = await buildCampaign(projectId);
  sections.push("## MARKETING\n", formatCampaignInline(campaign), "");

  if (isBrandKey(projectId)) {
    phases.push("gtm");
    const launch = await buildLaunchPack(projectId);
    sections.push("## GTM / LAUNCH\n", launch.markdown, "");
  }

  phases.push("creative-ugc");
  const ugc = await generateCreative({ project: projectId, kind: "ugc", topic: "testnet proof" });
  sections.push("## CREATIVE — UGC\n", formatCreativeInline(ugc), "");

  phases.push("creative-clip");
  const clip = await generateCreative({ project: projectId, kind: "clip" });
  sections.push("## CREATIVE — CLIP\n", formatCreativeInline(clip), "");

  if (hasTinyfish()) {
    phases.push("distribution");
    if (isBrandKey(projectId)) {
      const tags = await discoverHashtags(projectId);
      sections.push("## DISTRIBUTION — hashtags\n", `Post: ${tags.hashtags.slice(0, 2).join(" ")}\nEngage: ${tags.tags.join(" ")}\n`);
      const trends = await discoverTrending({ limit: 6, brand: projectId as BrandKey });
      if (isBrandKey(projectId)) {
        await generateEngageFromTrends(trends, projectId as BrandKey, 4);
      }
      sections.push("## DISTRIBUTION — engage drafts saved to dashboard\n");
    }
    phases.push("learn");
    if (isBrandKey(projectId)) {
      try {
        await autoLearn({ top: 3, brand: projectId as BrandKey, categories: "all" });
        sections.push("## LEARN — autolearn 3 videos done\n");
      } catch {
        sections.push("## LEARN — skipped (no URLs)\n");
      }
    }
  }

  const adStyle = adStyleForBrand(projectId);
  if (projectId === "magmos") {
    phases.push("paid-growth");
    const growth = buildPaidGrowthPack("magmos");
    sections.push("## PAID GROWTH (blue tick + ads)\n", growth.markdown.slice(0, 2800), "…\n");
  }

  sections.push(
    "## STUDIO",
    tierReport(),
    "",
    projectId === "magmos"
      ? [
          "Magmos ad pipeline (autonomous — no CapCut):",
          "1. Record forge terminal 45–60s",
          `2. \`npm run magmos-ad recording.webm\` — style **${adStyle.id}**`,
          "3. Upload 9:16 to X Ads + organic post first",
          "4. `npm run growth-check magmos` — budget + blue tick checklist",
        ].join("\n")
      : [
          "Run: npm run sandbox " + projectId + " → npm run produce " + projectId + " trailer",
          "1. Record UGC shot list above",
          `2. \`npm run edit-auto recording.mp4 ${projectId}\``,
        ].join("\n"),
    "",
    "Dashboard: npm run serve",
    "",
    "## Realistic media policy",
    "- Autonomous editor: beat-sync, music, VO, b-roll — zero timeline babysitting",
    "- Avatar: NO watermarked AI faces — screen + text hooks",
    "- UGC: founder desk / terminal showing real txs",
  );

  const md = sections.join("\n");
  assertDataDir();
  const dir = join(DATA_DIR, "ops");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const id = newId("ops");
  const outputPath = join(dir, "TODAY.md");
  writeFileSync(outputPath, md);
  writeFileSync(join(dir, `${id}.json`), JSON.stringify({ id, projectId, at: Date.now(), phases }, null, 2));

  const stack = smartStatus();
  learn({
    projectId,
    feature: "ops",
    outcome: "success",
    summary: `ops phases: ${phases.join(",")}`,
    lessons: [
      "Ops should always seed brain + adopt skills before creatives",
      stack.tinyfish
        ? "TinyFish powered distribution/hashtags this run"
        : "Add TINYFISH_API_KEY so ops can trend+engage live",
      `LLM cascade: ${stack.order.join("→") || "none"} — keep Venice+OpenAI healthy`,
    ],
    meta: { id, phases, stack },
  });
  try {
    await smartCritique({
      projectId,
      feature: "ops",
      artifactSummary: md.slice(0, 2500),
    });
  } catch {
    /* best-effort */
  }

  return { id, projectId, at: Date.now(), phases, outputPath };
}

function formatCampaignInline(c: Awaited<ReturnType<typeof buildCampaign>>): string {
  return `${c.positioning}\n\nMessages: ${c.keyMessages.join(" · ")}`;
}

function formatCreativeInline(b: Awaited<ReturnType<typeof generateCreative>>): string {
  return `${b.concept}\nHook: ${b.hookOnScreen}\n${b.shotList.join("\n")}`;
}
