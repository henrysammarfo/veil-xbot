/**
 * One connected entrypoint: URL → research → full fleet pack (ads, video, UGC, GTM, engage).
 * With VENICE + OPENAI + TINYFISH + ffmpeg: production link-drop path.
 */
import { writeFileSync, mkdirSync, copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR, assertDataDir } from "../config.js";
import { newId } from "../store.js";
import { hasTinyfish, tinyfishFetchText, tinyfishSearch } from "../research/tinyfish.js";
import { remember } from "../brain/memory.js";
import { learn } from "../brain/self-learn.js";
import { smartCritique, smartStatus } from "../brain/smart.js";
import { prepareUnifiedSystem } from "../brain/unified-context.js";
import { runAdMaker, formatAdMaker } from "../studio/ad-maker.js";
import { buildPaidGrowthPack } from "./paid-growth.js";
import { generateCreative } from "../teams/creative.js";
import { getProject } from "../projects/registry.js";
import { produceFullPack, formatProducePack } from "./produce-pack.js";
import { runGrowthOps } from "../teams/ops.js";
import { seedCinematicCraft } from "../studio/cinematic-craft.js";
import { evolveHarness } from "../brain/evolve.js";
import { blockersForFleet, formatCapabilityReport, keyStack } from "../brain/capabilities.js";

