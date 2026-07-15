/**
 * freecut-style Edit Decision List — JSON timeline the agent/render can execute.
 */
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR, assertDataDir } from "../config.js";
import { newId } from "../store.js";
import type { KeepSegment } from "./dead-space.js";
import type { EditManifest } from "./manifest.js";
import type { FootageAnalysis } from "./analyze-footage.js";

export interface EdlClip {
  source: string;
  inSec: number;
  outSec: number;
  note?: string;
}

export interface EdlEvent {
  atSec: number;
  type: "zoom-punch" | "flash-frame" | "caption" | "sfx" | "broll";
  payload?: Record<string, unknown>;
}

export interface EditDecisionList {
  id: string;
  version: 1;
  createdAt: number;
  source: string;
  durationSec: number;
  clips: EdlClip[];
  events: EdlEvent[];
  hook: string;
  cta: string;
  fillersRemoved: number;
  notes: string[];
}

export function buildEdl(opts: {
  analysis: FootageAnalysis;
  manifest: EditManifest;
  keepSegments: KeepSegment[];
  fillersRemoved?: number;
}): EditDecisionList {
  const clips: EdlClip[] = opts.keepSegments.map((s, i) => ({
    source: opts.analysis.inputPath,
    inSec: s.start,
    outSec: s.end,
    note: `keep-${i}`,
  }));

  const events: EdlEvent[] = [
    ...opts.manifest.cuts.map((c) => ({
      atSec: c.atSec,
      type: c.type as EdlEvent["type"],
      payload: { scale: c.scale, durationSec: c.durationSec },
    })),
    ...opts.manifest.captions.map((c) => ({
      atSec: c.start,
      type: "caption" as const,
      payload: { text: c.text, end: c.end, style: c.style },
    })),
    ...opts.manifest.sfx.map((s) => ({
      atSec: s.atSec,
      type: "sfx" as const,
      payload: { kind: s.sound },
    })),
    ...opts.manifest.broll.map((b) => ({
      atSec: b.atSec,
      type: "broll" as const,
      payload: { prompt: b.prompt, durationSec: b.durationSec },
    })),
  ].sort((a, b) => a.atSec - b.atSec);

  return {
    id: newId("edl"),
    version: 1,
    createdAt: Date.now(),
    source: opts.analysis.inputPath,
    durationSec: opts.manifest.durationSec,
    clips,
    events,
    hook: opts.manifest.hookLine ?? "",
    cta: opts.manifest.captions.find((c) => c.style === "cta")?.text ?? "",
    fillersRemoved: opts.fillersRemoved ?? 0,
    notes: [
      ...opts.manifest.renderNotes,
      `freecut EDL: ${clips.length} clips, ${events.length} events`,
    ],
  };
}

export function saveEdl(edl: EditDecisionList): string {
  assertDataDir();
  const dir = join(DATA_DIR, "edit", "edl");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const path = join(dir, `${edl.id}.json`);
  writeFileSync(path, JSON.stringify(edl, null, 2));
  writeFileSync(join(dir, "latest-edl.json"), JSON.stringify(edl, null, 2));
  return path;
}

export function loadLatestEdl(): EditDecisionList | null {
  const p = join(DATA_DIR, "edit", "edl", "latest-edl.json");
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf8")) as EditDecisionList;
}

export function formatEdl(edl: EditDecisionList): string {
  return [
    `# EDL ${edl.id}`,
    `Source: ${edl.source}`,
    `Duration: ${edl.durationSec.toFixed(1)}s · clips: ${edl.clips.length} · fillers cut: ${edl.fillersRemoved}`,
    `Hook: ${edl.hook}`,
    `CTA: ${edl.cta}`,
    "",
    "## Clips",
    ...edl.clips.map(
      (c, i) => `${i + 1}. ${c.inSec.toFixed(2)}→${c.outSec.toFixed(2)} (${(c.outSec - c.inSec).toFixed(2)}s)`,
    ),
  ].join("\n");
}
