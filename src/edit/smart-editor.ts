/**
 * Smart editor — LLM + heuristics plan edits from capture event timeline.
 */
import { hasOpenAI, requireEnv } from "../config.js";
import { hasVenice, veniceChat } from "../integrations/venice.js";
import OpenAI from "openai";
import type { CaptureEventLog } from "../qa/capture-events.js";
import type { VeilDemoBeat } from "../studio/veil-3min-script.js";
import type { CaptionBeat, CutPoint, EditManifest, BrollSlot, SfxCue } from "./manifest.js";
import { probeDuration, runFfmpeg } from "./ffmpeg-util.js";

export interface SmartEditPlan {
  beats: VeilDemoBeat[];
  removeRanges: Array<{ startSec: number; endSec: number; reason: string }>;
  cuts: CutPoint[];
  sfx: SfxCue[];
  broll: BrollSlot[];
  captions: CaptionBeat[];
  useCaptions: boolean;
  musicPrompt: string;
  renderNotes: string[];
}

const SCENE_KEYWORDS: Array<{ keys: string[]; beatIndex: number }> = [
  { keys: ["landing hook", "stealth hook"], beatIndex: 0 },
  { keys: ["alpha leak", "alpha", "problem"], beatIndex: 1 },
  { keys: ["bull order", "15m bull", "wallet connected"], beatIndex: 2 },
  { keys: ["bear mood", "earn parlay", "modes tour"], beatIndex: 3 },
  { keys: ["kelly", "portfolio", "capital"], beatIndex: 4 },
  { keys: ["live testnet", "orders"], beatIndex: 5 },
  { keys: ["tee", "proof"], beatIndex: 6 },
  { keys: ["cta"], beatIndex: 7 },
];

export function remapBeatsAfterCut(
  beats: VeilDemoBeat[],
  removeRanges: Array<{ startSec: number; endSec: number }>,
): VeilDemoBeat[] {
  const removedBefore = (t: number) =>
    removeRanges
      .filter((r) => r.endSec <= t + 0.01)
      .reduce((s, r) => s + (r.endSec - r.startSec), 0);

  return beats.map((b) => ({
    ...b,
    startSec: Math.max(0, b.startSec - removedBefore(b.startSec)),
    endSec: Math.max(0, b.endSec - removedBefore(b.endSec)),
  }));
}

/** Map beats to scene markers in capture order — VO follows what's on screen. */
export function syncBeatsToCaptureEvents(
  scriptBeats: VeilDemoBeat[],
  log: CaptureEventLog,
  rawDurationSec: number,
): VeilDemoBeat[] {
  const sceneEvents = log.events.filter((e) => e.type === "scene");
  const usedSceneIdx = new Set<number>();
  const synced: VeilDemoBeat[] = [];

  for (let i = 0; i < scriptBeats.length; i++) {
    const beat = scriptBeats[i];
    const map = SCENE_KEYWORDS.find((m) => m.beatIndex === i);
    let tSec = beat.startSec;

    if (map && sceneEvents.length) {
      const idx = sceneEvents.findIndex(
        (ev, si) =>
          !usedSceneIdx.has(si) && map.keys.some((k) => ev.note.toLowerCase().includes(k)),
      );
      if (idx >= 0) {
        usedSceneIdx.add(idx);
        tSec = sceneEvents[idx].tSec;
      }
    }

    synced.push({
      ...beat,
      startSec: Math.max(0, tSec),
      endSec: Math.min(rawDurationSec, beat.endSec),
    });
  }

  for (let i = 1; i < synced.length; i++) {
    if (synced[i].startSec <= synced[i - 1].startSec + 2) {
      synced[i].startSec = synced[i - 1].startSec + 8;
    }
    synced[i - 1].endSec = synced[i].startSec;
  }
  if (synced.length) synced[synced.length - 1].endSec = rawDurationSec;

  return synced;
}

/** Lock beat windows so VO segments never overlap. */
export function finalizeBeatWindows(beats: VeilDemoBeat[], durationSec: number): VeilDemoBeat[] {
  const out = beats.map((b) => ({ ...b }));
  for (let i = 0; i < out.length; i++) {
    const nextStart = out[i + 1]?.startSec ?? durationSec;
    out[i].endSec = Math.min(out[i].endSec, nextStart - 0.45);
    if (out[i].endSec <= out[i].startSec) {
      out[i].endSec = Math.min(durationSec, out[i].startSec + 8);
    }
  }
  return out;
}