export interface GrowFromUrlResult {
  id: string;
  url: string;
  projectId: string;
  status: "done" | "partial" | "failed";
  outputPath: string;
  packDir?: string;
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
  /** Skip full pack (ads-only research) */
  light?: boolean;
}): Promise<GrowFromUrlResult> {
  const id = newId("grow");
  const log: string[] = [];
  const projectId = opts.projectId || "magmos";
  const url = opts.url.includes("://") ? opts.url : `https://${opts.url}`;
  const domain = hostnameOf(url);

  assertDataDir();
  const dir = join(DATA_DIR, "growth", "grow", id);
  mkdirSync(dir, { recursive: true });

  log.push(formatCapabilityReport().split("\n").slice(0, 12).join(" · "));
  const blockers = blockersForFleet();
  if (blockers.length) {
    log.push(`Blockers (will still run best-effort): ${blockers.join(", ")}`);
  }

  const craftPath = seedCinematicCraft(projectId);
  log.push(`Craft: ${craftPath}`);

  const unified = prepareUnifiedSystem({ projectId, task: "grow", feature: "grow" });
  writeFileSync(join(dir, "UNIFIED.md"), unified.promptBlock.slice(0, 12000));
  log.push(
    `Unified OS: skills ${unified.skillCatalogCount} · brain ${unified.brainSeeded} · lessons ${unified.lessons.length}`,
  );

  remember({
    kind: "url",
    title: `Grow target ${domain}`,
    url,
    importance: 5,
    source: "grow-from-url",
    tags: ["grow", "fleet", projectId, domain],
    body: `Fleet growth for ${url} — ads + video + UGC + GTM`,
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
        importance: 5,
        source: "tinyfish",
        tags: ["brand", domain, "fleet"],
        body: pageMd.slice(0, 4000),
      });
      log.push(`Fetched ${pageMd.length} chars`);
    } catch (e) {
      log.push(`Fetch warn: ${e instanceof Error ? e.message : e}`);
    }
    try {
      const hits = await tinyfishSearch(`${domain} product OR app OR waitlist OR pricing`, 8);
      writeFileSync(join(dir, "search.json"), JSON.stringify(hits, null, 2));
      log.push(`Search hits: ${hits.length}`);
    } catch (e) {
      log.push(`Search warn: ${e instanceof Error ? e.message : e}`);
    }
  } else {
    log.push("[1] TinyFish missing — set TINYFISH_API_KEY for live site research");
  }

  // Fast ad stills (also runs inside pack — kept for early artifact)
  log.push("[2] Ad-maker (Goose stack + Venice)");
  let adMakerOut = "";
  try {
    const ads = await runAdMaker({ projectId, domain });
    adMakerOut = ads.outputPath;
    log.push(formatAdMaker(ads).split("\n").slice(0, 6).join(" | "));
  } catch (e) {
    log.push(`Ad-maker failed: ${e instanceof Error ? e.message : e}`);
  }

  log.push("[3] Paid growth floors");
  const paid = buildPaidGrowthPack(projectId);
  log.push(`Paid: ${paid.outputPath}`);

  log.push("[4] UGC brief");
  let ugcPath = "";
  try {
    const project = getProject(projectId);
    const ugc = await generateCreative({
      project: projectId,
      kind: "ugc",
      topic: `${project.name} — ${domain} — 9:16 product-first UGC, phone screen, plain English`,
    });
    ugcPath = join(dir, "UGC.md");
    writeFileSync(ugcPath, JSON.stringify(ugc, null, 2));
  } catch (e) {
    log.push(`UGC warn: ${e instanceof Error ? e.message : e}`);
  }

  // FULL FLEET pack — thriller, site ads, formats, engage, quality gate
  let packDir: string | undefined;
  if (!opts.light) {
    log.push("[5] FLEET pack (ads + Venice video + UGC + engage + quality)");
    try {
      const pack = await produceFullPack({ projectId, url });
      packDir = pack.packDir;
      writeFileSync(join(dir, "PACK-LOG.md"), formatProducePack(pack));
      log.push(`Pack ${pack.status} → ${pack.packDir}`);
      // copy quality report if present
      const q = join(pack.packDir, "QUALITY.md");
      if (existsSync(q)) {
        copyFileSync(q, join(dir, "QUALITY.md"));
      }
    } catch (e) {
      log.push(`Pack fail: ${e instanceof Error ? e.message : e}`);
    }
  }

  // GTM / ops daily doc
  log.push("[6] Growth ops / GTM");
  try {
    const ops = await runGrowthOps(projectId);
    log.push(`Ops → ${ops.outputPath}`);
    writeFileSync(join(dir, "OPS-PATH.txt"), ops.outputPath);
  } catch (e) {
    log.push(`Ops warn: ${e instanceof Error ? e.message : e}`);
  }

  const keys = keyStack();
  const status: GrowFromUrlResult["status"] =
    packDir && adMakerOut && keys.triple
      ? "done"
      : packDir || adMakerOut
        ? "partial"
        : "failed";

  const md = [
    `# FLEET GROW — ${domain}`,
    `_id ${id}_ · **${status}**`,
    ``,
    `Project: **${projectId}**`,
    `URL: ${url}`,
    ``,
    formatCapabilityReport(),
    ``,
    `## Log`,
    ...log.map((l) => `- ${l}`),
    ``,
    `## Artifacts`,
    adMakerOut ? `- Ad maker: ${adMakerOut}` : "",
    `- Paid growth: ${paid.outputPath}`,
    ugcPath ? `- UGC: ${ugcPath}` : "",
    packDir ? `- Full pack: ${packDir}` : "",
    pageMd ? `- Page: ${join(dir, "page.md")}` : "",
    ``,
    `## Operator paste`,
    "Open dashboard `npm run serve` → copy posts/ads from pack + GROW.md",
  ]
    .filter(Boolean)
    .join("\n");

  const outputPath = join(dir, "GROW.md");
  writeFileSync(outputPath, md);
  writeFileSync(
    join(dir, "RESULT.json"),
    JSON.stringify({ id, url, projectId, status, packDir, log }, null, 2),
  );

  learn({
    projectId,
    feature: "grow",
    outcome: status === "done" ? "success" : status === "partial" ? "partial" : "fail",
    summary: `fleet grow ${url} pack=${Boolean(packDir)} ads=${Boolean(adMakerOut)}`,
    errors: log.filter((l) => /fail|warn|Blockers/i.test(l)).slice(0, 10),
    lessons: [
      "Drop URL → fleet: research → ads → Venice thriller → site ads → UGC → ops → quality",
      keys.triple
        ? "3 keys live — media partials only if ffmpeg missing"
        : "Set VENICE + OPENAI + TINYFISH for full fleet",
      "Higgsfield MCSLA craft drives Venice video prompts",
    ],
    meta: { id, url, packDir, keys },
  });

  try {
    await evolveHarness({
      projectId,
      trajectory: {
        feature: "grow",
        summary: md.slice(0, 2000),
        outcome: status === "done" ? "success" : status === "partial" ? "partial" : "fail",
        errors: log.filter((l) => /fail/i.test(l)),
        log,
      },
    });
  } catch {
    /* */
  }

  try {
    await smartCritique({
      projectId,
      feature: "grow",
      artifactSummary: md.slice(0, 2500),
      errors: log.filter((l) => /fail/i.test(l)),
    });
  } catch {
    /* */
  }

  return { id, url, projectId, status, outputPath, packDir, log };
}

export function formatGrow(r: GrowFromUrlResult): string {
  return [
    `# Fleet grow — ${r.status}`,
    r.url,
    `Out: ${r.outputPath}`,
    r.packDir ? `Pack: ${r.packDir}` : "",
    "",
    ...r.log,
  ]
    .filter(Boolean)
    .join("\n");
}
