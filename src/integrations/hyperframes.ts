/**
 * HyperFrames — Apache 2.0 OSS: https://github.com/heygen-com/hyperframes
 * CLI: npx hyperframes init | preview | render
 * Skills: npx skills add heygen-com/hyperframes
 */
import { execFile } from "node:child_process";
import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { DATA_DIR, assertDataDir } from "../config.js";
import { newId } from "../store.js";
import type { TrailerProduction } from "../studio/trailer.js";

const exec = promisify(execFile);

export const HYPERFRAMES_REPO = "https://github.com/heygen-com/hyperframes";
export const HYPERFRAMES_SKILL_CMD = "npx skills add heygen-com/hyperframes";

export interface HyperframesJob {
  id: string;
  projectDir: string;
  outputPath?: string;
  status: "scaffolded" | "rendered" | "failed";
  log: string;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Build HTML composition from trailer brief — deterministic MP4 via hyperframes render */
export function scaffoldFromTrailer(trailer: TrailerProduction): HyperframesJob {
  assertDataDir();
  const id = newId("hf");
  const projectDir = join(DATA_DIR, "exports", `hyperframes-${id}`);
  if (!existsSync(projectDir)) mkdirSync(projectDir, { recursive: true });

  let t = 0;
  const clips: string[] = [];
  for (const act of trailer.acts) {
    const title = escapeHtml(act.name);
    clips.push(`
  <h2 class="clip" data-start="${t}" data-duration="2" data-track-index="1"
      style="position:absolute;left:50%;top:40%;transform:translate(-50%,-50%);font:700 72px/1.1 Inter,sans-serif;color:#fff;">
    ${title}
  </h2>`);
    let shotT = t + 0.5;
    for (const shot of act.shots.slice(0, 4)) {
      const dur = Math.max(2, Math.floor(act.durationSec / Math.max(act.shots.length, 1)));
      clips.push(`
  <p class="clip" data-start="${shotT}" data-duration="${dur}" data-track-index="2"
     style="position:absolute;left:8%;right:8%;bottom:12%;font:500 36px/1.3 Inter,sans-serif;color:#e8e8e8;">
    ${escapeHtml(shot)}
  </p>`);
      shotT += dur;
    }
    t += act.durationSec;
  }

  const endT = t;
  const endDur = trailer.ending.fadeSec || 2.5;
  clips.push(`
  <div class="clip" data-start="${endT}" data-duration="${endDur}" data-track-index="3"
       style="position:absolute;inset:0;background:#000;opacity:0.92;display:flex;align-items:center;justify-content:center;">
    <span style="font:600 48px Instrument Serif,serif;color:#fff;">${escapeHtml(trailer.ending.text)}</span>
  </div>`);

  const totalSec = endT + endDur;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(trailer.title)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #0a0a0a; }
  </style>
</head>
<body>
<div id="stage" data-composition-id="trailer" data-start="0" data-width="1920" data-height="1080"
     data-duration="${totalSec}" style="position:relative;width:1920px;height:1080px;background:linear-gradient(160deg,#0a0a0a,#1a1020);overflow:hidden;">
  <div class="clip" data-start="0" data-duration="${totalSec}" data-track-index="0"
       style="position:absolute;inset:0;background:radial-gradient(circle at 30% 20%,#2a1a3a55,transparent 55%);"></div>
${clips.join("\n")}
  <script src="https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js"></script>
  <script>
    const tl = gsap.timeline({ paused: true });
    document.querySelectorAll(".clip").forEach((el, i) => {
      const start = parseFloat(el.dataset.start || "0");
      tl.from(el, { opacity: 0, duration: 0.6, ease: "power2.out" }, start + 0.1);
    });
    window.__timelines = window.__timelines || {};
    window.__timelines.trailer = tl;
  </script>
</div>
</body>
</html>`;

  writeFileSync(join(projectDir, "index.html"), html, "utf8");
  writeFileSync(
    join(projectDir, "README.txt"),
    [
      "HyperFrames project — veil-xbot scaffold",
      "",
      "Install skill for Cursor agents:",
      `  ${HYPERFRAMES_SKILL_CMD}`,
      "",
      "Preview:",
      "  npx hyperframes preview",
      "",
      "Render MP4 (Node 22+, FFmpeg):",
      "  npx hyperframes render",
      "",
      `Source: ${HYPERFRAMES_REPO}`,
    ].join("\n"),
    "utf8",
  );

  return {
    id,
    projectDir,
    status: "scaffolded",
    log: `Scaffolded ${projectDir} — run: cd "${projectDir}" && npx hyperframes render`,
  };
}

/** Run hyperframes render in project dir (requires Node 22+ and FFmpeg on PATH) */
export async function renderHyperframes(projectDir: string): Promise<HyperframesJob> {
  const id = projectDir.split(/[/\\]/).pop()?.replace("hyperframes-", "") ?? newId("hf");
  try {
    const { stdout, stderr } = await exec("npx", ["hyperframes", "render"], {
      cwd: projectDir,
      timeout: 600_000,
      shell: process.platform === "win32",
    });
    const log = [stdout, stderr].filter(Boolean).join("\n");
    const outputPath = join(projectDir, "output.mp4");
    return {
      id,
      projectDir,
      outputPath: existsSync(outputPath) ? outputPath : undefined,
      status: existsSync(outputPath) ? "rendered" : "scaffolded",
      log: log || "render complete",
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { id, projectDir, status: "failed", log: msg };
  }
}

/** Scaffold + optional render from prompt text (title slide) */
export function scaffoldSimplePrompt(title: string, body: string): HyperframesJob {
  const fake: TrailerProduction = {
    id: newId("hf-prompt"),
    projectId: "veil",
    phase: "teaser",
    title,
    logline: body,
    acts: [{ name: title, durationSec: 8, shots: [body] }],
    ending: { type: "fade-black", text: title, fadeSec: 2 },
    cast: { role: "text", look: "kinetic", provider: "hyperframes" },
    music: "",
    referenceVibe: "",
    paidSlots: [],
    createdAt: Date.now(),
  };
  return scaffoldFromTrailer(fake);
}
