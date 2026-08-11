/**
 * Adaptive memory control — research-backed patterns (2025–2026):
 * - Reflect on fail/partial trajectories → durable rules (Reflexion / harness self-improve)
 * - Consolidate + prune noisy memory (MemCon-style control: don't dump raw forever)
 * - Prefer procedural lessons ("how") over episodic dumps
 * - Gated improvement: only promote lessons that repeated or linked to success
 *
 * Grounded in: SelfMem, MemCon, AutoMem, harness self-improvement taxonomy.
 * No weight fine-tunes — harness memory only (safe, auditable).
 */
import { writeFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR, assertDataDir } from "../config.js";
import { loadSelfLearn, learn, type LearnEvent, type LearnFeature } from "./self-learn.js";
import { loadBrain, remember, type BrainEntry } from "./memory.js";
import { hasVenice } from "../integrations/venice.js";
import { hasOpenAI } from "../config.js";

// Note: chatCompletion is lazy-imported inside reflectOnTrajectory to avoid
// router ↔ evolve circular dependency.

export interface LessonScore {
  lesson: string;
  score: number;
  wins: number;
  fails: number;
  lastAt: number;
}

export interface EvolveReport {
  consolidated: number;
  pruned: number;
  promoted: number;
  reflections: number;
  scoresPath: string;
  protocolPath: string;
}

function improveDir(): string {
  assertDataDir();
  const d = join(DATA_DIR, "improve");
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
  return d;
}

function scoresPath(): string {
  return join(improveDir(), "LESSON-SCORES.json");
}

export function loadLessonScores(): Record<string, LessonScore> {
  const p = scoresPath();
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(readFileSync(p, "utf8")) as Record<string, LessonScore>;
  } catch {
    return {};
  }
}

function saveScores(s: Record<string, LessonScore>): void {
  writeFileSync(scoresPath(), JSON.stringify(s, null, 2));
}

function normalizeLesson(l: string): string {
  return l.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 160);
}

/** Rescore all lessons from event history — success strengthens, fail strengthens ban-rules */
export function rescoreLessons(): Record<string, LessonScore> {
  const events = loadSelfLearn().events;
  const scores = loadLessonScores();
  for (const e of events) {
    const deltaWin = e.outcome === "success" ? 2 : e.outcome === "partial" ? 0.5 : 0;
    const deltaFail = e.outcome === "fail" ? 2 : e.outcome === "partial" ? 0.5 : 0;
    for (const raw of e.lessons) {
      const key = normalizeLesson(raw);
      if (!key) continue;
      const row = scores[key] ?? {
        lesson: raw.slice(0, 220),
        score: 0,
        wins: 0,
        fails: 0,
        lastAt: e.at,
      };
      row.wins += e.outcome === "success" ? 1 : 0;
      row.fails += e.outcome === "fail" ? 1 : 0;
      row.score += deltaWin - (e.outcome === "fail" ? 0 : 0);
      if (e.outcome === "fail") row.score += deltaFail; // failure lessons still matter
      row.lastAt = Math.max(row.lastAt, e.at);
      scores[key] = row;
    }
  }
  saveScores(scores);
  return scores;
}

/** Top ranked procedural lessons for injection */
export function topLessons(limit = 16): string[] {
  const scores = rescoreLessons();
  return Object.values(scores)
    .sort((a, b) => b.score - a.score || b.lastAt - a.lastAt)
    .slice(0, limit)
    .map((s) => s.lesson);
}

/**
 * After a pack/grow run: reflect once (LLM if keys) into 2–5 durable rules.
 * Verification gate: only store rules that are short + imperative.
 */
export async function reflectOnTrajectory(opts: {
  projectId: string;
  feature: LearnFeature;
  summary: string;
  outcome: LearnEvent["outcome"];
  errors?: string[];
  log?: string[];
}): Promise<string[]> {
  if (!hasVenice() && !hasOpenAI()) {
    // Cheap structural reflection without LLM
    const rules: string[] = [];
    if (opts.errors?.length) {
      rules.push(`Do not repeat: ${opts.errors[0].slice(0, 120)}`);
    }
    if (opts.outcome === "success") {
      rules.push(`${opts.feature}: keep the path that produced shippable assets`);
    }
    if (rules.length) {
      learn({
        projectId: opts.projectId,
        feature: opts.feature,
        outcome: opts.outcome,
        summary: `reflect-offline ${opts.feature}`,
        lessons: rules,
        meta: { kind: "reflect-offline" },
      });
    }
    return rules;
  }

  try {
    const { chatCompletion } = await import("../ai/router.js");
    const res = await chatCompletion({
      system: `You are the kiln harness self-improver (Reflexion-style).
Read the trajectory. Output JSON only: {"rules":["…"]}
Rules must be:
- imperative (Do X / Never Y)
- reusable across runs
- max 120 chars each
- 2–5 rules
- Magmos public voice: no forge/APY jargon
Research frame: promote procedural memory, not raw dumps.`,
      user: `Outcome: ${opts.outcome}
Feature: ${opts.feature}
Summary: ${opts.summary.slice(0, 1200)}
Errors: ${(opts.errors ?? []).slice(0, 8).join(" | ")}
Log tail: ${(opts.log ?? []).slice(-12).join(" | ")}`,
      temperature: 0.2,
      json: true,
      projectId: opts.projectId,
      feature: "global",
    });
    let rules: string[] = [];
    try {
      const j = JSON.parse(res.content) as { rules?: string[] };
      rules = (j.rules ?? []).map((r) => String(r).trim()).filter((r) => r.length > 8 && r.length < 160);
    } catch {
      rules = [];
    }
    if (rules.length) {
      learn({
        projectId: opts.projectId,
        feature: opts.feature,
        outcome: opts.outcome,
        summary: `reflect ${opts.feature} → ${rules.length} rules`,
        lessons: rules,
        meta: { kind: "reflect" },
      });
      for (const r of rules) {
        remember({
          kind: "insight",
          title: `rule:${normalizeLesson(r).slice(0, 40)}`,
          importance: opts.outcome === "fail" ? 5 : 4,
          source: "evolve/reflect",
          tags: ["self-improve", opts.feature, opts.projectId],
          body: r,
        });
      }
    }
    return rules;
  } catch {
    return [];
  }
}

