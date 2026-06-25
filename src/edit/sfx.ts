import { existsSync } from "node:fs";
import { join } from "node:path";
import { XBOT_ROOT } from "../config.js";

/** Free SFX — drop MP3s here (see assets/sfx/README.md). Bot mixes on timeline if present. */
export const SFX_CATALOG: Record<string, string> = {
  whoosh: "Short air whoosh — cut transition",
  "bass-hit": "Sub bass impact — beat drop / reveal",
  impact: "Punch impact — hook or loss reveal",
  rise: "Riser 0.5-1s — pre-drop tension",
  glitch: "Digital glitch — error/loss moment",
  ding: "Notification ding — proof/tx confirmed",
  "camera-click": "Shutter — screenshot moment",
  "cash-register": "Cha-ching — ironic loss/win",
  "sub-bass": "Low rumble — cinematic open",
  keyboard: "Mechanical key — typing/code beat",
};

const SFX_DIR = join(XBOT_ROOT, "assets", "sfx");

export function sfxPath(name: string): string | null {
  for (const ext of [".mp3", ".wav", ".m4a"]) {
    const p = join(SFX_DIR, `${name}${ext}`);
    if (existsSync(p)) return p;
  }
  return null;
}

export function listAvailableSfx(): string[] {
  return Object.keys(SFX_CATALOG).filter((k) => sfxPath(k) !== null);
}

export function sfxDir(): string {
  return SFX_DIR;
}
