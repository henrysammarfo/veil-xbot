import OpenAI from "openai";
import { createReadStream, readFileSync } from "node:fs";
import { join } from "node:path";
import { requireEnv, hasOpenAI, env } from "../config.js";
import { extractAudio, hasAudioStream } from "./ffmpeg-util.js";

export type TranscribeBackend = "whisper" | "vibevoice";

function backend(): TranscribeBackend {
  const b = (env("TRANSCRIBE_BACKEND", "whisper") || "whisper").toLowerCase();
  return b === "vibevoice" ? "vibevoice" : "whisper";
}

/**
 * microsoft/VibeVoice ASR via freecut-style HTTP endpoint.
 * POST multipart file= → JSON with words[] or segments[].
 * Set VIBEVOICE_ASR_URL (see freecut helpers/transcribe.py contract).
 */
async function transcribeViaVibeVoice(wavPath: string): Promise<TranscriptResult | null> {
  const url = env("VIBEVOICE_ASR_URL");
  if (!url) return null;
  const buf = readFileSync(wavPath);
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(buf)], { type: "audio/wav" }), "audio.wav");
  const res = await fetch(url, { method: "POST", body: form });
  if (!res.ok) throw new Error(`VibeVoice ASR ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const raw = (await res.json()) as {
    text?: string;
    language?: string;
    words?: Array<{ word?: string; text?: string; start: number; end: number }>;
    segments?: Array<{
      start?: number;
      end?: number;
      text?: string;
      content?: string;
      speaker?: string;
      start_time?: number;
      end_time?: number;
    }>;
  };
  const words: WordStamp[] = (raw.words ?? []).map((w) => ({
    word: (w.word ?? w.text ?? "").trim(),
    start: w.start,
    end: w.end,
  }));
  const segments: TranscriptSegment[] = (raw.segments ?? []).map((s) => ({
    start: s.start ?? s.start_time ?? 0,
    end: s.end ?? s.end_time ?? 0,
    text: (s.text ?? s.content ?? "").trim() + (s.speaker ? ` [${s.speaker}]` : ""),
  }));
  const text =
    raw.text?.trim() ||
    segments.map((s) => s.text).join(" ") ||
    words.map((w) => w.word).join(" ");
  return { text, language: raw.language ?? "en", words, segments };
}

export interface WordStamp {
  word: string;
  start: number;
  end: number;
}

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface TranscriptResult {
  text: string;
  words: WordStamp[];
  segments: TranscriptSegment[];
  language: string;
}

function parseWhisperVerbose(raw: unknown): TranscriptResult {
  const r = raw as {
    text?: string;
    language?: string;
    words?: Array<{ word: string; start: number; end: number }>;
    segments?: Array<{ start: number; end: number; text: string }>;
  };
  return {
    text: r.text?.trim() ?? "",
    language: r.language ?? "en",
    words: (r.words ?? []).map((w) => ({
      word: w.word.trim(),
      start: w.start,
      end: w.end,
    })),
    segments: (r.segments ?? []).map((s) => ({
      start: s.start,
      end: s.end,
      text: s.text.trim(),
    })),
  };
}

export async function transcribeAudioFile(wavPath: string): Promise<TranscriptResult | null> {
  if (backend() === "vibevoice") {
    const vv = await transcribeViaVibeVoice(wavPath);
    if (vv) return vv;
    console.warn("VibeVoice ASR unavailable — falling back to Whisper");
  }
  if (!hasOpenAI()) return null;
  const openai = new OpenAI({ apiKey: requireEnv("OPENAI_API_KEY") });
  const res = await openai.audio.transcriptions.create({
    file: createReadStream(wavPath),
    model: "whisper-1",
    response_format: "verbose_json",
    timestamp_granularities: ["word", "segment"],
  });
  return parseWhisperVerbose(res);
}

export async function transcribeVideo(
  videoPath: string,
  workDir: string,
): Promise<TranscriptResult | null> {
  if (!hasAudioStream(videoPath)) return null;
  const wavPath = join(workDir, "audio-16k.wav");
  extractAudio(videoPath, wavPath);
  return transcribeAudioFile(wavPath);
}

/** Group words into caption beats (3–5 words). */
export function wordsToCaptionGroups(
  words: WordStamp[],
  maxWords = 4,
): Array<{ start: number; end: number; text: string }> {
  const out: Array<{ start: number; end: number; text: string }> = [];
  let batch: WordStamp[] = [];
  for (const w of words) {
    if (!w.word) continue;
    batch.push(w);
    const endsSentence = /[.!?]$/.test(w.word);
    if (batch.length >= maxWords || endsSentence) {
      out.push({
        start: batch[0].start,
        end: batch[batch.length - 1].end,
        text: batch.map((x) => x.word).join(" ").toUpperCase(),
      });
      batch = [];
    }
  }
  if (batch.length) {
    out.push({
      start: batch[0].start,
      end: batch[batch.length - 1].end,
      text: batch.map((x) => x.word).join(" ").toUpperCase(),
    });
  }
  return out;
}
