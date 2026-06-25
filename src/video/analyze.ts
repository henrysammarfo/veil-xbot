import OpenAI from "openai";
import { requireEnv } from "../config.js";
import type { VideoAnalysis } from "../store.js";
import type { VideoSource } from "./source.js";
import { tasteSystemSuffix } from "../taste.js";

const SYSTEM = `You are a growth strategist studying high-performing short-form content.
Extract actionable editing and copy patterns — not generic advice.
Reject slop. Output valid JSON only.${tasteSystemSuffix()}`;

export async function analyzeVideoWithAI(source: VideoSource): Promise<VideoAnalysis> {
  const openai = new OpenAI({ apiKey: requireEnv("OPENAI_API_KEY") });

  const transcript =
    source.transcript.length > 12_000
      ? source.transcript.slice(0, 12_000) + "…"
      : source.transcript;

  const user = `Analyze this ${source.platform} video for content we can reuse for Veil (stealth Sui trading) and Magmos (yield-dollar).

Title: ${source.title}
Channel: ${source.channel ?? "unknown"}
URL: ${source.url}

Transcript / notes:
${transcript || "(empty — infer from title only)"}

Return JSON:
{
  "summary": "2-3 sentences what the video does",
  "hookPattern": "first 3 sec pattern",
  "pacing": "cuts per minute feel, retention tricks",
  "editStyle": "captions, zoom, split screen, etc",
  "textOverlays": "on-screen text patterns",
  "musicMood": "genre/energy for similar vibe",
  "ctaStyle": "how they ask for follow/click",
  "nicheTags": ["tag1","tag2"],
  "stealablePatterns": ["concrete pattern 1", "pattern 2"],
  "veilAngles": ["how Veil could use this"],
  "suggestedSunoPrompt": "one line Suno prompt for bg music",
  "suggestedBroll": ["shot idea 1", "shot idea 2"],
  "sfxOnCuts": ["whoosh at 0s on hook", "bass-hit on reveal"],
  "bpmFeel": 120
}`;

  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.4,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: user },
    ],
  });

  const raw = res.choices[0]?.message?.content;
  if (!raw) throw new Error("OpenAI returned empty analysis");
  return JSON.parse(raw) as VideoAnalysis;
}

/** Fallback when no OpenAI key — store raw transcript only. */
export function stubAnalysis(source: VideoSource): VideoAnalysis {
  return {
    summary: `Saved ${source.platform} link without AI analysis (set OPENAI_API_KEY).`,
    hookPattern: "—",
    pacing: "—",
    editStyle: "—",
    textOverlays: "—",
    musicMood: "—",
    ctaStyle: "—",
    nicheTags: [],
    stealablePatterns: [],
    veilAngles: [],
    suggestedBroll: [],
  };
}
