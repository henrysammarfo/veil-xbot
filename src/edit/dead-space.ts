import { join } from "node:path";
import { copyFileSync } from "node:fs";
import { runFfmpeg, concatSegments, probeDuration, hasAudioStream, type SilenceGap } from "./ffmpeg-util.js";

export interface KeepSegment {
  start: number;
  end: number;
}

const MIN_KEEP_SEC = 0.2;
const MIN_SILENCE_TO_CUT = 0.65;
const SILENCE_PAD = 0.08;

/** Invert silence gaps into keep segments. */
export function silencesToKeepSegments(
  durationSec: number,
  silences: SilenceGap[],
): KeepSegment[] {
  const merged = mergeSilences(silences);
  const keep: KeepSegment[] = [];
  let cursor = 0;
  for (const s of merged) {
    const cutStart = Math.max(0, s.start + SILENCE_PAD);
    const cutEnd = Math.min(durationSec, s.end - SILENCE_PAD);
    if (cutStart - cursor >= MIN_KEEP_SEC) {
      keep.push({ start: cursor, end: cutStart });
    }
    cursor = Math.max(cursor, cutEnd);
  }
  if (durationSec - cursor >= MIN_KEEP_SEC) {
    keep.push({ start: cursor, end: durationSec });
  }
  if (!keep.length) return [{ start: 0, end: durationSec }];
  return keep;
}

function mergeSilences(silences: SilenceGap[]): SilenceGap[] {
  const sorted = [...silences]
    .filter((s) => s.duration >= MIN_SILENCE_TO_CUT)
    .sort((a, b) => a.start - b.start);
  if (!sorted.length) return [];
  const out: SilenceGap[] = [{ ...sorted[0] }];
  for (let i = 1; i < sorted.length; i++) {
    const prev = out[out.length - 1];
    const cur = sorted[i];
    if (cur.start <= prev.end + 0.15) {
      prev.end = Math.max(prev.end, cur.end);
      prev.duration = prev.end - prev.start;
    } else {
      out.push({ ...cur });
    }
  }
  return out;
}

export function totalKeptDuration(segments: KeepSegment[]): number {
  return segments.reduce((sum, s) => sum + (s.end - s.start), 0);
}

/** Map timestamp from original timeline → trimmed timeline. */
export function remapTime(t: number, segments: KeepSegment[]): number {
  let acc = 0;
  for (const seg of segments) {
    if (t < seg.start) return acc;
    if (t <= seg.end) return acc + (t - seg.start);
    acc += seg.end - seg.start;
  }
  return acc;
}

export function remapValue<T extends { atSec?: number; start?: number; end?: number }>(
  item: T,
  segments: KeepSegment[],
): T | null {
  const startKey = item.start !== undefined ? "start" : "atSec";
  const rawStart = (item[startKey as keyof T] as number) ?? 0;
  const rawEnd = item.end ?? rawStart + 0.5;
  const newStart = remapTime(rawStart, segments);
  const newEnd = remapTime(rawEnd, segments);
  if (newEnd <= newStart) return null;
  return {
    ...item,
    ...(startKey === "start" ? { start: newStart, end: newEnd } : { atSec: newStart }),
  };
}

/** Trim dead space — returns kept duration in seconds. */
export function trimDeadSpace(
  input: string,
  segments: KeepSegment[],
  workDir: string,
  output: string,
): number {
  const kept = totalKeptDuration(segments);
  const sourceDur = probeDuration(input);

  if (segments.length === 1 && segments[0].start <= 0.02 && kept >= sourceDur - 0.2) {
    copyFileSync(input, output);
    return kept;
  }

  if (segments.length === 1 && segments[0].start <= 0.02) {
    const audioArgs = hasAudioStream(input)
      ? (["-c:a", "aac"] as const)
      : (["-an"] as const);
    runFfmpeg(
      [
        "-y",
        "-i",
        input,
        "-t",
        String(segments[0].end - segments[0].start),
        "-c:v",
        "libx264",
        "-preset",
        "fast",
        "-crf",
        "20",
        ...audioArgs,
        output,
      ],
      "trim-single",
    );
    return kept;
  }

  const hasAudio = hasAudioStream(input);
  const parts: string[] = [];
  segments.forEach((seg, i) => {
    const part = join(workDir, `seg-${i}.mp4`);
    const audioArgs = hasAudio
      ? (["-c:a", "aac", "-b:a", "192k"] as const)
      : (["-an"] as const);
    runFfmpeg(
      [
        "-y",
        "-ss",
        String(seg.start),
        "-to",
        String(seg.end),
        "-i",
        input,
        "-c:v",
        "libx264",
        "-preset",
        "fast",
        "-crf",
        "20",
        ...audioArgs,
        part,
      ],
      `trim-seg-${i}`,
    );
    parts.push(part);
  });
  concatSegments(parts, output, hasAudio);
  return totalKeptDuration(segments);
}
