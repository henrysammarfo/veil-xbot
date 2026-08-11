/**
 * OSS tool discovery via TinyFish — finds repos/docs to fork, clone, or wire.
 * Saves catalog to data/research/oss-catalog.json
 */
import { writeFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR, assertDataDir } from "../config.js";
import { tinyfishSearch, tinyfishFetchText, type SearchHit } from "../research/tinyfish.js";

export interface OssCatalogEntry {
  id: string;
  category: string;
  query: string;
  hits: SearchHit[];
  fetchedNotes?: string;
  at: number;
}

export interface OssCatalog {
  version: 1;
  updatedAt: number;
  entries: OssCatalogEntry[];
  /** Curated from official docs — always present */
  pinned: Array<{ name: string; url: string; use: string; license?: string }>;
}

const PINNED: OssCatalog["pinned"] = [
  // --- Russo walkthrough + ads (2026-07) ---
  {
    name: "HyperFrames",
    url: "https://github.com/heygen-com/hyperframes",
    use: "HTML compose → check/snapshot/inspect/render 1080p — Magmos product walkthrough",
    license: "Apache-2.0",
  },
  {
    name: "ad-maker (Branda)",
    url: "https://github.com/context-dot-dev/ad-maker",
    use: "Domain → on-brand still ads — npm run ad-maker magmos",
    license: "see repo",
  },
  {
    name: "goose-skills",
    url: "https://github.com/gooseworks-ai/goose-skills",
    use: "200+ GTM skills — npx gooseworks install --all; bot runtime: npm run skills adopt",
    license: "MIT",
  },
  // --- User-provided Magmos editor stack (2026-07) ---
  {
    name: "OpenMontage",
    url: "https://github.com/calesthio/OpenMontage",
    use: "Agentic video production — pipeline/skills patterns for edit-auto + HyperFrames",
    license: "see repo",
  },
  {
    name: "freecut",
    url: "https://github.com/Moh4696/freecut",
    use: "PRIMARY CapCut replacement — Whisper/VibeVoice → EDL → ffmpeg (patterns in edit/)",
    license: "MIT",
  },
  {
    name: "VibeVoice",
    url: "https://github.com/microsoft/VibeVoice",
    use: "Long-form ASR (Who/When/What) + research TTS — VIBEVOICE_ASR_URL backend",
    license: "MIT",
  },
  {
    name: "voicebox",
    url: "https://github.com/jamiepine/voicebox",
    use: "Local voice clone/TTS studio — VO alternative to Venice",
    license: "see repo",
  },
  {
    name: "openshorts",
    url: "https://github.com/mutonby/openshorts",
    use: "Self-hosted clip generator + AI shorts — 9:16 hooks for Magmos ads",
    license: "MIT",
  },
  {
    name: "web-to-app",
    url: "https://github.com/shiaho777/web-to-app",
    use: "Package magmoslabs.vercel.app as Android demo APK (post–X profile)",
    license: "Unlicense",
  },
  {
    name: "Diffusion Studio editor",
    url: "https://github.com/diffusionstudio/editor",
    use: "Agent TSX compositions → dapi mount/render — npm run dse · FFmpeg for agents",
    license: "MPL-2.0",
  },
  {
    name: "open-source-ai-goldmine",
    url: "https://github.com/Moh4696/open-source-ai-goldmine",
    use: "Curated lab OSS list (Anthropic/OpenAI/Google/Meta…) — agent learning",
    license: "curated list",
  },
  // --- Already in stack ---
  {
    name: "HeyGen MCP",
    url: "https://mcp.heygen.com/mcp/v1/",
    use: "OAuth Video Agent in Cursor — no API key",
  },
  {
    name: "HeyGen CLI",
    url: "https://developers.heygen.com/cli",
    use: "heygen video create / download from shell or CI",
  },
  {
    name: "x-algorithm",
    url: "https://github.com/xai-org/x-algorithm",
    use: "X ranking signals — already wired in algorithm/x-signals.ts",
  },
  {
    name: "Remotion",
    url: "https://github.com/remotion-dev/remotion",
    use: "React video — compare vs HyperFrames / OpenMontage compositions",
    license: "Remotion License",
  },
  {
    name: "FFmpeg.wasm",
    url: "https://github.com/ffmpegwasm/ffmpeg.wasm",
    use: "Browser/server ffmpeg for edit pipeline",
  },
  {
    name: "Mysten Sui SDK",
    url: "https://github.com/MystenLabs/sui",
    use: "Sandbox wallet + testnet faucet",
  },
];

