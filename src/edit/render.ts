import { execSync, spawnSync } from "node:child_process";
import { existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join, basename } from "node:path";
import { DATA_DIR, assertDataDir } from "../config.js";
import { newId } from "../store.js";
import type { EditManifest, CaptionBeat } from "./manifest.js";
import { sfxPath, listAvailableSfx } from "./sfx.js";
import type { EditRecipe } from "../discover/auto-learn.js";

export interface RenderResult {
  id: string;
  outputPath: string;
  manifestPath: string;
  status: "done" | "failed" | "partial";
  log: string;
}

function hasFfmpeg(): boolean {
  try {
    execSync("ffmpeg -version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function probeDuration(input: string): number {
  try {
    const out = execSync(
      `ffprobe -v error -show_entries format=duration -of csv=p=0 "${input}"`,
      { encoding: "utf8" },
    );
    return Math.max(5, parseFloat(out.trim()) || 30);
  } catch {
    return 30;
  }
}

function fmtSrtTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.floor((sec % 1) * 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

export function captionsToSrt(captions: CaptionBeat[]): string {
  const lines: string[] = [];
  captions.forEach((c, i) => {
    lines.push(String(i + 1));
    lines.push(`${fmtSrtTime(c.start)} --> ${fmtSrtTime(c.end)}`);
    lines.push(c.text);
    lines.push("");
  });
  return lines.join("\n");
}

function escPath(p: string): string {
  return p.replace(/\\/g, "/").replace(/:/g, "\\:");
}

/** Build ffmpeg audio filter: mix SFX at exact timestamps onto source audio. */
function buildAudioFilter(
  manifest: EditManifest,
  sfxFileMap: Map<string, number>,
): string | null {
  const chains: string[] = [];
  const mixInputs = ["[0:a]"];
  let n = 0;
  for (const cue of manifest.sfx) {
    const idx = sfxFileMap.get(cue.sound);
    if (idx === undefined) continue;
    const delayMs = Math.round(cue.atSec * 1000);
    chains.push(`[${idx}:a]adelay=${delayMs}|${delayMs},volume=0.8[s${n}]`);
    mixInputs.push(`[s${n}]`);
    n++;
  }
  if (!chains.length) return null;
  return `${chains.join(";")};${mixInputs.join("")}amix=inputs=${mixInputs.length}:duration=first:dropout_transition=0[aout]`;
}

/** Zoom punches at cut points via zoompan (anime-style punch-ins). */
function buildVideoFilter(manifest: EditManifest, srtPath: string, duration: number): string {
  const sub = `subtitles='${escPath(srtPath)}'`;
  const punches = manifest.cuts.filter((c) => c.type === "zoom-punch" && c.atSec < duration);
  if (!punches.length) {
    return `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,${sub}`;
  }
  const z = punches[0];
  const scale = z.scale ?? 1.12;
  const start = z.atSec;
  const end = Math.min(start + 0.35, duration);
  return `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,zoompan=z='if(between(in_time,${start},${end}),${scale},1)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1080x1920:fps=30,${sub}`;
}

export function renderFromManifest(
  inputPath: string,
  manifest: EditManifest,
  recipe?: EditRecipe,
): RenderResult {
  assertDataDir();
  const outDir = join(DATA_DIR, "exports");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  const id = newId("render");
  const duration = Math.min(probeDuration(inputPath), manifest.durationSec);
  const srtPath = join(outDir, `${manifest.id}.srt`);
  writeFileSync(srtPath, captionsToSrt(manifest.captions));

  const manifestPath = join(outDir, `${manifest.id}-manifest.json`);
  const outputPath = join(
    outDir,
    `${basename(inputPath, ".mp4")}_${manifest.brand}_${manifest.style}.mp4`,
  );

  const log: string[] = [
    `Style: ${manifest.style}`,
    `Cuts: ${manifest.cuts.length} · SFX cues: ${manifest.sfx.length} · B-roll slots: ${manifest.broll.length}`,
    `SFX on disk: ${listAvailableSfx().join(", ") || "(none — add assets/sfx/*.mp3)"}`,
    `SRT: ${srtPath}`,
  ];

  if (!hasFfmpeg()) {
    log.push("ffmpeg missing — manifest + SRT only");
    const result: RenderResult = { id, outputPath, manifestPath, status: "partial", log: log.join("\n") };
    writeFileSync(join(outDir, `${id}.json`), JSON.stringify(result, null, 2));
    return result;
  }

  const sfxFileMap = new Map<string, number>();
  const sfxFiles: string[] = [];
  for (const cue of manifest.sfx) {
    const p = sfxPath(cue.sound);
    if (!p || sfxFileMap.has(cue.sound)) continue;
    sfxFileMap.set(cue.sound, sfxFiles.length + 1);
    sfxFiles.push(p);
  }

  const vf = buildVideoFilter(manifest, srtPath, duration);
  const args = ["-y", "-i", inputPath, ...sfxFiles.flatMap((f) => ["-i", f])];

  const af = buildAudioFilter(manifest, sfxFileMap);
  if (af) {
    args.push(
      "-t",
      String(duration),
      "-vf",
      vf,
      "-filter_complex",
      af,
      "-map",
      "0:v",
      "-map",
      "[aout]",
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-crf",
      "22",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      outputPath,
    );
  } else {
    args.push(
      "-t",
      String(duration),
      "-vf",
      vf,
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-crf",
      "22",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      outputPath,
    );
    log.push("No SFX files — video+captions only. Drop MP3s in assets/sfx/");
  }

  const proc = spawnSync("ffmpeg", args, { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
  if (proc.status !== 0) {
    log.push(proc.stderr?.slice(-1200) ?? "ffmpeg failed");
    const result: RenderResult = { id, outputPath, manifestPath, status: "failed", log: log.join("\n") };
    writeFileSync(join(outDir, `${id}.json`), JSON.stringify(result, null, 2));
    return result;
  }

  log.push(`Output: ${outputPath}`);
  if (manifest.broll.length) {
    log.push(`B-roll: ${manifest.broll.length} clips queued in data/media/ — overlay in CapCut or second pass`);
  }
  if (recipe) log.push(`Recipe music: ${recipe.musicMood}`);

  const result: RenderResult = { id, outputPath, manifestPath, status: "done", log: log.join("\n") };
  writeFileSync(join(outDir, `${id}.json`), JSON.stringify(result, null, 2));
  return result;
}
