/**
 * Locked LLM router — Venice AI (text) + OpenAI / Flock / QVAC fallbacks.
 * Venice = venice.ai — one API for text, image, audio, video (see integrations/venice.ts).
 */
import OpenAI from "openai";
import { env } from "../config.js";
import { tasteSystemSuffix } from "../taste.js";
import { eddyLaunchSystemSuffix, eddyTrailerJsonSchema } from "../studio/eddy-launch.js";
import { hasVenice, veniceChat, veniceConfig } from "../integrations/venice.js";
import { brainContextSuffix } from "../brain/memory.js";
import { skillsContextForTask } from "../skills/catalog.js";

export type LlmProvider = "openai" | "flockai" | "qvac" | "venice" | "vernice";
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
  | "ad-maker";

export interface ChatResult {
  content: string;
  provider: LlmProvider;
  model: string;
}

interface TaskSpec {
  temperature: number;
  json: boolean;
  system: (ctx?: string) => string;
}

const TASKS: Record<LlmTask, TaskSpec> = {
  draft: {
    temperature: 0.7,
    json: false,
    system: () =>
      `X growth copywriter. Short posts, no slop, no guaranteed returns.${tasteSystemSuffix()}`,
  },
  trailer: {
    temperature: 0.65,
    json: true,
    system: (ctx) =>
      `Film director + trailer editor.${ctx ? ` Project: ${ctx}.` : ""} JSON only. Sync cuts to BPM. No crypto slop.${tasteSystemSuffix()}\n\n${eddyLaunchSystemSuffix()}\n\nSchema:\n${eddyTrailerJsonSchema()}`,
  },
  launch: {
    temperature: 0.6,
    json: true,
    system: (ctx) =>
      `Launch video strategist — sorts hooks, proof, CTA.${ctx ? ` Project: ${ctx}.` : ""} JSON only.${tasteSystemSuffix()}\n\n${eddyLaunchSystemSuffix()}`,
  },
  qa: {
    temperature: 0.4,
    json: false,
    system: (ctx) =>
      `Product Q&A for ${ctx ?? "the app"}. Accurate, cite reality, no hype.${tasteSystemSuffix()}`,
  },
  creative: {
    temperature: 0.75,
    json: true,
    system: () => `UGC creative director. Realistic shots, no fake influencers.${tasteSystemSuffix()}`,
  },
  manifest: {
    temperature: 0.5,
    json: true,
    system: () => `Video edit manifest — cuts, SFX, b-roll slots. JSON only.${tasteSystemSuffix()}`,
  },
  engage: {
    temperature: 0.72,
    json: false,
    system: () => `Quote/reply engagement — witty, not cringe.${tasteSystemSuffix()}`,
  },
  walkthrough: {
    temperature: 0.55,
    json: true,
    system: (ctx) =>
      `Product walkthrough director — HyperFrames + Venice presenter PiP (HeyGen optional). Brief, narration, storyboard, capture plan, timings.${ctx ? ` Product: ${ctx}.` : ""} JSON only.${tasteSystemSuffix()}`,
  },
  openmontage: {
    temperature: 0.6,
    json: true,
    system: (ctx) =>
      `OpenMontage editor — plan cuts, hooks, shorts from footage.${ctx ? ` Brand: ${ctx}.` : ""} JSON only.${tasteSystemSuffix()}`,
  },
  "ad-maker": {
    temperature: 0.7,
    json: true,
    system: (ctx) =>
      `Performance ad creative director (Branda/ad-maker style). Concepts, hooks, visual briefs.${ctx ? ` Brand: ${ctx}.` : ""} JSON only.${tasteSystemSuffix()}`,
  },
};

function resolveProvider(): LlmProvider {
  const forced = env("LLM_PROVIDER").toLowerCase();
  if (forced === "vernice") return "venice";
  if (forced === "flockai" || forced === "qvac" || forced === "openai" || forced === "venice") {
    return forced as LlmProvider;
  }
  if (hasVenice()) return "venice";
  if (env("FLOCKAI_API_URL") && env("FLOCKAI_API_KEY")) return "flockai";
  if (env("QVAC_API_URL") && env("QVAC_API_KEY")) return "qvac";
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
  if (p === "qvac") {
    return {
      baseURL: env("QVAC_API_URL"),
      apiKey: env("QVAC_API_KEY"),
      model: env("QVAC_MODEL", "default"),
    };
  }
  return {
    apiKey: env("OPENAI_API_KEY"),
    model: env("OPENAI_MODEL", "gpt-4o-mini"),
  };
}

/** Single entry for chat — enforces task-locked system prompt */
export async function chatCompletion(
  task: LlmTask,
  userContent: string,
  opts?: { context?: string; provider?: LlmProvider },
): Promise<ChatResult> {
  const spec = TASKS[task];
  let provider = opts?.provider ?? resolveProvider();
  if (provider === "vernice") provider = "venice";

  const system = `${spec.system(opts?.context)}${brainContextSuffix(10)}${skillsContextForTask(task, 8)}`;
  const messages = [
    { role: "system" as const, content: system },
    { role: "user" as const, content: userContent },
  ];

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

export function llmStatus(): string {
  const p = resolveProvider();
  if (p === "venice" && hasVenice()) return formatVeniceStatus();
  const cfg = providerConfig(p);
  return `LLM: ${p} · model ${cfg.model}${cfg.baseURL ? ` · ${cfg.baseURL}` : ""}`;
}

export function formatVeniceStatus(): string {
  if (!hasVenice()) return "Venice AI: not configured (set VENICE_API_KEY — https://venice.ai)";
  const cfg = veniceConfig();
  return `Venice AI: text ${cfg.textModel} · image ${cfg.imageModel} · tts ${cfg.ttsModel} · video ${cfg.videoModel}`;
}
