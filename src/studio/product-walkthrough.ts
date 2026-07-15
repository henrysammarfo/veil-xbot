/**
 * Product walkthrough pipeline — HyperFrames + smart capture (Russo pattern).
 *
 * inspect → script/storyboard/timing → SMART Playwright capture → screen + VO
 * → HyperFrames compose → validate → render 1080p MP4
 *
 * Presenter defaults to OFF (product-is-the-content). Optional:
 *   WALKTHROUGH_AVATAR=1 + PRESENTER_VIDEO=1 → Venice T2V talking-head PiP
 *   (still+TTS faces are never used — they look fake)
 *
 * Refs: https://github.com/heygen-com/hyperframes
 */
import { writeFileSync, mkdirSync, existsSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import { DATA_DIR, assertDataDir, env } from "../config.js";
import { newId } from "../store.js";
import { getProject } from "../projects/registry.js";
import { chatCompletion } from "../ai/router.js";
import { produceVenicePresenter } from "./venice-presenter.js";
import { hasVenice, veniceTextToSpeech } from "../integrations/venice.js";
import { hasVoicebox, voiceboxTextToSpeech } from "../integrations/voicebox.js";
import {
  HYPERFRAMES_REPO,
  renderHyperframes,
  type HyperframesJob,
} from "../integrations/hyperframes.js";
import { probeDuration, runFfmpeg, hasFfmpeg, hasAudioStream } from "../edit/ffmpeg-util.js";
import { CaptureTimeline } from "../qa/capture-events.js";
import { waitForPageReady } from "../qa/smart-wait.js";
import {
  loadCaptureRecipe,
  resolveCaptureGeometry,
  evaluateBeat,
  applySmartAction,
  rememberCaptureOutcome,
} from "../qa/smart-capture-brain.js";
import { learn } from "../brain/self-learn.js";
import { smartCritique } from "../brain/smart.js";

export interface WalkthroughBeat {
  sec: number;
  durationSec: number;
  onScreen: string;
  narration: string;
  captureAction: string;
  urlPath?: string;
}

export interface WalkthroughBrief {
  title: string;
  hook: string;
  totalSec: number;
  beats: WalkthroughBeat[];
  cta: string;
  avatarPrompt: string;
}

export interface WalkthroughResult {
  id: string;
  projectId: string;
  status: "done" | "failed" | "partial";
  briefPath: string;
  capturePath?: string;
  avatarPath?: string;
  hyperframesDir?: string;
  outputPath?: string;
  log: string[];
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export async function planWalkthrough(
  projectId: string,
  briefHint?: string,
): Promise<WalkthroughBrief> {
  const project = getProject(projectId);
  const demoUrl = project.primaryUrl;
  const hint =
    briefHint ||
    (projectId === "magmos"
      ? "45s Magmos forge walkthrough — connect wallet, /aurum forge, show tx proof"
      : "45s product walkthrough of live UI");

  try {
    const llm = await chatCompletion(
      "walkthrough",
      `Product: ${project.name}
URL: ${demoUrl}
Tagline: ${project.tagline}
Brief: ${hint}

Return JSON ONLY:
{
  "title":"…",
  "hook":"≤8 words on screen first 2s",
  "totalSec":45,
  "beats":[
    {"sec":0,"durationSec":5,"onScreen":"…","narration":"…","captureAction":"goto landing","urlPath":"/"}
  ],
  "cta":"…",
  "avatarPrompt":"optional Venice T2V talking-head only — never a static selfie still"
}
Timing plan is the contract between VO, screen recording, captions, animation, sound.
5–8 beats. Live product proof. Product is the content — no logo open.`,
      { context: projectId, projectId, feature: "walkthrough", failover: true },
    );
    const parsed = JSON.parse(llm.content.replace(/```json|```/g, "").trim()) as WalkthroughBrief;
    if (parsed.beats?.length) return parsed;
  } catch {
    /* fallback below */
  }

  return {
    title: `${project.name} — product walkthrough`,
    hook: projectId === "magmos" ? "FORGE TX LANDED" : "LIVE ON TESTNET",
    totalSec: 45,
    beats: [
      {
        sec: 0,
        durationSec: 6,
        onScreen: "Hook — live product",
        narration: `${project.name}. Real product. Not a mockup.`,
        captureAction: "goto landing",
        urlPath: "/",
      },
      {
        sec: 6,
        durationSec: 12,
        onScreen: "Core flow",
        narration: "Watch the real UI — no QuickTime, scripted capture.",
        captureAction: "scroll / click primary CTA",
        urlPath: projectId === "magmos" ? "/aurum" : "/dashboard",
      },
      {
        sec: 18,
        durationSec: 15,
        onScreen: "Proof",
        narration: "Proof on screen — wallet, tx, or live state.",
        captureAction: "dwell on proof UI",
        urlPath: projectId === "magmos" ? "/aurum" : "/dashboard",
      },
      {
        sec: 33,
        durationSec: 12,
        onScreen: "CTA",
        narration: "Try it yourself — link in bio.",
        captureAction: "freeze CTA",
        urlPath: "/",
      },
    ],
    cta: `Open ${demoUrl}`,
    avatarPrompt: `Founder-style presenter briefly explaining ${project.name} while screen recording plays. Calm, technical, no hype.`,
  };
}

/** Smart awareness recorder — geometry-locked 16:9 + LLM beat critique + learnings. */
export async function captureProductWalkthrough(
  projectId: string,
  brief: WalkthroughBrief,
  outPath: string,
): Promise<{ path: string; eventsPath?: string; criticalErrors: string[]; geometry: string }> {
  const project = getProject(projectId);
  const base = project.primaryUrl.replace(/\/$/, "");
  const headed = env("SANDBOX_HEADED", "1") !== "0";
  const smartCapture = env("SMART_CAPTURE", "1") === "1";
  const timeline = smartCapture ? new CaptureTimeline(base) : undefined;
  let recipe = loadCaptureRecipe(projectId);
  const geo = resolveCaptureGeometry(recipe);
  recipe = {
    ...recipe,
    viewport: {
      width: geo.width,
      height: geo.height,
      deviceScaleFactor: geo.deviceScaleFactor,
      zoom: geo.zoom,
    },
  };
  const criticalErrors: string[] = [];
  const geometry = `${geo.width}x${geo.height} @${geo.deviceScaleFactor}x zoom=${geo.zoom} aspect=16:9${geo.aspectOk ? "" : " (corrected)"}`;

  const browser = await chromium.launch({
    headless: !headed,
    args: [
      "--autoplay-policy=no-user-gesture-required",
      "--disable-blink-features=AutomationControlled",
      `--force-device-scale-factor=${geo.deviceScaleFactor}`,
    ],
  });
  const context = await browser.newContext({
    viewport: { width: geo.width, height: geo.height },
    deviceScaleFactor: geo.deviceScaleFactor,
    recordVideo: {
      dir: join(DATA_DIR, "sandbox", "walkthrough-tmp"),
      size: { width: geo.width, height: geo.height },
    },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();
  // Hard lock browser zoom to 100% — prevents "tiny UI / weird ratio" recordings
  await page.evaluate((z) => {
    (document.body.style as unknown as { zoom?: string }).zoom = String(z);
  }, geo.zoom).catch(() => undefined);
  await page.addInitScript((z: number) => {
    Object.defineProperty(window, "devicePixelRatio", { get: () => z });
  }, geo.deviceScaleFactor);

  try {
    for (const beat of brief.beats) {
      const path = beat.urlPath || "/";
      const url = path.startsWith("http") ? path : `${base}${path.startsWith("/") ? path : `/${path}`}`;
      if (recipe.knownBadUrls.some((b) => url.includes(b))) {
        criticalErrors.push(`Skipped known-bad URL from prior learning: ${url}`);
        timeline?.log("error", `known-bad ${url}`);
        continue;
      }
      timeline?.log("navigate", beat.onScreen || beat.captureAction, { url });
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90_000 });
      await page.evaluate(() => {
        document.body.style.zoom = "1";
      }).catch(() => undefined);

      if (smartCapture) {
        const ready = await waitForPageReady(page, {
          timeline,
          note: beat.onScreen || beat.captureAction,
          settleMs: 900,
        });
        if (!ready.ok) {
          criticalErrors.push(`Page not ready: ${ready.errors.join("; ") || beat.onScreen}`);
          timeline?.log("error", ready.errors.join("; ") || "page not ready", { url });
        }

        // LLM / heuristic: is the beat actually true on screen?
        let decision = await evaluateBeat({
          projectId,
          beatGoal: beat.onScreen,
          narration: beat.narration,
          page,
          recipe,
          timeline,
        });

        // One recovery attempt for click/wait/goto/scroll
        for (let attempt = 0; attempt < 2 && decision.action !== "ok" && decision.action !== "fail"; attempt++) {
          const applied = await applySmartAction(page, decision, timeline);
          if (applied.fatal) criticalErrors.push(applied.fatal);
          await waitForPageReady(page, { timeline, note: `retry ${beat.onScreen}`, settleMs: 600 });
          decision = await evaluateBeat({
            projectId,
            beatGoal: beat.onScreen,
            narration: beat.narration,
            page,
            recipe,
            timeline,
          });
        }

        if (decision.action === "fail") {
          criticalErrors.push(`BEAT FAIL [${beat.onScreen}]: ${decision.reason}`);
          recipe = rememberCaptureOutcome(recipe, {
            errors: criticalErrors,
            lessons: [`Beat "${beat.onScreen}" failed: ${decision.reason}`],
            badUrl: url.replace(base, ""),
          });
        } else if (decision.action === "ok") {
          timeline?.log("scene", beat.narration.slice(0, 80), { url });
          if (decision.reason.includes("click")) {
            /* noop */
          }
        } else {
          await applySmartAction(page, decision, timeline);
        }
      }

      const holdMs = Math.min(Math.max(beat.durationSec * 1000, 2200), 10_000);
      await page.waitForTimeout(holdMs);
    }
  } finally {
    const vid = page.video();
    await context.close();
    await browser.close();
    if (vid) {
      const tmp = await vid.path();
      if (tmp && existsSync(tmp)) {
        if (outPath.endsWith(".mp4") && !tmp.endsWith(".mp4") && hasFfmpeg()) {
          runFfmpeg(
            ["-y", "-i", tmp, "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac", outPath],
            "walkthrough-norm",
          );
        } else {
          copyFileSync(tmp, outPath);
        }
      }
    }
  }
  if (!existsSync(outPath)) throw new Error("Walkthrough capture produced no video");

  rememberCaptureOutcome(recipe, {
    errors: criticalErrors,
    lessons: criticalErrors.length
      ? ["Next run must click real Connect/Forge and show on-screen proof before claiming it"]
      : ["Capture geometry locked 16:9; smart brain passed beats"],
  });

  let eventsPath: string | undefined;
  if (timeline) {
    eventsPath = outPath.replace(/\.(mp4|webm)$/i, "") + "-events.json";
    writeFileSync(eventsPath, JSON.stringify(timeline.toLog(), null, 2));
  }
  return { path: outPath, eventsPath, criticalErrors, geometry };
}

/** Compose screen + optional avatar PiP as HyperFrames HTML composition. */
export function scaffoldWalkthroughComposition(opts: {
  brief: WalkthroughBrief;
  projectId: string;
  screenPath: string;
  avatarPath?: string;
  projectDir: string;
}): HyperframesJob {
  const { brief, screenPath, avatarPath, projectDir } = opts;
  if (!existsSync(projectDir)) mkdirSync(projectDir, { recursive: true });

  const total = brief.totalSec;
  const screenRel = "assets/screen.mp4";
  const avatarRel = avatarPath ? "assets/avatar.mp4" : undefined;
  const assetsDir = join(projectDir, "assets");
  if (!existsSync(assetsDir)) mkdirSync(assetsDir, { recursive: true });
  copyFileSync(screenPath, join(projectDir, screenRel));
  if (avatarPath && existsSync(avatarPath) && avatarRel) {
    copyFileSync(avatarPath, join(projectDir, avatarRel));
  }

  const captionClips = brief.beats
    .map(
      (b) => `
  <p class="clip" data-start="${b.sec}" data-duration="${b.durationSec}" data-track-index="3"
     style="position:absolute;left:6%;right:28%;bottom:10%;font:600 42px/1.25 Inter,system-ui,sans-serif;color:#fff;text-shadow:0 2px 12px #000;">
    ${escapeHtml(b.onScreen)}
  </p>`,
    )
    .join("\n");

  const avatarHtml = avatarRel
    ? `
  <video id="avatar-pip" class="clip" data-start="0" data-duration="${total}" data-track-index="2"
         src="${avatarRel}" muted playsinline
         style="position:absolute;right:3%;bottom:4%;width:280px;height:280px;object-fit:cover;border-radius:16px;border:2px solid #ffffff33;z-index:5;"></video>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(brief.title)}</title>
  <style>*{box-sizing:border-box;margin:0;padding:0} body{background:#050505}</style>
</head>
<body>
<div id="stage" data-composition-id="walkthrough" data-start="0" data-width="1920" data-height="1080"
     data-duration="${total}" style="position:relative;width:1920px;height:1080px;overflow:hidden;background:#050505;">
  <video id="screen-main" class="clip" data-start="0" data-duration="${total}" data-track-index="0"
         src="${screenRel}" autoplay muted playsinline
         style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#050505;"></video>
  <div id="hook-title" class="clip" data-start="0" data-duration="2.2" data-track-index="1"
       style="position:absolute;left:50%;top:18%;transform:translateX(-50%);font:800 64px/1 Inter,system-ui,sans-serif;color:#fff;letter-spacing:-0.02em;">
    ${escapeHtml(brief.hook)}
  </div>
  ${avatarHtml}
  ${captionClips}
  <div id="cta-line" class="clip" data-start="${Math.max(0, total - 4)}" data-duration="4" data-track-index="4"
       style="position:absolute;left:6%;bottom:6%;font:600 36px Inter,system-ui,sans-serif;color:#f5f5f5;">
    ${escapeHtml(brief.cta)}
  </div>
  <script src="https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js"><\/script>
  <script>
    const tl = gsap.timeline({ paused: true });
    document.querySelectorAll(".clip").forEach((el) => {
      const start = parseFloat(el.dataset.start || "0");
      tl.from(el, { opacity: 0, duration: 0.4, ease: "power2.out" }, start);
    });
    window.__timelines = window.__timelines || {};
    window.__timelines.walkthrough = tl;
  <\/script>
</div>
</body>
</html>`;

  writeFileSync(join(projectDir, "index.html"), html, "utf8");
  writeFileSync(
    join(projectDir, "BRIEF.md"),
    [
      `# ${brief.title}`,
      "",
      `Hook: ${brief.hook}`,
      `CTA: ${brief.cta}`,
      `Total: ${brief.totalSec}s`,
      "",
      "## Timing contract",
      ...brief.beats.map(
        (b) => `- ${b.sec}–${b.sec + b.durationSec}s · ${b.onScreen} · ${b.captureAction}`,
      ),
      "",
      `HyperFrames: ${HYPERFRAMES_REPO}`,
      "Render: npx hyperframes render",
    ].join("\n"),
  );

  return {
    id: newId("hf-wt"),
    projectDir,
    status: "scaffolded",
    log: `Walkthrough composition scaffolded → ${projectDir}`,
  };
}

/**
 * Full Russo workflow for Magmos/Veil:
 * plan → smart capture (OpenAI/Venice critic) → VO → HyperFrames → render.
 * Failures are surfaced loudly and written into self-learn recipes.
 */
export async function produceProductWalkthrough(opts: {
  projectId: string;
  briefHint?: string;
  skipAvatar?: boolean;
  skipCapture?: boolean;
  screenPath?: string;
  skipRender?: boolean;
}): Promise<WalkthroughResult> {
  const id = newId("walk");
  const log: string[] = [];
  const projectId = opts.projectId || "magmos";

  assertDataDir();
  const dir = join(DATA_DIR, "studio", "walkthrough", id);
  mkdirSync(dir, { recursive: true });

  log.push("[1/6] Plan brief + timing contract");
  const brief = await planWalkthrough(projectId, opts.briefHint);
  const briefPath = join(dir, "brief.json");
  writeFileSync(briefPath, JSON.stringify(brief, null, 2));
  writeFileSync(join(dir, "TIMING.md"), brief.beats.map((b) => `${b.sec}s ${b.narration}`).join("\n"));

  let capturePath = opts.screenPath;
  if (!opts.skipCapture && !capturePath) {
    const smart = env("SMART_CAPTURE", "1") === "1";
    log.push(`[2/6] ${smart ? "Smart awareness" : "Basic"} Playwright capture (no QuickTime)`);
    capturePath = join(dir, "screen.webm");
    try {
      const cap = await captureProductWalkthrough(projectId, brief, capturePath);
      capturePath = cap.path;
      log.push(`Geometry: ${cap.geometry}`);
      if (cap.eventsPath) log.push(`Smart events: ${cap.eventsPath}`);
      if (cap.criticalErrors.length) {
        log.push(`CRITICAL CAPTURE ERRORS (${cap.criticalErrors.length}):`);
        for (const err of cap.criticalErrors) log.push(`  ✗ ${err}`);
      } else {
        log.push("Smart brain: no critical beat failures");
      }
      const mp4 = join(dir, "screen.mp4");
      if (hasFfmpeg() && existsSync(capturePath) && !capturePath.endsWith(".mp4")) {
        try {
          runFfmpeg(
            ["-y", "-i", capturePath, "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac", mp4],
            "screen-mp4",
          );
          if (existsSync(mp4)) capturePath = mp4;
        } catch {
          /* keep webm */
        }
      }
      log.push(`Capture: ${capturePath} (${probeDuration(capturePath).toFixed(1)}s)`);
      // Persist capture errors onto result for honesty
      writeFileSync(join(dir, "CAPTURE-ERRORS.json"), JSON.stringify(cap.criticalErrors, null, 2));
      if (cap.criticalErrors.length >= 2) {
        log.push("ABORTING compose — capture claimed beats it could not prove on screen. See CAPTURE-ERRORS.json");
        const result: WalkthroughResult = {
          id,
          projectId,
          status: "failed",
          briefPath,
          capturePath,
          log,
        };
        writeFileSync(join(dir, "RESULT.json"), JSON.stringify(result, null, 2));
        writeFileSync(join(dir, "RESULT.md"), formatWalkthrough(result));
        learn({
          projectId,
          feature: "walkthrough",
          outcome: "fail",
          summary: `Abort: ${cap.criticalErrors.length} critical capture errors`,
          errors: cap.criticalErrors,
          lessons: [
            "Do not compose when ≥2 beats fail screen proof",
            "Fix live UI paths before re-running walkthrough",
            "Use SMART_CAPTURE=1 + open wallet/forge for real proof moments",
          ],
          meta: { id, capturePath },
        });
        return result;
      }
    } catch (e) {
      log.push(`Capture failed: ${e instanceof Error ? e.message : e}`);
      learn({
        projectId,
        feature: "walkthrough",
        outcome: "fail",
        summary: "Capture threw",
        errors: [e instanceof Error ? e.message : String(e)],
        lessons: ["Capture must stay up for full walkthrough — check Playwright + SMART_CAPTURE"],
      });
      return { id, projectId, status: "failed", briefPath, log };
    }
  } else {
    log.push(`[2/6] Reusing screen: ${capturePath}`);
  }
  if (!capturePath || !existsSync(capturePath)) {
    return { id, projectId, status: "failed", briefPath, log: [...log, "No screen capture"] };
  }

  const narration = brief.beats.map((b) => b.narration).join(" ");
  // Default OFF — product is the content. Still faces look fake. Moving T2V only if asked.
  const wantFace =
    !opts.skipAvatar &&
    env("WALKTHROUGH_AVATAR", "0") === "1" &&
    env("PRESENTER_VIDEO", "0") === "1";

  let avatarPath: string | undefined;
  let voicePath: string | undefined;

  log.push("[3/6] Narration VO (Voicebox if set, else Venice TTS — no static face)");
  try {
    if (hasVoicebox()) {
      const vb = await voiceboxTextToSpeech(narration, { outName: `walk-vo-${id}.mp3` });
      voicePath = vb.path;
      log.push(`Voicebox VO: ${voicePath}`);
    } else if (hasVenice()) {
      const voice = env("VENICE_TTS_VOICE", "am_michael");
      const tts = await veniceTextToSpeech(narration, {
        outName: `walk-vo-${id}.mp3`,
        voice,
        projectId,
      });
      voicePath = tts.path;
      log.push(`Venice TTS voice=${voice}: ${voicePath}`);
    } else {
      log.push("No TTS configured — silent screen only");
    }
  } catch (e) {
    log.push(`VO failed: ${e instanceof Error ? e.message : e}`);
  }

  if (wantFace && hasVenice()) {
    log.push("[3b/6] Venice T2V talking-head PiP (PRESENTER_VIDEO=1)");
    try {
      const presenter = await produceVenicePresenter({
        narration,
        projectId,
        characterPrompt: brief.avatarPrompt,
        outDir: join(dir, "presenter"),
        forceVideo: true,
      });
      log.push(...presenter.log);
      if (presenter.mode === "t2v" && presenter.avatarPath && existsSync(presenter.avatarPath)) {
        avatarPath = presenter.avatarPath;
      } else {
        log.push("T2V unavailable — keeping product-only (no still-face PiP)");
      }
      if (!voicePath && presenter.voicePath) voicePath = presenter.voicePath;
    } catch (e) {
      log.push(`T2V presenter skipped: ${e instanceof Error ? e.message : e}`);
    }
  } else {
    log.push("[3b/6] Face PiP off (set WALKTHROUGH_AVATAR=1 PRESENTER_VIDEO=1 for moving avatar only)");
  }

  log.push("[4/6] HyperFrames compose (screen + PiP + captions)");
  const hfDir = join(dir, "hyperframes");
  const scaffold = scaffoldWalkthroughComposition({
    brief,
    projectId,
    screenPath: capturePath,
    avatarPath,
    projectDir: hfDir,
  });
  log.push(scaffold.log);

  let outputPath: string | undefined;
  if (!opts.skipRender) {
    log.push("[5/6] hyperframes render → 1080p MP4");
    const rendered = await renderHyperframes(hfDir);
    log.push(rendered.log.slice(0, 800));
    if (/media_missing_id|FROZEN|✗|error/i.test(rendered.log)) {
      log.push("CRITICAL RENDER ERROR — HyperFrames reported media/id failures (video would freeze). Using ffmpeg fallback and marking partial.");
    }
    outputPath = rendered.outputPath;
    if (!outputPath && hasFfmpeg()) {
      // Fallback compose — screen + optional T2V PiP + narration VO
      const fallback = join(dir, "walkthrough_fallback.mp4");
      try {
        const args: string[] = ["-y", "-i", capturePath];
        if (avatarPath && existsSync(avatarPath)) args.push("-i", avatarPath);
        if (voicePath && existsSync(voicePath)) args.push("-i", voicePath);

        if (avatarPath && existsSync(avatarPath) && voicePath && existsSync(voicePath)) {
          args.push(
            "-filter_complex",
            "[0:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2[base];[1:v]scale=280:280[pip];[base][pip]overlay=W-w-40:H-h-40[vout]",
            "-map",
            "[vout]",
            "-map",
            "2:a:0",
          );
        } else if (avatarPath && existsSync(avatarPath)) {
          args.push(
            "-filter_complex",
            "[0:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2[base];[1:v]scale=280:280[pip];[base][pip]overlay=W-w-40:H-h-40[vout]",
            "-map",
            "[vout]",
            "-map",
            "0:a?",
          );
        } else if (voicePath && existsSync(voicePath)) {
          args.push(
            "-filter_complex",
            "[0:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2[vout]",
            "-map",
            "[vout]",
            "-map",
            "1:a:0",
          );
        } else {
          args.push("-vf", "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2");
        }

        args.push(
          "-t",
          String(brief.totalSec),
          "-c:v",
          "libx264",
          "-preset",
          "fast",
          "-crf",
          "20",
          "-c:a",
          "aac",
          "-shortest",
          fallback,
        );
        runFfmpeg(args, "walkthrough-fallback");
        if (existsSync(fallback)) outputPath = fallback;
      } catch (e) {
        log.push(`Fallback compose: ${e instanceof Error ? e.message : e}`);
      }
    }
  } else {
    log.push("[5/6] Render skipped — open hyperframes dir and run npx hyperframes render");
  }

  log.push("[6/6] Validate");
  if (outputPath && existsSync(outputPath)) {
    const dur = probeDuration(outputPath);
    const audio = hasAudioStream(outputPath);
    log.push(`Output ${dur.toFixed(1)}s · audio=${audio} · ${outputPath}`);
  }

  const status: WalkthroughResult["status"] = outputPath
    ? "done"
    : existsSync(hfDir)
      ? "partial"
      : "failed";

  const result: WalkthroughResult = {
    id,
    projectId,
    status,
    briefPath,
    capturePath,
    avatarPath,
    hyperframesDir: hfDir,
    outputPath,
    log,
  };
  writeFileSync(join(dir, "RESULT.json"), JSON.stringify(result, null, 2));
  writeFileSync(join(dir, "RESULT.md"), formatWalkthrough(result));

  const critical = result.log.filter((l) => /CRITICAL|✗|ABORTING|media_missing/i.test(l));
  learn({
    projectId,
    feature: "walkthrough",
    outcome: status === "done" ? "success" : status === "partial" ? "partial" : "fail",
    summary: `walkthrough ${status} · out=${Boolean(outputPath)} · face=${Boolean(avatarPath)}`,
    errors: critical,
    lessons: [
      status === "done"
        ? "Product-only + smart capture + VO compose works — keep faces off unless T2V asked"
        : "Inspect CAPTURE-ERRORS / HyperFrames media ids before next run",
      "Geometry must stay 16:9; object-fit contain; never skip critical beat fails",
      "Self-learn + Venice/OpenAI cascade drive next plan",
    ],
    meta: { id, outputPath, capturePath },
  });
  try {
    await smartCritique({
      projectId,
      feature: "walkthrough",
      artifactSummary: formatWalkthrough(result).slice(0, 2500),
      errors: critical,
    });
  } catch {
    /* best-effort */
  }

  return result;
}

export function formatWalkthrough(r: WalkthroughResult): string {
  const critical = r.log.filter((l) => /CRITICAL|✗|BEAT FAIL|ABORTING|media_missing/i.test(l));
  return [
    `# Product walkthrough — ${r.status}`,
    `Project: ${r.projectId} · ${r.id}`,
    "",
    critical.length
      ? ["## ⚠ ERRORS YOU NEED TO SEE", ...critical.map((c) => `- ${c}`), ""].join("\n")
      : "",
    `Brief: ${r.briefPath}`,
    r.capturePath ? `Screen: ${r.capturePath}` : "",
    r.avatarPath ? `Avatar: ${r.avatarPath}` : "",
    r.hyperframesDir ? `HyperFrames: ${r.hyperframesDir}` : "",
    r.outputPath ? `MP4: ${r.outputPath}` : "",
    "",
    "## Log",
    ...r.log,
    "",
    "Workflow: inspect → script → smart capture (Venice→OpenAI + TinyFish) → VO → HyperFrames → validate → render",
    `Repo: ${HYPERFRAMES_REPO}`,
    "Learnings: data/improve/SELF-LEARN.json + walkthrough-recipe-<project>.json",
  ]
    .filter(Boolean)
    .join("\n");
}
