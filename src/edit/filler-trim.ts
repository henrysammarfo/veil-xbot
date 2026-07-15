/**
 * freecut-inspired filler word + false-start trim.
 * Cuts umm/uh/like-as-filler and long pauses from word timestamps.
 */
import type { WordStamp, TranscriptResult } from "./transcribe.js";
import type { KeepSegment } from "./dead-space.js";
import { silencesToKeepSegments } from "./dead-space.js";
import type { SilenceGap } from "./ffmpeg-util.js";

const FILLERS = new Set(
  [
    "um",
    "umm",
    "uh",
    "uhh",
    "er",
    "ah",
    "eh",
    "hm",
    "hmm",
    "like",
    "literally",
    "basically",
    "actually",
    "youknow",
    "you",
    "know",
  ].map((w) => w.toLowerCase()),
);

function normalizeWord(w: string): string {
  return w.replace(/[^a-zA-Z']/g, "").toLowerCase();
}

/** Mark filler words as removable gaps (with pad). */
export function fillerGapsFromWords(
  words: WordStamp[],
  opts?: { padSec?: number; includeLike?: boolean },
): SilenceGap[] {
  const pad = opts?.padSec ?? 0.04;
  const gaps: SilenceGap[] = [];
  for (let i = 0; i < words.length; i++) {
    const raw = words[i];
    const n = normalizeWord(raw.word);
    if (!n) continue;

    // "you know" as pair
    if (n === "you" && words[i + 1] && normalizeWord(words[i + 1].word) === "know") {
      const end = words[i + 1].end;
      gaps.push({
        start: Math.max(0, raw.start - pad),
        end: end + pad,
        duration: end - raw.start + pad * 2,
      });
      i += 1;
      continue;
    }

    if (n === "like" && opts?.includeLike === false) continue;
    if (!FILLERS.has(n)) continue;
    // Don't cut "like" mid-sentence when next word is substantive noun-ish short words only if isolated
    if (n === "like" && words[i + 1] && normalizeWord(words[i + 1].word).length > 2) {
      // still cut standalone "like," fillers that are short duration
      if (raw.end - raw.start > 0.35) continue;
    }

    gaps.push({
      start: Math.max(0, raw.start - pad),
      end: raw.end + pad,
      duration: raw.end - raw.start + pad * 2,
    });
  }
  return gaps;
}

/** Merge silence + filler gaps → keep segments (freecut dead-air + filler). */
export function freecutKeepSegments(
  durationSec: number,
  silences: SilenceGap[],
  transcript: TranscriptResult | null,
  opts?: { cutFillers?: boolean },
): KeepSegment[] {
  const gaps = [...silences];
  if (opts?.cutFillers !== false && transcript?.words?.length) {
    gaps.push(...fillerGapsFromWords(transcript.words));
  }
  return silencesToKeepSegments(durationSec, gaps);
}

export function countFillersRemoved(words: WordStamp[]): number {
  return fillerGapsFromWords(words).length;
}
