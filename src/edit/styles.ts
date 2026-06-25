/** Edit styles learned from viral refs — bot picks or you force via --style */
export type EditStyleId =
  | "anime-hype"
  | "capcut-crypto"
  | "cinematic-broll"
  | "raw-build"
  | "loss-receipt";

export interface EditStyleDef {
  id: EditStyleId;
  label: string;
  avgCutSec: number;
  hookSec: number;
  bpm: number;
  musicMood: string;
  sfxPack: string[];
  brollDensity: "heavy" | "medium" | "light";
  description: string;
}

export const EDIT_STYLES: EditStyleDef[] = [
  {
    id: "anime-hype",
    label: "Anime / hype cuts",
    avgCutSec: 1.8,
    hookSec: 1.5,
    bpm: 140,
    musicMood: "phonk drift 140bpm bass drops every 8 bars",
    sfxPack: ["whoosh", "bass-hit", "impact", "rise", "glitch"],
    brollDensity: "heavy",
    description: "Hard cuts on beat, zoom punches, flash frames, anime-style energy — CapCut velocity template energy.",
  },
  {
    id: "capcut-crypto",
    label: "CapCut crypto viral",
    avgCutSec: 2.2,
    hookSec: 2,
    bpm: 120,
    musicMood: "dark trap minimal 120bpm tiktok crypto edit",
    sfxPack: ["whoosh", "ding", "camera-click", "cash-register"],
    brollDensity: "medium",
    description: "POV hook, bold captions, UI zoom on clicks — what 500k+ crypto TikToks use.",
  },
  {
    id: "cinematic-broll",
    label: "Cinematic + b-roll",
    avgCutSec: 3.5,
    hookSec: 3,
    bpm: 90,
    musicMood: "cinematic ambient swell 90bpm minimal",
    sfxPack: ["whoosh", "rise", "sub-bass"],
    brollDensity: "heavy",
    description: "Slow open, Kling b-roll intercuts, terminal/dashboard as hero shots.",
  },
  {
    id: "raw-build",
    label: "Raw build in public",
    avgCutSec: 4,
    hookSec: 2.5,
    bpm: 100,
    musicMood: "lo-fi founder grind 100bpm understated",
    sfxPack: ["ding", "keyboard"],
    brollDensity: "light",
    description: "Minimal effects — screen + facecam optional. Works for Magmos forge demos.",
  },
  {
    id: "loss-receipt",
    label: "Loss receipt viral",
    avgCutSec: 2,
    hookSec: 1.2,
    bpm: 130,
    musicMood: "dramatic sting 130bpm single bass hit on reveal",
    sfxPack: ["impact", "glitch", "ding"],
    brollDensity: "light",
    description: "Hook = negative PnL on screen. Highest X share rate for Veil testnet proof.",
  },
];

export function getStyle(id?: string): EditStyleDef {
  const found = EDIT_STYLES.find((s) => s.id === id);
  return found ?? EDIT_STYLES.find((s) => s.id === "capcut-crypto")!;
}

export function styleForBrand(brand: "veil" | "magmos", override?: string): EditStyleDef {
  if (override) return getStyle(override);
  return brand === "veil" ? getStyle("loss-receipt") : getStyle("raw-build");
}
