import { existsSync } from "node:fs";
import { loadLatestEditRecipe } from "../discover/auto-learn.js";
import type { BrandKey } from "../brands.js";
import type { EditStyleId } from "./styles.js";
import {
  generateEditManifest,
  loadLatestManifest,
  saveManifest,
  formatManifestForHuman,
  type EditManifest,
} from "./manifest.js";
import { renderFromManifest } from "./render.js";

export interface EditJob {
  id: string;
  inputPath: string;
  outputPath: string;
  manifest: EditManifest;
  status: "done" | "failed" | "recipe_only" | "partial";
  log: string;
}

/** Build edit timeline only (no video file). */
export async function planEdit(
  brand: BrandKey,
  style?: EditStyleId,
  topic?: string,
): Promise<EditManifest> {
  return generateEditManifest({ brand, style, durationSec: 45, topic });
}

/** Screen recording → manifest → render with cuts, captions, SFX, b-roll queue. */
export async function autoEdit(
  inputPath: string,
  brand: BrandKey = "veil",
  style?: EditStyleId,
): Promise<EditJob> {
  if (!existsSync(inputPath)) throw new Error(`Input not found: ${inputPath}`);

  const recipe = loadLatestEditRecipe();
  let manifest = loadLatestManifest();

  if (!manifest || manifest.brand !== brand || (style && manifest.style !== style)) {
    manifest = await generateEditManifest({
      brand,
      style,
      inputPath,
      durationSec: 45,
    });
  } else {
    manifest = { ...manifest, inputPath };
    saveManifest(manifest);
  }

  const render = renderFromManifest(inputPath, manifest, recipe ?? undefined);
  const log = [
    formatManifestForHuman(manifest),
    "---",
    render.log,
  ].join("\n");

  return {
    id: render.id,
    inputPath,
    outputPath: render.outputPath,
    manifest,
    status: render.status === "partial" ? "recipe_only" : render.status,
    log,
  };
}

export { formatManifestForHuman };
