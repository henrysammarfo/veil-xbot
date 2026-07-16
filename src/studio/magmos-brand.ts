/**
 * Magmos brand kit + Goose-level reference taste — the bar for local ads.
 * Refs live in data/ads/reference/magmos-goose/ (user-provided Goose dashboard ads).
 */
import { existsSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR, assertDataDir } from "../config.js";
import { remember } from "../brain/memory.js";
import { learn } from "../brain/self-learn.js";

export const MAGMOS_BRAND = {
  name: "Magmos",
  mustard: "#E8B84A",
  mustardDeep: "#C9922E",
  ink: "#111111",
  paper: "#F7F4EE",
  black: "#0A0A0A",
  white: "#FFFFFF",
  teal: "#2A9D8F",
  /** Short lines only — Goose-level density */
  voice: [
    "No lockups. No jargon.",
    "Just yield onchain.",
    "Always worth $1.00",
    "Your dollar earns while you hold",
    "100% on-chain reserves",
    "Composable yield-dollar on Sui",
    "Trust-minimized. Composable. Verifiable on-chain.",
    "Where is your dollar going?",
    "HELLO, NICE TO MEET YOUR YIELD DOLLAR",
    "Magmos is for the builders shipping yield on Sui while the market sleeps.",
    "Because YIELD SHOULD COMPOUND",
    "Your reserves shouldn't be hiding in spend you can't verify",
  ],
};

/** Concept templates distilled from Goose Magmos ads — layout + plate prompt + copy. */
export interface GooseLevelConcept {
  id: string;
  /** HTML template key in local compositor */
  layout: string;
  ratio: "1:1" | "4:5";
  headline: string;
  subheadline: string;
  cta?: string;
  /** Venice plate — NO TEXT. Matches Goose photography mood. */
  platePrompt: string;
  /** Why this is the bar */
  lesson: string;
  useUiShot?: boolean;
}

export const GOOSE_LEVEL_CONCEPTS: GooseLevelConcept[] = [
  {
    id: "yellow-split-hello",
    layout: "yellow_split",
    ratio: "1:1",
    headline: "HELLO,\nNICE TO\nMEET\nYOUR\nYIELD\nDOLLAR",
    subheadline: "",
    cta: "Magmos",
    platePrompt:
      "Surreal street photo cherry blossoms, people in casual clothes with whimsical animal mask heads meeting at coffee cart, bright daylight, Magmos mustard-yellow color grade feel, NO TEXT NO LOGOS NO LETTERS",
    lesson: "Bold mustard panel + surreal photo = interruption. Short stacked words.",
  },
  {
    id: "lifestyle-earns",
    layout: "lifestyle_yellow",
    ratio: "4:5",
    headline: "A digital dollar\nthat earns while\nyou hold",
    subheadline: "Always worth $1.00",
    cta: "Composable yield on Sui",
    platePrompt:
      "Natural light lifestyle photo young woman cross-legged on lounge chair looking at phone, soft neutrals, editorial fashion feel, empty negative space on left for text overlay, NO TEXT NO LOGOS",
    lesson: "Lifestyle photo + mustard graphic shapes + punchy benefit + $1 pill.",
  },
  {
    id: "clarity-no-jargon",
    layout: "clarity_overlay",
    ratio: "4:5",
    headline: "No lockups.\nNo jargon.",
    subheadline: "Just yield onchain.",
    cta: "100% on-chain reserves, verifiable via Walrus MemWal",
    platePrompt:
      "Cinematic close-up of a focused person reading a document, warm brown knit sweater, soft spotlight, shallow depth of field, NO readable text on paper (blank/blurred), NO logos",
    lesson: "Human emotion + two short headlines sandwiching the message.",
    useUiShot: true,
  },
  {
    id: "dollar-leaking",
    layout: "pain_tags",
    ratio: "4:5",
    headline: "Where is your\ndollar going?",
    subheadline: "",
    cta: "Magmos",
    platePrompt:
      "Photorealistic top-down leather wallet with US dollar bills spilling out on light gray seamless background, product photography studio light, NO text on tags (blank white tags only), NO logos",
    lesson: "Object metaphor + labeled pain points. Problem before product.",
  },
  {
    id: "late-night-builders",
    layout: "builders_night",
    ratio: "4:5",
    headline: "Magmos is for\nthe builders shipping yield on Sui\nwhile the market sleeps.",
    subheadline: "Magmos is for you.",
    platePrompt:
      "Overhead night office photograph, single developer at desk under warm desk lamp, rest of office in darkness, cinematic, NO TEXT NO SCREENS WITH READABLE TEXT",
    lesson: "Atmospheric photography carries the culture message.",
  },
  {
    id: "compound-dreams",
    layout: "compound_room",
    ratio: "4:5",
    headline: "Because",
    subheadline: "YIELD SHOULD COMPOUND",
    cta: "Magmos",
    platePrompt:
      "Warm beige room, young woman in mustard yellow shirt sitting on wood floor looking hopeful upward, soft daylight, empty wall space, NO TEXT NO FURNITURE OVERLAYS",
    lesson: "Aspirational quiet photo + gold type. Leave room for line-art overlays in HTML.",
  },
  {
    id: "hidden-reserves",
    layout: "spotlight_object",
    ratio: "1:1",
    headline: "Your reserves shouldn't be hiding in spend you can't verify",
    subheadline: "Magmos keeps 100% on-chain.",
    cta: "See verifiable reserves →",
    platePrompt:
      "Dramatic spotlight on crumpled ball of blank ledger paper on black background, studio product photo, deep shadows, NO readable text, NO logos",
    lesson: "Single metaphor object + gold accent word + dark mode.",
  },
  {
    id: "defi-gazette",
    layout: "gazette",
    ratio: "1:1",
    headline: "MINT, STAKE AND EARN\nIN A SINGLE ATOMIC TRANSACTION",
    subheadline: "AURUM $1 · sAURUM compounds · 100% on-chain reserves",
    cta: "The DeFi Gazette — Sui Special Edition",
    platePrompt:
      "Photorealistic newspaper lying flat on mustard yellow table surface, blank newsprint pages slight crease, top-down product photo, NO readable newspaper text (empty columns), NO logos",
    lesson: "Editorial object as container. Mustard stage. Dense but designed.",
    useUiShot: false,
  },
];

