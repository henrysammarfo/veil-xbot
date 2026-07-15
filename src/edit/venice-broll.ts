/**
 * Venice AI b-roll — credit-budgeted Kling / Veo / Seedance for Editor v2.
 */
import { existsSync, mkdirSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR, assertDataDir } from "../config.js";
import { hasVenice, veniceGenerateVideo } from "../integrations/venice.js";
import {
  resolveVideoModel,
  resolveLaunchTier,
  VENICE_LAUNCH_PRESETS,
} from "../integrations/venice-presets.js";
import { quoteVideoUsd } from "../integrations/venice-credits.js";
import type { BrollSlot } from "./manifest.js";

export interface VeniceBrollOpts {
  projectId?: string;
  tier?: string;
  videoModel?: string;
  force?: boolean;
  aspectRatio?: string;
  resolution?: string;
}

const VENICE_PROVIDERS = new Set([
  "venice",
  "kling-ref",
  "kling",
  "veo",
  "seedance",
  "seedance-mini",
  "generated",
]);

export function slotUsesVenice(slot: BrollSlot): boolean {
  return VENICE_PROVIDERS.has(slot.provider);
}

export function estimateBrollPackUsd(
  slots: BrollSlot[],
  opts?: VeniceBrollOpts,
): Promise<number> {
  const veniceSlots = slots.filter(slotUsesVenice);
  if (!veniceSlots.length || !hasVenice()) return Promise.resolve(0);

  const preset = VENICE_LAUNCH_PRESETS[resolveLaunchTier(opts?.tier)];
  const model = resolveVideoModel(opts?.videoModel, preset);

  return veniceSlots.reduce(async (sumP, slot) => {
    const sum = await sumP;
    const dur = `${Math.min(8, Math.max(4, Math.ceil(slot.durationSec)))}s`;
    const q = await quoteVideoUsd({
      model,
      duration: dur,
      resolution: opts?.resolution ?? preset.videoResolution,
      aspectRatio: opts?.aspectRatio ?? "9:16",
      audio: false,
    });
    return sum + q;
  }, Promise.resolve(0));
}

/** Generate one Venice clip for a b-roll slot. */
export async function generateVeniceBrollClip(
  slot: BrollSlot,
  workDir: string,
  index: number,
  opts?: VeniceBrollOpts,
): Promise<string | null> {
  if (!hasVenice() || !slotUsesVenice(slot)) return null;

  assertDataDir();
  const brollCache = join(DATA_DIR, "media", "broll", "venice");
  if (!existsSync(brollCache)) mkdirSync(brollCache, { recursive: true });

  const preset = VENICE_LAUNCH_PRESETS[resolveLaunchTier(opts?.tier)];
  const model = resolveVideoModel(
    opts?.videoModel ?? (slot.provider === "kling" || slot.provider === "kling-ref" ? "kling" : slot.provider),
    preset,
  );
  const durationSec = Math.min(8, Math.max(4, Math.ceil(slot.durationSec)));

  const out = join(workDir, `venice-broll-${index}.mp4`);
  try {
    const { path } = await veniceGenerateVideo(slot.prompt, {
      model,
      durationSec,
      aspectRatio: opts?.aspectRatio ?? "9:16",
      resolution: opts?.resolution ?? "720p",
      audio: false,
      force: opts?.force,
      projectId: opts?.projectId,
    });
    copyFileSync(path, out);
    const cached = join(brollCache, `slot-${index}-${Date.now()}.mp4`);
    copyFileSync(path, cached);
    return out;
  } catch (e) {
    console.warn(`Venice b-roll slot ${index}:`, e instanceof Error ? e.message : e);
    return null;
  }
}
