/**
 * Remix voiceover onto latest Veil 3-min demo (skip capture/re-render).
 */
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR, assertDataDir, env } from "../config.js";
import { veil3MinBeats, VEIL_3MIN_TARGET_SEC } from "../studio/veil-3min-script.js";
import { generateSegmentedVoiceover } from "../edit/voiceover.js";
import { runFfmpeg, hasFfmpeg, hasAudioStream } from "../edit/ffmpeg-util.js";
import { newId } from "../store.js";

export async function remixVeil3MinVoiceover(inputPath: string): Promise<string> {
  if (!hasFfmpeg()) throw new Error("ffmpeg required");
  if (!existsSync(inputPath)) throw new Error(`Not found: ${inputPath}`);

  assertDataDir();
  const workDir = join(DATA_DIR, "edit", `vo-remix-${newId("vo")}`);
  mkdirSync(workDir, { recursive: true });

  const tx = env("VEIL_FALLBACK_TX", "").split("/tx/").pop();
  const beats = veil3MinBeats(tx);
  console.log("Generating 8-segment synced voiceover...");
  const vo = await generateSegmentedVoiceover(beats, workDir, {
    force: true,
    projectId: "veil",
    targetDurationSec: VEIL_3MIN_TARGET_SEC,
  });
  if (!vo.path) throw new Error("Voiceover generation failed");

  const out = join(DATA_DIR, "exports", `veil_judge_demo_3min_FINAL_${Date.now()}.mp4`);
  const hasBg = hasAudioStream(inputPath);

  if (hasBg) {
    runFfmpeg(
      [
        "-y",
        "-i",
        inputPath,
        "-i",
        vo.path,
        "-filter_complex",
        "[0:a]volume=0.2[bg];[1:a]volume=1.0[vo];[bg][vo]amix=inputs=2:duration=first:dropout_transition=2[aout]",
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
        out,
      ],
      "remix-vo",
    );
  } else {
    runFfmpeg(
      [
        "-y",
        "-i",
        inputPath,
        "-i",
        vo.path,
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
        out,
      ],
      "remix-vo",
    );
  }

  return out;
}
