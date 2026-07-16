/**
 * Daily social max — TinyFish across X / YouTube / TikTok / Reddit / LinkedIn / IG.
 * Watches winners, extracts craft patterns, writes into self-learn + brain.
 * This is the missing loop: learn from what's actually winning, then create.
 */
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { hasTinyfish } from "../research/tinyfish.js";
import { DATA_DIR, assertDataDir } from "../config.js";
import { tinyfishSearch, tinyfishFetchText } from "../research/tinyfish.js";
import { discoverTrending, type RankedTrend } from "./trending.js";
import { watchVideo, buildPlaybook } from "../video/watch.js";
import { learn } from "../brain/self-learn.js";
import { remember } from "../brain/memory.js";
import { smartChat } from "../brain/smart.js";
import { xAlgorithmPromptBlock } from "../algorithm/x-signals.js";
import { newId } from "../store.js";

export interface SocialMaxResult {
  id: string;
  at: number;
  trends: RankedTrend[];
  watched: string[];
  craftRules: string[];
  winningHooks: string[];
  antiAiRules: string[];
  reportPath: string;
}

const PLATFORM_QUERIES = [
  "site:x.com viral fintech OR \"digital dollar\" OR \"stable\" OR waitlist product launch",
  "youtube short high views personal finance storytelling hook clear copy",
  "tiktok product demo phone screen recording high views no face",
  "reddit r/personalfinance OR r/SaaS launch post high upvotes",
  "linkedin fintech product launch post high engagement plain english",
  "best short form fintech ad hooks idle money OR dollar earns",
  "github anti AI slop writing guidelines crisp product copy",
];

const JUNK_HOOK =
  /capcut|corona|re-fungible|cursor killer|walk effect|trending music|ai walk|template 2026|create your own social/i;

function isUsefulHook(h: string): boolean {
  if (!h || h.length < 4) return false;
  if (JUNK_HOOK.test(h)) return false;
  return true;
}

async function harvestAntiAiCraft(): Promise<string[]> {
  const defaults = [
    "Say the product in plain words a friend would use — never metaphor stacks",
    "One claim per sentence. No filler adjectives",
    "Show real UI or real proof — never invent features",
    "Hook in first 1.5s / first line — outcome, not brand name",
    "Cut dead air. Every 2–3s a new beat",
    "Ban: forge, smelt, thermal, council jargon in public ads",
    "Ban: compostible typo, guaranteed APY, AI-face stock",
  ];
  if (!hasTinyfish()) return defaults;
  try {
    const hits = await tinyfishSearch("stop AI hallucinations writing guidelines crisp copy", 5);
    const extras: string[] = [];
    for (const h of hits.slice(0, 3)) {
      try {
        const text = await tinyfishFetchText(h.url);
        const llm = await smartChat(
          "learn",
          `Extract 5 concrete anti-AI / anti-slop writing rules for product ads and social posts from this page. Return JSON {"rules":["..."]}. Plain English only.\n\n${text.slice(0, 4000)}`,
          { projectId: "magmos", feature: "global" },
        );
        const parsed = JSON.parse(llm.content.replace(/```json|```/g, "").trim()) as {
          rules?: string[];
        };
        extras.push(...(parsed.rules ?? []).slice(0, 5));
      } catch {
        /* skip */
      }
    }
    return [...defaults, ...extras].slice(0, 14);
  } catch {
    return defaults;
  }
}

