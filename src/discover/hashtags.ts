import { tinyfishSearch } from "../research/tinyfish.js";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR, assertDataDir } from "../config.js";
import OpenAI from "openai";
import { requireEnv, hasOpenAI } from "../config.js";
import type { BrandKey } from "../brands.js";

export interface TrendingTags {
  hashtags: string[];
  tags: string[]; // @mentions worth engaging (not spamming)
  queries: string[];
  at: number;
}

const TAG_QUERIES = [
  "trending crypto twitter hashtags today",
  "site:x.com trending defi hashtag",
  "viral tiktok crypto hashtags 2026",
  "build in public twitter trending",
  "sui blockchain twitter trending",
];

/** Trending hashtags + accounts to engage — not spam tags on your post. */
export async function discoverHashtags(brand: BrandKey): Promise<TrendingTags> {
  const rawHits: string[] = [];
  for (const q of TAG_QUERIES) {
    try {
      const hits = await tinyfishSearch(q, 5);
      for (const h of hits) rawHits.push(`${h.title} ${h.snippet ?? ""}`);
    } catch {
      /* skip */
    }
  }

  const fallback: TrendingTags = {
    hashtags: brand === "veil" ? ["#DeFi", "#buildinpublic"] : ["#DeFi", "#Sui"],
    tags: brand === "veil" ? ["@SuiNetwork"] : ["@SuiNetwork"],
    queries: TAG_QUERIES,
    at: Date.now(),
  };

  if (!hasOpenAI()) return saveTags(fallback);

  const openai = new OpenAI({ apiKey: requireEnv("OPENAI_API_KEY") });
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.3,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "Extract trending hashtags for X. Max 4 hashtags for post. Max 3 @tags for engagement targets (do not say to spam them). JSON only.",
      },
      {
        role: "user",
        content: `Brand: ${brand}\nSearch results:\n${rawHits.join("\n")}\n\nReturn {"hashtags":[],"tags":[],"notes":""}. Prefer what's trending NOW not generic #Web3.`,
      },
    ],
  });
  const parsed = JSON.parse(res.choices[0]?.message?.content ?? "{}") as {
    hashtags?: string[];
    tags?: string[];
  };
  return saveTags({
    hashtags: (parsed.hashtags ?? fallback.hashtags).slice(0, 4),
    tags: (parsed.tags ?? fallback.tags).slice(0, 3),
    queries: TAG_QUERIES,
    at: Date.now(),
  });
}

function saveTags(t: TrendingTags): TrendingTags {
  assertDataDir();
  const dir = join(DATA_DIR, "tags");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "latest.json"), JSON.stringify(t, null, 2));
  return t;
}

export function loadLatestTags(): TrendingTags | null {
  const p = join(DATA_DIR, "tags", "latest.json");
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf8")) as TrendingTags;
}
