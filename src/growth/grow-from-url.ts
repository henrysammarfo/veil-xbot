/**
 * One connected entrypoint: URL → brain ingest → ads → growth pack → creatives.
 * Footage-optional — queues walkthrough/edit when recording provided.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR, assertDataDir } from "../config.js";
import { newId } from "../store.js";
import { hasTinyfish, tinyfishFetchText, tinyfishSearch } from "../research/tinyfish.js";
import { remember } from "../brain/memory.js";
import { seedGrowthBrain } from "../brain/seed.js";
import { learn } from "../brain/self-learn.js";
import { smartCritique, smartStatus } from "../brain/smart.js";
import { runAdMaker, formatAdMaker } from "../studio/ad-maker.js";
import { buildPaidGrowthPack } from "./paid-growth.js";
import { generateCreative } from "../teams/creative.js";
import { getProject } from "../projects/registry.js";
import { adoptSkillsIntoBrain, ensureGooseVendorLink } from "../skills/catalog.js";

export interface GrowFromUrlResult {
  id: string;
  url: string;
  projectId: string;
  status: "done" | "partial" | "failed";
  outputPath: string;
  log: string[];
}

function hostnameOf(url: string): string {
  try {
    return new URL(url.includes("://") ? url : `https://${url}`).hostname;
  } catch {
    return url;
  }
}

export async function growFromUrl(opts: {
  url: string;
  projectId?: string;
}): Promise<GrowFromUrlResult> {
  const id = newId("grow");
  const log: string[] = [];
  const projectId = opts.projectId || "magmos";
  const url = opts.url.includes("://") ? opts.url : `https://${opts.url}`;
  const domain = hostnameOf(url);

  assertDataDir();
  const dir = join(DATA_DIR, "growth", "grow", id);
  mkdirSync(dir, { recursive: true });

  const seeded = seedGrowthBrain();
  log.push(`Brain seed: ${seeded.counted} entries refreshed`);
  ensureGooseVendorLink();
  const skills = adoptSkillsIntoBrain(80);
  log.push(`Skills adopted into brain: ${skills.adopted}`);

  remember({
    kind: "url",
    title: `Grow target ${domain}`,
    url,
    importance: 4,
    source: "grow-from-url",
    tags: ["grow", projectId, domain],
    body: `User asked full growth OS for ${url}`,
  });

  let pageMd = "";
  if (hasTinyfish()) {
    log.push("[1] TinyFish fetch + search");
    try {
      pageMd = await tinyfishFetchText(url);
      writeFileSync(join(dir, "page.md"), pageMd);
      remember({
        kind: "brand",
        title: `Site digest ${domain}`,
        url,
        importance: 4,
        source: "tinyfish",
        tags: ["brand", domain],
        body: pageMd.slice(0, 3500),
      });
      log.push(`Fetched ${pageMd.length} chars`);
    } catch (e) {
      log.push(`Fetch warn: ${e instanceof Error ? e.message : e}`);
    }
    try {
      const hits = await tinyfishSearch(`${domain} product OR app OR docs`, 6);
      writeFileSync(join(dir, "search.json"), JSON.stringify(hits, null, 2));
      log.push(`Search hits: ${hits.length}`);
    } catch (e) {
      log.push(`Search warn: ${e instanceof Error ? e.message : e}`);
    }
  } else {
    log.push("[1] TinyFish missing — continuing with project registry + Venice");
  }

  log.push("[2] Ad-maker (Branda pattern → Venice images)");
  let adMakerOut = "";
  try {
    const ads = await runAdMaker({ projectId, domain });
    adMakerOut = ads.outputPath;
    log.push(formatAdMaker(ads).split("\n").slice(0, 8).join(" | "));
  } catch (e) {
    log.push(`Ad-maker failed: ${e instanceof Error ? e.message : e}`);
  }

  log.push("[3] Paid growth pack (X/Meta/Google low floors)");
  const paid = buildPaidGrowthPack(projectId);
  log.push(`Paid pack: ${paid.outputPath}`);

  log.push("[4] UGC creative brief");
  let ugcPath = "";
  try {
    const project = getProject(projectId);
    const ugc = await generateCreative({
      project: projectId,
      kind: "ugc",
      topic: `${project.name} — ${domain} — product-first demo UGC`,
    });
    ugcPath = join(dir, "UGC.md");
    writeFileSync(ugcPath, JSON.stringify(ugc, null, 2));
    log.push("UGC brief saved");
  } catch (e) {
    log.push(`UGC brief warn: ${e instanceof Error ? e.message : e}`);
  }

  const md = [
    `# GROW — ${domain}`,
    `_id ${id}_`,
    ``,
    `Project: **${projectId}**`,
    `URL: ${url}`,
    ``,
    `## Log`,
    ...log.map((l) => `- ${l}`),
    ``,
    `## Artifacts`,
    adMakerOut ? `- Ad maker: ${adMakerOut}` : "",
    `- Paid growth: ${paid.outputPath}`,
    ugcPath ? `- UGC: ${ugcPath}` : "",
    pageMd ? `- Page digest: ${join(dir, "page.md")}` : "",
    ``,
    `## Next (one connected pipe)`,
    "```bash",
    `# Record live product then:`,
    `npm run walkthrough ${projectId}   # Venice presenter PiP + HyperFrames`,
    `npm run magmos-ad recording.mp4    # CapCut-class master + export-ads`,
    `npm run engage-batch 5 ${projectId}`,
    "```",
  ]
    .filter(Boolean)
    .join("\n");

  const outputPath = join(dir, "GROW.md");
  writeFileSync(outputPath, md);
  writeFileSync(join(dir, "RESULT.json"), JSON.stringify({ id, url, projectId, log }, null, 2));

  const status: GrowFromUrlResult["status"] = adMakerOut || paid.outputPath ? "done" : "partial";
  const stack = smartStatus();
  const lessons = [
    adMakerOut ? "Ad-maker stills ready — push to X static before paid video" : "Ad-maker empty — check Venice image + TinyFish domain",
    stack.tinyfish ? "TinyFish live research worked for brand digest" : "Set TINYFISH_API_KEY for live site research",
    `Smart stack: ${stack.order.join("→") || "none"}`,
  ];
  learn({
    projectId,
    feature: "grow",
    outcome: status === "done" ? "success" : "partial",
    summary: `grow ${url} → ads=${Boolean(adMakerOut)} paid=${Boolean(paid.outputPath)}`,
    errors: log.filter((l) => /fail|warn/i.test(l)).slice(0, 8),
    lessons,
    meta: { id, url, stack },
  });
  try {
    await smartCritique({
      projectId,
      feature: "grow",
      artifactSummary: md.slice(0, 2500),
      errors: log.filter((l) => /fail/i.test(l)),
    });
  } catch {
    /* critique best-effort */
  }

  return {
    id,
    url,
    projectId,
    status,
    outputPath,
    log,
  };
}

export function formatGrow(r: GrowFromUrlResult): string {
  return [`# Grow — ${r.status}`, r.url, `Out: ${r.outputPath}`, "", ...r.log].join("\n");
}
