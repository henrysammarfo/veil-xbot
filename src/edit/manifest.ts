import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR, assertDataDir } from "../config.js";
import { newId } from "../store.js";
import { loadLatestEditRecipe } from "../discover/auto-learn.js";
import type { BrandKey } from "../brands.js";
import { styleForBrand, type EditStyleId } from "./styles.js";
import { SFX_CATALOG } from "./sfx.js";
import type { FootageAnalysis } from "./analyze-footage.js";
import { remapTime } from "./dead-space.js";
import { discoverClips } from "../discover/clips.js";
import { queueSunoMusic } from "../media/providers.js";
import { hasVenice } from "../integrations/venice.js";

export interface CutPoint {
  atSec: number;
  type: "hard-cut" | "zoom-punch" | "speed-ramp" | "flash-frame";
  scale?: number;
  durationSec?: number;
  note?: string;
}

export interface SfxCue {
  atSec: number;
  sound: keyof typeof SFX_CATALOG | string;
  reason: string;
}

export interface BrollSlot {
  atSec: number;
  durationSec: number;
  prompt: string;
  provider: "pexels" | "pixabay" | "screen" | "kling-ref" | "generated" | "venice" | "kling" | "veo" | "seedance";
}

export interface CaptionBeat {
  start: number;
  end: number;
  text: string;
  style: "hook" | "body" | "cta";
}

export interface EditManifest {
  id: string;
  brand: BrandKey;
  style: EditStyleId;
  inputPath?: string;
  durationSec: number;
  bpm: number;
  musicPrompt: string;
  cuts: CutPoint[];
  sfx: SfxCue[];
  broll: BrollSlot[];
  captions: CaptionBeat[];
  renderNotes: string[];
  createdAt: number;
  sourceDurationSec?: number;
  deadSpaceRemovedSec?: number;
  hookLine?: string;
}

function exportsDir(): string {
  assertDataDir();
  const d = join(DATA_DIR, "exports");
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
  return d;
}

/** Build edit manifest from real footage analysis — not LLM guesses. */
export function buildManifestFromFootage(
  analysis: FootageAnalysis,
  brand: BrandKey,
  styleId?: EditStyleId,
  inputPath?: string,
): EditManifest {
  const style = styleForBrand(brand, styleId);
  const recipe = loadLatestEditRecipe();
  const segments = analysis.keepSegments;
  const durationSec = analysis.trimmedDurationSec;
  const mapT = (t: number) => remapTime(t, segments);

  const captions: CaptionBeat[] = [];
  captions.push({
    start: 0,
    end: Math.min(style.hookSec, durationSec),
    text: analysis.hookLine,
    style: "hook",
  });

  if (analysis.wordCaptions.length) {
    for (const wc of analysis.wordCaptions) {
      const start = mapT(wc.start);
      const end = mapT(wc.end);
      if (end <= style.hookSec || start >= durationSec - 2.5) continue;
      if (end <= start) continue;
      captions.push({
        start: Math.max(style.hookSec, start),
        end: Math.min(durationSec - 2.5, end),
        text: wc.text,
        style: "body",
      });
    }
  } else {
    captions.push({
      start: style.hookSec,
      end: Math.min(style.hookSec + 10, durationSec - 3),
      text: "REAL SCREEN RECORDING — LIVE APP",
      style: "body",
    });
  }

  captions.push({
    start: Math.max(0, durationSec - 2.8),
    end: durationSec,
    text: brand === "veil" ? "LINK IN REPLY ↓" : "TRY IT — LINK IN BIO",
    style: "cta",
  });

  const cuts: CutPoint[] = [];
  cuts.push({
    atSec: 0,
    type: "zoom-punch",
    scale: style.id === "anime-hype" ? 1.18 : 1.14,
    note: "hook punch",
  });

  let t = style.avgCutSec;
  let i = 1;
  while (t < durationSec - 1.5) {
    const type =
      i % 5 === 0
        ? "flash-frame"
        : i % 3 === 0
          ? "speed-ramp"
          : i % 2 === 0
            ? "zoom-punch"
            : "hard-cut";
    cuts.push({
      atSec: t,
      type,
      scale: type === "zoom-punch" ? 1.1 : undefined,
      durationSec: type === "speed-ramp" ? 0.45 : type === "flash-frame" ? 0.06 : undefined,
      note: `beat ${i}`,
    });
    t += style.avgCutSec;
    i++;
  }

  for (const peak of analysis.energyPeaks.map(mapT)) {
    if (peak > 1 && peak < durationSec - 2 && !cuts.some((c) => Math.abs(c.atSec - peak) < 0.4)) {
      cuts.push({ atSec: peak, type: "zoom-punch", scale: 1.12, note: "energy peak" });
    }
  }
  cuts.sort((a, b) => a.atSec - b.atSec);

  const sfxPack = style.sfxPack;
  const sfx: SfxCue[] = [
    { atSec: 0, sound: "impact", reason: "hook hit" },
    { atSec: Math.min(style.hookSec, durationSec), sound: "whoosh", reason: "enter demo" },
  ];
  for (const c of cuts.slice(1)) {
    if (c.type === "hard-cut") sfx.push({ atSec: c.atSec, sound: "whoosh", reason: "cut" });
    if (c.type === "zoom-punch") sfx.push({ atSec: c.atSec, sound: "bass-hit", reason: "punch in" });
    if (c.type === "flash-frame") sfx.push({ atSec: c.atSec, sound: "glitch", reason: "flash" });
    if (c.type === "speed-ramp") {
      sfx.push({ atSec: c.atSec, sound: sfxPack[sfx.length % sfxPack.length] ?? "rise", reason: "speed ramp" });
    }
  }

  const broll: BrollSlot[] = [];
  const veniceProvider = hasVenice() ? ("seedance" as const) : ("generated" as const);
  if (style.brollDensity !== "light" && durationSec > 8) {
    broll.push({
      atSec: Math.min(4, durationSec * 0.25),
      durationSec: style.id === "anime-hype" ? 1.2 : 2,
      prompt: `${brand} dark UI motion vertical abstract tech b-roll cinematic`,
      provider: veniceProvider,
    });
  }
  if (style.brollDensity === "heavy" && durationSec > 14) {
    broll.push({
      atSec: durationSec * 0.55,
      durationSec: 1.8,
      prompt: "abstract motion lines vertical dark technology cinematic",
      provider: veniceProvider,
    });
  }
  if (style.id === "anime-hype") {
    broll.push({
      atSec: 1.0,
      durationSec: 0.35,
      prompt: "flash cut motion blur vertical hype",
      provider: veniceProvider,
    });
  }

  const deadSpaceRemovedSec = analysis.durationSec - durationSec;

  return {
    id: newId("manifest"),
    brand,
    style: style.id,
    inputPath,
    durationSec,
    sourceDurationSec: analysis.durationSec,
    deadSpaceRemovedSec,
    hookLine: analysis.hookLine,
    bpm: style.bpm,
    musicPrompt: recipe?.musicMood ?? style.musicMood,
    cuts,
    sfx: sfx.slice(0, 16),
    broll,
    captions,
    renderNotes: [
      `Style: ${style.label}`,
      `Dead space removed: ${deadSpaceRemovedSec.toFixed(1)}s`,
      `Whisper captions: ${analysis.transcript ? "yes" : "template fallback"}`,
      "All cuts rendered — zoom, flash, speed-ramp, b-roll overlay",
      "ASS cinematic captions burned in",
    ],
    createdAt: Date.now(),
  };
}

