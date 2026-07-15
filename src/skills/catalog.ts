/**
 * Goose + HyperFrames skills catalog — bot runtime uses these (not just Cursor).
 * Sources:
 *  - vendor/goose-skills/skills-index.json (full Goose GTM catalog)
 *  - .agents/skills/<name>/SKILL.md (installed agent skills)
 */
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  statSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { DATA_DIR, assertDataDir, XBOT_ROOT } from "../config.js";
import { remember } from "../brain/memory.js";

export interface SkillRecord {
  slug: string;
  name: string;
  domain: string;
  category: string;
  description: string;
  tags: string[];
  path: string;
  source: "goose" | "agents" | "hyperframes";
}

export interface SkillCatalog {
  version: 1;
  updatedAt: number;
  count: number;
  skills: SkillRecord[];
}

const GOOSE_INDEX_CANDIDATES = [
  join(XBOT_ROOT, "vendor", "goose-skills", "skills-index.json"),
  join(XBOT_ROOT, "..", "goose-skills", "skills-index.json"),
  "c:\\Users\\RICHEY_SON\\Desktop\\goose-skills\\skills-index.json",
];

function agentsSkillsDir(): string {
  return join(XBOT_ROOT, ".agents", "skills");
}

function catalogPath(): string {
  assertDataDir();
  const dir = join(DATA_DIR, "skills");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return join(dir, "CATALOG.json");
}

function parseFrontmatter(md: string): { name?: string; description?: string } {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  const name = m[1].match(/^name:\s*(.+)$/m)?.[1]?.trim();
  const description = m[1].match(/^description:\s*(.+)$/m)?.[1]?.trim();
  return { name, description };
}

function gooseRoot(): string {
  const vendorRoot = join(XBOT_ROOT, "vendor", "goose-skills");
  const rootTxt = join(vendorRoot, "ROOT.txt");
  if (existsSync(rootTxt)) {
    const line = readFileSync(rootTxt, "utf8").split(/\r?\n/)[0]?.trim();
    if (line && existsSync(line)) return line;
  }
  for (const p of GOOSE_INDEX_CANDIDATES) {
    if (existsSync(p)) return dirname(p);
  }
  return join(XBOT_ROOT, "..", "goose-skills");
}

function loadGooseIndex(): SkillRecord[] {
  ensureGooseVendorLink();
  const root = gooseRoot();
  const indexFile = existsSync(join(XBOT_ROOT, "vendor", "goose-skills", "skills-index.json"))
    ? join(XBOT_ROOT, "vendor", "goose-skills", "skills-index.json")
    : join(root, "skills-index.json");
  if (!existsSync(indexFile)) return [];
  const raw = JSON.parse(readFileSync(indexFile, "utf8")) as {
    skills?: Array<{
      slug?: string;
      name?: string;
      domain?: string;
      category?: string;
      description?: string;
      tags?: string | string[];
      path?: string;
      metadata?: { description?: string; tags?: string[] };
    }>;
  };
  return (raw.skills ?? []).map((s) => {
    const tags = Array.isArray(s.tags)
      ? s.tags
      : typeof s.tags === "string"
        ? s.tags.split(/[,\s]+/).filter(Boolean)
        : s.metadata?.tags ?? [];
    const rel = s.path ?? "";
    const abs = join(root, rel);
    const skillMd = join(abs, "SKILL.md");
    return {
      slug: s.slug ?? s.name ?? "unknown",
      name: s.name ?? s.slug ?? "unknown",
      domain: s.domain ?? "growth",
      category: s.category ?? "skill",
      description:
        (s.metadata?.description || s.description || "").replace(/^>\s*/, "").trim() ||
        `${s.slug} skill`,
      tags,
      path: existsSync(skillMd) ? skillMd : abs,
      source: "goose" as const,
    };
  });
}

function walkSkillMd(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (name === "node_modules" || name === ".git") continue;
      walkSkillMd(p, out);
    } else if (name === "SKILL.md") {
      out.push(p);
    }
  }
  return out;
}

