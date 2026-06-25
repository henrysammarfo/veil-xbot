import { env } from "../config.js";

/**
 * Media quality tiers — honest routing.
 * Free ≈ 70–75%. Paid APIs (FAL/HeyGen/Kling) → target 90%+.
 */
export type MediaTier = "free" | "paid";

export interface ProviderSlot {
  id: string;
  label: string;
  role: "avatar" | "broll" | "poster" | "motion" | "voice";
  free: { tool: string; quality: number; watermark: boolean };
  paid: { tool: string; envKey: string; quality: number; watermark: boolean };
}

export const STUDIO_PROVIDERS: ProviderSlot[] = [
  {
    id: "avatar-ugc",
    label: "AI actor / UGC face",
    role: "avatar",
    free: { tool: "Screen POV + text hook (no face)", quality: 0.72, watermark: false },
    paid: { tool: "HeyGen / Kling avatar / FAL video", envKey: "HEYGEN_API_KEY", quality: 0.92, watermark: false },
  },
  {
    id: "scene-broll",
    label: "Cinematic b-roll",
    role: "broll",
    free: { tool: "Pexels + screen record", quality: 0.7, watermark: false },
    paid: { tool: "Kling / FAL video", envKey: "FAL_API_KEY", quality: 0.9, watermark: false },
  },
  {
    id: "poster",
    label: "Poster / key art",
    role: "poster",
    free: { tool: "DALL-E 3 + design presets", quality: 0.75, watermark: false },
    paid: { tool: "FAL Flux", envKey: "FAL_API_KEY", quality: 0.9, watermark: false },
  },
  {
    id: "motion",
    label: "Speed ramps / transitions",
    role: "motion",
    free: { tool: "ffmpeg zoompan", quality: 0.65, watermark: false },
    paid: { tool: "Hyperframes / FAL", envKey: "HYPERFRAMES_API_KEY", quality: 0.88, watermark: false },
  },
  {
    id: "voice",
    label: "VO / ad copy read",
    role: "voice",
    free: { tool: "Suno instrumental only", quality: 0.7, watermark: false },
    paid: { tool: "HeyGen voice / ElevenLabs", envKey: "HEYGEN_API_KEY", quality: 0.9, watermark: false },
  },
];

export function activeTier(): MediaTier {
  if (env("FAL_API_KEY") || env("HEYGEN_API_KEY") || env("KLING_API_KEY")) return "paid";
  return "free";
}

export function hasPaidAvatar(): boolean {
  return Boolean(env("HEYGEN_API_KEY") || env("KLING_API_KEY") || env("FAL_API_KEY"));
}

export function tierReport(): string {
  const tier = activeTier();
  const lines = [`Active tier: ${tier} (target ${tier === "paid" ? "90%+" : "70–75%"})`, ""];
  for (const p of STUDIO_PROVIDERS) {
    const usePaid = tier === "paid" && env(p.paid.envKey);
    const slot = usePaid ? p.paid : p.free;
    lines.push(`- ${p.label}: ${slot.tool} (~${Math.round(slot.quality * 100)}%)${slot.watermark ? " watermark" : ""}`);
  }
  return lines.join("\n");
}
