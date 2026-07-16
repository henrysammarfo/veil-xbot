/**
 * ONE OS context — skills + brain + knowledge + OSS + lessons + goose formats.
 * Every major flow (pack / grow / ads / ops) should call prepareUnifiedSystem first.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR, XBOT_ROOT, assertDataDir } from "../config.js";
import { seedGrowthBrain } from "./seed.js";
import { remember, recall, brainContextSuffix } from "./memory.js";
import { lessonsFor, learnContextSuffix, type LearnFeature } from "./self-learn.js";
import {
  adoptSkillsIntoBrain,
  ensureGooseVendorLink,
  searchSkills,
  readSkillBody,
  skillsContextForTask,
  rebuildSkillCatalog,
} from "../skills/catalog.js";
import { saveGoldmineCatalog, GOLDMINE_REPOS } from "../discover/goldmine.js";
import { USER_OSS_STACK } from "../discover/oss-stack.js";
import { getProject } from "../projects/registry.js";
import { hasVenice } from "../integrations/venice.js";
import { hasTinyfish } from "../research/tinyfish.js";
import { env, hasOpenAI } from "../config.js";
import { ingestGooseMagmosReferences } from "../studio/magmos-brand.js";
import { probeStack, resolveGooseRoot } from "../studio/goose-stack.js";

function cascadeLabel(): string {
  const parts: string[] = [];
  if (hasVenice()) parts.push("venice");
  if (hasOpenAI()) parts.push("openai");
  if (env("FLOCKAI_API_URL") && env("FLOCKAI_API_KEY")) parts.push("flockai");
  return parts.join(" → ") || "none";
}

export interface UnifiedSystem {
  projectId: string;
  preparedAt: number;
  brainSeeded: number;
  skillsAdopted: number;
  skillCatalogCount: number;
  lessons: string[];
  /** Inject into every LLM call for this run */
  promptBlock: string;
  paths: {
    knowledge?: string;
    taste: string;
    goldmine: string;
    ossStack: string;
    contextFile: string;
  };
}

const GOOSE_AD_SKILLS = [
  "remix-graphic-ad-from-reference",
  "brand-research",
  "ad-angle-miner",
  "meta-ads-campaign-builder",
  "trending-ad-hook-spotter",
  "goose-graphics",
  "ugc-filmloop",
  "paid-channel-prioritizer",
];

function loadTaste(): string {
  const p = join(XBOT_ROOT, "taste.md");
  if (!existsSync(p)) return "";
  return readFileSync(p, "utf8").slice(0, 2500);
}

function loadProjectKnowledge(projectId: string): { path?: string; text: string } {
  const candidates = [
    join(XBOT_ROOT, "knowledge", `${projectId}.md`),
    join(XBOT_ROOT, "knowledge", projectId === "magmos" ? "magmos.md" : `${projectId}.md`),
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      return { path: p, text: readFileSync(p, "utf8").slice(0, 4500) };
    }
  }
  return { text: "" };
}

function loadGooseFormats(): string {
  const probe = probeStack();
  const lines = Object.entries(probe.formats).map(
    ([fmt, skill]) => `- format \`${fmt}\` → skill \`${skill}\` (EXECUTE via goose-stack / AD_ENGINE=stack)`,
  );
  if (lines.length) return lines.join("\n");
  return [
    "- format `static` → remix-graphic-ad-from-reference (EXECUTE — do not prompt-only)",
    "- format `brand-research` → brand-research",
  ].join("\n");
}

function deepSkillBodies(slugs: string[], maxCharsEach = 2200): string {
  const parts: string[] = [];
  for (const slug of slugs) {
    const body = readSkillBody(slug, maxCharsEach);
    if (body) {
      parts.push(`### SKILL ${slug}\n${body.slice(0, maxCharsEach)}`);
    }
  }
  // Also try search hits if exact slug missing
  if (parts.length < 2) {
    for (const hit of searchSkills("remix graphic ad brand", 4)) {
      if (slugs.includes(hit.slug)) continue;
      const body = readSkillBody(hit.slug, 1600);
      if (body) parts.push(`### SKILL ${hit.slug}\n${body.slice(0, 1600)}`);
      if (parts.length >= 3) break;
    }
  }
  return parts.join("\n\n");
}

function priorAdFailures(projectId: string): string {
  const lessons = lessonsFor({ projectId, feature: "ad-maker", limit: 8 });
  const insights = recall({ tag: "ad-maker", limit: 5 });
  const lines = [
    ...lessons.map((l) => `- LESSON: ${l}`),
    ...insights.map((e) => `- PRIOR: ${e.title}: ${e.body.slice(0, 160)}`),
  ];
  return lines.join("\n") || "- (no prior ad lessons yet)";
}

/**
 * Arm the whole OS once — call at start of pack / grow / ops / ad-maker.
 */
