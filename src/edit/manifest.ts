import OpenAI from "openai";
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { requireEnv, DATA_DIR, assertDataDir, hasOpenAI } from "../config.js";
import { listLearnings, readPlaybook, newId } from "../store.js";
import { loadLatestEditRecipe } from "../discover/auto-learn.js";
import { tasteSystemSuffix } from "../taste.js";
import type { BrandKey } from "../brands.js";
import { styleForBrand, type EditStyleId } from "./styles.js";
import { SFX_CATALOG } from "./sfx.js";
import { discoverClips } from "../discover/clips.js";
import { queueSunoMusic } from "../media/providers.js";

export interface CutPoint {
  atSec: number;
  type: "hard-cut" | "zoom-punch" | "speed-ramp" | "flash-frame";
  scale?: number;
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
  provider: "pexels" | "pixabay" | "screen" | "kling-ref";
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
}

function exportsDir(): string {
  assertDataDir();
  const d = join(DATA_DIR, "exports");
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
  return d;
}

function fallbackManifest(
  brand: BrandKey,
  styleId: EditStyleId,
  durationSec: number,
): EditManifest {
  const style = styleForBrand(brand, styleId);
  const recipe = loadLatestEditRecipe();
  const hook =
    brand === "veil"
      ? "I lost $5 on testnet. On purpose."
      : "Forge live. Real Move. No mockup.";

  const captions: CaptionBeat[] = [
    { start: 0, end: style.hookSec, text: hook, style: "hook" },
    { start: style.hookSec, end: style.hookSec + 8, text: "Screen recording — real app", style: "body" },
    { start: durationSec - 3, end: durationSec, text: "Link in reply", style: "cta" },
  ];

  const cuts: CutPoint[] = [];
  let t = 0;
  let i = 0;
  while (t < durationSec - 1) {
    cuts.push({
      atSec: t,
      type: i === 0 ? "zoom-punch" : i % 3 === 0 ? "flash-frame" : "hard-cut",
      scale: i === 0 ? 1.15 : 1.08,
    });
    t += style.avgCutSec;
    i++;
  }

  const sfx: SfxCue[] = [
    { atSec: 0, sound: "impact", reason: "hook hit" },
    { atSec: style.hookSec, sound: "whoosh", reason: "enter demo" },
  ];
  for (const c of cuts.slice(2)) {
    if (c.type === "hard-cut") sfx.push({ atSec: c.atSec, sound: "whoosh", reason: "cut" });
    if (c.type === "zoom-punch") sfx.push({ atSec: c.atSec, sound: "bass-hit", reason: "punch in" });
  }

  const broll: BrollSlot[] = [];
  if (style.brollDensity !== "light") {
    broll.push({
      atSec: 4,
      durationSec: 2,
      prompt: `${brand} dashboard UI dark mode — use Pexels clip or screen`,
      provider: "pexels",
    });
  }
  if (style.id === "anime-hype") {
    broll.push({
      atSec: 1.2,
      durationSec: 0.4,
      prompt: "abstract motion lines vertical — Pexels",
      provider: "pexels",
    });
  }

  return {
    id: newId("manifest"),
    brand,
    style: style.id,
    durationSec,
    bpm: style.bpm,
    musicPrompt: recipe?.musicMood ?? style.musicMood,
    cuts,
    sfx: sfx.slice(0, 12),
    broll,
    captions,
    renderNotes: [
      `Style: ${style.label}`,
      "Hard cut on every SFX whoosh",
      "Zoom 110-115% on UI clicks",
      "Burn captions from manifest beats",
    ],
    createdAt: Date.now(),
  };
}

/** Frame-accurate edit plan: cuts, SFX, b-roll, captions — learned + style preset. */
export async function generateEditManifest(opts: {
  brand: BrandKey;
  style?: EditStyleId;
  durationSec?: number;
  inputPath?: string;
  topic?: string;
}): Promise<EditManifest> {
  const brand = opts.brand;
  const style = styleForBrand(brand, opts.style);
  const durationSec = opts.durationSec ?? 45;
  const learnings = listLearnings().slice(0, 6);
  const playbook = readPlaybook().slice(0, 2500);

  if (!hasOpenAI()) {
    const m = fallbackManifest(brand, style.id, durationSec);
    if (opts.inputPath) m.inputPath = opts.inputPath;
    saveManifest(m);
    return m;
  }

  const openai = new OpenAI({ apiKey: requireEnv("OPENAI_API_KEY") });
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.35,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          `You are a viral short-form editor (CapCut/anime/crypto TikTok). Output frame-accurate edit manifests. JSON only.${tasteSystemSuffix()}`,
      },
      {
        role: "user",
        content: `Brand: ${brand}
Style: ${style.id} — ${style.description}
Duration: ${durationSec}s
BPM: ${style.bpm}
Topic: ${opts.topic || "first viral post"}
Allowed SFX: ${Object.keys(SFX_CATALOG).join(", ")}

Learnings:
${learnings.map((l) => JSON.stringify({ title: l.title, hook: l.analysis.hookPattern, pacing: l.analysis.pacing, edit: l.analysis.editStyle, broll: l.analysis.suggestedBroll })).join("\n")}

Playbook:
${playbook}

Return JSON:
{
  "musicPrompt": "suno one-liner",
  "cuts": [{"atSec":0,"type":"zoom-punch|hard-cut|flash-frame|speed-ramp","scale":1.15,"note":"why"}],
  "sfx": [{"atSec":0,"sound":"whoosh|bass-hit|impact|...","reason":"on beat"}],
  "broll": [{"atSec":4,"durationSec":2,"prompt":"kling prompt","provider":"kling|hyperframes|anime-stock"}],
  "captions": [{"start":0,"end":2,"text":"max 6 words","style":"hook|body|cta"}],
  "renderNotes": ["editor instruction 1"]
}
SFX must land ON cuts. Hook caption under 1.5s for anime-hype. Min 8 cuts for anime-hype.`,
      },
    ],
  });

  const raw = res.choices[0]?.message?.content;
  const base = fallbackManifest(brand, style.id, durationSec);
  if (!raw) {
    saveManifest(base);
    return base;
  }

  const parsed = JSON.parse(raw) as Partial<EditManifest>;
  const manifest: EditManifest = {
    ...base,
    ...parsed,
    id: newId("manifest"),
    brand,
    style: style.id,
    durationSec,
    inputPath: opts.inputPath,
    createdAt: Date.now(),
  };
  saveManifest(manifest);
  await queueMediaFromManifest(manifest);
  return manifest;
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
    JSON.stringify({ manifestId: m.id, clips, note: "Download to assets/broll/ — NO Kling watermark" }, null, 2),
  );
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
    `# Edit manifest — ${m.style} (${m.brand})`,
    `Duration: ${m.durationSec}s · BPM: ${m.bpm}`,
    `Music: ${m.musicPrompt}`,
    "",
    "## Timeline",
  ];
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
