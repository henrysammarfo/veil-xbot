import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR, assertDataDir } from "../config.js";
import type { EditStyleId } from "../edit/styles.js";
import { getStyle } from "../edit/styles.js";
import { queueSunoMusic } from "../media/providers.js";

/** What seasoned short-form editors actually use — mapped to style + Suno prompt. */
export interface MusicPlan {
  style: EditStyleId;
  bpm: number;
  genre: string;
  referenceArtists: string;
  sunoPrompt: string;
  editorNotes: string[];
  downloadUrls: string[];
}

const EDITOR_MUSIC: Record<EditStyleId, Omit<MusicPlan, "style">> = {
  "anime-hype": {
    bpm: 140,
    genre: "phonk / drift phonk",
    referenceArtists: "Kordhell-style drift phonk, DVRST phonk edits",
    sunoPrompt: "instrumental drift phonk 140bpm heavy bass cowbell no vocals tiktok edit",
    editorNotes: [
      "Cut ON the snare — every 2 beats",
      "Bass-hit SFX when UI reveals",
      "Mute music -20dB under voice if any",
      "Drop hits at 0.0s and 0:15",
    ],
    downloadUrls: [
      "https://pixabay.com/music/search/phonk/",
      "https://suno.com",
    ],
  },
  "capcut-crypto": {
    bpm: 120,
    genre: "dark trap / minimal hip hop",
    referenceArtists: "CapCut crypto edit pack vibes — minimal 808",
    sunoPrompt: "dark trap instrumental 120bpm minimal 808 hi-hats no vocals crypto edit",
    editorNotes: [
      "Whoosh on every hard cut",
      "Sync caption pop to hi-hat",
      "No copyrighted Drake/etc — use royalty-free or Suno",
    ],
    downloadUrls: ["https://pixabay.com/music/search/dark%20trap/"],
  },
  "cinematic-broll": {
    bpm: 90,
    genre: "ambient cinematic",
    referenceArtists: "Hans Zimmer lite — swell not drop",
    sunoPrompt: "cinematic ambient swell 90bpm orchestral minimal no vocals documentary",
    editorNotes: ["Slow zoom matches swell", "SFX minimal — one rise into demo"],
    downloadUrls: ["https://pixabay.com/music/search/cinematic/"],
  },
  "raw-build": {
    bpm: 100,
    genre: "lo-fi / chill hop",
    referenceArtists: "Indie hacker build-in-public streams",
    sunoPrompt: "lo-fi chill hop 100bpm soft piano vinyl crackle no vocals focus",
    editorNotes: ["Music quiet — voice or typing is hero", "Optional keyboard SFX on commits"],
    downloadUrls: ["https://pixabay.com/music/search/lo-fi/"],
  },
  "loss-receipt": {
    bpm: 130,
    genre: "dramatic sting / trailer hit",
    referenceArtists: "Single hit + silence — TikTok loss edits",
    sunoPrompt: "dramatic trailer sting 130bpm single bass hit then silence dark no vocals",
    editorNotes: [
      "SILENCE 0.5s after hook text — then impact SFX",
      "Music barely there until reveal",
      "Ding on tx hash appear",
    ],
    downloadUrls: ["https://pixabay.com/music/search/dramatic/"],
  },
  "magmos-forge": {
    bpm: 128,
    genre: "epic industrial / forge hammer",
    referenceArtists: "CapCut product launch ads — punchy 128bpm",
    sunoPrompt: "epic industrial forge hammer 128bpm cinematic bass hits no vocals product ad",
    editorNotes: [
      "Cut on every snare — forge reveal at bar 4",
      "Whoosh on UI transitions",
      "Music -18dB under VO",
      "Flash frame on tx hash",
    ],
    downloadUrls: ["https://pixabay.com/music/search/epic%20industrial/"],
  },
};

export function getMusicPlan(styleId?: EditStyleId): MusicPlan {
  const style = getStyle(styleId);
  const plan = EDITOR_MUSIC[style.id];
  const full: MusicPlan = { style: style.id, ...plan };
  queueSunoMusic(full.sunoPrompt);
  return full;
}

export function saveMusicPlan(plan: MusicPlan): string {
  assertDataDir();
  const dir = join(DATA_DIR, "music");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const path = join(dir, "latest-plan.json");
  writeFileSync(path, JSON.stringify(plan, null, 2));
  return path;
}

export function formatMusicPlan(p: MusicPlan): string {
  return [
    `# Music plan — ${p.style} @ ${p.bpm} BPM`,
    `Genre: ${p.genre}`,
    `References: ${p.referenceArtists}`,
    ``,
    `Suno prompt: ${p.sunoPrompt}`,
    ``,
    `## Editor notes`,
    ...p.editorNotes.map((n) => `- ${n}`),
    ``,
    `## Download (no watermark)`,
    ...p.downloadUrls.map((u) => `- ${u}`),
    ``,
    `Save beat as assets/music/beat.mp3 for auto-mix on render.`,
  ].join("\n");
}