export function magmosReferenceDir(): string {
  return join(DATA_DIR, "ads", "reference", "magmos-goose");
}

export function listMagmosReferenceAds(): string[] {
  const dir = magmosReferenceDir();
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => /\.(png|jpg|webp)$/i.test(f));
}

/** Seed brain + self-learn from Goose Magmos refs — call on unified prepare / ad-maker. */
export function ingestGooseMagmosReferences(): {
  files: number;
  lessons: string[];
} {
  assertDataDir();
  const files = listMagmosReferenceAds();
  const lessons = [
    "GOLD STANDARD = Goose Magmos ads in data/ads/reference/magmos-goose — match or beat that taste",
    "Brand color: mustard yellow #E8B84A + black + white — not generic crypto blue/purple",
    "Concept > UI screenshot. Metaphor, lifestyle, editorial newspaper, surreal interruption",
    "Copy is short and stacked. No paragraphs on the ad face",
    "Human or object photography carries emotion; HTML type stays crisp on top",
    "Always place Magmos wordmark; never invent hardware gadgets",
    "Problem ads: idle stables / opaque reserves / lockups / low yield",
    "Culture ads: builders at night shipping yield on Sui",
    "Self-improve: if output looks like a dashboard paste, reject and regenerate",
  ];

  remember({
    kind: "insight",
    title: "Magmos Goose ads = taste gold standard",
    importance: 5,
    source: "magmos-goose-refs",
    tags: ["taste", "ads", "magmos", "goose-reference"],
    body: [
      `Reference files (${files.length}): ${files.join(", ") || "place PNGs in data/ads/reference/magmos-goose"}`,
      ...lessons,
      "Directions distilled: yellow-split-hello, lifestyle-earns, clarity-no-jargon, dollar-leaking, late-night-builders, compound-dreams, hidden-reserves, defi-gazette",
    ].join("\n"),
  });

  learn({
    projectId: "magmos",
    feature: "ad-maker",
    outcome: "success",
    summary: `Ingested ${files.length} Goose Magmos reference ads as taste bar`,
    lessons,
    meta: { files },
  });

  const outDir = join(DATA_DIR, "ads");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  writeFileSync(
    join(outDir, "MAGMOS-TASTE.md"),
    [
      "# Magmos ad taste bar (Goose refs)",
      "",
      "## Brand",
      `- Mustard: ${MAGMOS_BRAND.mustard}`,
      `- Ink/black/paper for type`,
      "",
      "## Voice (steal these rhythms)",
      ...MAGMOS_BRAND.voice.map((v) => `- ${v}`),
      "",
      "## Concepts to ship",
      ...GOOSE_LEVEL_CONCEPTS.map((c) => `- **${c.id}** (${c.layout}): ${c.lesson}`),
      "",
      "## References",
      ...files.map((f) => `- ${f}`),
    ].join("\n"),
  );

  return { files: files.length, lessons };
}