export function prepareUnifiedSystem(opts: {
  projectId: string;
  task?: string;
  feature?: LearnFeature;
}): UnifiedSystem {
  assertDataDir();
  const projectId = opts.projectId || "magmos";
  const project = getProject(projectId);

  ensureGooseVendorLink();
  const cat = rebuildSkillCatalog();
  const seeded = seedGrowthBrain();
  const skills = adoptSkillsIntoBrain(150);
  saveGoldmineCatalog();

  if (projectId === "magmos") {
    try {
      ingestGooseMagmosReferences();
    } catch {
      /* refs folder may be empty on first clone */
    }
  }

  // Persist OSS + goldmine into brain for recall
  remember({
    kind: "oss",
    title: "User OSS stack (wired)",
    importance: 4,
    source: "unified-context",
    tags: ["oss", "stack", projectId],
    body: USER_OSS_STACK.map((i) => `${i.id}: ${i.status} — ${i.role}`).join("\n"),
  });
  remember({
    kind: "oss",
    title: "Goldmine 22 labs armed",
    importance: 3,
    source: "unified-context",
    tags: ["goldmine", "oss"],
    body: GOLDMINE_REPOS.slice(0, 8)
      .map((r) => `${r.name}: ${r.use}`)
      .join("\n"),
  });

  const knowledge = loadProjectKnowledge(projectId);
  if (knowledge.text) {
    remember({
      kind: "brand",
      title: `${project.name} product truth`,
      importance: 5,
      source: knowledge.path ?? "knowledge",
      tags: ["product-truth", projectId],
      body: knowledge.text.slice(0, 2000),
    });
  }

  const taste = loadTaste();
  const lessons = lessonsFor({
    projectId,
    feature: opts.feature ?? "global",
    limit: 16,
  });
  const skillDeep = deepSkillBodies(GOOSE_AD_SKILLS);
  const formats = loadGooseFormats();
  const taskSkills = skillsContextForTask(opts.task ?? "grow", 10);
  const priorAds = priorAdFailures(projectId);

  const promptBlock = [
    `## Unified Magmos Growth OS (single source of truth)`,
    `Project: ${project.name} · ${project.tagline}`,
    `URL: ${project.primaryUrl}`,
    `LLM cascade: ${cascadeLabel()} · TinyFish: ${hasTinyfish() ? "on" : "off"}`,
    `Skills catalog: ${cat.count} · brain seeded: ${seeded.counted} · adopted: ${skills.adopted}`,
    ``,
    `### Product truth (never invent hardware / never say Compostible / no APY)`,
    knowledge.text || `(no knowledge/${projectId}.md — use registry only)`,
    ``,
    `### Taste gates`,
    taste.slice(0, 1800) || "(taste.md missing)",
    ``,
    `### Magmos ad gold standard (Goose refs)`,
    projectId === "magmos"
      ? "Match data/ads/reference/magmos-goose: mustard #E8B84A, concept photo/metaphor, short stacked copy, Magmos wordmark. Reject UI-dashboard paste ads."
      : "(veil — dark minimal)",
    ``,
    `### Self-learn lessons (obey)`,
    lessons.map((l) => `- ${l}`).join("\n") || "- (none)",
    ``,
    `### Prior ad critiques / fails`,
    priorAds,
    ``,
    `### Goose formats (EXECUTE — not wallpaper)`,
    formats,
    `Goose root: ${resolveGooseRoot() ?? "(missing)"} · FAL edit: ${probeStack().fal} · refs: ${probeStack().referenceAds.length}`,
    `AD_ENGINE=stack runs formats.static → remix-graphic-ad-from-reference + companion skill JSON`,
    ``,
    `### OSS stack roles`,
    USER_OSS_STACK.filter((i) => i.status === "wired" || i.status === "partial")
      .map((i) => `- ${i.name}: ${i.role} (${i.status})`)
      .join("\n"),
    ``,
    `### Goldmine (sample)`,
    GOLDMINE_REPOS.slice(0, 6)
      .map((r) => `- ${r.name}: ${r.use}`)
      .join("\n"),
    taskSkills,
    ``,
    `### Deep Goose skill playbooks (follow)`,
    skillDeep.slice(0, 7000) || "(skill bodies not found — run npm run skills adopt)",
    brainContextSuffix(14),
    learnContextSuffix({ projectId, feature: opts.feature }),
  ].join("\n");

  const dir = join(DATA_DIR, "improve");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const contextFile = join(dir, `UNIFIED-${projectId}.md`);
  writeFileSync(contextFile, promptBlock);

  return {
    projectId,
    preparedAt: Date.now(),
    brainSeeded: seeded.counted,
    skillsAdopted: skills.adopted,
    skillCatalogCount: cat.count,
    lessons,
    promptBlock,
    paths: {
      knowledge: knowledge.path,
      taste: join(XBOT_ROOT, "taste.md"),
      goldmine: join(DATA_DIR, "research", "goldmine.json"),
      ossStack: join(XBOT_ROOT, "OSS-STACK.md"),
      contextFile,
    },
  };
}

/** Compact suffix for chatCompletion when full block already in user message */
export function unifiedContextSuffix(projectId: string, maxChars = 6000): string {
  const p = join(DATA_DIR, "improve", `UNIFIED-${projectId}.md`);
  if (existsSync(p)) {
    return `\n\n${readFileSync(p, "utf8").slice(0, maxChars)}`;
  }
  return prepareUnifiedSystem({ projectId }).promptBlock.slice(0, maxChars);
}
