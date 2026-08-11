/**
 * Goose video-ad formats — EXECUTE create-*-mockup atoms + HyperFrames pack videos.
 *
 * formats.json maps:
 *   imessage → remix-imessage-ad-from-sample (orchestration)
 *   chatgpt  → remix-chatgpt-ad-from-sample
 *   apple-notes → remix-apple-notes-ad-from-sample
 *
 * Executable atoms on disk (deterministic, $0 GooseWorks):
 *   create-imessage-mockup / create-chatgpt-mockup / create-apple-notes-mockup
 */
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  copyFileSync,
} from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { DATA_DIR, assertDataDir, env } from "../config.js";
import { newId } from "../store.js";
import { scaffoldSimplePrompt, renderHyperframes } from "../integrations/hyperframes.js";
import { hasFfmpeg, runFfmpeg } from "../edit/ffmpeg-util.js";
import { learn } from "../brain/self-learn.js";
import { MAGMOS_BRAND } from "./magmos-brand.js";
import { launchChromium } from "../qa/playwright-launch.js";
import { videoFormatSkillDir } from "../skills/paths.js";

const execFileAsync = promisify(execFile);

export type VideoFormatId = "imessage" | "chatgpt" | "apple-notes";

export interface VideoFormatResult {
  format: VideoFormatId;
  skillDir: string;
  threadPath: string;
  pngPath?: string;
  htmlPath?: string;
  mp4Path?: string;
  hfDir?: string;
  log: string[];
}

function skillDirFor(format: VideoFormatId): string | null {
  return videoFormatSkillDir(format);
}

function magmosImessageThread() {
  return {
    mode: "dm",
    participants: [
      { id: "me", name: "Me", self: true },
      { id: "alex", name: "Alex", color: "#E8B84A", initials: "A" },
    ],
    messages: [
      { type: "timestamp", label: "iMessage\nToday 9:41 AM" },
      { type: "text", from: "alex", text: "what’re you doing with idle USDC" },
      {
        type: "text",
        from: "me",
        text: "Moved it into Magmos. Still $1. Can earn while I hold.",
        delivered: true,
      },
      { type: "text", from: "alex", text: "lockups?" },
      {
        type: "text",
        from: "me",
        text: "None. Reserves on-chain. magmoslabs.vercel.app",
        delivered: true,
        read: true,
      },
    ],
    keyboard: { leftIcon: "plus" },
  };
}

function magmosChatgptThread() {
  return {
    statusBar: { time: "9:41" },
    header: {
      style: "model-tag",
      title: "ChatGPT",
      model: "5",
      rightIcons: ["personPlus", "dottedCircle"],
    },
    messages: [
      {
        type: "user-text",
        text: "I want a digital dollar on Sui that can earn while I hold it — no lockups, clear reserves.",
      },
      {
        type: "assistant",
        text: `**Magmos** — a digital dollar that stays $1.00.\n\nYou can earn while you hold. No lockups. Reserves are on-chain.\n\nNo APY promises — just a clear product.\n\nOpen: magmoslabs.vercel.app`,
      },
    ],
    composer: { placeholder: "Ask anything" },
  };
}

function magmosAppleNotesThread() {
  return {
    title: "Why Magmos",
    body: [
      { type: "paragraph", text: "Digital dollar on Sui — stays $1" },
      {
        type: "checklist",
        items: [
          { text: "Earn while you hold", checked: true },
          { text: "No lockups", checked: true },
          { text: "On-chain reserves", checked: true },
          { text: "Join waitlist", checked: false },
        ],
      },
      { type: "paragraph", text: "Calm product. Clear words. Ship." },
    ],
    cursor: null,
    status_bar: {
      time: "9:41",
      battery_pct: 87,
      battery_low: false,
      show_focus_glyph: false,
    },
    show_keyboard: false,
    with_iphone_frame: true,
  };
}

function threadFor(format: VideoFormatId): unknown {
  if (format === "imessage") return magmosImessageThread();
  if (format === "chatgpt") return magmosChatgptThread();
  return magmosAppleNotesThread();
}

async function screenshotHtmlLocal(opts: {
  htmlPath: string;
  pngPath: string;
  width: number;
  height: number;
}): Promise<void> {
  const browser = await launchChromium({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: opts.width, height: opts.height },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    await page.goto(pathToFileURL(opts.htmlPath).href, {
      waitUntil: "networkidle",
      timeout: 60000,
    });
    await page.waitForTimeout(500);
    await page.screenshot({ path: opts.pngPath, type: "png", fullPage: false });
  } finally {
    await browser.close();
  }
}

