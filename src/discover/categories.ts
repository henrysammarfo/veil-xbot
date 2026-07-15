/** Booming niches — steal what's winning, angle Veil/Magmos later. */
import type { BrandKey } from "../brands.js";

export type TrendCategory =
  | "crypto"
  | "ai"
  | "trading"
  | "build"
  | "finance"
  | "tech"
  | "culture"
  | "all";

export interface CategoryDef {
  id: TrendCategory;
  label: string;
  queries: string[];
}

export const TREND_CATEGORIES: CategoryDef[] = [
  {
    id: "crypto",
    label: "Crypto / DeFi / on-chain",
    queries: [
      "site:tiktok.com crypto viral edit trending 2026",
      "site:youtube.com defi tutorial viral views",
      "site:x.com crypto thread viral engagement",
      "bitcoin ethereum narrative trending twitter",
      "on-chain analytics viral tiktok",
      "memecoin culture trending edit",
    ],
  },
  {
    id: "ai",
    label: "AI / agents / automation",
    queries: [
      "site:tiktok.com AI agent viral 2026",
      "site:youtube.com chatgpt workflow viral views",
      "site:x.com AI startup build in public viral",
      "cursor claude agent trending twitter",
      "AI side hustle tiktok viral",
    ],
  },
  {
    id: "trading",
    label: "Trading / markets / charts",
    queries: [
      "site:tiktok.com trading edit viral capcut",
      "site:youtube.com day trading recap viral",
      "site:x.com market commentary viral thread",
      "options flow narrative trending",
      "loss porn trading tiktok viral",
    ],
  },
  {
    id: "build",
    label: "Build in public / indie hacker",
    queries: [
      "site:tiktok.com build in public startup viral",
      "site:youtube.com indie hacker launch viral",
      "site:x.com shipped product viral thread",
      "saas mrr milestone twitter viral",
      "founder story capcut edit trending",
    ],
  },
  {
    id: "finance",
    label: "Finance / macro / wealth",
    queries: [
      "site:tiktok.com finance explain viral",
      "site:youtube.com macro economics viral shorts",
      "site:x.com fed rates thread viral",
      "personal finance hook tiktok trending",
    ],
  },
  {
    id: "tech",
    label: "Tech / dev / infra",
    queries: [
      "site:tiktok.com developer life viral",
      "site:youtube.com programming tutorial viral shorts",
      "site:x.com open source launch viral",
      "devtool demo capcut edit trending",
    ],
  },
  {
    id: "culture",
    label: "Memes / culture / hooks",
    queries: [
      "site:tiktok.com viral hook formula capcut",
      "site:youtube.com storytelling edit tutorial viral",
      "site:x.com meme format trending crypto",
      "POV hook tiktok viral template",
    ],
  },
];

/** Brand-specific boost queries — layered on top, not the only source. */
export const BRAND_BOOST_QUERIES: Record<"veil" | "magmos", string[]> = {
  veil: [
    "stealth trading defi edit",
    "order flow privacy crypto",
    "deepbook predict trading",
  ],
  magmos: [
    "yield stablecoin defi edit",
    "composable dollar crypto",
  ],
};

export function resolveCategories(
  pick?: TrendCategory | TrendCategory[],
): CategoryDef[] {
  if (!pick || pick === "all") return TREND_CATEGORIES;
  const ids = Array.isArray(pick) ? pick : [pick];
  return TREND_CATEGORIES.filter((c) => ids.includes(c.id));
}

export function queriesForDiscovery(opts: {
  categories?: TrendCategory | TrendCategory[];
  brand?: BrandKey | "both";
}): string[] {
  const cats = resolveCategories(opts.categories ?? "all");
  const base = cats.flatMap((c) => c.queries);
  const boost: string[] = [];
  if (opts.brand === "veil" || opts.brand === "both") boost.push(...BRAND_BOOST_QUERIES.veil);
  if (opts.brand === "magmos" || opts.brand === "both") boost.push(...BRAND_BOOST_QUERIES.magmos);
  return [...new Set([...base, ...boost])];
}

export function listCategoryIds(): TrendCategory[] {
  return ["all", ...TREND_CATEGORIES.map((c) => c.id)];
}
