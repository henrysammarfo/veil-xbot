import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { DATA_DIR, assertDataDir } from "../config.js";
import { newId } from "../store.js";
import type { EditManifest, CutPoint } from "./manifest.js";
import { sfxPath, listAvailableSfx } from "./sfx.js";
import type { EditRecipe } from "../discover/auto-learn.js";
import {
  hasFfmpeg,
  probeDuration,
  runFfmpeg,
  escFilterPath,
  normalizeToMp4,
  hasAudioStream,
} from "./ffmpeg-util.js";
import { trimDeadSpace } from "./dead-space.js";
import { mixBackgroundMusic } from "./music-mix.js";
import type { FootageAnalysis } from "./analyze-footage.js";
import { captionsToAss } from "./ass-captions.js";
import { resolveBrollClipsAsync, type ResolvedBroll } from "./broll-resolve.js";
import type { VeniceBrollOpts } from "./venice-broll.js";
import { getStyle } from "./styles.js";

export interface RenderResult {
  id: string;
  outputPath: string;
  manifestPath: string;
  status: "done" | "failed" | "partial";
  log: string;
  workDir?: string;
}

export type OutputAspect = "9:16" | "16:9";

function outputDims(aspect: OutputAspect): { w: number; h: number; playRes: string } {
  if (aspect === "16:9") return { w: 1920, h: 1080, playRes: "1920x1080" };
  return { w: 1080, h: 1920, playRes: "1080x1920" };
}

function buildZoomExpr(cuts: CutPoint[], duration: number): string {
  const punches = cuts.filter((c) => c.type === "zoom-punch" && c.atSec < duration);
  if (!punches.length) return "1";
  let expr = "1";
  for (const p of punches) {
    const scale = p.scale ?? 1.12;
    const start = p.atSec;
    const end = Math.min(start + 0.38, duration);
    expr = `if(between(in_time,${start.toFixed(3)},${end.toFixed(3)}),${scale},${expr})`;
  }
  return expr;
}

function buildFlashFilter(
  cuts: CutPoint[],
  duration: number,
  inLabel: string,
  outLabel: string,
  dims: { w: number; h: number },
): string {
  const flashes = cuts.filter((c) => c.type === "flash-frame" && c.atSec < duration);
  if (!flashes.length) return `[${inLabel}]copy[${outLabel}]`;

  const parts: string[] = [];
  let prev = inLabel;
  flashes.forEach((f, i) => {
    const dur = f.durationSec ?? 0.06;
    const start = f.atSec;
    const end = Math.min(start + dur, duration);
    const white = `white${i}`;
    const out = i === flashes.length - 1 ? outLabel : `vf${i + 1}`;
    parts.push(
      `color=c=white:s=${dims.w}x${dims.h}:d=${dur.toFixed(3)}[${white}]`,
      `[${prev}][${white}]overlay=enable='between(t,${start.toFixed(3)},${end.toFixed(3)})':shortest=0[${out}]`,
    );
    prev = out;
  });
  return parts.join(";");
}

function buildSpeedRampFilter(cuts: CutPoint[], duration: number, inLabel: string, outLabel: string): string {
  const ramps = cuts.filter((c) => c.type === "speed-ramp" && c.atSec < duration);
  if (!ramps.length) return `[${inLabel}]copy[${outLabel}]`;

  let expr = "PTS";
  for (const r of ramps) {
    const dur = r.durationSec ?? 0.45;
    const start = r.atSec;
    const end = Math.min(start + dur, duration);
    expr = `if(between(T,${start.toFixed(3)},${end.toFixed(3)}),PTS/1.55,${expr})`;
  }
  return `[${inLabel}]setpts='${expr}'[${outLabel}]`;
}

function buildAudioFilter(
  manifest: EditManifest,
  sfxFileMap: Map<string, number>,
  baseAudioLabel = "[0:a]",
): string | null {
  const chains: string[] = [];
  const mixInputs = [baseAudioLabel];
  let n = 0;
  for (const cue of manifest.sfx) {
    const idx = sfxFileMap.get(cue.sound);
    if (idx === undefined) continue;
    const delayMs = Math.round(cue.atSec * 1000);
    chains.push(`[${idx}:a]adelay=${delayMs}|${delayMs},volume=0.85[s${n}]`);
    mixInputs.push(`[s${n}]`);
    n++;
  }
  if (!chains.length) return null;
  return `${chains.join(";")};${mixInputs.join("")}amix=inputs=${mixInputs.length}:duration=first:dropout_transition=0[aout]`;
}

