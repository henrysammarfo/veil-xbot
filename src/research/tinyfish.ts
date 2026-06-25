import { env, requireEnv } from "../config.js";

const SEARCH_BASE = "https://api.search.tinyfish.ai";
const FETCH_BASE = "https://api.fetch.tinyfish.ai";

function headers(): HeadersInit {
  return {
    "X-API-Key": requireEnv("TINYFISH_API_KEY"),
    Accept: "application/json",
  };
}

export interface SearchHit {
  title: string;
  url: string;
  snippet?: string;
}

/** Free-tier web search — ranked results for trend research. */
export async function tinyfishSearch(query: string, limit = 8): Promise<SearchHit[]> {
  const url = new URL(SEARCH_BASE);
  url.searchParams.set("query", query);
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`TinyFish search ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    results?: Array<{ title?: string; url?: string; snippet?: string; description?: string }>;
  };
  return (data.results ?? []).slice(0, limit).map((r) => ({
    title: r.title ?? r.url ?? "result",
    url: r.url ?? "",
    snippet: r.snippet ?? r.description,
  }));
}

/** Fetch page markdown for X/TikTok when transcript unavailable. */
export async function tinyfishFetchText(pageUrl: string): Promise<string> {
  const res = await fetch(FETCH_BASE, {
    method: "POST",
    headers: { ...headers(), "Content-Type": "application/json" },
    body: JSON.stringify({ urls: [pageUrl], format: "markdown", ttl: 0 }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`TinyFish fetch ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    results?: Array<{ text?: string; markdown?: string; url?: string }>;
    errors?: Array<{ url?: string; error?: string }>;
  };
  if (data.errors?.length) {
    console.warn("TinyFish fetch warnings:", data.errors);
  }
  const first = data.results?.[0];
  return (first?.text ?? first?.markdown ?? "").slice(0, 15_000);
}

export function hasTinyfish(): boolean {
  return Boolean(env("TINYFISH_API_KEY"));
}
