import { readFileSync, writeFileSync, existsSync } from "node:fs";
import type { EditManifest, CutPoint, CaptionBeat } from "./manifest.js";
import { saveManifest } from "./manifest.js";

export type ReviseOp =
  | { type: "add-cut"; atSec: number; cut: CutPoint["type"]; scale?: number }
  | { type: "remove-cut"; atSec: number; tolerance?: number }
  | { type: "set-hook"; text: string }
  | { type: "set-cta"; text: string }
  | { type: "trim-end"; sec: number };

export function loadManifestFile(path: string): EditManifest {
  if (!existsSync(path)) throw new Error(`Manifest not found: ${path}`);
  return JSON.parse(readFileSync(path, "utf8")) as EditManifest;
}

export function reviseManifest(m: EditManifest, ops: ReviseOp[]): EditManifest {
  const next: EditManifest = JSON.parse(JSON.stringify(m)) as EditManifest;

  for (const op of ops) {
    if (op.type === "add-cut") {
      next.cuts.push({
        atSec: op.atSec,
        type: op.cut,
        scale: op.scale ?? (op.cut === "zoom-punch" ? 1.12 : undefined),
        note: "manual revise",
      });
      next.cuts.sort((a, b) => a.atSec - b.atSec);
    }
    if (op.type === "remove-cut") {
      const tol = op.tolerance ?? 0.35;
      next.cuts = next.cuts.filter((c) => Math.abs(c.atSec - op.atSec) > tol);
    }
    if (op.type === "set-hook") {
      const hook = next.captions.find((c) => c.style === "hook");
      if (hook) hook.text = op.text;
      next.hookLine = op.text;
    }
    if (op.type === "set-cta") {
      const cta = next.captions.find((c) => c.style === "cta");
      if (cta) cta.text = op.text;
    }
    if (op.type === "trim-end") {
      next.durationSec = Math.max(3, next.durationSec - op.sec);
      next.cuts = next.cuts.filter((c) => c.atSec < next.durationSec);
      next.sfx = next.sfx.filter((s) => s.atSec < next.durationSec);
      next.broll = next.broll.filter((b) => b.atSec < next.durationSec);
      next.captions = next.captions
        .map((c) => trimCaption(c, next.durationSec))
        .filter((c) => c.end > c.start);
    }
  }

  next.renderNotes = [...next.renderNotes, `Revised ${ops.length} op(s) at ${new Date().toISOString()}`];
  return next;
}

function trimCaption(c: CaptionBeat, maxEnd: number): CaptionBeat {
  return { ...c, end: Math.min(c.end, maxEnd) };
}

export function parseReviseArgs(args: string[]): ReviseOp[] {
  const ops: ReviseOp[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--add-cut" && args[i + 1] && args[i + 2]) {
      ops.push({
        type: "add-cut",
        atSec: parseFloat(args[i + 1]),
        cut: args[i + 2] as CutPoint["type"],
        scale: args[i + 3] && !args[i + 3].startsWith("--") ? parseFloat(args[i + 3]) : undefined,
      });
      i += 2;
    } else if (a === "--remove-cut" && args[i + 1]) {
      ops.push({ type: "remove-cut", atSec: parseFloat(args[i + 1]) });
      i += 1;
    } else if (a === "--hook" && args[i + 1]) {
      ops.push({ type: "set-hook", text: args[i + 1] });
      i += 1;
    } else if (a === "--cta" && args[i + 1]) {
      ops.push({ type: "set-cta", text: args[i + 1] });
      i += 1;
    } else if (a === "--trim-end" && args[i + 1]) {
      ops.push({ type: "trim-end", sec: parseFloat(args[i + 1]) });
      i += 1;
    }
  }
  return ops;
}

export function saveRevisedManifest(m: EditManifest, basePath?: string): string {
  const path = saveManifest(m);
  if (basePath) {
    writeFileSync(basePath, JSON.stringify(m, null, 2));
  }
  return path;
}
