/**
 * Venice presenter — replaces HeyGen Video Agent for walkthrough PiP.
 * Character still (consistent look) + narration TTS → looping talking-head MP4.
 * Optional: short Venice T2V talking clip when PRESENTER_VIDEO=1.
 */
import { existsSync, mkdirSync, writeFileSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR, assertDataDir, env } from "../config.js";
import { newId } from "../store.js";
import { hasFfmpeg, runFfmpeg, probeDuration } from "../edit/ffmpeg-util.js";
import {
  hasVenice,
  veniceGenerateImage,
  veniceTextToSpeech,
  veniceGenerateVideo,
} from "../integrations/venice.js";
import { resolveVideoModel } from "../integrations/venice-presets.js";

export interface VenicePresenterResult {
  id: string;
  avatarPath?: string;
  facePath?: string;
  voicePath?: string;
  mode: "still+tts" | "t2v" | "skipped";
  usd: number;
  log: string[];
}

const MAGMOS_FACE =
  "Ultra realistic talking-head portrait, founder mid-20s to early-30s, natural lighting, " +
  "neutral charcoal tee, soft desk background bokeh, eye-level medium close-up, " +
  "looking at camera, authentic confident expression, no text, no logos, iPhone selfie quality";

/** Build a PiP-ready presenter MP4 without HeyGen. */
export async function produceVenicePresenter(opts: {
  narration: string;
  projectId?: string;
  characterPrompt?: string;
  outDir?: string;
  force?: boolean;
}): Promise<VenicePresenterResult> {
  const id = newId("presenter");
  const log: string[] = [];
  let usd = 0;

  if (!hasVenice()) {
    return { id, mode: "skipped", usd: 0, log: ["Venice not configured — presenter skipped"] };
  }
  if (!hasFfmpeg()) {
    return { id, mode: "skipped", usd: 0, log: ["ffmpeg missing — presenter skipped"] };
  }

  assertDataDir();
  const dir = opts.outDir ?? join(DATA_DIR, "studio", "presenter", id);
  mkdirSync(dir, { recursive: true });

  const facePrompt = opts.characterPrompt ?? MAGMOS_FACE;
  log.push("[presenter] Venice character still");
  const face = await veniceGenerateImage(facePrompt, {
    outName: `face-${id}.png`,
    size: "1024x1024",
    projectId: opts.projectId,
    force: opts.force,
  });
  usd += face.usd;
  const facePath = join(dir, "face.png");
  copyFileSync(face.path, facePath);

  log.push("[presenter] Venice TTS narration");
  const voice = await veniceTextToSpeech(opts.narration.slice(0, 2500), {
    outName: `vo-${id}.mp3`,
    projectId: opts.projectId,
    force: opts.force,
  });
  usd += voice.usd;
  const voicePath = join(dir, "voice.mp3");
  copyFileSync(voice.path, voicePath);

  const wantT2v = env("PRESENTER_VIDEO", "0") === "1";
  const avatarPath = join(dir, "avatar.mp4");

  if (wantT2v) {
    try {
      log.push("[presenter] Venice T2V talking-head (PRESENTER_VIDEO=1)");
      const model = resolveVideoModel(env("PRESENTER_VIDEO_MODEL", "seedance-mini"));
      const motion = [
        "Ultra realistic vertical talking head, static eye-level medium close-up.",
        "Same person as a natural founder selfie. Subtle mouth and head motion while speaking.",
        "No text overlays, no captions. Natural desk lighting.",
        `They say: "${opts.narration.slice(0, 280)}"`,
      ].join(" ");
      const vid = await veniceGenerateVideo(motion, {
        model,
        durationSec: Math.min(12, Math.max(5, Math.ceil(probeDuration(voicePath) || 8))),
        aspectRatio: "9:16",
        projectId: opts.projectId,
        force: opts.force,
      });
      usd += vid.usd;
      copyFileSync(vid.path, avatarPath);
      writeFileSync(join(dir, "RESULT.json"), JSON.stringify({ id, mode: "t2v", usd, log }, null, 2));
      return { id, avatarPath, facePath, voicePath, mode: "t2v", usd, log };
    } catch (e) {
      log.push(`T2V failed, falling back to still+tts: ${e instanceof Error ? e.message : e}`);
    }
  }

  log.push("[presenter] still+tts → avatar.mp4 (PiP)");
  const dur = Math.max(3, probeDuration(voicePath) || 8);
  runFfmpeg(
    [
      "-y",
      "-loop",
      "1",
      "-i",
      facePath,
      "-i",
      voicePath,
      "-c:v",
      "libx264",
      "-tune",
      "stillimage",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-pix_fmt",
      "yuv420p",
      "-shortest",
      "-t",
      String(dur + 0.3),
      avatarPath,
    ],
    "venice-presenter",
  );

  writeFileSync(
    join(dir, "RESULT.json"),
    JSON.stringify({ id, mode: "still+tts", usd, facePath, voicePath, avatarPath, log }, null, 2),
  );

  return {
    id,
    avatarPath: existsSync(avatarPath) ? avatarPath : undefined,
    facePath,
    voicePath,
    mode: "still+tts",
    usd,
    log,
  };
}
