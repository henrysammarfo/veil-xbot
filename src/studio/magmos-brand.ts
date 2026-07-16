/**
 * Magmos brand kit — plain human voice for public ads/posts.
 * Goose refs in data/ads/reference/magmos-goose/ = taste bar (layout/energy), NOT copy source of truth.
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
  /** Public voice — warm, easy, zero crypto-jargon theater */
  voice: [
    "Your dollar can earn while you hold it.",
    "Still worth $1.00.",
    "No lockups. Stay flexible.",
    "Reserves you can check on-chain.",
    "Simple. Clear. On Sui.",
    "Idle money shouldn't sit still.",
    "Join the waitlist.",
    "Hold steady. Earn quietly.",
    "Built for people who want clarity — not more jargon.",
    "A digital dollar that stays $1 and can grow.",
  ],
  /** Words banned in public ads / trailers / X posts */
  neverSay: [
    "forge",
    "smelt",
    "refine",
    "melt",
    "thermal",
    "Forge Council",
    "composable yield-dollar",
    "Trust-minimized",
    "APY",
    "real yield",
    "guaranteed",
    "compostible",
    "Own Your World",
    "Trust in Tech",
  ],
};

/** Concept templates — layout craft from Goose taste; copy is plain Magmos. */
export interface GooseLevelConcept {
  id: string;
  layout: string;
  ratio: "1:1" | "4:5";
  headline: string;
  subheadline: string;
  cta?: string;
  platePrompt: string;
  lesson: string;
  useUiShot?: boolean;
}

export const GOOSE_LEVEL_CONCEPTS: GooseLevelConcept[] = [
  {
    id: "yellow-split-hello",
    layout: "yellow_split",
    ratio: "1:1",
    headline: "HELLO,\nNICE TO\nMEET\nYOUR\nDOLLAR",
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
    cta: "Join waitlist",
    platePrompt:
      "Natural light lifestyle photo young woman cross-legged on lounge chair looking at phone, soft neutrals, editorial fashion feel, empty negative space on left for text overlay, NO TEXT NO LOGOS",
    lesson: "Lifestyle photo + mustard shapes + clear benefit + $1 pill.",
  },
  {
    id: "clarity-no-jargon",
    layout: "clarity_overlay",
    ratio: "4:5",
    headline: "No lockups.\nNo stress.",
    subheadline: "Just hold and earn.",
    cta: "Reserves on-chain",
    platePrompt:
      "Cinematic close-up of a focused person reading a document, warm brown knit sweater, soft spotlight, shallow depth of field, NO readable text on paper (blank/blurred), NO logos",
    lesson: "Human emotion + two short headlines.",
    useUiShot: true,
  },
  {
    id: "dollar-leaking",
    layout: "pain_tags",
    ratio: "4:5",
    headline: "Where is your\nmoney going?",
    subheadline: "",
    cta: "Magmos",
    platePrompt:
      "Photorealistic top-down leather wallet with US dollar bills spilling out on light gray seamless background, product photography studio light, NO text on tags (blank white tags only), NO logos",
    lesson: "Object metaphor + pain points. Problem before product.",
  },
  {
    id: "late-night-builders",
    layout: "builders_night",
    ratio: "4:5",
    headline: "For people building\nquietly while the\nworld sleeps.",
    subheadline: "Magmos is for you.",
    platePrompt:
      "Overhead night office photograph, single developer at desk under warm desk lamp, rest of office in darkness, cinematic, NO TEXT NO SCREENS WITH READABLE TEXT",
    lesson: "Atmosphere carries culture — keep words soft.",
  },
  {
    id: "compound-dreams",
    layout: "compound_room",
    ratio: "4:5",
    headline: "Because",
    subheadline: "GROWTH SHOULD FEEL QUIET",
    cta: "Magmos",
    platePrompt:
      "Warm beige room, young woman in mustard yellow shirt sitting on wood floor looking hopeful upward, soft daylight, empty wall space, NO TEXT NO FURNITURE OVERLAYS",
    lesson: "Aspirational quiet photo + gold type.",
  },
  {
    id: "hidden-reserves",
    layout: "spotlight_object",
    ratio: "1:1",
    headline: "Your reserves shouldn't hide",
    subheadline: "Check them on-chain.",
    cta: "See Magmos →",
    platePrompt:
      "Dramatic spotlight on crumpled ball of blank ledger paper on black background, studio product photo, deep shadows, NO readable text, NO logos",
    lesson: "Single metaphor object + dark mode.",
  },
  {
    id: "defi-gazette",
    layout: "gazette",
    ratio: "1:1",
    headline: "MINT. HOLD. EARN.\nONE CLEAR FLOW",
    subheadline: "$1 digital dollar · earns while you hold · on-chain reserves",
    cta: "Magmos — waitlist open",
    platePrompt:
      "Photorealistic newspaper lying flat on mustard yellow table surface, blank newsprint pages slight crease, top-down product photo, NO readable newspaper text (empty columns), NO logos",
    lesson: "Editorial object as container. Mustard stage.",
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

/** Seed brain from Goose refs as TASTE bar — layout/energy only. */
export function ingestGooseMagmosReferences(): {
  files: number;
  lessons: string[];
} {
  assertDataDir();
  const files = listMagmosReferenceAds();
  const lessons = [
    "Goose Magmos PNGs = taste bar for layout/energy — NOT the only ad path",
    "Primary ads path = site → Google-style concepts → Venice stills + Seedance clips",
    "Brand color: mustard #E8B84A + black + white",
    "Public copy: plain English. Ban forge/smelt/thermal jargon in ads",
    "Concept > dashboard paste. Metaphor, lifestyle, quiet aspiration",
    "Short stacked words. No paragraphs on the ad face",
    "Never invent Magmos hardware gadgets or AI faces",
    "Self-improve: if output looks like a UI screenshot dump, reject",
  ];

  remember({
    kind: "insight",
    title: "Magmos taste = Goose layout energy + plain human voice",
    importance: 5,
    source: "magmos-goose-refs",
    tags: ["taste", "ads", "magmos"],
    body: [
      `Reference files (${files.length}): ${files.join(", ") || "optional taste refs"}`,
      ...lessons,
      `Never say in public: ${MAGMOS_BRAND.neverSay.join(", ")}`,
    ].join("\n"),
  });

  learn({
    projectId: "magmos",
    feature: "ad-maker",
    outcome: "success",
    summary: `Taste bar: ${files.length} Goose refs · public voice = plain English`,
    lessons,
    meta: { files },
  });

  const outDir = join(DATA_DIR, "ads");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  writeFileSync(
    join(outDir, "MAGMOS-TASTE.md"),
    [
      "# Magmos ad taste",
      "",
      "## Public voice",
      ...MAGMOS_BRAND.voice.map((v) => `- ${v}`),
      "",
      "## Never say (public)",
      ...MAGMOS_BRAND.neverSay.map((v) => `- ${v}`),
      "",
      "## Concepts",
      ...GOOSE_LEVEL_CONCEPTS.map((c) => `- **${c.id}**: ${c.lesson}`),
    ].join("\n"),
  );

  return { files: files.length, lessons };
}
