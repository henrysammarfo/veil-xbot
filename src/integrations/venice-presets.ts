/**
 * Venice model presets — Kling, Veo, Nano Banana, Seedance, etc.
 * Tiers balance quality vs credit burn (8000 pool).
 */
export type VeniceLaunchTier = "draft" | "standard" | "hero" | "premium";

export interface VeniceModelPreset {
  tier: VeniceLaunchTier;
  label: string;
  textModel: string;
  imageModel: string;
  ttsModel: string;
  videoModel?: string;
  videoDuration: string;
  videoResolution: string;
  includeVideo: boolean;
  /** Rough $ estimate for full launch pack (text+image+audio+optional video) */
  estimateUsd: number;
  notes: string;
}

export const VENICE_LAUNCH_PRESETS: Record<VeniceLaunchTier, VeniceModelPreset> = {
  draft: {
    tier: "draft",
    label: "Draft — hooks + poster only (~$0.15)",
    textModel: "venice-uncensored-1-2",
    imageModel: "nano-banana-lite",
    ttsModel: "tts-kokoro",
    videoDuration: "5s",
    videoResolution: "720p",
    includeVideo: false,
    estimateUsd: 0.15,
    notes: "Text + 1 poster. No video. Use for iterating hooks.",
  },
  standard: {
    tier: "standard",
    label: "Standard — poster + VO + 5s Seedance Mini (~$1–3)",
    textModel: "venice-uncensored-1-2",
    imageModel: "nano-banana-2",
    ttsModel: "tts-kokoro",
    videoModel: "seedance-2-0-mini-text-to-video",
    videoDuration: "5s",
    videoResolution: "720p",
    includeVideo: true,
    estimateUsd: 2,
    notes: "Default launch. Cheap video; pair with real screen recording for proof.",
  },
  hero: {
    tier: "hero",
    label: "Hero — Nano Banana Pro + Seedance 2.0 Fast (~$3–8)",
    textModel: "deepseek-v3.2",
    imageModel: "nano-banana-pro",
    ttsModel: "tts-kokoro",
    videoModel: "seedance-2-0-fast-text-to-video",
    videoDuration: "5s",
    videoResolution: "720p",
    includeVideo: true,
    estimateUsd: 6,
    notes: "Main launch clip. Still quote before generate.",
  },
  premium: {
    tier: "premium",
    label: "Premium — Kling Turbo or Veo 3.1 Fast (~$10–40+)",
    textModel: "deepseek-v3.2",
    imageModel: "nano-banana-pro",
    ttsModel: "tts-xai-v1",
    videoModel: "kling-v3-turbo-pro-text-to-video",
    videoDuration: "5s",
    videoResolution: "1080p",
    includeVideo: true,
    estimateUsd: 15,
    notes: "Hero b-roll only — always venice quote first. Requires --force if > auto cap.",
  },
};

/** Alternate video models selectable via --video-model */
export const VENICE_VIDEO_ALIASES: Record<string, string> = {
  seedance: "seedance-2-0-fast-text-to-video",
  "seedance-mini": "seedance-2-0-mini-text-to-video",
  "seedance-2": "seedance-2-0-text-to-video",
  kling: "kling-v3-turbo-pro-text-to-video",
  "kling-turbo": "kling-2.5-turbo-pro-text-to-video",
  veo: "veo3.1-fast-text-to-video",
  "veo-full": "veo3.1-full-text-to-video",
  wan: "wan-2-7-text-to-video",
};

export const VENICE_IMAGE_ALIASES: Record<string, string> = {
  nano: "nano-banana-lite",
  "nano-banana": "nano-banana-2",
  "nano-pro": "nano-banana-pro",
  flux: "flux-2-pro",
};

export function resolveLaunchTier(t?: string): VeniceLaunchTier {
  if (t === "standard" || t === "hero" || t === "premium" || t === "draft") return t;
  return (envDefaultTier() as VeniceLaunchTier) || "standard";
}

function envDefaultTier(): VeniceLaunchTier {
  const t = process.env.VENICE_DEFAULT_TIER?.trim();
  if (t === "draft" || t === "standard" || t === "hero" || t === "premium") return t;
  return "standard";
}

export function resolveVideoModel(aliasOrId?: string, preset?: VeniceModelPreset): string {
  if (!aliasOrId) return preset?.videoModel ?? "seedance-2-0-mini-text-to-video";
  return VENICE_VIDEO_ALIASES[aliasOrId.toLowerCase()] ?? aliasOrId;
}

export function resolveImageModel(aliasOrId?: string, preset?: VeniceModelPreset): string {
  if (!aliasOrId) return preset?.imageModel ?? "nano-banana-lite";
  return VENICE_IMAGE_ALIASES[aliasOrId.toLowerCase()] ?? aliasOrId;
}
