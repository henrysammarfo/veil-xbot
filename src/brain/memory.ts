/**
 * Unified growth brain — durable memory so the bot doesn't hallucinate.
 * Stores OSS repos, UGC workflows, ad floors, skills, articles, user directives.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
} from "node:fs";
import { join } from "node:path";
import { DATA_DIR, assertDataDir, XBOT_ROOT } from "../config.js";
import { newId } from "../store.js";

export type BrainKind =
  | "oss"
  | "skill"
  | "workflow"
  | "insight"
  | "ad-pricing"
  | "directive"
  | "brand"
  | "ugc"
  | "article"
  | "url";

export interface BrainEntry {
  id: string;
  kind: BrainKind;
  title: string;
  body: string;
  url?: string;
  tags: string[];
  source: string;
  at: number;
  importance: 1 | 2 | 3 | 4 | 5;
}

export interface BrainIndex {
  version: 1;
  updatedAt: number;
  entries: BrainEntry[];
}

function brainDir(): string {
  assertDataDir();
  const dir = join(DATA_DIR, "brain");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function indexPath(): string {
  return join(brainDir(), "INDEX.json");
}

export function loadBrain(): BrainIndex {
  const p = indexPath();
  if (!existsSync(p)) {
    return { version: 1, updatedAt: Date.now(), entries: [] };
  }
  try {
    return JSON.parse(readFileSync(p, "utf8")) as BrainIndex;
  } catch {
    return { version: 1, updatedAt: Date.now(), entries: [] };
  }
}

function saveBrain(index: BrainIndex): void {
  index.updatedAt = Date.now();
  writeFileSync(indexPath(), JSON.stringify(index, null, 2));
  const md = [
    `# Magmos Growth Brain`,
    `_Updated ${new Date(index.updatedAt).toISOString()}_`,
    `_Entries: ${index.entries.length}_`,
    ``,
    ...index.entries
      .slice()
      .sort((a, b) => b.importance - a.importance || b.at - a.at)
      .map(
        (e) =>
          `## [${e.kind}] ${e.title}\n- id: \`${e.id}\`\n- tags: ${e.tags.join(", ") || "—"}\n- source: ${e.source}${e.url ? `\n- url: ${e.url}` : ""}\n\n${e.body.slice(0, 1200)}\n`,
      ),
  ].join("\n");
  writeFileSync(join(brainDir(), "BRAIN.md"), md);
  const knowledgeMirror = join(XBOT_ROOT, "knowledge", "BRAIN.md");
  try {
    mkdirSync(join(XBOT_ROOT, "knowledge"), { recursive: true });
    writeFileSync(knowledgeMirror, md);
  } catch {
    /* optional mirror */
  }
}

/** Upsert by title+kind — keeps memory big without duplicates. */
export function remember(entry: Omit<BrainEntry, "id" | "at"> & { id?: string }): BrainEntry {
  const index = loadBrain();
  const existing = index.entries.find(
    (e) => e.kind === entry.kind && e.title.toLowerCase() === entry.title.toLowerCase(),
  );
  const saved: BrainEntry = {
    id: existing?.id ?? entry.id ?? newId("mem"),
    at: Date.now(),
    kind: entry.kind,
    title: entry.title,
    body: entry.body,
    url: entry.url,
    tags: entry.tags,
    source: entry.source,
    importance: entry.importance,
  };
  if (existing) {
    Object.assign(existing, saved, { id: existing.id });
  } else {
    index.entries.push(saved);
  }
  saveBrain(index);
  writeFileSync(join(brainDir(), `${saved.id}.json`), JSON.stringify(saved, null, 2));
  return saved;
}

export function recall(opts: {
  kind?: BrainKind;
  tag?: string;
  q?: string;
  limit?: number;
}): BrainEntry[] {
  const { kind, tag, q, limit = 24 } = opts;
  let list = loadBrain().entries;
  if (kind) list = list.filter((e) => e.kind === kind);
  if (tag) list = list.filter((e) => e.tags.includes(tag));
  if (q) {
    const needle = q.toLowerCase();
    list = list.filter(
      (e) =>
        e.title.toLowerCase().includes(needle) ||
        e.body.toLowerCase().includes(needle) ||
        e.tags.some((t) => t.includes(needle)),
    );
  }
  return list
    .slice()
    .sort((a, b) => b.importance - a.importance || b.at - a.at)
    .slice(0, limit);
}

/** Compact context block injected into LLM system prompts. */
export function brainContextSuffix(limit = 12): string {
  const top = recall({ limit });
  if (!top.length) {
    return "\n\n## Growth brain\n(Empty — run `npm run brain` once to seed OSS/UGC/ad floors.)";
  }
  const lines = top.map(
    (e) => `- [${e.kind}/${e.importance}] ${e.title}: ${e.body.replace(/\s+/g, " ").slice(0, 180)}`,
  );
  return `\n\n## Growth brain (do not invent contradicting facts)\n${lines.join("\n")}`;
}

export function formatBrain(limit = 40): string {
  const index = loadBrain();
  const lines = [
    `# Brain — ${index.entries.length} entries`,
    `Updated: ${new Date(index.updatedAt).toISOString()}`,
    `Dir: ${brainDir()}`,
    "",
  ];
  for (const e of recall({ limit })) {
    lines.push(`## ${e.title} (${e.kind} · p${e.importance})`);
    lines.push(e.body.slice(0, 400));
    if (e.url) lines.push(e.url);
    lines.push("");
  }
  return lines.join("\n");
}

export function listBrainFiles(): string[] {
  const dir = brainDir();
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith(".json") || f.endsWith(".md"));
}
