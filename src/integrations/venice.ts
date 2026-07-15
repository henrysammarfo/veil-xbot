/**
 * Venice AI — one API for text, image, audio, video.
 * @see https://docs.venice.ai/overview/about-venice
 *
 * Env (pick one naming scheme):
 *   VENICE_API_KEY  or  VERNICE_API_KEY  (legacy alias)
 *   VENICE_API_URL  default https://api.venice.ai/api/v1
 */
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { env, DATA_DIR, assertDataDir } from "../config.js";
import { newId } from "../store.js";

export const VENICE_DEFAULT_BASE = "https://api.venice.ai/api/v1";

export type VeniceModelType =
  | "text"
  | "image"
  | "video"
  | "tts"
  | "asr"
  | "music"
  | "embedding"
  | "all";

export interface VeniceConfig {
  apiKey: string;
  baseUrl: string;
  textModel: string;
  imageModel: string;
  ttsModel: string;
  videoModel: string;
}

export function hasVenice(): boolean {
  return Boolean(veniceApiKey());
}

export function veniceApiKey(): string {
  return env("VENICE_API_KEY") || env("VERNICE_API_KEY");
}

export function veniceConfig(): VeniceConfig {
  const apiKey = veniceApiKey();
  if (!apiKey) throw new Error("Set VENICE_API_KEY (or VERNICE_API_KEY) — https://venice.ai");
  const baseUrl =
    env("VENICE_API_URL") ||
    env("VERNICE_API_URL") ||
    VENICE_DEFAULT_BASE;
  return {
    apiKey,
    baseUrl: baseUrl.replace(/\/$/, ""),
    textModel: env("VENICE_TEXT_MODEL") || env("VERNICE_MODEL") || "venice-uncensored",
    imageModel: env("VENICE_IMAGE_MODEL") || "flux-dev",
    ttsModel: env("VENICE_TTS_MODEL") || "tts-kokoro",
    videoModel: env("VENICE_VIDEO_MODEL") || "seedance-2-0-mini-text-to-video",
  };
}

export function veniceHeaders(cfg: VeniceConfig): Record<string, string> {
  return {
    Authorization: `Bearer ${cfg.apiKey}`,
    "Content-Type": "application/json",
  };
}

export interface VeniceModelRow {
  id: string;
  type?: string;
  owned_by?: string;
}