function computeOrderSealingCuts(log: CaptureEventLog): SmartEditPlan["removeRanges"] {
  const ranges: SmartEditPlan["removeRanges"] = [];
  for (let i = 0; i < log.events.length; i++) {
    const ev = log.events[i];
    if (ev.type !== "wait" || !/order|sealed|sealing/i.test(ev.note)) continue;
    const end = log.events.find(
      (e, j) => j > i && e.type === "ready" && e.note === ev.note && e.tSec > ev.tSec + 3,
    );
    if (!end) continue;
    const dur = end.tSec - ev.tSec;
    if (dur <= 10) continue;
    // Keep ~5s showing "Executing…", jump-cut the rest before success toast
    ranges.push({
      startSec: ev.tSec + 5,
      endSec: end.tSec - 2.5,
      reason: `enclave wait — ${ev.note}`,
    });
  }
  for (const lr of log.loadingRanges) {
    if (!/sealing|order sealed|bull order|bear order/i.test(lr.note)) continue;
    if (lr.endSec - lr.startSec <= 10) continue;
    ranges.push({
      startSec: lr.startSec + 5,
      endSec: lr.endSec - 2.5,
      reason: `trim ${lr.note}`,
    });
  }
  return ranges;
}

function computeLandingTrim(log: CaptureEventLog): SmartEditPlan["removeRanges"] {
  const problemScene = log.events.find(
    (e) => e.type === "scene" && /alpha leak|problem/i.test(e.note),
  );
  const authNav = log.events.find(
    (e) =>
      e.type === "navigate" &&
      (e.url?.includes("/auth") || e.note.toLowerCase().includes("auth")),
  );
  if (problemScene && authNav && authNav.tSec > problemScene.tSec + 4) {
    return [
      {
        startSec: problemScene.tSec + 3,
        endSec: authNav.tSec - 0.35,
        reason: "landing idle after problem scroll",
      },
    ];
  }
  if (!authNav) return [];
  const keepSec = 16;
  if (authNav.tSec <= keepSec + 1) return [];
  return [
    {
      startSec: keepSec,
      endSec: authNav.tSec - 0.35,
      reason: "landing idle — trim before auth",
    },
  ];
}

function computeCtaTrim(log: CaptureEventLog, durationSec: number): SmartEditPlan["removeRanges"] {
  const ctaScene = log.events.find((e) => e.type === "scene" && /cta/i.test(e.note));
  if (!ctaScene) return [];
  const tailStart = ctaScene.tSec + 5;
  if (durationSec - tailStart < 2) return [];
  return [{ startSec: tailStart, endSec: durationSec - 0.2, reason: "CTA landing tail" }];
}

function computeIdleGaps(log: CaptureEventLog, minGapSec = 5): SmartEditPlan["removeRanges"] {
  const anchors = log.events.filter((e) =>
    ["scene", "click", "navigate", "fill", "ready"].includes(e.type),
  );
  const ranges: SmartEditPlan["removeRanges"] = [];
  for (let i = 0; i < anchors.length - 1; i++) {
    const a = anchors[i];
    const b = anchors[i + 1];
    const gap = b.tSec - a.tSec;
    if (gap <= minGapSec) continue;
    if (a.type === "scene" && a.url && a.url === b.url) {
      ranges.push({
        startSec: a.tSec + 2,
        endSec: b.tSec - 0.6,
        reason: `idle after ${a.note}`,
      });
    }
  }
  return ranges;
}

function mergeRemoveRanges(
  ranges: SmartEditPlan["removeRanges"],
  durationSec: number,
): SmartEditPlan["removeRanges"] {
  const valid = ranges
    .filter((r) => r.endSec - r.startSec > 0.35 && r.startSec < durationSec)
    .map((r) => ({
      ...r,
      startSec: Math.max(0, r.startSec),
      endSec: Math.min(durationSec, r.endSec),
    }))
    .sort((a, b) => a.startSec - b.startSec);

  const merged: SmartEditPlan["removeRanges"] = [];
  for (const r of valid) {
    const last = merged[merged.length - 1];
    if (last && r.startSec <= last.endSec + 0.2) {
      last.endSec = Math.max(last.endSec, r.endSec);
    } else {
      merged.push({ ...r });
    }
  }
  return merged;
}