export async function runSocialMax(opts?: {
  projectId?: string;
  watchTop?: number;
  skipWatch?: boolean;
}): Promise<SocialMaxResult> {
  assertDataDir();
  const projectId = opts?.projectId ?? "magmos";
  const id = newId("smax");
  const dir = join(DATA_DIR, "improve", "social-max");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const trends: RankedTrend[] = [];
  if (hasTinyfish()) {
    const discovered = await discoverTrending({
      brand: projectId === "magmos" || projectId === "veil" ? (projectId as "magmos" | "veil") : "both",
      categories: "all",
      limit: 20,
    });
    trends.push(...discovered);

    for (const q of PLATFORM_QUERIES) {
      try {
        const hits = await tinyfishSearch(q, 4);
        for (const h of hits) {
          if (!h.url || trends.some((t) => t.url === h.url)) continue;
          const platform = /youtube|youtu\.be/i.test(h.url)
            ? "youtube"
            : /tiktok/i.test(h.url)
              ? "tiktok"
              : /x\.com|twitter/i.test(h.url)
                ? "x"
                : "other";
          if (platform === "other" && !/reddit|linkedin|instagram/i.test(h.url)) continue;
          trends.push({
            url: h.url.split("&")[0],
            title: h.title,
            snippet: h.snippet ?? "",
            platform: platform === "other" ? "other" : platform,
            engagementScore: 1,
            engagementLabel: "platform-scan",
            query: q,
            category: "all",
          });
        }
      } catch {
        /* continue */
      }
    }
  }

  const watched: string[] = [];
  const watchN = opts?.watchTop ?? 4;
  if (!opts?.skipWatch) {
    for (const t of trends.slice(0, watchN)) {
      if (!/youtube|youtu\.be|tiktok|x\.com\/.+\/status/i.test(t.url)) continue;
      try {
        await watchVideo(t.url, `social-max ${t.platform} ${t.engagementLabel}`);
        watched.push(t.url);
      } catch {
        /* skip broken */
      }
    }
    if (watched.length) buildPlaybook();
  }

  const antiAiRules = await harvestAntiAiCraft();

  let winningHooks: string[] = [];
  let craftRules: string[] = [...antiAiRules];
  try {
    const sample = trends
      .slice(0, 12)
      .map((t) => `- [${t.platform}] ${t.title} (${t.engagementLabel})`)
      .join("\n");
    const llm = await smartChat(
      "learn",
      `${xAlgorithmPromptBlock()}

Winning posts/videos scanned today:
${sample || "(no TinyFish hits — use evergreen short-form craft)"}

Return JSON only:
{
  "winningHooks":["≤8 word hooks that could sell Magmos — a $1 digital dollar that earns while you hold"],
  "craftRules":["how to edit/write like winners — plain English, product-first"],
  "neverSay":["jargon and AI slop to ban"]
}
HARD RULES:
- Magmos public voice only. NO CapCut template names, NO random AI tool drama, NO pandemic titles.
- Hooks must be about money clarity, idle dollars, holding $1, waitlist, calm product UI.
- If a scanned title is junk (CapCut, corona, RFT), IGNORE it — do not copy it into winningHooks.
Never say: forge, smelt, thermal, APY, real yield.`,
      { projectId, feature: "global" },
    );
    const parsed = JSON.parse(llm.content.replace(/```json|```/g, "").trim()) as {
      winningHooks?: string[];
      craftRules?: string[];
      neverSay?: string[];
    };
    winningHooks = (parsed.winningHooks ?? []).filter(isUsefulHook).slice(0, 8);
    if (!winningHooks.length) {
      winningHooks = [
        "Your idle dollar can work",
        "Still $1. Still earning.",
        "No lockups. Just hold.",
        "See your reserves on-chain",
      ];
    }
    craftRules = [
      ...(parsed.craftRules ?? []),
      ...(parsed.neverSay?.map((n) => `Never: ${n}`) ?? []),
      ...antiAiRules,
      "Ignore CapCut/template/AI-drama trends — steal craft, not junk titles",
    ];
  } catch {
    winningHooks = [
      "Your idle dollars can work",
      "Still $1. Still earning.",
      "No lockups. Just hold.",
    ];
  }

  learn({
    projectId,
    feature: "grow",
    outcome: trends.length ? "success" : "partial",
    summary: `social-max: ${trends.length} trends, watched ${watched.length}`,
    lessons: [
      ...craftRules.slice(0, 10),
      "Daily: TinyFish X/YT/TikTok/Reddit → watch winners → update recipe before creating",
      "Optimize for x-algorithm: reply + quote + video_view + dwell",
      "Public Magmos copy = plain English. Product mechanics stay in docs/Q&A only",
    ],
    meta: { id, trends: trends.length, watched: watched.length },
  });

  remember({
    kind: "insight",
    title: `Social max ${new Date().toISOString().slice(0, 10)}`,
    importance: 5,
    source: "social-max",
    tags: ["social", "learn", "x", "tiktok", "youtube", projectId],
    body: [
      `Trends: ${trends.length} · Watched: ${watched.length}`,
      "Hooks:",
      ...winningHooks.map((h) => `- ${h}`),
      "Craft:",
      ...craftRules.slice(0, 12).map((r) => `- ${r}`),
    ].join("\n"),
  });

  const reportPath = join(dir, `${id}.json`);
  const result: SocialMaxResult = {
    id,
    at: Date.now(),
    trends: trends.slice(0, 40),
    watched,
    craftRules,
    winningHooks,
    antiAiRules,
    reportPath,
  };
  writeFileSync(reportPath, JSON.stringify(result, null, 2));
  writeFileSync(join(dir, "latest.json"), JSON.stringify(result, null, 2));
  writeFileSync(
    join(dir, "LATEST.md"),
    [
      `# Social max — ${id}`,
      "",
      "## Winning hooks",
      ...winningHooks.map((h) => `- ${h}`),
      "",
      "## Craft rules",
      ...craftRules.map((r) => `- ${r}`),
      "",
      "## Top trends",
      ...trends.slice(0, 15).map((t) => `- [${t.platform}] ${t.title} — ${t.url}`),
      "",
      "## Watched",
      ...watched.map((u) => `- ${u}`),
    ].join("\n"),
  );

  return result;
}

export function loadLatestSocialMax(): SocialMaxResult | null {
  const p = join(DATA_DIR, "improve", "social-max", "latest.json");
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf8")) as SocialMaxResult;
}

export function formatSocialMax(r: SocialMaxResult): string {
  return [
    `# Social max — ${r.id}`,
    `Trends: ${r.trends.length} · Watched: ${r.watched.length}`,
    "",
    "## Hooks",
    ...r.winningHooks.map((h) => `- ${h}`),
    "",
    "## Craft",
    ...r.craftRules.slice(0, 12).map((c) => `- ${c}`),
    "",
    `Report: ${r.reportPath}`,
  ].join("\n");
}
