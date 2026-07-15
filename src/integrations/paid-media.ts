import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { env, DATA_DIR, assertDataDir } from "../config.js";
import { newId } from "../store.js";
import { generateFalImage } from "./fal.js";
import { hasHeyGen, runVideoAgent } from "./heygen.js";
import { scaffoldFromTrailer, renderHyperframes } from "./hyperframes.js";
import type { TrailerProduction } from "../studio/trailer.js";

export interface PaidMediaJob {
  id: string;
  provider: "heygen" | "kling" | "fal" | "hyperframes";
  prompt: string;
  status: "queued" | "manual" | "done" | "needs_key";
  instructions: string;
  outputPath?: string;
}

function save(job: PaidMediaJob): PaidMediaJob {
  assertDataDir();
  writeFileSync(join(DATA_DIR, "media", `${job.id}.json`), JSON.stringify(job, null, 2));
  return job;
}

/** HeyGen Video Agent — POST /v3/video-agents when HEYGEN_API_KEY set. */
export function queuePaidAvatar(dialogue: string, look: string): PaidMediaJob {
  if (!hasHeyGen()) {
    return save({
      id: newId("heygen"),
      provider: "heygen",
      prompt: `${look}\n\nScript: ${dialogue}`,
      status: "needs_key",
      instructions:
        "Set HEYGEN_API_KEY or add HeyGen MCP (OAuth): https://mcp.heygen.com/mcp/v1/",
    });
  }
  return save({
    id: newId("heygen"),
    provider: "heygen",
    prompt: `${look}. Presenter says: ${dialogue}`,
    status: "queued",
    instructions: "Run: npm start heygen-run <job-id> or produce with HEYGEN_AUTO=1",
  });
}

/** Execute queued HeyGen job — polls until MP4 in data/exports/ */
export async function runPaidHeyGen(prompt: string, jobId?: string): Promise<PaidMediaJob> {
  const job: PaidMediaJob = {
    id: jobId ?? newId("heygen"),
    provider: "heygen",
    prompt,
    status: "queued",
    instructions: "HeyGen Video Agent v3",
  };
  try {
    const result = await runVideoAgent(prompt);
    job.status = "done";
    job.outputPath = result.localPath;
    job.instructions = `session ${result.sessionId} · ${result.videoUrl}`;
  } catch (e) {
    job.status = "manual";
    job.instructions = e instanceof Error ? e.message : "HeyGen failed";
  }
  return save(job);
}

/** HyperFrames HTML scaffold from trailer — OSS, no API key */
export function queueHyperframesTrailer(trailer: TrailerProduction): PaidMediaJob {
  const hf = scaffoldFromTrailer(trailer);
  return save({
    id: newId("hyperframes"),
    provider: "hyperframes",
    prompt: trailer.title,
    status: "queued",
    instructions: hf.log,
    outputPath: hf.projectDir,
  });
}

/** Render HyperFrames project to MP4 */
export async function runPaidHyperframes(projectDir: string): Promise<PaidMediaJob> {
  const result = await renderHyperframes(projectDir);
  return save({
    id: newId("hyperframes"),
    provider: "hyperframes",
    prompt: projectDir,
    status: result.status === "rendered" ? "done" : result.status === "failed" ? "manual" : "queued",
    instructions: result.log,
    outputPath: result.outputPath,
  });
}

/** Kling / FAL b-roll scene. */
export function queuePaidBroll(scene: string): PaidMediaJob {
  const kling = env("KLING_API_KEY");
  const fal = env("FAL_API_KEY");
  if (fal) {
    return save({
      id: newId("fal-vid"),
      provider: "fal",
      prompt: scene,
      status: "queued",
      instructions: "FAL video model — run integrations/fal.ts generateFalVideo when ready.",
    });
  }
  return save({
    id: newId("kling"),
    provider: "kling",
    prompt: scene,
    status: kling ? "queued" : "needs_key",
    instructions: kling
      ? "Kling API text-to-video 5s — no watermark on paid tier."
      : "Set KLING_API_KEY or FAL_API_KEY for cinematic b-roll.",
  });
}

/** Poster via FAL Flux when key present, else DALL-E path in poster.ts */
export async function queuePaidPoster(prompt: string): Promise<PaidMediaJob> {
  if (!env("FAL_API_KEY")) {
    return save({
      id: newId("fal-img"),
      provider: "fal",
      prompt,
      status: "needs_key",
      instructions: "Set FAL_API_KEY for Flux/Ideogram posters — Canva-level templates.",
    });
  }
  try {
    const path = await generateFalImage(prompt);
    return save({
      id: newId("fal-img"),
      provider: "fal",
      prompt,
      status: "done",
      instructions: "FAL image generated.",
      outputPath: path,
    });
  } catch (e) {
    return save({
      id: newId("fal-img"),
      provider: "fal",
      prompt,
      status: "manual",
      instructions: e instanceof Error ? e.message : "FAL failed",
    });
  }
}
