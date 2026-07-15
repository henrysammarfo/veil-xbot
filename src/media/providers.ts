import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { env, DATA_DIR, assertDataDir } from "../config.js";
import { newId } from "../store.js";

export interface MediaJob {
  id: string;
  provider: string;
  prompt: string;
  status: "queued" | "manual" | "done";
  instructions: string;
  createdAt: number;
}

function saveJob(job: MediaJob): void {
  assertDataDir();
  writeFileSync(join(DATA_DIR, "media", `${job.id}.json`), JSON.stringify(job, null, 2));
}

/** Suno — no official public API on free tier; queue prompt for manual Suno web UI. */
export function queueSunoMusic(prompt: string): MediaJob {
  const key = env("SUNO_API_KEY");
  const job: MediaJob = {
    id: newId("suno"),
    provider: "suno",
    prompt,
    status: key ? "queued" : "manual",
    instructions: key
      ? "SUNO_API_KEY set — wire your Suno endpoint in src/media/suno.ts when available."
      : "Open https://suno.com → Create → paste prompt → download MP3 → attach in CapCut/DaVinci.",
    createdAt: Date.now(),
  };
  saveJob(job);
  return job;
}

export function queueHeyGen(prompt: string): MediaJob {
  const job: MediaJob = {
    id: newId("heygen"),
    provider: "heygen",
    prompt,
    status: hasHeyGenKey() ? "queued" : "manual",
    instructions: hasHeyGenKey()
      ? "npm start heygen \"prompt\" — Video Agent v3 → data/exports/"
      : "MCP OAuth: https://mcp.heygen.com/mcp/v1/ or set HEYGEN_API_KEY",
    createdAt: Date.now(),
  };
  saveJob(job);
  return job;
}

function hasHeyGenKey(): boolean {
  return Boolean(env("HEYGEN_API_KEY"));
}

export function queueKling(prompt: string): MediaJob {
  const job: MediaJob = {
    id: newId("kling"),
    provider: "kling",
    prompt,
    status: env("KLING_API_KEY") ? "queued" : "manual",
    instructions:
      "SKIP for X posts (watermark). Use npm run clips → Pexels. Prompt saved for reference only.",
    createdAt: Date.now(),
  };
  saveJob(job);
  return job;
}

export function queueHyperframes(prompt: string): MediaJob {
  const job: MediaJob = {
    id: newId("hyperframes"),
    provider: "hyperframes",
    prompt,
    status: "manual",
    instructions:
      "OSS — npm start hyperframes \"title | body\" [--render]. Skill: npx skills add heygen-com/hyperframes",
    createdAt: Date.now(),
  };
  saveJob(job);
  return job;
}

export function queueVeed(prompt: string): MediaJob {
  const job: MediaJob = {
    id: newId("veed"),
    provider: "veed",
    prompt,
    status: env("VEED_API_KEY") ? "queued" : "manual",
    instructions: "VEED.io free: auto-captions + resize for X — upload screen recording.",
    createdAt: Date.now(),
  };
  saveJob(job);
  return job;
}

export function queueNanoBanana(prompt: string): MediaJob {
  const job: MediaJob = {
    id: newId("nano"),
    provider: "nano-banana",
    prompt,
    status: "manual",
    instructions:
      "Gemini / Nano image gen: thumbnail or quote card — export PNG for X image post.",
    createdAt: Date.now(),
  };
  saveJob(job);
  return job;
}
