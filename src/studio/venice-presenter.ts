/**
 * Venice presenter — optional moving talking-head PiP (T2V only).
 * Still+TTS selfie loops are banned — they look fake. Prefer product-only + VO.
 */
import { existsSync, mkdirSync, writeFileSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR, assertDataDir, env } from "../config.js";
import { newId } from "../store.js";
import { hasFfmpeg, runFfmpeg, probeDuration } from "../edit/ffmpeg-util.js";
import {
  hasVenice,
  veniceTextToSpeech,
  veniceGenerateVideo,
} from "../integrations/venice.js";
import { resolveVideoModel } from "../integrations/venice-presets.js";

export interface VenicePresenterResult {
  id: string;
  avatarPath?: string;
  facePath?: string;
  voicePath?: string;
  mode: "t2v" | "skipped";
  usd: number;
  log: string[];
}

const MAGMOS_FACE =
  "Ultra realistic talking-head, natural desk lighting, eye-level medium close-up, " +
  "authentic founder energy, subtle motion while speaking, no text, no logos";

/** T2V talking-head only. Never returns a static still loop. */
export async function produceVenicePresenter(opts: {
  narration: string;
  projectId?: string;
  characterPrompt?: string;
  outDir?: string;
  force?: boolean;
  forceVideo?: boolean;
}): Promise<VenicePresenterResult> {
  const id = newId("presenter");
  const log: string[] = [];
  let usd = 0;

  const wantVideo = opts.forceVideo || env("PRESENTER_VIDEO", "0") === "1";
  if (!wantVideo) {
    return {
      id,
      mode: "skipped",
      usd: 0,
      log: ["Presenter skipped — still faces disabled; set PRESENTER_VIDEO=1 for T2V talking-head"],
    };
  }
  if (!hasVenice()) {
    return { id, mode: "skipped", usd: 0, log: ["Venice not configured — presenter skipped"] };
  }

  assertDataDir();
  const dir = opts.outDir ?? join(DATA_DIR, "studio", "presenter", id);
  mkdirSync(dir, { recursive: true });

  log.push("[presenter] Venice TTS narration");
  const voice = await veniceTextToSpeech(opts.narration.slice(0, 2500), {
    outName: `vo-${id}.mp3`,
    voice: env("VENICE_TTS_VOICE", "am_michael"),
    projectId: opts.projectId,
    force: opts.force,
  });
  usd += voice.usd;
  const voicePath = join(dir, "voice.mp3");
  copyFileSync(voice.path, voicePath);

  try {
    log.push("[presenter] Venice T2V talking-head");
    const model = resolveVideoModel(env("PRESENTER_VIDEO_MODEL", "seedance-mini"));
    const motion = [
      "Ultra realistic vertical talking head, static eye-level medium close-up.",
      opts.characterPrompt ?? MAGMOS_FACE,
      "Natural mouth motion while speaking, subtle head movement, blinks. No text overlays.",
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
    const avatarPath = join(dir, "avatar.mp4");
    copyFileSync(vid.path, avatarPath);
    if (hasFfmpeg()) {
      const muxed = join(dir, "avatar-vo.mp4");
      try {
        runFfmpeg(
          ["-y", "-i", avatarPath, "-i", voicePath, "-c:v", "copy", "-c:a", "aac", "-shortest", muxed],
          "presenter-mux-vo",
        );
        if (existsSync(muxed)) copyFileSync(muxed, avatarPath);
      } catch {
        /* keep silent video */
      }
    }
    writeFileSync(join(dir, "RESULT.json"), JSON.stringify({ id, mode: "t2v", usd, log }, null, 2));
    return { id, avatarPath, voicePath, mode: "t2v", usd, log };
  } catch (e) {
    log.push(`T2V failed: ${e instanceof Error ? e.message : e}`);
    writeFileSync(join(dir, "RESULT.json"), JSON.stringify({ id, mode: "skipped", usd, log }, null, 2));
    return { id, voicePath, mode: "skipped", usd, log };
  }
}