async function llmEditPlan(
  scriptBeats: VeilDemoBeat[],
  log: CaptureEventLog,
  rawDurationSec: number,
): Promise<Record<string, unknown> | null> {
  const eventSummary = log.events
    .slice(0, 100)
    .map((e) => `${e.tSec.toFixed(1)}s ${e.type} ${e.note}${e.errors?.length ? ` ERR:${e.errors.join(",")}` : ""}`)
    .join("\n");

  const prompt = `God-tier demo editor for Sui DeFi judge submission.

EVENTS:
${eventSummary}

LOADING TO CUT:
${log.loadingRanges.map((r) => `${r.startSec.toFixed(1)}-${r.endSec.toFixed(1)}s ${r.note}`).join("\n") || "none"}

BEATS:
${scriptBeats.map((b, i) => `${i}. ${b.onScreen} — ${b.visual}`).join("\n")}

Duration: ${rawDurationSec.toFixed(1)}s

Rules:
- VO starts exactly when the matching scene appears on screen
- Cut ALL loading spinners and dead landing time after problem scroll
- Never pad with frozen landing — keep action dense ~3min
- Cut gaps >4s on same page with no interaction

JSON: { "useCaptions": false, "musicPrompt": "...", "beatStarts": [...], "narrationTweaks": [...], "removeRanges": [...], "cuts": [...], "sfx": [...], "broll": [...], "renderNotes": [...] }`;

  try {
    if (hasVenice()) {
      const raw = await veniceChat(
        [
          { role: "system", content: "Demo video editor. JSON only." },
          { role: "user", content: prompt },
        ],
        { json: true, temperature: 0.35 },
      );
      return JSON.parse(raw) as Record<string, unknown>;
    }
    if (hasOpenAI()) {
      const openai = new OpenAI({ apiKey: requireEnv("OPENAI_API_KEY") });
      const res = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.35,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "Demo video editor. JSON only." },
          { role: "user", content: prompt },
        ],
      });
      return JSON.parse(res.choices[0]?.message?.content ?? "{}") as Record<string, unknown>;
    }
  } catch (e) {
    console.warn("Smart editor LLM:", e instanceof Error ? e.message : e);
  }
  return null;
}

function sanitizeRemoveRanges(
  raw: unknown,
  durationSec: number,
): SmartEditPlan["removeRanges"] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: SmartEditPlan["removeRanges"] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as { startSec?: unknown; endSec?: unknown; reason?: unknown };
    const startSec = Number(r.startSec);
    const endSec = Number(r.endSec);
    if (!Number.isFinite(startSec) || !Number.isFinite(endSec) || endSec <= startSec + 0.25) continue;
    if (startSec >= durationSec) continue;
    out.push({
      startSec: Math.max(0, startSec),
      endSec: Math.min(durationSec, endSec),
      reason: typeof r.reason === "string" ? r.reason : "cut",
    });
  }
  return out.length ? out : undefined;
}

function heuristicPlan(
  syncedBeats: VeilDemoBeat[],
  log: CaptureEventLog,
  rawDurationSec: number,
): SmartEditPlan {
  const removeRanges = mergeRemoveRanges(
    [
      ...log.loadingRanges
        .filter((r) => r.endSec - r.startSec > 0.4)
        .map((r) => ({ startSec: r.startSec, endSec: r.endSec, reason: r.note })),
      ...computeLandingTrim(log),
      ...computeCtaTrim(log, rawDurationSec),
      ...computeIdleGaps(log),
      ...computeOrderSealingCuts(log),
    ],
    rawDurationSec,
  );

  const cuts: CutPoint[] = [{ atSec: 0, type: "zoom-punch", scale: 1.04, note: "hook" }];
  const sfx: SfxCue[] = [{ atSec: 0, sound: "impact", reason: "hook" }];
  const broll: BrollSlot[] = [];

  for (const b of syncedBeats) {
    if (b.startSec <= 0) continue;
    cuts.push({ atSec: b.startSec, type: "zoom-punch", scale: 1.03, note: b.onScreen });
    sfx.push({ atSec: b.startSec + 0.1, sound: "whoosh", reason: b.visual });
  }

  return {
    beats: syncedBeats,
    removeRanges,
    cuts,
    sfx,
    broll,
    captions: [],
    useCaptions: false,
    musicPrompt: "royalty-free cinematic ambient 90bpm minimal no vocals YouTube-safe",
    renderNotes: [
      "Smart editor heuristic",
      `Synced ${syncedBeats.length} beats`,
      `Cut ${removeRanges.length} dead ranges`,
    ],
  };
}

