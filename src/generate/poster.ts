import OpenAI from "openai";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { requireEnv, DATA_DIR, assertDataDir } from "../config.js";
import { brandVoice, type BrandKey } from "../brands.js";
import { tasteSystemSuffix } from "../taste.js";
import { newId, saveGraphic, listLearnings, type GraphicAsset } from "../store.js";
import { stylePrompt, type PosterDesignStyle } from "../studio/design-styles.js";
import { hasFal, generateFalImage } from "../integrations/fal.js";

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
  designStyle: PosterDesignStyle;
}): Promise<string> {
  const voice = brandVoice(opts.brand);
  const learnings = listLearnings().slice(0, 3);
  const openai = new OpenAI({ apiKey: requireEnv("OPENAI_API_KEY") });
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.55,
    messages: [
      {
        role: "system",
        content:
          "You write image prompts for premium launch posters (Canva Pro / editorial / film poster level). NOT generic dark UI boxes. One paragraph." +
          tasteSystemSuffix(),
      },
      {
        role: "user",
        content: `Brand: ${voice.name}
Design style: ${opts.designStyle} — ${stylePrompt(opts.designStyle)}
Kind: ${opts.kind}
Topic: ${opts.topic}
Headline on image: ${opts.headline || "minimal"}
Learnings: ${learnings.map((l) => l.analysis.textOverlays).join("; ")}
NO: gold coins, neon crypto city, stock handshake, generic dashboard screenshot as whole image`,
      },
    ],
  });
  return res.choices[0]?.message?.content?.trim() || `${voice.name} ${opts.designStyle} ${opts.topic}`;
}

export async function generatePoster(opts: {
  brand: BrandKey;
  kind?: PosterKind;
  topic: string;
  headline?: string;
  designStyle?: PosterDesignStyle;
}): Promise<GraphicAsset> {
  const kind = opts.kind ?? "poster";
  const designStyle = opts.designStyle ?? "editorial-serif";
  const imagePrompt = await buildImagePrompt({ brand: opts.brand, kind, topic: opts.topic, headline: opts.headline, designStyle });

  const id = newId("gfx");
  let localPath: string;

  if (hasFal()) {
    localPath = await generateFalImage(imagePrompt);
  } else {
    const openai = new OpenAI({ apiKey: requireEnv("OPENAI_API_KEY") });
    const res = await openai.images.generate({
      model: "dall-e-3",
      prompt: imagePrompt,
      n: 1,
      size: SIZES[kind],
      response_format: "b64_json",
    });
    const b64 = res.data?.[0]?.b64_json;
    if (!b64) throw new Error("No image returned");
    localPath = join(graphicsDir(), `${id}.png`);
    writeFileSync(localPath, Buffer.from(b64, "base64"));
  }

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
