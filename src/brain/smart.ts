/**
 * Unified smart stack — Venice + OpenAI + TinyFish.
 * Provider cascade for text; TinyFish for live web truth; self-learn for memory.
 */
import { env, hasOpenAI } from "../config.js";
import { hasVenice } from "../integrations/venice.js";
import { hasTinyfish, tinyfishSearch, tinyfishFetchText } from "../research/tinyfish.js";
import {
  chatCompletion,
  type ChatResult,
  type LlmProvider,
  type LlmTask,
  listConfiguredProviders,
} from "../ai/router.js";
import { learn, type LearnFeature } from "./self-learn.js";
import { remember } from "./memory.js";

export interface SmartStatus {
  venice: boolean;
  openai: boolean;
  flockai: boolean;
  tinyfish: boolean;
  order: LlmProvider[];
}

export function smartStatus(): SmartStatus {
  const order = listConfiguredProviders();
  return {
    venice: hasVenice(),
    openai: hasOpenAI(),
    flockai: Boolean(env("FLOCKAI_API_URL") && env("FLOCKAI_API_KEY")),
    tinyfish: hasTinyfish(),
    order,
  };
}

export async function formatSmartStatus(): Promise<string> {
  const s = smartStatus();
  return [
    `# Smart stack`,
    `Cascade order: ${s.order.join(" → ") || "(none configured)"}`,
    `- Venice: ${s.venice ? "on" : "off"}`,
    `- OpenAI: ${s.openai ? "on" : "off"}`,
    `- FlockAI: ${s.flockai ? "on" : "off"}`,
    `- TinyFish: ${s.tinyfish ? "on" : "off"}`,
  ].join("\n");
}

/** Smart chat with failover across Venice → OpenAI → Flock */
export async function smartChat(
  task: LlmTask,
  userContent: string,
  opts?: { projectId?: string; feature?: LearnFeature },
): Promise<ChatResult & { attempted: LlmProvider[] }> {
  const attempted: LlmProvider[] = [];
  const providers = listConfiguredProviders();
  if (!providers.length) {
    throw new Error("No LLM providers — set VENICE_API_KEY and/or OPENAI_API_KEY");
  }

  let lastErr: unknown;
  for (const provider of providers) {
    attempted.push(provider);
    try {
      const result = await chatCompletion(task, userContent, {
        context: opts?.projectId,
        provider,
        feature: opts?.feature,
      });
      return { ...result, attempted };
    } catch (e) {
      lastErr = e;
      console.warn(`smartChat ${provider} failed:`, e instanceof Error ? e.message : e);
    }
  }

  learn({
    projectId: opts?.projectId ?? "global",
    feature: opts?.feature ?? "global",
    outcome: "fail",
    summary: `All LLM providers failed for task=${task}`,
    errors: [lastErr instanceof Error ? lastErr.message : String(lastErr)],
    lessons: ["Keep Venice + OpenAI keys healthy; cascade needs ≥1 live provider"],
  });
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export async function smartResearch(opts: {
  query: string;
  projectId?: string;
  fetchTop?: boolean;
}): Promise<{ hits: Array<{ title: string; url: string; snippet?: string }>; notes?: string }> {
  if (!hasTinyfish()) {
    return { hits: [], notes: "TinyFish not configured" };
  }
  const hits = await tinyfishSearch(opts.query, 8);
  let notes: string | undefined;
  if (opts.fetchTop && hits[0]?.url) {
    try {
      notes = await tinyfishFetchText(hits[0].url);
    } catch (e) {
      notes = `fetch failed: ${e instanceof Error ? e.message : e}`;
    }
  }
  remember({
    kind: "insight",
    title: `research:${opts.query.slice(0, 60)}`,
    importance: 3,
    source: "tinyfish",
    tags: ["tinyfish", "research", opts.projectId ?? "global"],
    body: hits.map((h) => `${h.title} — ${h.url}`).join("\n") + (notes ? `\n\n${notes.slice(0, 1200)}` : ""),
    url: hits[0]?.url,
  });
  return { hits, notes };
}

export async function smartCritique(opts: {
  projectId: string;
  feature: LearnFeature;
  artifactSummary: string;
  errors?: string[];
}): Promise<{ score: number; lessons: string[]; ok: boolean }> {
  const prompt = `Critique this ${opts.feature} run for ${opts.projectId}.
Artifact:
${opts.artifactSummary.slice(0, 3000)}
Errors:
${(opts.errors ?? []).join("\n") || "none"}

Return JSON: {"score":0-100,"ok":boolean,"lessons":["…","…"]}`;

  try {
    const res = await smartChat("learn", prompt, {
      projectId: opts.projectId,
      feature: opts.feature,
    });
    const parsed = JSON.parse(res.content.replace(/```json|```/g, "").trim()) as {
      score?: number;
      ok?: boolean;
      lessons?: string[];
    };
    const lessons = parsed.lessons ?? [];
    learn({
      projectId: opts.projectId,
      feature: opts.feature,
      outcome: parsed.ok === false || (parsed.score ?? 0) < 50 ? "fail" : parsed.ok ? "success" : "partial",
      summary: `Smart critique score=${parsed.score ?? "?"} via ${res.provider}`,
      errors: opts.errors,
      lessons,
      meta: { score: parsed.score, attempted: res.attempted },
    });
    return {
      score: parsed.score ?? 0,
      lessons,
      ok: Boolean(parsed.ok ?? (parsed.score ?? 0) >= 60),
    };
  } catch (e) {
    learn({
      projectId: opts.projectId,
      feature: opts.feature,
      outcome: "partial",
      summary: "Smart critique skipped",
      errors: [e instanceof Error ? e.message : String(e)],
      lessons: ["Wire Venice/OpenAI so critique can run"],
    });
    return { score: 0, lessons: [], ok: false };
  }
}
