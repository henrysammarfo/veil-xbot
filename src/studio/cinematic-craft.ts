/**
 * Cinematic craft for Venice — distilled from Higgsfield community OSS craft:
 * - MCSLA formula (Model · Camera · Subject · Look · Action)
 * - OSideMedia/higgsfield-ai-prompt-skill (community)
 * - pixelab-ch / NatiDvir / Seedance community skill sets
 * Runs on Venice T2V/image — no Higgsfield API required.
 * Goose skills stay the GTM/ad execution layer; this is film language.
 */
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR, assertDataDir, XBOT_ROOT } from "../config.js";
import { remember } from "../brain/memory.js";
import { MAGMOS_BRAND } from "./magmos-brand.js";

/** Anti-slop — never put these in production prompts (Higgsfield craft ban list adapted) */
export const CRAFT_BAN = [
  "beautiful",
  "stunning",
  "epic",
  "amazing",
  "breathtaking",
  "cinematic masterpiece",
  "8k",
  "ultra realistic",
  "hyperrealistic",
  "trending on artstation",
  "award winning",
  "capcut",
  "own your world",
];

export type CraftJob =
  | "product-hero"
  | "thriller"
  | "ugc-pov"
  | "social-hook"
  | "brand-story"
  | "ad-still";

export interface McslaParts {
  /** Model note for operators — Venice picks via VENICE_VIDEO_MODEL */
  model: string;
  camera: string;
  subject: string;
  look: string;
  action: string;
}

export interface CraftPrompt {
  job: CraftJob;
  mcsla: McslaParts;
  /** Final T2V / I2V body — positive constraints only */
  prompt: string;
  /** Short first-line hook (Seedance: subject+action in first 20–30 words) */
  lead: string;
  rules: string[];
}

const DEFAULT_LOOK = [
  "photoreal soft morning light",
  "mustard yellow #E8B84A as single accent only",
  "shallow depth of field",
  "clean commercial grade, no heavy grain",
  "no logos, no readable UI text, no AI faces staring at camera",
].join(", ");

