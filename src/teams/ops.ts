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
import { tierReport } from "../studio/tiers.js";

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
  const project = getProject(projectId);
  const phases: string[] = [];
  const sections: string[] = [
    `# GROWTH OPS — ${project.name}`,
    `_${new Date().toISOString()}_`,
    "",
    "## Teams activated",
    "- Marketing (campaign)",
    "- GTM (launch)",
    "- Distribution (trends, engage, hashtags)",
    "- Creative (UGC + clip brief)",
    "- Q&A knowledge loaded",
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
      const trends = await discoverTrending({ limit: 6, brand: projectId });
      if (isBrandKey(projectId)) {
        await generateEngageFromTrends(trends, projectId, 4);
      }
      sections.push("## DISTRIBUTION — engage drafts saved to dashboard\n");
    }
    phases.push("learn");
    if (isBrandKey(projectId)) {
      try {
        await autoLearn({ top: 3, brand: projectId, categories: "all" });
        sections.push("## LEARN — autolearn 3 videos done\n");
      } catch {
        sections.push("## LEARN — skipped (no URLs)\n");
      }
    }
  }

  sections.push(
    "## STUDIO",
    tierReport(),
    "",
    "Run: npm run sandbox " + projectId + " → fix bugs → npm run produce " + projectId + " trailer",
    "",
    "1. Record UGC shot list above",
    "2. `npm run edit recording.mp4 " + projectId + "`",
    "3. Post video → `npm run qa " + projectId + ' "question"` for replies',
    "4. Dashboard: npm run serve",
    "",
    "## Realistic media policy",
    "- Clips: screen POV + Pexels b-roll (bot finds URLs)",
    "- Avatar: NO watermarked AI faces — screen + text hooks",
    "- UGC: founder desk / phone showing real app",
  );

  const md = sections.join("\n");
  assertDataDir();
  const dir = join(DATA_DIR, "ops");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const id = newId("ops");
  const outputPath = join(dir, "TODAY.md");
  writeFileSync(outputPath, md);
  writeFileSync(join(dir, `${id}.json`), JSON.stringify({ id, projectId, at: Date.now(), phases }, null, 2));

  return { id, projectId, at: Date.now(), phases, outputPath };
}

function formatCampaignInline(c: Awaited<ReturnType<typeof buildCampaign>>): string {
  return `${c.positioning}\n\nMessages: ${c.keyMessages.join(" · ")}`;
}

function formatCreativeInline(b: Awaited<ReturnType<typeof generateCreative>>): string {
  return `${b.concept}\nHook: ${b.hookOnScreen}\n${b.shotList.join("\n")}`;
}
