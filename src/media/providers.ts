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
    status: env("HEYGEN_API_KEY") ? "queued" : "manual",
    instructions:
      "HeyGen free tier: avatar video at app.heygen.com — use prompt as script. Export 9:16 for X.",
    createdAt: Date.now(),
  };
  saveJob(job);
  return job;
}

export function queueKling(prompt: string): MediaJob {
  const job: MediaJob = {
    id: newId("kling"),
    provider: "kling",
    prompt,
    status: env("KLING_API_KEY") ? "queued" : "manual",
    instructions:
      "Kling AI: text-to-video b-roll at klingai.com free credits — 5s clips for dashboard screen overlays.",
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
    status: env("HYPERFRAMES_API_KEY") ? "queued" : "manual",
    instructions:
      "Hyperframes: speed-ramp screen recordings / UI motion — use for demo walkthrough hype cuts.",
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