/** Goose generate.js + bot Playwright (skill dirs often lack their own playwright). */
async function runMockupRender(opts: {
  format: VideoFormatId;
  skillDir: string;
  threadPath: string;
  outDir: string;
  name: string;
}): Promise<{ png?: string; html?: string; log: string[] }> {
  const log: string[] = [];
  const thread = JSON.parse(readFileSync(opts.threadPath, "utf8"));
  mkdirSync(opts.outDir, { recursive: true });
  const htmlPath = join(opts.outDir, "index.html");
  const pngPath = join(opts.outDir, "screenshot.png");

  try {
    const require = createRequire(join(opts.skillDir, "render.js"));
    let html = "";
    if (opts.format === "apple-notes") {
      const gen = require("./generate.js") as { generateHtml: (spec: unknown) => string };
      html = gen.generateHtml(thread);
    } else {
      const gen = require("./generate.js") as {
        renderHTML: (t: unknown, o?: { mode?: string }) => string;
      };
      html = gen.renderHTML(
        thread,
        opts.format === "imessage" ? { mode: "with-iphone-frame" } : undefined,
      );
    }
    writeFileSync(htmlPath, html, "utf8");
    const viewport =
      opts.format === "imessage"
        ? { width: 525, height: 980 }
        : opts.format === "chatgpt"
          ? { width: 750, height: 1624 }
          : { width: 1180, height: 2556 };
    await screenshotHtmlLocal({
      htmlPath,
      pngPath,
      width: viewport.width,
      height: viewport.height,
    });
    log.push(`local Playwright PNG ← ${opts.format} generate.js`);
    return { png: pngPath, html: htmlPath, log };
  } catch (e) {
    log.push(`local generate/screenshot failed: ${e instanceof Error ? e.message : e}`);
  }

  // Fallback: skill render.js if they npm-installed playwright
  try {
    const args =
      opts.format === "apple-notes"
        ? [
            "render.js",
            "--note",
            opts.threadPath,
            "--with-iphone-frame",
            "--output",
            opts.outDir,
            "--name",
            opts.name,
          ]
        : opts.format === "imessage"
          ? [
              "render.js",
              "--thread",
              opts.threadPath,
              "--with-iphone-frame",
              "--output",
              opts.outDir,
              "--name",
              opts.name,
            ]
          : ["render.js", "--thread", opts.threadPath, "--output", opts.outDir, "--name", opts.name];
    await execFileAsync(process.execPath, args, {
      cwd: opts.skillDir,
      timeout: 180_000,
    });
    if (existsSync(pngPath)) {
      log.push("skill render.js ok");
      return { png: pngPath, html: htmlPath, log };
    }
  } catch (e) {
    log.push(`skill render.js skip: ${e instanceof Error ? e.message.slice(0, 100) : e}`);
  }

  return { html: existsSync(htmlPath) ? htmlPath : undefined, log };
}

async function mockupToMp4(pngPath: string, outMp4: string, label: string): Promise<boolean> {
  if (!hasFfmpeg() || !existsSync(pngPath)) return false;
  try {
    runFfmpeg(
      [
        "-y",
        "-loop",
        "1",
        "-i",
        pngPath,
        "-vf",
        "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,format=yuv420p",
        "-c:v",
        "libx264",
        "-t",
        "6",
        "-pix_fmt",
        "yuv420p",
        outMp4,
      ],
      label,
    );
    return existsSync(outMp4);
  } catch {
    return false;
  }
}

