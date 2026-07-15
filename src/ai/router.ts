/**
 * Locked LLM router — Venice → OpenAI → Flock cascade.
 * Venice = venice.ai — text, image, audio, video (see integrations/venice.ts).
 * Every call injects brain + skills + self-learn context.
 */
import OpenAI from "openai";
import { env, hasOpenAI } from "../config.js";
import { tasteSystemSuffix } from "../taste.js";
import { eddyLaunchSystemSuffix, eddyTrailerJsonSchema } from "../studio/eddy-launch.js";
import { hasVenice, veniceChat, veniceConfig } from "../integrations/venice.js";
import { brainContextSuffix } from "../brain/memory.js";
import { learnContextSuffix, type LearnFeature } from "../brain/self-learn.js";
import { skillsContextForTask } from "../skills/catalog.js";

export type LlmProvider = "openai" | "flockai" | "venice" | "vernice";
export type LlmTask =
  | "draft"
  | "trailer"
  | "launch"
  | "qa"
  | "creative"
  | "manifest"
  | "engage"
  | "walkthrough"
  | "openmontage"
  | "ad-maker"
  | "learn"
  | "ops"
  | "grow";

export interface ChatResult {
  content: string;
  provider: LlmProvider;
  model: string;
}

interface TaskSpec {
  temperature: number;
  json: boolean;
  system: (ctx?: string) => string;
  feature?: LearnFeature;
}

const TASKS: Record<LlmTask, TaskSpec> = {
  draft: {
    temperature: 0.7,
    json: false,
    feature: "draft",
    system: () =>
      `X growth copywriter. Short posts, no slop, no guaranteed returns.${tasteSystemSuffix()}`,
  },
  trailer: {
    temperature: 0.65,
    json: true,
    feature: "global",
    system: (ctx) =>
      `Film director + trailer editor.${ctx ? ` Project: ${ctx}.` : ""} JSON only. Sync cuts to BPM. No crypto slop.${tasteSystemSuffix()}\n\n${eddyLaunchSystemSuffix()}\n\nSchema:\n${eddyTrailerJsonSchema()}`,
  },
  launch: {
    temperature: 0.6,
    json: true,
    feature: "global",
    system: (ctx) =>
      `Launch video strategist — sorts hooks, proof, CTA.${ctx ? ` Project: ${ctx}.` : ""} JSON only.${tasteSystemSuffix()}\n\n${eddyLaunchSystemSuffix()}`,
  },
  qa: {
    temperature: 0.4,
    json: false,
    feature: "global",
    system: (ctx) =>
      `Product Q&A for ${ctx ?? "the app"}. Accurate, cite reality, no hype.${tasteSystemSuffix()}`,
  },
  creative: {
    temperature: 0.75,
    json: true,
    feature: "global",
    system: () => `UGC creative director. Realistic shots, no fake influencers.${tasteSystemSuffix()}`,
  },
  manifest: {
    temperature: 0.5,
    json: true,
    feature: "edit-auto",
    system: () => `Video edit manifest — cuts, SFX, b-roll slots. JSON only.${tasteSystemSuffix()}`,
  },
  engage: {
    temperature: 0.72,
    json: true,
    feature: "engage",
    system: () => `Quote/reply engagement — witty, not cringe. JSON only.${tasteSystemSuffix()}`,
  },
  walkthrough: {
    temperature: 0.55,
    json: true,
    feature: "walkthrough",
    system: (ctx) =>
      `Product walkthrough director — HyperFrames + smart capture + narration VO. Product is the content (no fake still faces). Optional T2V PiP only if asked.${ctx ? ` Product: ${ctx}.` : ""} JSON only.${tasteSystemSuffix()}`,
  },
  openmontage: {
    temperature: 0.6,
    json: true,
    feature: "global",
    system: (ctx) =>
      `OpenMontage editor — plan cuts, hooks, shorts from footage.${ctx ? ` Brand: ${ctx}.` : ""} JSON only.${tasteSystemSuffix()}`,
  },
  "ad-maker": {
    temperature: 0.7,
    json: true,
    feature: "ad-maker",
    system: (ctx) =>
      `Performance ad creative director (Branda/ad-maker style). Concepts, hooks, visual briefs.${ctx ? ` Brand: ${ctx}.` : ""} JSON only.${tasteSystemSuffix()}`,
  },
  learn: {
    temperature: 0.35,
    json: true,
    feature: "global",
    system: (ctx) =>
      `Self-learning critic for the Magmos growth OS.${ctx ? ` Project: ${ctx}.` : ""} Score runs, extract durable lessons, never invent successes. JSON only.`,
  },
  ops: {
    temperature: 0.55,
    json: false,
    feature: "ops",
    system: (ctx) =>
      `Growth ops lead — marketing, GTM, distribution, creative in one day plan.${ctx ? ` Project: ${ctx}.` : ""}${tasteSystemSuffix()}`,
  },
  grow: {
    temperature: 0.55,
    json: true,
    feature: "grow",
    system: (ctx) =>
      `URL→growth pipeline strategist — TinyFish research + ads + paid floors + UGC.${ctx ? ` Target: ${ctx}.` : ""} JSON only.${tasteSystemSuffix()}`,
  },
};

