/**
 * Product walkthrough pipeline — HyperFrames + presenter PiP (Russo pattern).
 *
 * inspect → script/storyboard/timing → Playwright capture → presenter PiP
 * → HyperFrames compose → validate → render 1080p MP4
 *
 * Presenter backends (keep the flow; swap keys):
 *   1. Venice character still + TTS (default when VENICE_API_KEY set)
 *   2. Optional HeyGen if HEYGEN_API_KEY + HEYGEN_AUTO=1
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
import { hasHeyGen, runVideoAgent } from "../integrations/heygen.js";
import { produceVenicePresenter } from "./venice-presenter.js";
import { hasVenice } from "../integrations/venice.js";
import {
  HYPERFRAMES_REPO,
  renderHyperframes,
  type HyperframesJob,
} from "../integrations/hyperframes.js";
import { probeDuration, runFfmpeg, hasFfmpeg, hasAudioStream } from "../edit/ffmpeg-util.js";

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
  "avatarPrompt":"HeyGen presenter prompt — calm founder explaining the product while UI plays"
}
Timing plan is the contract between presenter, screen recording, captions, animation, sound.
5–8 beats. Live product proof. No logo open.`,
      { context: projectId },
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

/** Playwright record of the live product URL (scripted — no QuickTime). */
export async function captureProductWalkthrough(
  projectId: string,
  brief: WalkthroughBrief,
  outPath: string,
): Promise<string> {
  const project = getProject(projectId);
  const base = project.primaryUrl.replace(/\/$/, "");
  const headed = env("SANDBOX_HEADED", "1") !== "0";

  const browser = await chromium.launch({
    headless: !headed,
    args: ["--autoplay-policy=no-user-gesture-required"],
  });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: { dir: join(DATA_DIR, "sandbox", "walkthrough-tmp"), size: { width: 1920, height: 1080 } },
  });
  const page = await context.newPage();

  try {
    for (const beat of brief.beats) {
      const path = beat.urlPath || "/";
      const url = path.startsWith("http") ? path : `${base}${path.startsWith("/") ? path : `/${path}`}`;
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90_000 });
      await page.waitForTimeout(Math.min(beat.durationSec * 1000, 12_000));
      // Light interaction so capture isn't frozen
      await page.mouse.wheel(0, 400).catch(() => undefined);
      await page.waitForTimeout(800);
    }
  } finally {
    const vid = page.video();
    await context.close();
    await browser.close();
    if (vid) {
      const tmp = await vid.path();
      if (tmp && existsSync(tmp)) {
        if (outPath.endsWith(".mp4") && !tmp.endsWith(".mp4") && hasFfmpeg()) {
          runFfmpeg(["-y", "-i", tmp, "-c:v", "libx264", "-preset", "fast", "-crf", "20", "-c:a", "aac", outPath], "walkthrough-norm");
        } else {
          copyFileSync(tmp, outPath);
        }
      }
    }
  }
  if (!existsSync(outPath)) throw new Error("Walkthrough capture produced no video");
  return outPath;
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
  <video class="clip" data-start="0" data-duration="${total}" data-track-index="2"
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
  <video class="clip" data-start="0" data-duration="${total}" data-track-index="0"
         src="${screenRel}" autoplay muted playsinline
         style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;"></video>
  <div class="clip" data-start="0" data-duration="2.2" data-track-index="1"
       style="position:absolute;left:50%;top:18%;transform:translateX(-50%);font:800 64px/1 Inter,system-ui,sans-serif;color:#fff;letter-spacing:-0.02em;">
    ${escapeHtml(brief.hook)}
  </div>
  ${avatarHtml}
  ${captionClips}
  <div class="clip" data-start="${Math.max(0, total - 4)}" data-duration="4" data-track-index="4"
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
 * plan → capture live URL → Venice (or optional HeyGen) presenter → HyperFrames → render.
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
    log.push("[2/6] Playwright capture of live product (no QuickTime)");
    capturePath = join(dir, "screen.webm");
    try {
      await captureProductWalkthrough(projectId, brief, capturePath);
      const mp4 = join(dir, "screen.mp4");
      if (hasFfmpeg() && existsSync(capturePath)) {
        try {
          runFfmpeg(["-y", "-i", capturePath, "-c:v", "libx264", "-preset", "fast", "-crf", "20", "-c:a", "aac", mp4], "screen-mp4");
          if (existsSync(mp4)) capturePath = mp4;
        } catch {
          /* keep webm */
        }
      }
      log.push(`Capture: ${capturePath} (${probeDuration(capturePath).toFixed(1)}s)`);
    } catch (e) {
      log.push(`Capture failed: ${e instanceof Error ? e.message : e}`);
      return { id, projectId, status: "failed", briefPath, log };
    }
  } else {
    log.push(`[2/6] Reusing screen: ${capturePath}`);
  }
  if (!capturePath || !existsSync(capturePath)) {
    return { id, projectId, status: "failed", briefPath, log: [...log, "No screen capture"] };
  }

  let avatarPath: string | undefined;
  const narration = brief.beats.map((b) => b.narration).join(" ");
  const wantPresenter = !opts.skipAvatar && env("WALKTHROUGH_AVATAR", "1") !== "0";

  if (wantPresenter && hasVenice()) {
    log.push("[3/6] Venice presenter PiP (replaces HeyGen agent when no sub)");
    try {
      const presenter = await produceVenicePresenter({
        narration,
        projectId,
        characterPrompt: brief.avatarPrompt,
        outDir: join(dir, "presenter"),
      });
      log.push(...presenter.log);
      if (presenter.avatarPath && existsSync(presenter.avatarPath)) {
        avatarPath = presenter.avatarPath;
        log.push(`Presenter avatar: ${avatarPath} (${presenter.mode}, ~$${presenter.usd.toFixed(2)})`);
      }
    } catch (e) {
      log.push(`Venice presenter failed: ${e instanceof Error ? e.message : e}`);
    }
  }

  if (!avatarPath && wantPresenter && hasHeyGen() && env("HEYGEN_AUTO", "0") === "1") {
    log.push("[3/6] HeyGen avatar fallback (optional key)");
    try {
      const prompt = `${brief.avatarPrompt}\n\nScript:\n${narration}`;
      const result = await runVideoAgent(prompt, { download: true, maxWaitMs: 15 * 60_000 });
      avatarPath = result.localPath;
      log.push(`HeyGen avatar: ${avatarPath ?? result.videoUrl}`);
    } catch (e) {
      log.push(`HeyGen skipped: ${e instanceof Error ? e.message : e}`);
    }
  } else if (!avatarPath) {
    log.push("[3/6] Presenter skipped (no Venice/HeyGen or WALKTHROUGH_AVATAR=0)");
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
    outputPath = rendered.outputPath;
    if (!outputPath && hasFfmpeg()) {
      // Fallback compose without CLI
      const fallback = join(dir, "walkthrough_fallback.mp4");
      try {
        if (avatarPath && existsSync(avatarPath)) {
          runFfmpeg(
            [
              "-y",
              "-i",
              capturePath,
              "-i",
              avatarPath,
              "-filter_complex",
              "[0:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2[base];[1:v]scale=280:280[pip];[base][pip]overlay=W-w-40:H-h-40",
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
            ],
            "walkthrough-pip-fallback",
          );
        } else {
          runFfmpeg(
            ["-y", "-i", capturePath, "-t", String(brief.totalSec), "-c:v", "libx264", "-preset", "fast", "-crf", "20", "-c:a", "aac", fallback],
            "walkthrough-fallback",
          );
        }
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
  return result;
}

export function formatWalkthrough(r: WalkthroughResult): string {
  return [
    `# Product walkthrough — ${r.status}`,
    `Project: ${r.projectId} · ${r.id}`,
    "",
    `Brief: ${r.briefPath}`,
    r.capturePath ? `Screen: ${r.capturePath}` : "",
    r.avatarPath ? `Avatar: ${r.avatarPath}` : "",
    r.hyperframesDir ? `HyperFrames: ${r.hyperframesDir}` : "",
    r.outputPath ? `MP4: ${r.outputPath}` : "",
    "",
    "## Log",
    ...r.log,
    "",
    "Workflow: inspect → script → storyboard → capture → HeyGen → HyperFrames → validate → render",
    `Repo: ${HYPERFRAMES_REPO}`,
  ]
    .filter(Boolean)
    .join("\n");
}
