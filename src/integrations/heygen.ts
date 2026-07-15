/**
 * HeyGen Video Agent API v3 — docs: https://developers.heygen.com/docs/quick-start
 * Auth: X-Api-Key header · Base: https://api.heygen.com
 */
import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { env, DATA_DIR, assertDataDir } from "../config.js";
import { newId } from "../store.js";

const BASE = "https://api.heygen.com";

export interface HeyGenSession {
  session_id: string;
  status: string;
  video_id: string | null;
}

export interface HeyGenVideo {
  id: string;
  status: "pending" | "processing" | "completed" | "failed" | string;
  video_url?: string;
  failure_code?: string;
  failure_message?: string;
  duration?: number;
}

function apiKey(): string {
  const k = env("HEYGEN_API_KEY");
  if (!k) throw new Error("HEYGEN_API_KEY required — Settings → API at app.heygen.com");
  return k;
}

function headers(): HeadersInit {
  return { "X-Api-Key": apiKey(), "Content-Type": "application/json", Accept: "application/json" };
}

async function parseJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!res.ok) throw new Error(`HeyGen ${res.status}: ${text.slice(0, 400)}`);
  return JSON.parse(text) as T;
}

/** POST /v3/video-agents — prompt → session */
export async function createVideoAgent(
  prompt: string,
  opts?: { callbackUrl?: string },
): Promise<HeyGenSession> {
  const body: Record<string, string> = { prompt };
  if (opts?.callbackUrl) body.callback_url = opts.callbackUrl;
  const res = await fetch(`${BASE}/v3/video-agents`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });
  const data = await parseJson<{ data: HeyGenSession }>(res);
  return data.data;
}

/** GET /v3/video-agents/{session_id} */
export async function getVideoAgentSession(sessionId: string): Promise<HeyGenSession> {
  const res = await fetch(`${BASE}/v3/video-agents/${sessionId}`, { headers: headers() });
  const data = await parseJson<{ data: HeyGenSession }>(res);
  return data.data;
}

/** GET /v3/videos/{video_id} */
export async function getVideo(videoId: string): Promise<HeyGenVideo> {
  const res = await fetch(`${BASE}/v3/videos/${videoId}`, { headers: headers() });
  const data = await parseJson<{ data: HeyGenVideo }>(res);
  return data.data;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Poll session → video_id → video_url, download MP4 to data/exports/ */
export async function runVideoAgent(
  prompt: string,
  opts?: { maxWaitMs?: number; download?: boolean },
): Promise<{
  sessionId: string;
  videoId: string;
  videoUrl: string;
  localPath?: string;
  duration?: number;
}> {
  const maxWait = opts?.maxWaitMs ?? 20 * 60_000;
  const started = Date.now();
  const session = await createVideoAgent(prompt);
  const sessionId = session.session_id;

  let videoId: string | null = session.video_id;
  while (!videoId && Date.now() - started < maxWait) {
    await sleep(5000);
    const s = await getVideoAgentSession(sessionId);
    videoId = s.video_id;
    if (s.status === "failed") throw new Error(`HeyGen session failed: ${sessionId}`);
  }
  if (!videoId) throw new Error(`HeyGen timeout waiting for video_id (session ${sessionId})`);

  let video: HeyGenVideo;
  do {
    await sleep(10_000);
    video = await getVideo(videoId);
    if (video.status === "failed") {
      throw new Error(
        `HeyGen render failed: ${video.failure_code ?? ""} ${video.failure_message ?? ""}`.trim(),
      );
    }
    if (Date.now() - started > maxWait) {
      throw new Error(`HeyGen timeout waiting for video ${videoId}`);
    }
  } while (video.status !== "completed");

  if (!video.video_url) throw new Error(`HeyGen completed but no video_url for ${videoId}`);

  let localPath: string | undefined;
  if (opts?.download !== false) {
    assertDataDir();
    const dir = join(DATA_DIR, "exports");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    localPath = join(dir, `heygen-${newId("vid")}.mp4`);
    const dl = await fetch(video.video_url);
    if (!dl.ok) throw new Error(`HeyGen download ${dl.status}`);
    await pipeline(dl.body!, createWriteStream(localPath));
  }

  return {
    sessionId,
    videoId,
    videoUrl: video.video_url,
    localPath,
    duration: video.duration,
  };
}

export function hasHeyGen(): boolean {
  return Boolean(env("HEYGEN_API_KEY"));
}

/** MCP alternative — OAuth, no API key: https://mcp.heygen.com/mcp/v1/ */
export const HEYGEN_MCP_URL = "https://mcp.heygen.com/mcp/v1/";
