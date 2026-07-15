/**
 * freecut self-eval — probe rendered output at cut boundaries for obvious failures.
 */
import { existsSync } from "node:fs";
import { probeDuration, hasAudioStream, hasFfmpeg } from "./ffmpeg-util.js";
import type { EditDecisionList } from "./edl.js";

export interface SelfEvalIssue {
  severity: "error" | "warn";
  code: string;
  message: string;
  atSec?: number;
}

export interface SelfEvalResult {
  ok: boolean;
  issues: SelfEvalIssue[];
  durationSec: number;
  hasAudio: boolean;
}

export function selfEvalRender(
  outputPath: string,
  edl?: EditDecisionList | null,
): SelfEvalResult {
  const issues: SelfEvalIssue[] = [];
  if (!existsSync(outputPath)) {
    return {
      ok: false,
      issues: [{ severity: "error", code: "missing", message: `Output missing: ${outputPath}` }],
      durationSec: 0,
      hasAudio: false,
    };
  }
  if (!hasFfmpeg()) {
    issues.push({ severity: "warn", code: "no-ffmpeg", message: "ffmpeg missing — limited checks" });
  }

  let durationSec = 0;
  let hasAudio = false;
  try {
    durationSec = probeDuration(outputPath);
    hasAudio = hasAudioStream(outputPath);
  } catch (e) {
    issues.push({
      severity: "error",
      code: "probe-fail",
      message: e instanceof Error ? e.message : String(e),
    });
    return { ok: false, issues, durationSec: 0, hasAudio: false };
  }

  if (durationSec < 2) {
    issues.push({
      severity: "error",
      code: "too-short",
      message: `Render only ${durationSec.toFixed(2)}s`,
    });
  }
  if (durationSec > 180) {
    issues.push({
      severity: "warn",
      code: "long",
      message: `${durationSec.toFixed(0)}s — consider clip for ads (≤60s)`,
    });
  }
  if (!hasAudio) {
    issues.push({
      severity: "warn",
      code: "silent",
      message: "No audio stream — VO/music may have failed",
    });
  }

  if (edl) {
    if (Math.abs(durationSec - edl.durationSec) > 2.5) {
      issues.push({
        severity: "warn",
        code: "duration-mismatch",
        message: `EDL ${edl.durationSec.toFixed(1)}s vs render ${durationSec.toFixed(1)}s`,
      });
    }
    for (const clip of edl.clips) {
      if (clip.outSec <= clip.inSec) {
        issues.push({
          severity: "error",
          code: "bad-clip",
          message: `Empty clip ${clip.inSec}→${clip.outSec}`,
          atSec: clip.inSec,
        });
      }
    }
  }

  const ok = !issues.some((i) => i.severity === "error");
  return { ok, issues, durationSec, hasAudio };
}

export function formatSelfEval(r: SelfEvalResult): string {
  if (r.ok && !r.issues.length) {
    return `Self-eval PASS · ${r.durationSec.toFixed(1)}s · audio=${r.hasAudio}`;
  }
  return [
    `Self-eval ${r.ok ? "PASS (warnings)" : "FAIL"} · ${r.durationSec.toFixed(1)}s`,
    ...r.issues.map((i) => `- [${i.severity}] ${i.code}: ${i.message}`),
  ].join("\n");
}
