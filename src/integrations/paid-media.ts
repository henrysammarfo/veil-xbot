import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { env, DATA_DIR, assertDataDir } from "../config.js";
import { newId } from "../store.js";
import { generateFalImage } from "./fal.js";

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

/** HeyGen avatar scene — when HEYGEN_API_KEY set. */
export function queuePaidAvatar(dialogue: string, look: string): PaidMediaJob {
  const key = env("HEYGEN_API_KEY");
  return save({
    id: newId("heygen"),
    provider: "heygen",
    prompt: `${look}\n\nScript: ${dialogue}`,
    status: key ? "queued" : "needs_key",
    instructions: key
      ? "POST HeyGen API v2 video — wire in integrations/heygen.ts when key purchased."
      : "Buy HeyGen API → set HEYGEN_API_KEY. Until then: screen POV from trailer shot list.",
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