/** Render one Goose video format (still + optional MP4 + HyperFrames scaffold). */
export async function runVideoFormat(opts: {
  format: VideoFormatId;
  projectId: string;
  workDir?: string;
}): Promise<VideoFormatResult> {
  assertDataDir();
  const log: string[] = [];
  const skillDir = skillDirFor(opts.format);
  if (!skillDir) {
    return {
      format: opts.format,
      skillDir: "",
      threadPath: "",
      log: [`Missing Goose skill dir for ${opts.format} — clone goose-skills`],
    };
  }

  const workDir = opts.workDir ?? join(DATA_DIR, "exports", "video-formats", newId("vf"));
  mkdirSync(workDir, { recursive: true });
  const threadPath = join(workDir, `${opts.format}-thread.json`);
  writeFileSync(threadPath, JSON.stringify(threadFor(opts.format), null, 2));

  const renderOut = join(workDir, "render");
  mkdirSync(renderOut, { recursive: true });
  const rendered = await runMockupRender({
    format: opts.format,
    skillDir,
    threadPath,
    outDir: renderOut,
    name: `magmos-${opts.format}`,
  });
  log.push(...rendered.log);

  let pngPath = rendered.png;
  let htmlPath = rendered.html;
  if (pngPath) {
    const dest = join(workDir, `${opts.format}.png`);
    copyFileSync(pngPath, dest);
    pngPath = dest;
  }

  let mp4Path: string | undefined;
  if (pngPath) {
    const mp4 = join(workDir, `${opts.format}.mp4`);
    if (await mockupToMp4(pngPath, mp4, `vf-${opts.format}`)) {
      mp4Path = mp4;
      log.push(`ffmpeg still→mp4: ${mp4}`);
    }
  }

  // HyperFrames composition that features the mockup as a phone-ad beat
  let hfDir: string | undefined;
  try {
    const title =
      opts.format === "imessage"
        ? "Magmos in the DMs"
        : opts.format === "chatgpt"
          ? "Ask ChatGPT → Magmos"
          : "Notes: Why Magmos";
    const body = `${MAGMOS_BRAND.name} · ${opts.format} format · composable yield-dollar on Sui`;
    const hf = scaffoldSimplePrompt(title, body);
    hfDir = hf.projectDir;
    if (pngPath && existsSync(pngPath)) {
      copyFileSync(pngPath, join(hf.projectDir, "hero.png"));
      // Enrich index.html with hero image if scaffold is simple
      const idx = join(hf.projectDir, "index.html");
      if (existsSync(idx)) {
        let html = readFileSync(idx, "utf8");
        if (!html.includes("hero.png")) {
          html = html.replace(
            "</div>\n</body>",
            `<img class="clip" data-start="0.5" data-duration="5" data-track-index="4" src="hero.png" style="position:absolute;left:50%;top:52%;transform:translate(-50%,-50%);width:42%;border-radius:28px;box-shadow:0 20px 60px rgba(0,0,0,.5);" />\n</div>\n</body>`,
          );
          writeFileSync(idx, html);
        }
      }
    }
    try {
      // Default: scaffold only (HF render is slow). Set HF_RENDER=1 to npx hyperframes render.
      if (env("HF_RENDER", "0") === "1") {
        const renderedHf = await renderHyperframes(hf.projectDir);
        if (renderedHf.outputPath && existsSync(renderedHf.outputPath)) {
          const dest = join(workDir, `${opts.format}-hf.mp4`);
          copyFileSync(renderedHf.outputPath, dest);
          mp4Path = mp4Path ?? dest;
          log.push(`HyperFrames render: ${dest}`);
        } else {
          log.push(`HyperFrames scaffolded (render failed): ${hf.projectDir}`);
        }
      } else {
        log.push(`HyperFrames scaffolded (set HF_RENDER=1 to render): ${hf.projectDir}`);
      }
    } catch (e) {
      log.push(`HF: ${e instanceof Error ? e.message : e}`);
    }
  } catch (e) {
    log.push(`HF scaffold: ${e instanceof Error ? e.message : e}`);
  }

  writeFileSync(
    join(workDir, "FORMAT.md"),
    [
      `# ${opts.format}`,
      `Skill: ${skillDir}`,
      `Thread: ${threadPath}`,
      pngPath ? `PNG: ${pngPath}` : "PNG: (missing)",
      mp4Path ? `MP4: ${mp4Path}` : "MP4: (missing)",
      hfDir ? `HF: ${hfDir}` : "",
      "",
      ...log.map((l) => `- ${l}`),
    ].join("\n"),
  );

  return {
    format: opts.format,
    skillDir,
    threadPath,
    pngPath,
    htmlPath,
    mp4Path,
    hfDir,
    log,
  };
}

/** Run all three formats into one pack folder. */
export async function runAllVideoFormats(opts: {
  projectId: string;
  workDir?: string;
}): Promise<{ dir: string; results: VideoFormatResult[] }> {
  assertDataDir();
  const dir = opts.workDir ?? join(DATA_DIR, "exports", "video-formats", newId("vpack"));
  mkdirSync(dir, { recursive: true });
  const formats: VideoFormatId[] = ["imessage", "chatgpt", "apple-notes"];
  const results: VideoFormatResult[] = [];
  for (const format of formats) {
    const r = await runVideoFormat({
      format,
      projectId: opts.projectId,
      workDir: join(dir, format),
    });
    results.push(r);
  }

  writeFileSync(
    join(dir, "VIDEO-FORMATS.md"),
    [
      `# Goose video formats + HyperFrames`,
      `Project: ${opts.projectId}`,
      "",
      ...results.map(
        (r) =>
          `## ${r.format}\n- png: ${r.pngPath ?? "—"}\n- mp4: ${r.mp4Path ?? "—"}\n- hf: ${r.hfDir ?? "—"}\n- ${r.log.slice(-2).join("; ")}`,
      ),
    ].join("\n"),
  );

  learn({
    projectId: opts.projectId,
    feature: "grow",
    outcome: results.some((r) => r.pngPath) ? "success" : "partial",
    summary: `video formats: ${results.filter((r) => r.pngPath).length}/3 mockups`,
    lessons: [
      "EXECUTE create-imessage/chatgpt/apple-notes-mockup — not formats.json text only",
      "HyperFrames scaffolds each format; ffmpeg still→mp4 when HF render unavailable",
      "Magmos threads: no APY, composable dollar, waitlist URL",
    ],
  });

  return { dir, results };
}
