import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { env, DATA_DIR, assertDataDir } from "../config.js";
import { newId } from "../store.js";

const FAL_BASE = "https://fal.run";

/** FAL.ai — Flux image when FAL_API_KEY purchased. */
export async function generateFalImage(prompt: string): Promise<string> {
  const key = env("FAL_API_KEY");
  if (!key) throw new Error("FAL_API_KEY not set");

  const res = await fetch(`${FAL_BASE}/fal-ai/flux/dev`, {
    method: "POST",
    headers: {
      Authorization: `Key ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt,
      image_size: "portrait_16_9",
      num_inference_steps: 28,
    }),
  });

  if (!res.ok) throw new Error(`FAL ${res.status}: ${await res.text()}`);

  const data = (await res.json()) as { images?: Array<{ url: string }> };
  const url = data.images?.[0]?.url;
  if (!url) throw new Error("FAL returned no image");

  const imgRes = await fetch(url);
  const buf = Buffer.from(await imgRes.arrayBuffer());

  assertDataDir();
  const dir = join(DATA_DIR, "graphics");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const path = join(dir, `${newId("fal")}.png`);
  writeFileSync(path, buf);
  return path;
}

export function hasFal(): boolean {
  return Boolean(env("FAL_API_KEY"));
}