const DISCOVERY_QUERIES: Array<{ category: string; query: string; fetchTop?: boolean }> = [
  { category: "heygen", query: "site:github.com heygen hyperframes OR video agent", fetchTop: true },
  { category: "ugc-video", query: "site:github.com open source ugc video generator remotion" },
  { category: "avatar", query: "site:github.com AI avatar video lip sync open source" },
  { category: "motion-graphics", query: "site:github.com HTML video render headless chrome ffmpeg" },
  { category: "sui-web3", query: "site:github.com sui testnet faucet playwright e2e" },
  { category: "growth", query: "site:github.com social media growth automation open source" },
  { category: "captions", query: "site:github.com auto captions video whisper ffmpeg" },
  { category: "mcp", query: "site:github.com MCP server video generation model context protocol" },
];

function catalogPath(): string {
  return join(DATA_DIR, "research", "oss-catalog.json");
}

export function loadOssCatalog(): OssCatalog | null {
  const p = catalogPath();
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf8")) as OssCatalog;
}

/** Run all discovery queries — uses TinyFish search (+ optional page fetch) */
export async function discoverOssTools(opts?: { limitPerQuery?: number }): Promise<OssCatalog> {
  assertDataDir();
  const researchDir = join(DATA_DIR, "research");
  if (!existsSync(researchDir)) mkdirSync(researchDir, { recursive: true });

  const limit = opts?.limitPerQuery ?? 6;
  const entries: OssCatalogEntry[] = [];

  for (const { category, query, fetchTop } of DISCOVERY_QUERIES) {
    const hits = await tinyfishSearch(query, limit);
    let fetchedNotes: string | undefined;
    if (fetchTop && hits[0]?.url) {
      try {
        fetchedNotes = (await tinyfishFetchText(hits[0].url)).slice(0, 2000);
      } catch {
        fetchedNotes = "(fetch failed — check URL manually)";
      }
    }
    entries.push({
      id: category,
      category,
      query,
      hits,
      fetchedNotes,
      at: Date.now(),
    });
  }

  const catalog: OssCatalog = {
    version: 1,
    updatedAt: Date.now(),
    entries,
    pinned: PINNED,
  };

  writeFileSync(catalogPath(), JSON.stringify(catalog, null, 2));
  return catalog;
}

export function formatOssCatalog(c: OssCatalog): string {
  const lines = [
    "# OSS tool catalog",
    `Updated: ${new Date(c.updatedAt).toISOString()}`,
    "",
    "## Pinned (official / high-signal)",
  ];
  for (const p of c.pinned) {
    lines.push(`- **${p.name}** — ${p.use}`);
    lines.push(`  ${p.url}${p.license ? ` (${p.license})` : ""}`);
  }
  lines.push("", "## TinyFish discoveries");
  for (const e of c.entries) {
    lines.push(`\n### ${e.category}`);
    lines.push(`Query: \`${e.query}\``);
    for (const h of e.hits) {
      lines.push(`- [${h.title}](${h.url})`);
      if (h.snippet) lines.push(`  ${h.snippet.slice(0, 120)}`);
    }
    if (e.fetchedNotes) {
      lines.push("", "Top page excerpt:", e.fetchedNotes.slice(0, 500) + "…");
    }
  }
  lines.push("", `Full JSON: ${catalogPath()}`);
  return lines.join("\n");
}
