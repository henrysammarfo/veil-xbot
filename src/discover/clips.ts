import { tinyfishSearch } from "../research/tinyfish.js";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR, assertDataDir } from "../config.js";

export interface StockClip {
  url: string;
  title: string;
  source: "pexels" | "pixabay" | "coverr" | "other";
  query: string;
  downloadHint: string;
}

const CLIP_QUERIES = [
  "site:pexels.com video dark technology vertical",
  "site:pexels.com video coding screen vertical",
  "site:pixabay.com videos cryptocurrency trading",
  "site:coverr.co stock video technology",
  "site:pexels.com video abstract motion vertical",
  "site:pexels.com video city night vertical b-roll",
];

function classifySource(url: string): StockClip["source"] {
  if (/pexels\.com/i.test(url)) return "pexels";
  if (/pixabay\.com/i.test(url)) return "pixabay";
  if (/coverr\.co/i.test(url)) return "coverr";
  return "other";
}

function isClipPage(url: string): boolean {
  return /pexels\.com\/video|pixabay\.com\/videos|coverr\.co\/videos/i.test(url);
}

/** Bot finds free no-watermark b-roll — you download to assets/broll/ */
export async function discoverClips(opts: {
  niche?: string;
  limit?: number;
}): Promise<StockClip[]> {
  const niche = opts.niche ?? "crypto technology dark";
  const queries = [
    `site:pexels.com video ${niche} vertical free`,
    `site:pixabay.com videos ${niche}`,
    ...CLIP_QUERIES,
  ];
  const seen = new Set<string>();
  const out: StockClip[] = [];

  for (const query of queries) {
    try {
      const hits = await tinyfishSearch(query, 6);
      for (const h of hits) {
        if (!h.url || !isClipPage(h.url) || seen.has(h.url)) continue;
        seen.add(h.url);
        const source = classifySource(h.url);
        if (source === "other") continue;
        out.push({
          url: h.url,
          title: h.title,
          source,
          query,
          downloadHint:
            source === "pexels"
              ? "pexels.com → Free Download → save to assets/broll/"
              : source === "pixabay"
                ? "pixabay.com → Free download → assets/broll/"
                : "coverr.co → Download → assets/broll/",
        });
      }
    } catch {
      /* skip query */
    }
    if (out.length >= (opts.limit ?? 12)) break;
  }

  assertDataDir();
  const dir = join(DATA_DIR, "clips");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "latest-clips.json"), JSON.stringify(out, null, 2));
  return out.slice(0, opts.limit ?? 12);
}
