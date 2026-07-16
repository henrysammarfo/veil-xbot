import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { env, DATA_DIR, assertDataDir } from "../config.js";
import { newId } from "../store.js";

const FAL_BASE = "https://fal.run";

function falKey(): string {
  const key = env("FAL_API_KEY");
  if (!key) throw new Error("FAL_API_KEY not set");
  return key;
}

async function downloadToGraphics(url: string, prefix: string): Promise<string> {
  const imgRes = await fetch(url);
  const buf = Buffer.from(await imgRes.arrayBuffer());
  assertDataDir();
  const dir = join(DATA_DIR, "graphics");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const path = join(dir, `${newId(prefix)}.png`);
  writeFileSync(path, buf);
  return path;
}

/** FAL.ai — Flux image when FAL_API_KEY purchased. */
export async function generateFalImage(prompt: string): Promise<string> {
  const key = falKey();

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
  return downloadToGraphics(url, "fal");
}

/**
 * Goose remix Phase 2B — edit a reference ad (fal-ai/gpt-image-1/edit-image).
 * Uses data URI for local refs so we don't need GooseWorks media proxy.
 */
export async function editFalImage(opts: {
  prompt: string;
  referencePath: string;
  outPath?: string;
  aspect?: "1:1" | "2:3" | "3:2" | "9:16" | "16:9";
}): Promise<string> {
  const key = falKey();
  if (!existsSync(opts.referencePath)) {
    throw new Error(`FAL edit: missing reference ${opts.referencePath}`);
  }
  const buf = readFileSync(opts.referencePath);
  const b64 = buf.toString("base64");
  const dataUri = `data:image/png;base64,${b64}`;

  const imageSize =
    opts.aspect === "1:1"
      ? "1024x1024"
      : opts.aspect === "16:9" || opts.aspect === "3:2"
        ? "1536x1024"
        : "1024x1536";

  const res = await fetch(`${FAL_BASE}/fal-ai/gpt-image-1/edit-image`, {
    method: "POST",
    headers: {
      Authorization: `Key ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt: opts.prompt,
      image_urls: [dataUri],
      image_size: imageSize,
      num_images: 1,
      quality: "medium",
    }),
  });

  if (!res.ok) throw new Error(`FAL edit ${res.status}: ${await res.text()}`);

  const data = (await res.json()) as {
    images?: Array<{ url?: string }>;
    image?: { url?: string };
  };
  const url = data.images?.[0]?.url ?? data.image?.url;
  if (!url) throw new Error("FAL edit returned no image");

  const downloaded = await downloadToGraphics(url, "fal-edit");
  if (opts.outPath) {
    writeFileSync(opts.outPath, readFileSync(downloaded));
    return opts.outPath;
  }
  return downloaded;
}

export function hasFal(): boolean {
  return Boolean(env("FAL_API_KEY"));
}