/** All live brains — preferred first, then Venice → OpenAI → Flock */
export function listConfiguredProviders(): LlmProvider[] {
  const available: LlmProvider[] = [];
  if (hasVenice()) available.push("venice");
  if (hasOpenAI()) available.push("openai");
  if (env("FLOCKAI_API_URL") && env("FLOCKAI_API_KEY")) available.push("flockai");

  let prefer = env("LLM_PROVIDER").toLowerCase();
  if (prefer === "vernice") prefer = "venice";
  if (prefer === "openai" || prefer === "flockai" || prefer === "venice") {
    const rest = available.filter((p) => p !== prefer);
    return available.includes(prefer as LlmProvider)
      ? [prefer as LlmProvider, ...rest]
      : available;
  }
  return available;
}

function resolveProvider(): LlmProvider {
  const list = listConfiguredProviders();
  if (list.length) return list[0];
  if (hasVenice()) return "venice";
  if (env("FLOCKAI_API_URL") && env("FLOCKAI_API_KEY")) return "flockai";
  return "openai";
}

function providerConfig(p: LlmProvider): { baseURL?: string; apiKey: string; model: string } {
  if (p === "venice") {
    const cfg = hasVenice() ? veniceConfig() : null;
    return {
      baseURL: cfg?.baseUrl,
      apiKey: cfg?.apiKey ?? "",
      model: cfg?.textModel ?? "venice-uncensored",
    };
  }
  if (p === "flockai") {
    return {
      baseURL: env("FLOCKAI_API_URL"),
      apiKey: env("FLOCKAI_API_KEY"),
      model: env("FLOCKAI_MODEL", "default"),
    };
  }
  return {
    apiKey: env("OPENAI_API_KEY"),
    model: env("OPENAI_MODEL", "gpt-4o-mini"),
  };
}

async function callProvider(
  provider: LlmProvider,
  task: LlmTask,
  messages: Array<{ role: "system" | "user"; content: string }>,
  spec: TaskSpec,
): Promise<ChatResult> {
  if (provider === "venice") {
    const cfg = veniceConfig();
    const content = await veniceChat(messages, {
      model: cfg.textModel,
      json: spec.json,
      temperature: spec.temperature,
    });
    return { content, provider: "venice", model: cfg.textModel };
  }

  const cfg = providerConfig(provider);
  if (!cfg.apiKey) throw new Error(`Missing API key for provider ${provider}`);

  if (provider === "openai") {
    const openai = new OpenAI({ apiKey: cfg.apiKey });
    const res = await openai.chat.completions.create({
      model: cfg.model,
      temperature: spec.temperature,
      ...(spec.json ? { response_format: { type: "json_object" as const } } : {}),
      messages,
    });
    const content = res.choices[0]?.message?.content ?? "";
    if (!content) throw new Error(`Empty ${task} response from OpenAI`);
    return { content, provider, model: cfg.model };
  }

  const url = `${cfg.baseURL!.replace(/\/$/, "")}/v1/chat/completions`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: cfg.model,
      temperature: spec.temperature,
      ...(spec.json ? { response_format: { type: "json_object" } } : {}),
      messages,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${provider} ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content ?? "";
  if (!content) throw new Error(`Empty ${task} response from ${provider}`);
  return { content, provider, model: cfg.model };
}

/**
 * Single entry for chat — task-locked system prompt + brain + skills + self-learn.
 * Pass `provider` to pin one brain; omit to use primary (smartChat cascades).
 * Set `failover: true` to try Venice → OpenAI → Flock on failure.
 */
export async function chatCompletion(
  task: LlmTask,
  userContent: string,
  opts?: {
    context?: string;
    provider?: LlmProvider;
    feature?: LearnFeature;
    projectId?: string;
    failover?: boolean;
  },
): Promise<ChatResult> {
  const spec = TASKS[task];
  const feature = opts?.feature ?? spec.feature ?? "global";
  const projectId = opts?.projectId ?? opts?.context;

  const system = `${spec.system(opts?.context)}${brainContextSuffix(10)}${skillsContextForTask(task, 8)}${learnContextSuffix({ projectId, feature })}`;
  const messages = [
    { role: "system" as const, content: system },
    { role: "user" as const, content: userContent },
  ];

  if (opts?.failover) {
    const providers = listConfiguredProviders();
    if (!providers.length) throw new Error("No LLM providers configured");
    let lastErr: unknown;
    for (const p of providers) {
      try {
        return await callProvider(p === "vernice" ? "venice" : p, task, messages, spec);
      } catch (e) {
        lastErr = e;
        console.warn(`chatCompletion failover ${p}:`, e instanceof Error ? e.message : e);
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  }

  let provider = opts?.provider ?? resolveProvider();
  if (provider === "vernice") provider = "venice";
  return callProvider(provider, task, messages, spec);
}

export function llmStatus(): string {
  const cascade = listConfiguredProviders();
  const p = resolveProvider();
  const cfg = providerConfig(p === "vernice" ? "venice" : p);
  const heads = [
    `LLM cascade: ${cascade.join(" → ") || "(none)"}`,
    `Primary: ${p} · ${cfg.model}${cfg.baseURL ? ` · ${cfg.baseURL}` : ""}`,
  ];
  if (hasVenice()) heads.push(formatVeniceStatus());
  return heads.join("\n");
}

export function formatVeniceStatus(): string {
  if (!hasVenice()) return "Venice AI: not configured (set VENICE_API_KEY — https://venice.ai)";
  const cfg = veniceConfig();
  return `Venice AI: text ${cfg.textModel} · image ${cfg.imageModel} · tts ${cfg.ttsModel} · video ${cfg.videoModel}`;
}
