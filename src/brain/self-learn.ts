/**
 * Project-wide self-learning — every feature writes lessons; every LLM call reads them.
 * Stored under data/improve/SELF-LEARN.json (+ per-feature shards).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR, assertDataDir } from "../config.js";
import { newId } from "../store.js";
import { remember } from "./memory.js";

export type LearnFeature =
  | "walkthrough"
  | "ad-maker"
  | "edit-auto"
  | "grow"
  | "ops"
  | "engage"
  | "shorts"
  | "export-ads"
  | "venice"
  | "capture"
  | "music"
  | "draft"
  | "global";

export type LearnOutcome = "success" | "partial" | "fail";

export interface LearnEvent {
  id: string;
  at: number;
  projectId: string;
  feature: LearnFeature;
  outcome: LearnOutcome;
  summary: string;
  errors?: string[];
  lessons: string[];
  meta?: Record<string, unknown>;
}

export interface SelfLearnIndex {
  version: 1;
  updatedAt: number;
  events: LearnEvent[];
  /** Deduped rolling lessons by feature */
  lessonsByFeature: Partial<Record<LearnFeature, string[]>>;
  /** Project → lessons */
  lessonsByProject: Record<string, string[]>;
}

function improveDir(): string {
  assertDataDir();
  const dir = join(DATA_DIR, "improve");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function indexPath(): string {
  return join(improveDir(), "SELF-LEARN.json");
}

export function loadSelfLearn(): SelfLearnIndex {
  const p = indexPath();
  if (!existsSync(p)) {
    return {
      version: 1,
      updatedAt: Date.now(),
      events: [],
      lessonsByFeature: {},
      lessonsByProject: {},
    };
  }
  try {
    return JSON.parse(readFileSync(p, "utf8")) as SelfLearnIndex;
  } catch {
    return {
      version: 1,
      updatedAt: Date.now(),
      events: [],
      lessonsByFeature: {},
      lessonsByProject: {},
    };
  }
}

function saveSelfLearn(index: SelfLearnIndex): void {
  index.updatedAt = Date.now();
  writeFileSync(indexPath(), JSON.stringify(index, null, 2));
  const md = [
    `# Self-learn index`,
    `_Updated ${new Date(index.updatedAt).toISOString()}_`,
    `_Events: ${index.events.length}_`,
    "",
    "## By feature",
    ...Object.entries(index.lessonsByFeature).map(
      ([f, ls]) => `### ${f}\n${(ls ?? []).map((l) => `- ${l}`).join("\n")}`,
    ),
    "",
    "## By project",
    ...Object.entries(index.lessonsByProject).map(
      ([p, ls]) => `### ${p}\n${(ls ?? []).slice(0, 20).map((l) => `- ${l}`).join("\n")}`,
    ),
  ].join("\n");
  writeFileSync(join(improveDir(), "SELF-LEARN.md"), md);
}

function pushUnique(list: string[], items: string[], cap: number): string[] {
  return [...new Set([...items, ...list])].slice(0, cap);
}

/** Record an outcome from any feature — this is the global learning write API. */
export function learn(event: Omit<LearnEvent, "id" | "at">): LearnEvent {
  const index = loadSelfLearn();
  const saved: LearnEvent = {
    ...event,
    id: newId("learn"),
    at: Date.now(),
    lessons: event.lessons.filter(Boolean),
    errors: event.errors?.filter(Boolean),
  };
  index.events = [saved, ...index.events].slice(0, 500);

  const feat = saved.feature;
  index.lessonsByFeature[feat] = pushUnique(
    index.lessonsByFeature[feat] ?? [],
    saved.lessons,
    40,
  );
  index.lessonsByProject[saved.projectId] = pushUnique(
    index.lessonsByProject[saved.projectId] ?? [],
    saved.lessons,
    60,
  );
  index.lessonsByFeature.global = pushUnique(
    index.lessonsByFeature.global ?? [],
    saved.lessons,
    80,
  );

  saveSelfLearn(index);
  writeFileSync(join(improveDir(), `${saved.id}.json`), JSON.stringify(saved, null, 2));

  remember({
    kind: "insight",
    title: `learn:${saved.feature}:${saved.outcome}`,
    importance: saved.outcome === "fail" ? 5 : 3,
    source: `self-learn/${saved.feature}`,
    tags: ["self-learn", saved.feature, saved.projectId, saved.outcome],
    body: `${saved.summary}\nLessons: ${saved.lessons.join(" | ")}\n${(saved.errors ?? []).join(" | ")}`.slice(
      0,
      1500,
    ),
  });

  return saved;
}

export function lessonsFor(opts: {
  projectId?: string;
  feature?: LearnFeature;
  limit?: number;
}): string[] {
  const index = loadSelfLearn();
  const limit = opts.limit ?? 12;
  const out: string[] = [];
  if (opts.feature && index.lessonsByFeature[opts.feature]) {
    out.push(...(index.lessonsByFeature[opts.feature] ?? []));
  }
  if (opts.projectId && index.lessonsByProject[opts.projectId]) {
    out.push(...(index.lessonsByProject[opts.projectId] ?? []));
  }
  out.push(...(index.lessonsByFeature.global ?? []));
  return [...new Set(out)].slice(0, limit);
}

/** Injected into every chatCompletion system prompt */
export function learnContextSuffix(opts?: {
  projectId?: string;
  feature?: LearnFeature;
}): string {
  const ls = lessonsFor({
    projectId: opts?.projectId,
    feature: opts?.feature,
    limit: 14,
  });
  if (!ls.length) {
    return "\n\n## Self-learn\n(No lessons yet — record outcomes via grow/ops/walkthrough/edit-auto.)";
  }
  return `\n\n## Self-learn (follow these; do not repeat known failures)\n${ls.map((l) => `- ${l}`).join("\n")}`;
}

export function formatSelfLearn(limit = 20): string {
  const index = loadSelfLearn();
  const recent = index.events.slice(0, limit);
  return [
    `# Self-learn — ${index.events.length} events`,
    `Updated: ${new Date(index.updatedAt).toISOString()}`,
    `File: ${indexPath()}`,
    "",
    "## Recent",
    ...recent.map(
      (e) =>
        `- [${e.outcome}] ${e.feature}/${e.projectId}: ${e.summary.slice(0, 120)}\n  lessons: ${e.lessons.slice(0, 2).join("; ")}`,
    ),
  ].join("\n");
}
