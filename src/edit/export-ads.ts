/**
 * Export paid-ad creative variants — 9:16, 1:1, 16:9 from one master render.
 */
import { existsSync, mkdirSync, copyFileSync, writeFileSync } from "node:fs";
import { join, basename, extname } from "node:path";
import { DATA_DIR, assertDataDir } from "../config.js";
import { newId } from "../store.js";
import { hasFfmpeg, runFfmpeg, probeDuration } from "./ffmpeg-util.js";
import { getProject } from "../projects/registry.js";
import { brandVoice } from "../brands.js";
import type { BrandKey } from "../brands.js";

export type AdFormat = "9:16" | "1:1" | "16:9";

export interface AdExport {
  format: AdFormat;
  path: string;
  width: number;
  height: number;
}

export interface ExportAdsResult {
  id: string;
  masterPath: string;
  exports: AdExport[];
  captionsPath: string;
  uploadNotes: string[];
}

const FORMATS: Record<AdFormat, { w: number; h: number; vf: string }> = {
  "9:16": {
    w: 1080,
    h: 1920,
    vf: "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920",
  },
  "1:1": {
    w: 1080,
    h: 1080,
    vf: "scale=1080:1080:force_original_aspect_ratio=increase,crop=1080:1080",
  },
  "16:9": {
    w: 1920,
    h: 1080,
    vf: "scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080",
  },
};

function captionVariants(brand: BrandKey): string[] {
  const v = brandVoice(brand);
  const link = v.link();
  if (brand === "magmos") {
    return [
      `Forge tx landed. Not a mockup.\n\n${link}\n\n#Sui #DeFi`,
      `AURUM on testnet — smelt · refine · prove it.\n\n${link}`,
      `Composable yield-dollar on Sui. Real Move txs.\n\n${link}\n\nReply for forge walkthrough.`,
    ];
  }
  return [
    `Stealth execution on Sui — intent off-chain, fills on DeepBook.\n\n${link}`,
    `Real testnet proof. No mock receipts.\n\n${link}`,
  ];
}

export async function exportAdFormats(
  masterMp4: string,
  brand: BrandKey = "magmos",
  formats: AdFormat[] = ["9:16", "1:1", "16:9"],
): Promise<ExportAdsResult> {
  if (!existsSync(masterMp4)) throw new Error(`Master not found: ${masterMp4}`);
  if (!hasFfmpeg()) throw new Error("ffmpeg required for ad export");

  assertDataDir();
  const id = newId("ads");
  const dir = join(DATA_DIR, "exports", "ads", id);
  mkdirSync(dir, { recursive: true });

  const exports: AdExport[] = [];
  const base = basename(masterMp4, extname(masterMp4));

  for (const format of formats) {
    const spec = FORMATS[format];
    const out = join(dir, `${base}_${format.replace(":", "x")}.mp4`);

    if (format === "9:16" && probeDuration(masterMp4) > 0) {
      copyFileSync(masterMp4, out);
    } else {
      runFfmpeg([
        "-y",
        "-i",
        masterMp4,
        "-vf",
        spec.vf,
        "-c:v",
        "libx264",
        "-preset",
        "fast",
        "-crf",
        "20",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-movflags",
        "+faststart",
        out,
      ]);
    }

    exports.push({ format, path: out, width: spec.w, height: spec.h });
  }

  const project = getProject(brand);
  const captions = captionVariants(brand);
  const captionsMd = [
    `# Ad captions — ${project.name}`,
    ``,
    `Master: ${masterMp4}`,
    ``,
    ...captions.map((c, i) => `## Variant ${i + 1}\n\n${c}\n`),
    ``,
    `## Upload map`,
    `- **X / TikTok feed:** 9:16`,
    `- **X image card / Meta square:** 1:1`,
    `- **YouTube pre-roll / landscape:** 16:9`,
  ].join("\n");

  const captionsPath = join(dir, "CAPTIONS.md");
  writeFileSync(captionsPath, captionsMd);

  const uploadNotes = [
    "X Ads: upload 9:16 or 1:1 — hook visible in first 1.5s without sound",
    "TikTok Ads: 9:16 only — CTA in last 3s",
    "Promote the variant that matches placement — do not upscale wrong aspect",
  ];

  writeFileSync(
    join(dir, "manifest.json"),
    JSON.stringify({ id, brand, masterPath: masterMp4, exports, captionsPath }, null, 2),
  );

  return { id, masterPath: masterMp4, exports, captionsPath, uploadNotes };
}

export function formatExportAdsResult(r: ExportAdsResult): string {
  const lines = [
    `# Ad export — ${r.id}`,
    ``,
    `Master: ${r.masterPath}`,
    ``,
    `## Files`,
    ...r.exports.map((e) => `- ${e.format} (${e.width}×${e.height}): ${e.path}`),
    ``,
    `Captions: ${r.captionsPath}`,
    ``,
    `## Upload`,
    ...r.uploadNotes.map((n) => `- ${n}`),
  ];
  return lines.join("\n");
}