function applyEffectsPass(
  input: string,
  manifest: EditManifest,
  assPath: string,
  output: string,
  aspect: OutputAspect = "9:16",
  preserveFraming = false,
): void {
  const duration = probeDuration(input);
  const style = getStyle(manifest.style);
  const dims = outputDims(aspect);
  const assBurn = `ass='${escFilterPath(assPath)}'`;

  if (preserveFraming) {
    const baseScale = `scale=${dims.w}:${dims.h}:flags=lanczos,fps=30`;
    runFfmpeg(
      [
        "-y",
        "-i",
        input,
        "-vf",
        `${baseScale},${assBurn}`,
        "-t",
        String(Math.min(duration, manifest.durationSec)),
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "20",
        ...(hasAudioStream(input) ? ["-c:a", "aac", "-b:a", "192k"] : ["-an"]),
        output,
      ],
      "effects-preserve",
    );
    return;
  }

  const zoomExpr = buildZoomExpr(manifest.cuts, duration);
  const baseScale = `scale=${dims.w}:${dims.h}:force_original_aspect_ratio=increase,crop=${dims.w}:${dims.h},fps=30`;
  const zoomPan = `zoompan=z='${zoomExpr}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${dims.w}x${dims.h}:fps=30`;

  const flashChain = buildFlashFilter(manifest.cuts, duration, "vzoom", "vflash", dims);
  const speedChain = buildSpeedRampFilter(manifest.cuts, duration, "vflash", "vspd");

  const filterComplex = [
    `[0:v]${baseScale},${zoomPan}[vzoom]`,
    flashChain,
    speedChain,
    `[vspd]${assBurn}[vout]`,
  ].join(";");

  const args: string[] = [
    "-y",
    "-i",
    input,
    "-filter_complex",
    filterComplex,
    "-map",
    "[vout]",
    "-t",
    String(Math.min(duration, manifest.durationSec)),
    "-c:v",
    "libx264",
    "-preset",
    style.id === "anime-hype" ? "fast" : "medium",
    "-crf",
    style.id === "cinematic-broll" ? "20" : "22",
  ];
  if (hasAudioStream(input)) {
    args.push("-map", "0:a", "-c:a", "aac", "-b:a", "192k");
  } else {
    args.push("-an");
  }
  args.push("-movflags", "+faststart", output);

  runFfmpeg(args, "effects-pass");
}

function overlayBrollPass(
  baseVideo: string,
  brolls: ResolvedBroll[],
  manifest: EditManifest,
  output: string,
): void {
  if (!brolls.length) {
    runFfmpeg(
      ["-y", "-i", baseVideo, "-map", "0:v", "-map", "0:a?", "-c", "copy", output],
      "broll-skip",
    );
    return;
  }

  const inputs = ["-i", baseVideo, ...brolls.flatMap((b) => ["-i", b.path])];
  const filter = brolls
    .reduce<{ chain: string; prev: string }>(
      (acc, b, i) => {
        const idx = i + 1;
        const start = b.slot.atSec;
        const end = start + b.slot.durationSec;
        const out = i === brolls.length - 1 ? "vout" : `vb${i}`;
        const segment = `${acc.prev}[${idx}:v]overlay=enable='between(t,${start.toFixed(3)},${end.toFixed(3)})':x=0:y=0[${out}]`;
        return { chain: acc.chain ? `${acc.chain};${segment}` : segment, prev: `[${out}]` };
      },
      { chain: "", prev: "[0:v]" },
    )
    .chain;

  runFfmpeg(
    [
      "-y",
      ...inputs,
      "-filter_complex",
      filter,
      "-map",
      "[vout]",
      "-map",
      "0:a?",
      "-t",
      String(manifest.durationSec),
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-crf",
      "22",
      "-c:a",
      "copy",
      output,
    ],
    "broll-overlay",
  );
}