export async function buildSmartEditPlan(opts: {
  scriptBeats: VeilDemoBeat[];
  eventLog: CaptureEventLog;
  rawVideoPath: string;
}): Promise<SmartEditPlan> {
  const rawDurationSec = probeDuration(opts.rawVideoPath);
  const synced = syncBeatsToCaptureEvents(opts.scriptBeats, opts.eventLog, rawDurationSec);
  const base = heuristicPlan(synced, opts.eventLog, rawDurationSec);
  const llm = await llmEditPlan(opts.scriptBeats, opts.eventLog, rawDurationSec);
  if (!llm) return base;

  const beatStarts = llm.beatStarts as number[] | undefined;
  const tweaks = llm.narrationTweaks as unknown[] | undefined;
  const beats = synced.map((b, i) => {
    const tweak = tweaks?.[i];
    const narration =
      typeof tweak === "string" && tweak.trim() ? tweak.trim() : b.narration;
    return {
      ...b,
      startSec: beatStarts?.[i] ?? b.startSec,
      narration,
    };
  });
  for (let i = 0; i < beats.length; i++) {
    beats[i].endSec = beats[i + 1]?.startSec ?? rawDurationSec;
  }

  const llmRemoves = sanitizeRemoveRanges(llm.removeRanges, rawDurationSec);
  const removeRanges = mergeRemoveRanges(
    [...base.removeRanges, ...(llmRemoves ?? [])],
    rawDurationSec,
  );

  return {
    ...base,
    beats,
    removeRanges,
    cuts: ((llm.cuts as CutPoint[])?.length ? llm.cuts : base.cuts) as CutPoint[],
    sfx: ((llm.sfx as SfxCue[])?.length ? llm.sfx : base.sfx) as SfxCue[],
    broll: (llm.broll as BrollSlot[]) ?? base.broll,
    useCaptions: (llm.useCaptions as boolean) ?? false,
    musicPrompt: (llm.musicPrompt as string) ?? base.musicPrompt,
    renderNotes: [...base.renderNotes, ...((llm.renderNotes as string[]) ?? []), "LLM edit plan"],
  };
}

export function cutCaptureRanges(
  input: string,
  output: string,
  removeRanges: Array<{ startSec: number; endSec: number }>,
): number {
  const dur = probeDuration(input);
  const valid = removeRanges
    .filter((r) => Number.isFinite(r.startSec) && Number.isFinite(r.endSec) && r.endSec > r.startSec + 0.25)
    .map((r) => ({
      startSec: Math.max(0, r.startSec),
      endSec: Math.min(dur, r.endSec),
    }))
    .filter((r) => r.endSec > r.startSec + 0.25);

  if (!valid.length) {
    runFfmpeg(["-y", "-i", input, "-c", "copy", output], "smart-cut-copy");
    return dur;
  }

  const sorted = [...valid].sort((a, b) => a.startSec - b.startSec);
  const keep: Array<{ start: number; end: number }> = [];
  let cursor = 0;
  for (const r of sorted) {
    if (r.startSec > cursor + 0.25) keep.push({ start: cursor, end: r.startSec });
    cursor = Math.max(cursor, r.endSec);
  }
  if (cursor < dur - 0.25) keep.push({ start: cursor, end: dur });

  if (!keep.length) {
    runFfmpeg(["-y", "-i", input, "-c", "copy", output], "smart-cut-copy");
    return dur;
  }
  if (keep.length === 1) {
    const k = keep[0];
    runFfmpeg(
      [
        "-y",
        "-i",
        input,
        "-ss",
        k.start.toFixed(3),
        "-to",
        k.end.toFixed(3),
        "-c",
        "copy",
        output,
      ],
      "smart-cut-single",
    );
    return probeDuration(output);
  }

  const filter = keep
    .map((k, i) => `[0:v]trim=start=${k.start.toFixed(3)}:end=${k.end.toFixed(3)},setpts=PTS-STARTPTS[v${i}]`)
    .join(";");
  const concat = keep.map((_, i) => `[v${i}]`).join("") + `concat=n=${keep.length}:v=1:a=0[vout]`;

  runFfmpeg(
    ["-y", "-i", input, "-filter_complex", `${filter};${concat}`, "-map", "[vout]", "-an", output],
    "smart-cut-ranges",
  );
  return probeDuration(output);
}

export function applySmartPlanToManifest(
  base: EditManifest,
  plan: SmartEditPlan,
  durationSec: number,
): EditManifest {
  const captions: CaptionBeat[] = plan.useCaptions
    ? plan.beats.map((b) => ({
        start: b.startSec,
        end: Math.min(b.endSec, durationSec),
        text: b.onScreen,
        style: (b.startSec < 12 ? "hook" : b.startSec >= durationSec - 15 ? "cta" : "body") as
          | "hook"
          | "body"
          | "cta",
      }))
    : [];

  return {
    ...base,
    durationSec,
    hookLine: plan.beats[0]?.onScreen ?? base.hookLine,
    musicPrompt: plan.musicPrompt,
    captions,
    cuts: plan.cuts.filter((c) => c.atSec < durationSec),
    sfx: plan.sfx.filter((s) => s.atSec < durationSec),
    broll: plan.broll.filter((b) => b.atSec < durationSec),
    renderNotes: [...base.renderNotes, ...plan.renderNotes],
  };
}