/** Prune low-value brain entries; keep high importance + recent reflections */
export function consolidateBrain(opts?: { maxEntries?: number }): { kept: number; pruned: number } {
  const max = opts?.maxEntries ?? 400;
  const brain = loadBrain();
  if (brain.entries.length <= max) {
    return { kept: brain.entries.length, pruned: 0 };
  }
  const ranked = brain.entries.slice().sort((a, b) => {
    const score = (e: BrainEntry) => e.importance * 1e12 + e.at;
    return score(b) - score(a);
  });
  const kept = ranked.slice(0, max);
  const pruned = brain.entries.length - kept.length;
  // rewrite via remember path — write index directly
  const index = {
    version: 1 as const,
    updatedAt: Date.now(),
    entries: kept,
  };
  writeFileSync(join(DATA_DIR, "brain", "INDEX.json"), JSON.stringify(index, null, 2));
  return { kept: kept.length, pruned };
}

/** Full evolve pass — call on activate and after grow/pack */
export async function evolveHarness(opts?: {
  projectId?: string;
  trajectory?: {
    feature: LearnFeature;
    summary: string;
    outcome: LearnEvent["outcome"];
    errors?: string[];
    log?: string[];
  };
}): Promise<EvolveReport> {
  const projectId = opts?.projectId ?? "magmos";
  const scores = rescoreLessons();
  const promoted = Object.values(scores)
    .filter((s) => s.score >= 3 || s.wins >= 2)
    .slice(0, 20);

  for (const p of promoted) {
    remember({
      kind: "insight",
      title: `promoted:${normalizeLesson(p.lesson).slice(0, 48)}`,
      importance: 4,
      source: "evolve/promote",
      tags: ["self-improve", "promoted", projectId],
      body: `${p.lesson} (score=${p.score} wins=${p.wins} fails=${p.fails})`,
    });
  }

  let reflections = 0;
  if (opts?.trajectory) {
    const rules = await reflectOnTrajectory({
      projectId,
      ...opts.trajectory,
    });
    reflections = rules.length;
  }

  const { pruned } = consolidateBrain();
  const protocol = [
    "# Self-improve protocol (kiln harness)",
    "",
    "Standards we follow (harness-only, no weight training):",
    "1. Reflect after fail/partial (Reflexion / NeurIPS self-improving agents).",
    "2. Score lessons; promote high-score procedural rules into brain.",
    "3. Consolidate memory so dumps don't drown signal (MemCon-style control).",
    "4. Gate quality: packs use quality-gate — learn only ships after real assets.",
    "5. Update on every grow/pack/ship — memory is not static.",
    "",
    `Updated: ${new Date().toISOString()}`,
    `Scored lessons: ${Object.keys(scores).length}`,
    `Promoted: ${promoted.length}`,
    `Reflections this pass: ${reflections}`,
    `Pruned brain: ${pruned}`,
    "",
    "## Top lessons",
    ...topLessons(12).map((l) => `- ${l}`),
  ].join("\n");

  const protocolPath = join(improveDir(), "EVOLVE.md");
  writeFileSync(protocolPath, protocol);
  writeFileSync(
    join(improveDir(), "EVOLVE.json"),
    JSON.stringify(
      {
        at: Date.now(),
        promoted: promoted.length,
        reflections,
        pruned,
        top: topLessons(20),
      },
      null,
      2,
    ),
  );

  return {
    consolidated: Object.keys(scores).length,
    pruned,
    promoted: promoted.length,
    reflections,
    scoresPath: scoresPath(),
    protocolPath,
  };
}

/** Rich suffix for LLM — scores + craft-aware self-learn */
export function evolveContextSuffix(opts?: { projectId?: string; feature?: LearnFeature }): string {
  const top = topLessons(10);
  if (!top.length) return "";
  return `\n\n## Evolved rules (ranked self-improve — obey)\n${top.map((l) => `- ${l}`).join("\n")}`;
}