export function saveManifest(m: EditManifest): string {
  const path = join(exportsDir(), `${m.id}-manifest.json`);
  writeFileSync(path, JSON.stringify(m, null, 2));
  writeFileSync(join(exportsDir(), "latest-manifest.json"), JSON.stringify(m, null, 2));
  return path;
}

export function loadLatestManifest(): EditManifest | null {
  const p = join(exportsDir(), "latest-manifest.json");
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf8")) as EditManifest;
}

export function formatManifestForHuman(m: EditManifest): string {
  const lines = [
    `# Edit manifest v2 — ${m.style} (${m.brand})`,
    `Duration: ${m.durationSec.toFixed(1)}s · BPM: ${m.bpm}`,
    m.deadSpaceRemovedSec ? `Dead space cut: ${m.deadSpaceRemovedSec.toFixed(1)}s` : "",
    m.hookLine ? `Hook: "${m.hookLine}"` : "",
    `Music: ${m.musicPrompt}`,
    "",
    "## Timeline",
  ].filter(Boolean);
  const events: Array<{ t: number; line: string }> = [];
  for (const c of m.cuts) events.push({ t: c.atSec, line: `CUT ${c.type} ${c.scale ? `@${c.scale}x` : ""} ${c.note || ""}` });
  for (const s of m.sfx) events.push({ t: s.atSec, line: `SFX ${s.sound} — ${s.reason}` });
  for (const b of m.broll) events.push({ t: b.atSec, line: `B-ROLL ${b.durationSec}s [${b.provider}] ${b.prompt}` });
  for (const c of m.captions) events.push({ t: c.start, line: `CAP [${c.style}] "${c.text}"` });
  events.sort((a, b) => a.t - b.t);
  for (const e of events) lines.push(`${e.t.toFixed(2)}s  ${e.line}`);
  lines.push("", "## Render notes", ...m.renderNotes.map((n) => `- ${n}`));
  return lines.join("\n");
}

/** @deprecated use buildManifestFromFootage via autoEdit v2 */
export async function generateEditManifest(opts: {
  brand: BrandKey;
  style?: EditStyleId;
  durationSec?: number;
  inputPath?: string;
  topic?: string;
}): Promise<EditManifest> {
  const style = styleForBrand(opts.brand, opts.style);
  const durationSec = opts.durationSec ?? 45;
  const m = buildManifestFromFootage(
    {
      inputPath: opts.inputPath ?? "",
      durationSec,
      transcript: null,
      silences: [],
      keepSegments: [{ start: 0, end: durationSec }],
      trimmedDurationSec: durationSec,
      fillersRemoved: 0,
      hookLine: opts.brand === "veil" ? "I LOST $5 ON TESTNET. ON PURPOSE." : "LIVE DEMO — REAL APP",
      hookEndSec: style.hookSec,
      wordCaptions: [],
      energyPeaks: [0],
    },
    opts.brand,
    opts.style,
    opts.inputPath,
  );
  saveManifest(m);
  return m;
}

export async function queueMediaFromManifest(m: EditManifest): Promise<void> {
  queueSunoMusic(m.musicPrompt);
  const clips = await discoverClips({
    niche: m.brand === "veil" ? "trading screen dark" : "technology abstract",
    limit: m.broll.length || 3,
  });
  assertDataDir();
  const dir = join(DATA_DIR, "clips");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "manifest-broll.json"),
    JSON.stringify(
      { manifestId: m.id, clips, note: "Optional stock — editor v2 generates ken-burns if empty" },
      null,
      2,
    ),
  );
}