function loadAgentsSkills(): SkillRecord[] {
  const root = agentsSkillsDir();
  return walkSkillMd(root).map((skillPath) => {
    const md = readFileSync(skillPath, "utf8");
    const fm = parseFrontmatter(md);
    const folder = skillPath.split(/[/\\]/).slice(-2, -1)[0] ?? "skill";
    const isHf =
      folder.includes("hyperframes") ||
      folder.includes("heygen") ||
      folder.includes("caption") ||
      folder.includes("explainer") ||
      folder.includes("motion") ||
      folder.includes("faceless") ||
      folder.includes("slideshow") ||
      folder.includes("website-to-video") ||
      folder.includes("product-launch") ||
      folder.includes("pr-to-video") ||
      folder.includes("music-to-video") ||
      folder.includes("graphic-overlay") ||
      folder.includes("remotion");
    return {
      slug: fm.name ?? folder,
      name: fm.name ?? folder,
      domain: isHf ? "video" : "agents",
      category: "installed",
      description: (fm.description ?? md.slice(0, 240)).replace(/\s+/g, " ").trim(),
      tags: isHf ? ["hyperframes", "video"] : ["goose", "gtm"],
      path: skillPath,
      source: isHf ? ("hyperframes" as const) : ("agents" as const),
    };
  });
}

export function rebuildSkillCatalog(): SkillCatalog {
  const bySlug = new Map<string, SkillRecord>();
  for (const s of loadGooseIndex()) {
    bySlug.set(s.slug, s);
  }
  for (const s of loadAgentsSkills()) {
    const prev = bySlug.get(s.slug);
    if (!prev) {
      bySlug.set(s.slug, s);
      continue;
    }
    // Keep goose metadata body if richer; mark as installed path for Cursor agents
    const desc =
      (prev.description?.length ?? 0) > (s.description?.length ?? 0) && prev.description !== ">"
        ? prev.description
        : s.description === ">"
          ? prev.description
          : s.description;
    bySlug.set(s.slug, {
      ...prev,
      ...s,
      description: desc || prev.description,
      path: existsSync(s.path) ? s.path : prev.path,
      source: s.source,
    });
  }
  const skills = [...bySlug.values()].sort((a, b) => a.slug.localeCompare(b.slug));
  const catalog: SkillCatalog = {
    version: 1,
    updatedAt: Date.now(),
    count: skills.length,
    skills,
  };
  writeFileSync(catalogPath(), JSON.stringify(catalog, null, 2));
  const md = [
    `# Skills catalog — ${catalog.count}`,
    `_Updated ${new Date(catalog.updatedAt).toISOString()}_`,
    "",
    ...skills.map(
      (s) =>
        `- **${s.slug}** [${s.source}/${s.domain}] — ${s.description.slice(0, 140)}`,
    ),
  ].join("\n");
  writeFileSync(join(dirname(catalogPath()), "CATALOG.md"), md);
  return catalog;
}

export function loadSkillCatalog(): SkillCatalog {
  const p = catalogPath();
  if (!existsSync(p)) return rebuildSkillCatalog();
  try {
    return JSON.parse(readFileSync(p, "utf8")) as SkillCatalog;
  } catch {
    return rebuildSkillCatalog();
  }
}

export function searchSkills(q: string, limit = 20): SkillRecord[] {
  const needle = q.toLowerCase();
  return loadSkillCatalog()
    .skills.filter(
      (s) =>
        s.slug.includes(needle) ||
        s.name.toLowerCase().includes(needle) ||
        s.domain.includes(needle) ||
        s.description.toLowerCase().includes(needle) ||
        s.tags.some((t) => t.toLowerCase().includes(needle)),
    )
    .slice(0, limit);
}

export function getSkill(slug: string): SkillRecord | undefined {
  return loadSkillCatalog().skills.find((s) => s.slug === slug || s.name === slug);
}

export function readSkillBody(slug: string, maxChars = 6000): string | null {
  const s = getSkill(slug);
  if (!s) return null;
  const mdPath = s.path.endsWith("SKILL.md") ? s.path : join(s.path, "SKILL.md");
  if (!existsSync(mdPath)) return null;
  return readFileSync(mdPath, "utf8").slice(0, maxChars);
}

