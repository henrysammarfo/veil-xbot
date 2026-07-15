import OpenAI from "openai";
import {
  probeVideo,
  detectSilences,
  type SilenceGap,
} from "./ffmpeg-util.js";
import {
  transcribeVideo,
  wordsToCaptionGroups,
  type TranscriptResult,
  type WordStamp,
} from "./transcribe.js";
import { silencesToKeepSegments, type KeepSegment } from "./dead-space.js";
import { freecutKeepSegments, countFillersRemoved } from "./filler-trim.js";
import { hasOpenAI, requireEnv, env } from "../config.js";
import type { BrandKey } from "../brands.js";
import { getProject } from "../projects/registry.js";

export interface FootageAnalysis {
  inputPath: string;
  durationSec: number;
  transcript: TranscriptResult | null;
  silences: SilenceGap[];
  keepSegments: KeepSegment[];
  trimmedDurationSec: number;
  hookLine: string;
  hookEndSec: number;
  wordCaptions: Array<{ start: number; end: number; text: string }>;
  energyPeaks: number[];
  fillersRemoved: number;
}

function wordsInWindow(words: WordStamp[], start: number, end: number): WordStamp[] {
  return words.filter((w) => w.start >= start && w.start < end);
}

function defaultHook(brand: BrandKey): string {
  const p = getProject(brand);
  if (brand === "veil") return "I LOST $5 ON TESTNET. ON PURPOSE.";
  return p.tagline.slice(0, 48).toUpperCase();
}

async function pickHookLine(
  brand: BrandKey,
  transcript: TranscriptResult | null,
): Promise<{ line: string; endSec: number }> {
  const fallback = defaultHook(brand);
  if (!transcript?.words.length) {
    return { line: fallback, endSec: 2.5 };
  }

  const hookWords = wordsInWindow(transcript.words, 0, 3.2);
  if (!hookWords.length) {
    return { line: fallback, endSec: 2.5 };
  }

  const localLine = hookWords.map((w) => w.word).join(" ").trim();
  const endSec = Math.min(3, hookWords[hookWords.length - 1].end + 0.2);

  if (!hasOpenAI() || localLine.split(/\s+/).length >= 4) {
    return { line: localLine.toUpperCase(), endSec };
  }

  try {
    const openai = new OpenAI({ apiKey: requireEnv("OPENAI_API_KEY") });
    const res = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Pick the best 3-second TikTok hook from transcript. Max 8 words. JSON: {hook, endSec}",
        },
        {
          role: "user",
          content: `Brand: ${brand}\nFirst 15s transcript:\n${transcript.segments
            .filter((s) => s.start < 15)
            .map((s) => s.text)
            .join(" ")}`,
        },
      ],
    });
    const raw = res.choices[0]?.message?.content;
    if (raw) {
      const parsed = JSON.parse(raw) as { hook?: string; endSec?: number };
      if (parsed.hook?.trim()) {
        return {
          line: parsed.hook.trim().toUpperCase(),
          endSec: Math.min(3.5, parsed.endSec ?? endSec),
        };
      }
    }
  } catch {
    /* local fallback */
  }

  return { line: localLine.toUpperCase(), endSec };
}

function detectEnergyPeaks(words: WordStamp[], durationSec: number): number[] {
  if (!words.length) return [0, Math.min(5, durationSec * 0.3)];
  const bucketSec = 1.5;
  const buckets = new Map<number, number>();
  for (const w of words) {
    const b = Math.floor(w.start / bucketSec);
    buckets.set(b, (buckets.get(b) ?? 0) + 1);
  }
  const ranked = [...buckets.entries()].sort((a, b) => b[1] - a[1]);
  const peaks = ranked.slice(0, 4).map(([b]) => b * bucketSec + 0.2);
  if (!peaks.includes(0)) peaks.unshift(0);
  return peaks.sort((a, b) => a - b);
}

export async function analyzeFootage(
  inputPath: string,
  workDir: string,
  brand: BrandKey = "veil",
): Promise<FootageAnalysis> {
  const { durationSec } = probeVideo(inputPath);
  const silences = detectSilences(inputPath, { noiseDb: -34, minDurationSec: 0.55 });

  let transcript: TranscriptResult | null = null;
  try {
    transcript = await transcribeVideo(inputPath, workDir);
  } catch (e) {
    console.warn("Whisper:", e instanceof Error ? e.message : e);
  }

  const cutFillers = env("FREECUT_FILLERS", "1") !== "0";
  const keepSegments =
    cutFillers && transcript?.words?.length
      ? freecutKeepSegments(durationSec, silences, transcript, { cutFillers: true })
      : silencesToKeepSegments(durationSec, silences);
  const fillersRemoved = transcript?.words?.length ? countFillersRemoved(transcript.words) : 0;

  const { line: hookLine, endSec: hookEndSec } = await pickHookLine(brand, transcript);
  const wordCaptions = transcript?.words.length
    ? wordsToCaptionGroups(transcript.words, 4)
    : [];

  const trimmedDurationSec = keepSegments.reduce((s, k) => s + (k.end - k.start), 0);

  return {
    inputPath,
    durationSec,
    transcript,
    silences,
    keepSegments,
    trimmedDurationSec,
    hookLine,
    hookEndSec,
    wordCaptions,
    energyPeaks: detectEnergyPeaks(transcript?.words ?? [], durationSec),
    fillersRemoved,
  };
}
