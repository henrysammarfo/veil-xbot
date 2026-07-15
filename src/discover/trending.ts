import { tinyfishSearch, type SearchHit } from "../research/tinyfish.js";
import { queriesForDiscovery, type TrendCategory } from "./categories.js";
import type { BrandKey } from "../brands.js";

export type TrendPlatform = "youtube" | "tiktok" | "x" | "other";

export interface RankedTrend {
  url: string;
  title: string;
  snippet: string;
  platform: TrendPlatform;
  engagementScore: number;
  engagementLabel: string;
  query: string;
  category: TrendCategory;
}

function detectPlatform(url: string): TrendPlatform {
  if (/youtube\.com|youtu\.be/i.test(url)) return "youtube";
  if (/tiktok\.com/i.test(url)) return "tiktok";
  if (/twitter\.com|x\.com/i.test(url)) return "x";
  return "other";
}

function categoryFromQuery(query: string): TrendCategory {
  const q = query.toLowerCase();
  if (/ai|chatgpt|claude|cursor|agent/.test(q)) return "ai";
  if (/trading|chart|options|loss porn|market/.test(q)) return "trading";
  if (/build in public|indie|saas|shipped|founder/.test(q)) return "build";
  if (/finance|macro|fed|wealth/.test(q)) return "finance";
  if (/developer|programming|devtool|open source/.test(q)) return "tech";
  if (/meme|pov|hook|storytelling|culture/.test(q)) return "culture";
  if (/crypto|defi|bitcoin|on-chain|memecoin|yield|stealth|deepbook/.test(q)) return "crypto";
  return "all";
}

/** Parse views/likes from search snippets → sortable score. */
export function parseEngagement(text: string): { score: number; label: string } {
  const t = text.toLowerCase();
  let best = 0;
  let label = "unknown";

  const patterns: Array<{ re: RegExp; kind: string }> = [
    { re: /([\d,.]+)\s*m(?:illion)?\s*views?/i, kind: "views" },
    { re: /([\d,.]+)\s*k\s*views?/i, kind: "views" },
    { re: /([\d,.]+)\s*views?/i, kind: "views" },
    { re: /([\d,.]+)\s*m(?:illion)?\s*likes?/i, kind: "likes" },
    { re: /([\d,.]+)\s*k\s*likes?/i, kind: "likes" },
    { re: /([\d,.]+)\s*likes?/i, kind: "likes" },
    { re: /([\d,.]+)\s*k\s*followers?/i, kind: "followers" },
  ];

  for (const { re, kind } of patterns) {
    const m = t.match(re);
    if (!m) continue;
    const raw = m[1].replace(/,/g, "");
    let n = parseFloat(raw);
    if (Number.isNaN(n)) continue;
    if (/m(?:illion)?/i.test(m[0]) && !/k/i.test(m[0])) n *= 1_000_000;
    else if (/k/i.test(m[0])) n *= 1_000;
    const weighted = kind === "views" ? n : kind === "likes" ? n * 10 : n * 5;
    if (weighted > best) {
      best = weighted;
      label = `${m[0].trim()} (${kind})`;
    }
  }

  return { score: best, label };
}

function isDirectMediaUrl(url: string): boolean {
  if (/youtube\.com\/results|capcut\.com\/explore|playlist\?list=/i.test(url)) return false;
  if (/youtube\.com\/watch|youtu\.be\/|tiktok\.com\/@[^/]+\/video|x\.com\/[^/]+\/status/i.test(url))
    return true;
  return false;
}

function scoreHit(hit: SearchHit, query: string): RankedTrend | null {
  if (!hit.url || !isDirectMediaUrl(hit.url)) return null;
  const platform = detectPlatform(hit.url);
  if (platform === "other") return null;
  const eng = parseEngagement(`${hit.title} ${hit.snippet ?? ""}`);
  const platformBoost = platform === "tiktok" ? 1.2 : platform === "youtube" ? 1.1 : 1;
  return {
    url: hit.url.split("&")[0],
    title: hit.title,
    snippet: hit.snippet ?? "",
    platform,
    engagementScore: eng.score * platformBoost + (eng.score > 0 ? 0 : 1),
    engagementLabel: eng.label,
    query,
    category: categoryFromQuery(query),
  };
}

export async function discoverTrending(opts: {
  brand?: BrandKey | "both";
  categories?: TrendCategory | TrendCategory[];
  limit?: number;
  perQuery?: number;
}): Promise<RankedTrend[]> {
  const queries = queriesForDiscovery({
    categories: opts.categories ?? "all",
    brand: opts.brand,
  });
  const perQuery = opts.perQuery ?? 6;
  const seen = new Set<string>();
  const ranked: RankedTrend[] = [];

  for (const query of queries) {
    try {
      const hits = await tinyfishSearch(query, perQuery);
      for (const hit of hits) {
        const row = scoreHit(hit, query);
        if (!row || seen.has(row.url)) continue;
        seen.add(row.url);
        ranked.push(row);
      }
    } catch (e) {
      console.warn(`discover skip "${query}":`, e instanceof Error ? e.message : e);
    }
  }

  ranked.sort((a, b) => b.engagementScore - a.engagementScore);
  return ranked.slice(0, opts.limit ?? 20);
}