function stripSlop(s: string): string {
  let out = s;
  for (const b of CRAFT_BAN) {
    const re = new RegExp(b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    out = out.replace(re, "");
  }
  return out.replace(/\s{2,}/g, " ").trim();
}

/** Build MCSLA layers for Magmos-grade product cinema */
export function buildMcsla(opts: {
  job: CraftJob;
  productName?: string;
  productPromise?: string;
  brandColor?: string;
}): McslaParts {
  const name = opts.productName ?? MAGMOS_BRAND.name;
  const promise =
    opts.productPromise ?? "a digital dollar that stays $1 and can earn while you hold it";
  const mustard = opts.brandColor ?? MAGMOS_BRAND.mustard;

  const byJob: Record<CraftJob, Omit<McslaParts, "model">> = {
    "product-hero": {
      camera: "slow Dolly In, locked tripod start, 35mm equivalent",
      subject: `phone on calm desk showing a soft-blur finance app for ${name}, hands enter frame once`,
      look: `photoreal desk, single lamp, ${mustard} accent edge light only, soft bokeh, ${DEFAULT_LOOK}`,
      action: "gentle push-in while soft morning light moves across the phone glass",
    },
    thriller: {
      camera: "slow Crane Up then subtle lateral track, anamorphic feel without barndoors cliché",
      subject: `quiet city morning and a person holding a phone with ${name} on screen (unreadable UI), calm posture`,
      look: `warm soft grade, restrained ${mustard} accents, shallow DOF, ${DEFAULT_LOOK}`,
      action: "they glance at the screen, breathe, pocket the phone, walk forward — one primary action",
    },
    "ugc-pov": {
      camera: "handheld phone POV, slight natural shake, vertical 9:16 framing language",
      subject: "first-person hands over a real desk keyboard, product web app on phone glass",
      look: "authentic daylight, slight phone lens softness, no studio polish, no masks",
      action: "thumb opens waitlist, scrolls once, holds still on $1 product line",
    },
    "social-hook": {
      camera: "hard cut jump-in: close insert then rapid pull-back, 0.0–1.5s attention grab",
      subject: `one clear object: phone screen with ${name} promise framing (no fine text)`,
      look: "high contrast, clean, scroll-stopping, ${mustard} flash accent only in last second".replace(
        "${mustard}",
        mustard,
      ),
      action: "object lands in frame; freeze beat; micro zoom",
    },
    "brand-story": {
      camera: "slow orbit, then settle medium",
      subject: `everyday person at a quiet table, cup of coffee, phone with ${name}`,
      look: "warm paper tones, soft shadows, editorial commercial",
      action: "sits with the product idea for a beat — no speech required",
    },
    "ad-still": {
      camera: "fixed editorial frame, eye-level",
      subject: `hero still for ${name}: lifestyle or product desk, composition room for type`,
      look: `${mustard} + black + paper white, high design clarity, ${DEFAULT_LOOK}`,
      action: "static plate — no motion; leave negative space top-left for headline",
    },
  };

  const base = byJob[opts.job];
  return {
    model: "venice-seedance (VENICE_VIDEO_MODEL) — Higgsfield-craft prompts, Venice execution",
    camera: base.camera,
    subject: `${base.subject}. Product idea: ${promise}.`,
    look: base.look,
    action: base.action,
  };
}

/** Assemble production prompt — Seedance-friendly short lead, positive constraints */
export function craftVideoPrompt(opts: {
  job: CraftJob;
  productName?: string;
  productPromise?: string;
  seconds?: number;
  aspect?: "9:16" | "16:9" | "1:1";
}): CraftPrompt {
  const mcsla = buildMcsla(opts);
  const sec = opts.seconds ?? 6;
  const aspect = opts.aspect ?? "9:16";
  const lead = stripSlop(
    `${mcsla.subject.split(".")[0]}. ${mcsla.action.split("—")[0].trim()}.`,
  );
  const prompt = stripSlop(
    [
      lead,
      `Camera: ${mcsla.camera}.`,
      `Look: ${mcsla.look}.`,
      `Action continues: ${mcsla.action}.`,
      `${sec}s, ${aspect}, one primary action only, in medias res, no text overlays, no watermarks, no captions burned in.`,
      `Never: forge industrial vault, molten metal, stock trader cliché, AI avatar face lock-on.`,
    ].join(" "),
  );

  return {
    job: opts.job,
    mcsla,
    lead,
    prompt,
    rules: [
      "MCSLA: Model Camera Subject Look Action (Higgsfield community craft)",
      "I2V: only describe what changes — never re-describe still frame",
      "One primary action; 1–2 secondary max",
      "Kill slop words; positive constraints only",
      "Identity vs motion: never mix character lock with random new wardrobe",
      "Iterate one variable on regenerate",
    ],
  };
}

/** System suffix for any LLM writing video/image prompts */
export function craftSystemSuffix(): string {
  return `
## Cinematic craft (Higgsfield community standards — execute on Venice)
Use MCSLA: Model · Camera · Subject · Look · Action.
- Lead with Subject + Action in first ~25 words.
- One primary action per clip; scenes start in medias res unless told otherwise.
- Ban slop: ${CRAFT_BAN.slice(0, 8).join(", ")}.
- Positive constraints only (no negative-prompt laundry lists).
- Magmos public: plain English, no forge/smelt/APY, mustard ${MAGMOS_BRAND.mustard} accent only.
- Social: first 1.5s must read without sound.
`.trim();
}

/** Persist craft canon into brain + disk (activate / pack) */
export function seedCinematicCraft(projectId = "magmos"): string {
  assertDataDir();
  const dir = join(DATA_DIR, "craft");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const samples = (["thriller", "product-hero", "ugc-pov", "social-hook", "ad-still"] as CraftJob[]).map(
    (job) => craftVideoPrompt({ job, productName: projectId === "magmos" ? "Magmos" : projectId }),
  );

  const md = [
    "# Cinematic craft — Higgsfield community standards × Venice execution",
    "",
    "Sources (open community craft, not their paid API):",
    "- https://github.com/OSideMedia/higgsfield-ai-prompt-skill — MCSLA + ban lists",
    "- https://github.com/pixelab-ch/higgsfield-skills — motion ads / social hooks",
    "- https://github.com/NatiDvir/video-skills — director + Seedance patterns",
    "- Official skills index: https://github.com/higgsfield-ai/skills",
    "",
    "Goose covers GTM/ads skills; Higgsfield craft covers film language for Venice video.",
    "",
    craftSystemSuffix(),
    "",
    "## Sample Venice prompts",
    ...samples.flatMap((s) => [
      `### ${s.job}`,
      "```",
      s.prompt,
      "```",
      "",
    ]),
  ].join("\n");

  const path = join(dir, "HIGGSFIELD-CRAFT.md");
  writeFileSync(path, md);
  writeFileSync(join(dir, "samples.json"), JSON.stringify(samples, null, 2));

  // Also mirror into knowledge for agents
  try {
    mkdirSync(join(XBOT_ROOT, "knowledge"), { recursive: true });
    writeFileSync(join(XBOT_ROOT, "knowledge", "HIGGSFIELD-CRAFT.md"), md);
  } catch {
    /* */
  }

  remember({
    kind: "workflow",
    title: "Higgsfield MCSLA cinematic craft (Venice)",
    importance: 5,
    source: "higgsfield-community + kiln",
    tags: ["cinema", "mcsla", "higgsfield", "venice", "craft"],
    body: md.slice(0, 4000),
    url: "https://github.com/OSideMedia/higgsfield-ai-prompt-skill",
  });

  remember({
    kind: "directive",
    title: "Film craft rules for all video gen",
    importance: 5,
    source: "higgsfield-community",
    tags: ["cinema", "quality", "4k"],
    body: craftSystemSuffix(),
  });

  return path;
}
