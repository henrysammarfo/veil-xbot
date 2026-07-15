/**
 * Magmos paid-ad pipeline — autonomous editor (CapCut-class, zero handoff).
 * Record forge screen → beat-sync edit → multi-format ad export → growth copy.
 */
import { existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR, assertDataDir } from "../config.js";
import { newId } from "../store.js";
import { autonomousEdit } from "../edit/autonomous.js";
import { exportAdFormats, formatExportAdsResult } from "../edit/export-ads.js";
import { adStyleForBrand } from "../edit/styles.js";
import { buildPaidGrowthPack } from "../growth/paid-growth.js";
import { buildLaunchPack } from "../generate/launch-pack.js";

export interface MagmosAdReport {
  id: string;
  at: number;
  status: "done" | "failed";
  inputPath: string;
  masterPath?: string;
  adExports?: string[];
  log: string[];
}

export async function produceMagmosAd(inputPath: string): Promise<MagmosAdReport> {
  const id = newId("magmos-ad");
  const log: string[] = [];
  const style = adStyleForBrand("magmos");

  if (!existsSync(inputPath)) {
    return {
      id,
      at: Date.now(),
      status: "failed",
      inputPath,
      log: [
        `Input not found: ${inputPath}`,
        "",
        "Record forge / terminal screen (45–60s), then:",
        "  npm run magmos-ad path/to/recording.webm",
      ],
    };
  }

  log.push(`[1/3] Autonomous edit — ${style.id} (beat-sync + music + VO + b-roll)`);
  const job = await autonomousEdit(inputPath, "magmos", style.id, {
    beatSync: true,
    autoMusic: true,
    voiceover: true,
    veniceBroll: true,
    projectId: "magmos",
  });

  if (job.status !== "done" || !job.outputPath) {
    log.push("Edit failed", job.log.slice(-800));
    return { id, at: Date.now(), status: "failed", inputPath, log };
  }
  log.push(`Master: ${job.outputPath}`);

  log.push("[2/3] Export ad formats (9:16 · 1:1 · 16:9)");
  const ads = await exportAdFormats(job.outputPath, "magmos");
  log.push(formatExportAdsResult(ads));

  log.push("[3/3] Paid growth + launch packs");
  const growth = buildPaidGrowthPack("magmos");
  const launch = await buildLaunchPack("magmos", style.id);

  assertDataDir();
  const opsDir = join(DATA_DIR, "ops");
  if (!existsSync(opsDir)) mkdirSync(opsDir, { recursive: true });
  writeFileSync(join(opsDir, "MAGOS-AD-RESULT.md"), formatMagmosAdReport({
    id,
    at: Date.now(),
    status: "done",
    inputPath,
    masterPath: job.outputPath,
    adExports: ads.exports.map((e) => e.path),
    log,
  }));

  writeFileSync(join(DATA_DIR, "growth", "MAGOS-LAUNCH-SNIPPET.md"), launch.markdown.slice(0, 4000));

  return {
    id,
    at: Date.now(),
    status: "done",
    inputPath,
    masterPath: job.outputPath,
    adExports: ads.exports.map((e) => e.path),
    log: [...log, `Growth: ${growth.outputPath}`, `Launch: data/launch/LAUNCH.md`],
  };
}

export function formatMagmosAdReport(r: MagmosAdReport): string {
  const lines = [
    `# Magmos ad — ${r.status}`,
  ];
  if (r.masterPath) lines.push(`Master: ${r.masterPath}`);
  if (r.adExports?.length) {
    lines.push("", "## Ad files");
    for (const p of r.adExports) lines.push(`- ${p}`);
  }
  lines.push("", "## Log", ...r.log);
  return lines.join("\n");
}
