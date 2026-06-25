import OpenAI from "openai";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { requireEnv, DATA_DIR, assertDataDir } from "../config.js";
import { brandVoice, type BrandKey } from "../brands.js";
import { tasteSystemSuffix } from "../taste.js";
import { newId, saveGraphic, type GraphicAsset } from "../store.js";

export type PosterKind = "poster" | "quote-card" | "thread-header" | "announcement";

const SIZES: Record<PosterKind, "1024x1024" | "1024x1792" | "1792x1024"> = {
  poster: "1024x1024",
  "quote-card": "1024x1024",
  "thread-header": "1792x1024",
  announcement: "1024x1792",
};

function graphicsDir(): string {
  assertDataDir();
  const dir = join(DATA_DIR, "graphics");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

async function buildImagePrompt(opts: {
  brand: BrandKey;
  kind: PosterKind;
  topic: string;
  headline?: string;
}): Promise<string> {
  const voice = brandVoice(opts.brand);
  const openai = new OpenAI({ apiKey: requireEnv("OPENAI_API_KEY") });
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.6,
    messages: [
      {
        role: "system",
        content:
          "You write DALL-E image prompts for premium social graphics. Dark #0a0a0a Veil aesthetic. No crypto slop. One paragraph only." +
          tasteSystemSuffix(),
      },
      {
        role: "user",
        content: `Brand: ${voice.name}
Kind: ${opts.kind}
Topic: ${opts.topic}
Headline text on image: ${opts.headline || "auto from topic"}
Pillars: ${voice.pillars.join("; ")}
Style: Veil dashboard — #0a0a0a background, off-white type, thin borders, minimal. NO gold coins, neon cities, AI faces.`,
      },
    ],
  });
  return res.choices[0]?.message?.content?.trim() || `${voice.name} ${opts.kind} ${opts.topic}`;
}

/** Generate poster / quote card / thread header PNG via OpenAI Images. */
export async function generatePoster(opts: {
  brand: BrandKey;
  kind?: PosterKind;
  topic: string;
  headline?: string;
}): Promise<GraphicAsset> {
  const kind = opts.kind ?? "poster";
  const imagePrompt = await buildImagePrompt({ ...opts, kind });
  const openai = new OpenAI({ apiKey: requireEnv("OPENAI_API_KEY") });

  const res = await openai.images.generate({
    model: "dall-e-3",
    prompt: imagePrompt,
    n: 1,
    size: SIZES[kind],
    response_format: "b64_json",
  });

  const b64 = res.data?.[0]?.b64_json;
  if (!b64) throw new Error("No image returned from OpenAI");

  const id = newId("gfx");
  const filename = `${id}.png`;
  const localPath = join(graphicsDir(), filename);
  writeFileSync(localPath, Buffer.from(b64, "base64"));

  const asset: GraphicAsset = {
    id,
    brand: opts.brand,
    kind,
    topic: opts.topic,
    headline: opts.headline,
    imagePrompt,
    localPath,
    createdAt: Date.now(),
    usage: kind === "quote-card" ? "quote-tweet" : kind === "thread-header" ? "thread" : "image-post",
  };
  saveGraphic(asset);
  return asset;
}
