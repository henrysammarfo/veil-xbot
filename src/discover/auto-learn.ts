import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR, assertDataDir, hasOpenAI } from "../config.js";
import { discoverTrending } from "./trending.js";
import { watchVideo, buildPlaybook } from "../video/watch.js";
import { listLearnings, newId } from "../store.js";
import OpenAI from "openai";
import { requireEnv } from "../config.js";
import type { BrandKey } from "../brands.js";

export interface AutoLearnRun {
  id: string;
  at: number;
  discovered: number;
  watched: number;
  topPatterns: string[];
  urls: string[];
}

export interface EditRecipe {
  version: number;
  aspectRatio: "9:16";
  hookSeconds: number;
  avgCutSeconds: number;
  captionStyle: string;
  musicMood: string;
  overlayTemplates: string[];
  steps: string[];
}

function ensureImproveDir(): string {
  assertDataDir();
  const dir = join(DATA_DIR, "improve");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

export async function autoLearn(opts: {
  top?: number;
  brand?: BrandKey | "both";
  categories?: import("./categories.js").TrendCategory;
}): Promise<AutoLearnRun> {
  const top = opts.top ?? 5;
  console.log(`Discovering top ${top} trending URLs (all winning niches)…`);
  const trends = await discoverTrending({
    brand: opts.brand ?? "both",
    categories: opts.categories ?? "all",
    limit: top * 2,
  });
  const picks = trends.slice(0, top);

  if (!picks.length) throw new Error("No trending URLs found — try again later");

  console.log("Top picks:");
  for (const p of picks) {
    console.log(`  [${p.platform}] ${p.engagementLabel} — ${p.title}\n    ${p.url}`);
  }

  let watched = 0;
  for (const p of picks) {
    try {
      console.log(`\nWatching: ${p.url}`);
      await watchVideo(p.url);
      watched++;
    } catch (e) {
      console.warn(`  skip: ${e instanceof Error ? e.message : e}`);
    }
  }

  buildPlaybook();
  const patterns = aggregatePatterns();
  const recipe = await synthesizeEditRecipe(patterns);

  const run: AutoLearnRun = {
    id: newId("learn"),
    at: Date.now(),
    discovered: trends.length,
    watched,
    topPatterns: patterns.slice(0, 8),
    urls: picks.map((p) => p.url),
  };

  const impDir = ensureImproveDir();
  writeFileSync(join(impDir, `${run.id}.json`), JSON.stringify(run, null, 2));
  writeFileSync(join(impDir, "latest-edit-recipe.json"), JSON.stringify(recipe, null, 2));
  writeFileSync(
    join(impDir, "runs.log"),
    `${new Date().toISOString()} watched=${watched} patterns=${patterns.length}\n`,
    { flag: "a" },
  );

  console.log(`\nSelf-improve: edit recipe updated → data/improve/latest-edit-recipe.json`);
  return run;
}

function aggregatePatterns(): string[] {
  const counts = new Map<string, number>();
  for (const v of listLearnings()) {
    for (const p of [...v.analysis.stealablePatterns, v.analysis.hookPattern]) {
      if (!p || p === "—") continue;
      counts.set(p, (counts.get(p) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([p]) => p);
}

async function synthesizeEditRecipe(patterns: string[]): Promise<EditRecipe> {
  const learnings = listLearnings().slice(0, 8);
  const fallback: EditRecipe = {
    version: Date.now(),
    aspectRatio: "9:16",
    hookSeconds: 2.5,
    avgCutSeconds: 2.8,
    captionStyle: "bold lower-third, 3-5 words per beat",
    musicMood: learnings[0]?.analysis.suggestedSunoPrompt ?? "dark minimal cyber 90bpm",
    overlayTemplates: patterns.slice(0, 5),
    steps: [
      "Open with problem hook text 0-2.5s",
      "Hard cut every 2-3s on action",
      "Zoom 110% on UI clicks",
      "End CTA freeze 2s",
    ],
  };

  if (!hasOpenAI()) return fallback;

  const openai = new OpenAI({ apiKey: requireEnv("OPENAI_API_KEY") });
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.3,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: "Synthesize a repeatable short-form edit recipe for crypto SaaS demos. JSON only.",
      },
      {
        role: "user",
        content: `Patterns:\n${patterns.join("\n")}\n\nLearnings:\n${learnings.map((l) => JSON.stringify(l.analysis)).join("\n")}\n\nReturn JSON with hookSeconds, avgCutSeconds, captionStyle, musicMood, overlayTemplates, steps.`,
      },
    ],
  });
  const raw = res.choices[0]?.message?.content;
  if (!raw) return fallback;
  return { ...fallback, ...JSON.parse(raw) };
}

export function loadLatestEditRecipe(): EditRecipe | null {
  const p = join(DATA_DIR, "improve", "latest-edit-recipe.json");
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf8")) as EditRecipe;
}

export { discoverTrending };