/** GET /models?type=text|image|video|tts|asr|... */
export async function listVeniceModels(type: VeniceModelType = "all"): Promise<VeniceModelRow[]> {
  const cfg = veniceConfig();
  const q = type === "all" ? "" : `?type=${encodeURIComponent(type)}`;
  const res = await fetch(`${cfg.baseUrl}/models${q}`, { headers: veniceHeaders(cfg) });
  if (!res.ok) throw new Error(`Venice models ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { data?: VeniceModelRow[] };
  return data.data ?? [];
}

/** OpenAI-compatible chat — scripts, hooks, Q&A, launch copy */
export async function veniceChat(
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  opts?: { model?: string; json?: boolean; temperature?: number },
): Promise<string> {
  const cfg = veniceConfig();
  const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: "POST",
    headers: veniceHeaders(cfg),
    body: JSON.stringify({
      model: opts?.model ?? cfg.textModel,
      messages,
      temperature: opts?.temperature ?? 0.65,
      ...(opts?.json ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  if (!res.ok) throw new Error(`Venice chat ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content ?? "";
  if (!content) throw new Error("Venice chat returned empty content");
  return content;
}

/** POST /video/quote — authoritative $ before queue */
export async function veniceQuoteVideo(params: {
  model: string;
  duration?: string;
  resolution?: string;
  aspectRatio?: string;
  audio?: boolean;
}): Promise<number> {
  const { quoteVideoUsd } = await import("./venice-credits.js");
  return quoteVideoUsd(params);
}

/** POST /images/generations — poster, quote card, thumbnail */
export async function veniceGenerateImage(
  prompt: string,
  opts?: { model?: string; size?: string; outName?: string; force?: boolean; projectId?: string },
): Promise<{ path: string; revisedPrompt?: string; usd: number }> {
  const model = opts?.model ?? veniceConfig().imageModel;
  const { estimateImageUsd, assertCanSpend, recordSpend } = await import("./venice-credits.js");
  const est = estimateImageUsd(model);
  assertCanSpend(est, { force: opts?.force, label: `Image ${model}` });
  const cfg = veniceConfig();
  const res = await fetch(`${cfg.baseUrl}/images/generations`, {
    method: "POST",
    headers: veniceHeaders(cfg),
    body: JSON.stringify({
      model,
      prompt,
      n: 1,
      size: opts?.size ?? "1024x1024",
      response_format: "b64_json",
    }),
  });
  if (!res.ok) throw new Error(`Venice image ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as {
    data?: Array<{ b64_json?: string; revised_prompt?: string }>;
  };
  const b64 = data.data?.[0]?.b64_json;
  if (!b64) throw new Error("Venice image: no b64_json in response");

  assertDataDir();
  const dir = join(DATA_DIR, "exports", "venice");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const name = opts?.outName ?? `${newId("venice-img")}.png`;
  const path = join(dir, name);
  writeFileSync(path, Buffer.from(b64, "base64"));
  recordSpend(est, {
    modality: "image",
    model,
    note: prompt.slice(0, 80),
    projectId: opts?.projectId,
  });
  return { path, revisedPrompt: data.data?.[0]?.revised_prompt, usd: est };
}

/** POST /audio/speech — VO for launch clips */
export async function veniceTextToSpeech(
  text: string,
  opts?: { model?: string; voice?: string; outName?: string; force?: boolean; projectId?: string },
): Promise<{ path: string; usd: number }> {
  const model = opts?.model ?? veniceConfig().ttsModel;
  const { estimateTtsUsd, assertCanSpend, recordSpend } = await import("./venice-credits.js");
  const est = estimateTtsUsd(text, model);
  assertCanSpend(est, { force: opts?.force, label: `TTS ${model}` });

  const cfg = veniceConfig();
  const res = await fetch(`${cfg.baseUrl}/audio/speech`, {
    method: "POST",
    headers: veniceHeaders(cfg),
    body: JSON.stringify({
      model,
      input: text,
      voice: opts?.voice ?? "af_sarah",
    }),
  });
  if (!res.ok) throw new Error(`Venice TTS ${res.status}: ${(await res.text()).slice(0, 200)}`);

  assertDataDir();
  const dir = join(DATA_DIR, "exports", "venice");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const name = opts?.outName ?? `${newId("venice-tts")}.mp3`;
  const path = join(dir, name);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(path, buf);
  recordSpend(est, {
    modality: "tts",
    model,
    note: `${text.length} chars`,
    projectId: opts?.projectId,
  });
  return { path, usd: est };
}

/** POST /video/queue → poll /video/retrieve (quotes first) */
export async function veniceGenerateVideo(
  prompt: string,
  opts?: {
    model?: string;
    durationSec?: number;
    duration?: string;
    resolution?: string;
    aspectRatio?: string;
    audio?: boolean;
    pollMs?: number;
    maxWaitMs?: number;
    force?: boolean;
    projectId?: string;
  },
): Promise<{ path: string; queueId: string; usd: number }> {
  const cfg = veniceConfig();
  const model = opts?.model ?? cfg.videoModel;
  const duration = opts?.duration ?? `${opts?.durationSec ?? 5}s`;
  const { quoteVideoUsd, assertCanSpend, recordSpend } = await import("./venice-credits.js");
  const quoted = await quoteVideoUsd({
    model,
    duration,
    resolution: opts?.resolution ?? "720p",
    aspectRatio: opts?.aspectRatio ?? "16:9",
    audio: opts?.audio ?? false,
  });
  assertCanSpend(quoted, { force: opts?.force, label: `Video ${model} ${duration}` });

  const durationSec = Math.min(15, Math.max(4, Math.ceil(parseInt(duration.replace(/s$/, ""), 10) || 5)));
  const aspectRatio = opts?.aspectRatio ?? "9:16";
  const queueRes = await fetch(`${cfg.baseUrl}/video/queue`, {
    method: "POST",
    headers: veniceHeaders(cfg),
    body: JSON.stringify({
      model,
      prompt,
      duration: `${durationSec}s`,
      aspect_ratio: aspectRatio,
    }),
  });
  if (!queueRes.ok) {
    throw new Error(`Venice video queue ${queueRes.status}: ${(await queueRes.text()).slice(0, 300)}`);
  }
  const queued = (await queueRes.json()) as { queue_id?: string; id?: string };
  const queueId = queued.queue_id ?? queued.id;
  if (!queueId) throw new Error("Venice video: no queue_id");

  const pollMs = opts?.pollMs ?? 5000;
  const maxWaitMs = opts?.maxWaitMs ?? 600_000;
  const started = Date.now();

  while (Date.now() - started < maxWaitMs) {
    await new Promise((r) => setTimeout(r, pollMs));
    const ret = await fetch(`${cfg.baseUrl}/video/retrieve`, {
      method: "POST",
      headers: veniceHeaders(cfg),
      body: JSON.stringify({ queue_id: queueId }),
    });
    if (!ret.ok) continue;
    const body = (await ret.json()) as {
      status?: string;
      video_url?: string;
      url?: string;
      data?: { url?: string };
    };
    const status = body.status?.toLowerCase();
    if (status === "processing" || status === "queued" || status === "pending") continue;

    const url = body.video_url ?? body.url ?? body.data?.url;
    if (!url) throw new Error(`Venice video done but no URL: ${JSON.stringify(body).slice(0, 200)}`);

    const vidRes = await fetch(url);
    if (!vidRes.ok) throw new Error(`Venice video download ${vidRes.status}`);

    assertDataDir();
    const dir = join(DATA_DIR, "exports", "venice");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const path = join(dir, `${newId("venice-vid")}.mp4`);
    writeFileSync(path, Buffer.from(await vidRes.arrayBuffer()));

    await fetch(`${cfg.baseUrl}/video/complete`, {
      method: "POST",
      headers: veniceHeaders(cfg),
      body: JSON.stringify({ queue_id: queueId }),
    }).catch(() => null);

    recordSpend(quoted, {
      modality: "video",
      model,
      note: prompt.slice(0, 80),
      projectId: opts?.projectId,
    });
    return { path, queueId, usd: quoted };
  }
  throw new Error(`Venice video timeout after ${maxWaitMs}ms (queue ${queueId})`);
}

export function formatVeniceStatus(): string {
  if (!hasVenice()) return "Venice: not configured (set VENICE_API_KEY)";
  const cfg = veniceConfig();
  return `Venice: ${cfg.baseUrl} · text ${cfg.textModel} · image ${cfg.imageModel}`;
}