/** Map veil-xbot LLM tasks → goose/hyperframes skill queries */
const TASK_SKILL_QUERIES: Record<string, string[]> = {
  draft: ["create-x-content", "x content", "social"],
  engage: ["create-x-content", "social-listening", "twitter"],
  "ad-maker": ["ad-angle-miner", "meta-ads", "ugc", "brand-research", "paid-channel"],
  walkthrough: ["hyperframes", "ugc-filmloop", "product", "render"],
  openmontage: ["ugc", "video", "mix-master", "stitch"],
  creative: ["ugc-filmloop", "ad-angle", "campaign-brief", "trending-ad-hook"],
  trailer: ["ugc", "video-ad", "hypermotion", "render"],
  launch: ["feature-launch", "campaign-brief", "paid-channel", "messaging"],
  manifest: ["mix-master", "ugc", "stitch-videos"],
  qa: ["brand-research", "landing-page"],
  learn: ["brand-research", "ugc", "meta-ads", "social-listening"],
  ops: ["campaign-brief", "feature-launch", "paid-channel", "ugc", "create-x-content"],
  grow: ["brand-research", "ad-angle-miner", "meta-ads", "landing-page", "ugc"],
};

/** Compact skill shortlist injected into LLM prompts so the bot actually uses them. */
export function skillsContextForTask(task: string, limit = 8): string {
  const queries = TASK_SKILL_QUERIES[task] ?? [task, "growth", "ads"];
  const hits: SkillRecord[] = [];
  const seen = new Set<string>();
  for (const q of queries) {
    for (const s of searchSkills(q, 6)) {
      if (seen.has(s.slug)) continue;
      seen.add(s.slug);
      hits.push(s);
      if (hits.length >= limit) break;
    }
    if (hits.length >= limit) break;
  }
  if (!hits.length) {
    hits.push(...loadSkillCatalog().skills.filter((s) => s.domain === "ads").slice(0, limit));
  }
  if (!hits.length) return "";
  const lines = hits.map(
    (s) => `- ${s.slug} (${s.domain}): ${s.description.replace(/\s+/g, " ").slice(0, 120)}`,
  );
  return `\n\n## Adopted skills (follow these playbooks; load full SKILL.md when executing)\n${lines.join("\n")}`;
}

/** Push catalog summaries into growth brain so memory stays huge and current. */
export function adoptSkillsIntoBrain(limit = 80): { adopted: number } {
  const catalog = rebuildSkillCatalog();
  remember({
    kind: "skill",
    title: "Goose + agent skills catalog",
    importance: 5,
    source: "gooseworks-ai/goose-skills",
    url: "https://github.com/gooseworks-ai/goose-skills",
    tags: ["skills", "goose", "gtm"],
    body: `${catalog.count} skills indexed. Domains: ${[...new Set(catalog.skills.map((s) => s.domain))].join(", ")}. CLI: npm run skills`,
  });

  const priority = catalog.skills.filter(
    (s) =>
      /ads|ugc|meta|google|x-content|brand|launch|paid|hook|video|hyperframes|campaign|social/i.test(
        `${s.slug} ${s.domain} ${s.tags.join(" ")}`,
      ),
  );
  const pick = (priority.length ? priority : catalog.skills).slice(0, limit);
  for (const s of pick) {
    remember({
      kind: "skill",
      title: `skill:${s.slug}`,
      importance: 3,
      source: s.source,
      tags: ["skill", s.domain, ...s.tags.slice(0, 3)],
      body: s.description.slice(0, 500),
      url: s.path,
    });
  }
  return { adopted: pick.length + 1 };
}

export function formatSkills(limit = 40, q?: string): string {
  const list = q ? searchSkills(q, limit) : loadSkillCatalog().skills.slice(0, limit);
  const cat = loadSkillCatalog();
  return [
    `# Skills — ${cat.count} indexed`,
    q ? `Query: ${q}` : "Showing first page — use: skills search <q>",
    "",
    ...list.map((s) => `## ${s.slug}\n[${s.source}/${s.domain}] ${s.description.slice(0, 200)}\n`),
  ].join("\n");
}

/** Ensure vendor copy of goose index exists for offline bot use */
export function ensureGooseVendorLink(): string {
  const vendor = join(XBOT_ROOT, "vendor", "goose-skills");
  const src = "c:\\Users\\RICHEY_SON\\Desktop\\goose-skills";
  if (!existsSync(join(vendor, "skills-index.json")) && existsSync(join(src, "skills-index.json"))) {
    mkdirSync(vendor, { recursive: true });
    writeFileSync(join(vendor, "skills-index.json"), readFileSync(join(src, "skills-index.json")));
    // Point path resolution at desktop clone for SKILL.md bodies
    writeFileSync(
      join(vendor, "ROOT.txt"),
      `${src}\n# Full skill bodies live here; index copied for veil-xbot runtime.\n`,
    );
  }
  return existsSync(join(vendor, "skills-index.json")) ? vendor : src;
}