function mixSfxPass(input: string, manifest: EditManifest, output: string): void {
  const sfxFileMap = new Map<string, number>();
  const sfxFiles: string[] = [];
  for (const cue of manifest.sfx) {
    const p = sfxPath(cue.sound);
    if (!p || sfxFileMap.has(cue.sound)) continue;
    sfxFileMap.set(cue.sound, sfxFiles.length + 1);
    sfxFiles.push(p);
  }

  const af = buildAudioFilter(manifest, sfxFileMap);
  if (!af || !sfxFiles.length) {
    runFfmpeg(["-y", "-i", input, "-map", "0:v", "-c", "copy", output], "sfx-skip");
    return;
  }

  const dur = probeDuration(input);
  const inputHasAudio = hasAudioStream(input);

  if (!inputHasAudio) {
    const sfxFileMapSilent = new Map<string, number>();
    sfxFiles.forEach((_, i) => {
      const sound = [...sfxFileMap.entries()].find(([, idx]) => idx === i + 1)?.[0];
      if (sound) sfxFileMapSilent.set(sound, i + 2);
    });
    const afSilent = buildAudioFilter(manifest, sfxFileMapSilent, "[silent]");
    if (!afSilent) {
      runFfmpeg(["-y", "-i", input, "-map", "0:v", "-c", "copy", output], "sfx-skip");
      return;
    }
    runFfmpeg(
      [
        "-y",
        "-i",
        input,
        "-f",
        "lavfi",
        "-i",
        `anullsrc=r=44100:cl=stereo,atrim=0:${dur.toFixed(3)}`,
        ...sfxFiles.flatMap((f) => ["-i", f]),
        "-filter_complex",
        `[1:a]asetpts=PTS-STARTPTS[silent];${afSilent}`,
        "-map",
        "0:v",
        "-map",
        "[aout]",
        "-c:v",
        "copy",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        output,
      ],
      "sfx-mix",
    );
    return;
  }

  runFfmpeg(
    [
      "-y",
      "-i",
      input,
      ...sfxFiles.flatMap((f) => ["-i", f]),
      "-filter_complex",
      af!,
      "-map",
      "0:v",
      "-map",
      "[aout]",
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      output,
    ],
    "sfx-mix",
  );
}

function mixVoiceoverPass(
  input: string,
  voiceoverPath: string,
  output: string,
  duckDb = 0.25,
): void {
  const hasBg = hasAudioStream(input);
  if (!hasBg) {
    runFfmpeg(
      [
        "-y",
        "-i",
        input,
        "-i",
        voiceoverPath,
        "-map",
        "0:v",
        "-map",
        "1:a",
        "-c:v",
        "copy",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-shortest",
        output,
      ],
      "voiceover-only",
    );
    return;
  }
  runFfmpeg(
    [
      "-y",
      "-i",
      input,
      "-i",
      voiceoverPath,
      "-filter_complex",
      `[0:a]volume=${duckDb}[bg];[1:a]volume=1.0[vo];[bg][vo]amix=inputs=2:duration=first:dropout_transition=2[aout]`,
      "-map",
      "0:v",
      "-map",
      "[aout]",
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-shortest",
      output,
    ],
    "voiceover-mix",
  );
}
export interface RenderV2Options {
  analysis: FootageAnalysis;
  manifest: EditManifest;
  recipe?: EditRecipe;
  hyperframesMp4?: string;
  veniceBroll?: VeniceBrollOpts;
  voiceoverPath?: string;
  voiceoverSegments?: Array<{ startSec: number; path: string; durationSec: number }>;
  /** Match capture device — desktop 16:9, mobile 9:16 */
  outputAspect?: OutputAspect;
  /** Judge demo — no zoom-punch / crop; 1:1 screen framing */
  preserveFraming?: boolean;
  /** Background music bed (CapCut-style duck under VO) */
  musicPath?: string;
  musicVolume?: number;
}

/** Full editor v2 render — dead space, effects, b-roll, captions, SFX, voiceover. */
export async function renderEditorV2(inputPath: string, opts: RenderV2Options): Promise<RenderResult> {
  assertDataDir();
  const outDir = join(DATA_DIR, "exports");
  const workDir = join(DATA_DIR, "edit", opts.manifest.id);
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  if (!existsSync(workDir)) mkdirSync(workDir, { recursive: true });

  const id = newId("render");
  const manifest = opts.manifest;
  const baseName = basename(inputPath).replace(/\.[^.]+$/, "");
  const outputPath = join(outDir, `${baseName}_${manifest.brand}_${manifest.style}_v2.mp4`);
  const manifestPath = join(outDir, `${manifest.id}-manifest.json`);
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  const log: string[] = [
    `Editor v2 — ${manifest.style}`,
    `Source: ${opts.analysis.durationSec.toFixed(1)}s → ${manifest.durationSec.toFixed(1)}s after dead-space trim`,
    `Cuts: ${manifest.cuts.length} · SFX: ${manifest.sfx.length} · B-roll: ${manifest.broll.length}`,
    `Whisper: ${opts.analysis.transcript ? "yes" : "fallback captions"}`,
    `SFX on disk: ${listAvailableSfx().join(", ") || "(none)"}`,
  ];

  if (!hasFfmpeg()) {
    log.push("ffmpeg missing — install ffmpeg and re-run");
    return { id, outputPath, manifestPath, status: "failed", log: log.join("\n"), workDir };
  }

  try {
    const normalized = join(workDir, "normalized.mp4");
    normalizeToMp4(inputPath, normalized);

    const trimmed = join(workDir, "trimmed.mp4");
    trimDeadSpace(normalized, opts.analysis.keepSegments, workDir, trimmed);
    log.push(`Dead-space trim: ${(opts.analysis.durationSec - manifest.durationSec).toFixed(1)}s removed`);

    const aspect = opts.outputAspect ?? "9:16";
    const dims = outputDims(aspect);
    const assPath = join(workDir, "captions.ass");
    writeFileSync(assPath, captionsToAss(manifest.captions, dims.playRes));

    const effects = join(workDir, "effects.mp4");
    applyEffectsPass(trimmed, manifest, assPath, effects, aspect, opts.preserveFraming === true);

    const brolls = await resolveBrollClipsAsync(manifest.broll, trimmed, workDir, {
      hyperframesMp4: opts.hyperframesMp4,
      venice: opts.veniceBroll,
    });
    log.push(
      `B-roll: ${brolls.map((b) => `${b.source}@${b.slot.atSec.toFixed(1)}s`).join(", ") || "none"}`,
    );

    const withBroll = join(workDir, "with-broll.mp4");
    overlayBrollPass(effects, brolls, manifest, withBroll);

    const withSfx = join(workDir, "with-sfx.mp4");
    mixSfxPass(withBroll, manifest, withSfx);

    let audioBase = withSfx;
    if (opts.musicPath && existsSync(opts.musicPath)) {
      const withMusic = join(workDir, "with-music.mp4");
      mixBackgroundMusic(withSfx, opts.musicPath, withMusic, { musicVolume: opts.musicVolume });
      audioBase = withMusic;
      log.push(`Music bed: ${opts.musicPath}`);
    }

    if (opts.voiceoverPath && existsSync(opts.voiceoverPath)) {
      mixVoiceoverPass(audioBase, opts.voiceoverPath, outputPath);
      log.push(`Voiceover: ${opts.voiceoverPath}`);
    } else {
      runFfmpeg(["-y", "-i", audioBase, "-c", "copy", outputPath], "final-copy");
    }

    log.push(`Output: ${outputPath}`);
    if (opts.recipe) log.push(`Recipe music mood: ${opts.recipe.musicMood}`);

    const result: RenderResult = {
      id,
      outputPath,
      manifestPath,
      status: "done",
      log: log.join("\n"),
      workDir,
    };
    writeFileSync(join(outDir, `${id}.json`), JSON.stringify(result, null, 2));
    return result;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log.push(`Render failed: ${msg.slice(-1500)}`);
    const result: RenderResult = {
      id,
      outputPath,
      manifestPath,
      status: "failed",
      log: log.join("\n"),
      workDir,
    };
    writeFileSync(join(outDir, `${id}.json`), JSON.stringify(result, null, 2));
    return result;
  }
}

/** Legacy entry — delegates to v2 when analysis provided. */
export async function renderFromManifest(
  inputPath: string,
  manifest: EditManifest,
  recipe?: EditRecipe,
): Promise<RenderResult> {
  const analysis: FootageAnalysis = {
    inputPath,
    durationSec: manifest.sourceDurationSec ?? manifest.durationSec,
    transcript: null,
    silences: [],
    keepSegments: [{ start: 0, end: manifest.durationSec }],
    trimmedDurationSec: manifest.durationSec,
    fillersRemoved: 0,
    hookLine: manifest.hookLine ?? "HOOK",
    hookEndSec: 2,
    wordCaptions: [],
    energyPeaks: [0],
  };
  return renderEditorV2(inputPath, { analysis, manifest, recipe });
}
