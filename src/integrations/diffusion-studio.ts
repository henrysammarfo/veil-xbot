/**
 * Diffusion Studio editor — agent-native video composer (TSX → dapi mount → MP4).
 * https://github.com/diffusionstudio/editor  (MPL-2.0)
 *
 * "FFmpeg for agents": kiln writes SolidJS compositions; when `dapi` is on PATH,
 * we open/mount/render. Without dapi the composition is still production-ready
 * for Cursor + `npx skills add diffusionstudio/skills` → `/editor`.
 */
import { execFile, execSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, basename, relative } from "node:path";
import { promisify } from "node:util";
import { DATA_DIR, assertDataDir, env, XBOT_ROOT } from "../config.js";
import { newId } from "../store.js";
import { learn } from "../brain/self-learn.js";
import { remember } from "../brain/memory.js";
import { craftVideoPrompt } from "../studio/cinematic-craft.js";
import { MAGMOS_BRAND } from "../studio/magmos-brand.js";

const execFileAsync = promisify(execFile);

export const DIFFUSION_STUDIO_REPO = "https://github.com/diffusionstudio/editor";
export const DIFFUSION_STUDIO_SKILLS = "npx skills add diffusionstudio/skills -g";
export const DAPI_SKILL_HINT = "/editor …  (Diffusion Studio skill)";

export interface DiffusionStudioJob {
  id: string;
  projectId: string;
  compositionPath: string;
  runbookPath: string;
  dir: string;
  dapiAvailable: boolean;
  status: "scaffolded" | "mounted" | "rendered" | "partial" | "failed";
  outputPath?: string;
  log: string[];
}

/** True when dapi CLI is on PATH (local install of diffusionstudio/editor) */
export function hasDapi(): boolean {
  try {
    execSync("dapi --help", { stdio: "ignore", timeout: 5000 });
    return true;
  } catch {
    try {
      execSync("npx --yes dapi --help", { stdio: "ignore", timeout: 15000 });
      return true;
    } catch {
      return false;
    }
  }
}

function dapiBin(): string {
  try {
    execSync("dapi --help", { stdio: "ignore", timeout: 4000 });
    return "dapi";
  } catch {
    return "npx";
  }
}

async function runDapi(args: string[], cwd?: string): Promise<{ ok: boolean; out: string }> {
  const bin = dapiBin();
  const full = bin === "dapi" ? args : ["--yes", "dapi", ...args];
  try {
    const { stdout, stderr } = await execFileAsync(bin, full, {
      cwd: cwd || process.cwd(),
      timeout: 180_000,
      maxBuffer: 16 * 1024 * 1024,
      windowsHide: true,
    });
    return { ok: true, out: `${stdout ?? ""}${stderr ?? ""}`.trim() };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message?: string };
    return {
      ok: false,
      out: `${err.stdout ?? ""}${err.stderr ?? err.message ?? e}`.trim().slice(0, 2000),
    };
  }
}

function escJs(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$/g, "\\$").replace(/"/g, '\\"');
}

/**
 * Magmos / product promo as Diffusion Studio SolidJS composition.
 * Uses MCSLA craft for generative plate when DIFFUSION_GEN=1 / default on.
 */
export function buildPromoComposition(opts: {
  projectId?: string;
  productName?: string;
  promise?: string;
  cta?: string;
  siteUrl?: string;
  /** Local footage path to embed instead of generate.video (optional) */
  footagePath?: string;
  aspect?: "9:16" | "16:9";
  durationSec?: number;
}): string {
  const name = opts.productName ?? "Magmos";
  const promise =
    opts.promise ?? "Still $1. Can earn while you hold it.";
  const cta = opts.cta ?? "Join the waitlist";
  const url = opts.siteUrl ?? "magmoslabs.vercel.app";
  const w = opts.aspect === "16:9" ? 1920 : 1080;
  const h = opts.aspect === "16:9" ? 1080 : 1920;
  const dur = opts.durationSec ?? 12;
  const craft = craftVideoPrompt({
    job: "thriller",
    productName: name,
    productPromise: promise,
    seconds: Math.min(6, dur),
    aspect: opts.aspect ?? "9:16",
  });
  const mustard = MAGMOS_BRAND.mustard;
  const hasFootage = Boolean(opts.footagePath && existsSync(opts.footagePath));
  const genOn = env("DIFFUSION_GEN", "1") === "1" && !hasFootage;

  const titles = [
    { text: name, start: 0, end: 2.2 },
    { text: promise.slice(0, 48), start: 2.2, end: 6.5 },
    { text: cta, start: 6.5, end: Math.min(dur, 10) },
    { text: url, start: Math.min(dur - 1.8, 10), end: dur },
  ];

  const mediaBlock = hasFootage
    ? `<video
        src=${JSON.stringify(opts.footagePath)}
        width={${w}}
        height={${h}}
        start={0}
        end={${dur}}
      />`
    : genOn
      ? `<>
      <video src={heroMotion} width={${w}} height={${h}} start={0} end={${dur}} />
    </>`
      : `<rect width={${w}} height={${h}} fill="#0A0A0A" />`;

  const genHeader = genOn
    ? `import { generate } from "@diffusionstudio/jsx";

const heroPlate = generate.image({
  prompt: ${JSON.stringify(craft.prompt.slice(0, 500))},
});
const heroMotion = generate.video({
  prompt: ${JSON.stringify(craft.mcsla.action + ". " + craft.mcsla.camera)},
  startFrame: heroPlate,
});
`
    : "";

  return `/**
 * Kiln × Diffusion Studio composition
 * Repo: ${DIFFUSION_STUDIO_REPO}
 * Mount: dapi mount ${basename("promo.tsx")}
 * Render: dapi node render -o out.mp4
 * Craft: MCSLA (Higgsfield community) · brand ${name}
 * Generated by kiln Growth OS — editable nodes after mount
 */
import { For } from "solid-js";
${genHeader}
const TITLES = ${JSON.stringify(titles, null, 2)};

export default function KilnPromo() {
  return (
    <rect
      scene="kiln-promo"
      name="${escJs(name)} promo"
      width={${w}}
      height={${h}}
      fill="#0A0A0A"
    >
      ${mediaBlock}
      <sequence>
        <For each={TITLES}>
          {(t) => (
            <text
              textAlign="center"
              textBaseline="middle"
              fontSize={t.text.length > 28 ? 42 : 64}
              fontWeight={700}
              width={${w}}
              height={${h}}
              fill="#FFFFFF"
              start={t.start}
              end={t.end}
            >
              {t.text}
            </text>
          )}
        </For>
      </sequence>
      {/* accent bar */}
      <rect
        x={${Math.round(w * 0.1)}}
        y={${Math.round(h * 0.72)}}
        width={${Math.round(w * 0.8)}}
        height={6}
        fill="${mustard}"
        start={2}
        end={${dur}}
      />
    </rect>
  );
}
`;
}

/** Scaffold composition + runbook; optionally run dapi if available */
export async function runDiffusionStudio(opts: {
  projectId?: string;
  productName?: string;
  promise?: string;
  siteUrl?: string;
  footagePath?: string;
  aspect?: "9:16" | "16:9";
  /** Attempt dapi open/mount/render when CLI present */
  execute?: boolean;
  outName?: string;
}): Promise<DiffusionStudioJob> {
  assertDataDir();
  const id = newId("dse");
  const projectId = opts.projectId ?? "magmos";
  const dir = join(DATA_DIR, "studio", "diffusion-studio", id);
  mkdirSync(dir, { recursive: true });

  const log: string[] = [];
  const dapiAvailable = hasDapi();
  log.push(`dapi CLI: ${dapiAvailable ? "found" : "not on PATH — composition + runbook only"}`);

  const compositionPath = join(dir, opts.outName ?? "promo.tsx");
  const tsx = buildPromoComposition({
    projectId,
    productName: opts.productName,
    promise: opts.promise,
    siteUrl: opts.siteUrl,
    footagePath: opts.footagePath,
    aspect: opts.aspect ?? "9:16",
  });
  writeFileSync(compositionPath, tsx, "utf8");
  log.push(`Composition: ${compositionPath}`);

  const runbook = [
    `# Diffusion Studio — kiln wire`,
    ``,
    `Source: ${DIFFUSION_STUDIO_REPO}`,
    `Skills: \`${DIFFUSION_STUDIO_SKILLS}\``,
    `Composition: \`${compositionPath}\``,
    ``,
    `## One-time setup`,
    "```bash",
    `git clone ${DIFFUSION_STUDIO_REPO}  # optional full app`,
    DIFFUSION_STUDIO_SKILLS,
    `# Put dapi on PATH (see repo README symlink:create)`,
    "```",
    ``,
    `## Agent edit loop`,
    "```bash",
    `dapi open`,
    `dapi mount ${compositionPath}`,
    `dapi media probe ${opts.footagePath ?? "clip.mp4"}   # when editing raw footage`,
    `dapi media filmstrip ${opts.footagePath ?? "clip.mp4"}`,
    `dapi node render -o ${join(dir, "out.mp4")}`,
    "```",
    ``,
    `Or in Cursor: ${DAPI_SKILL_HINT}`,
    `  "edit the composition in ${relative(XBOT_ROOT, compositionPath)} into a 15s social hero"`,
    ``,
    `## Kiln integration`,
    `- Pack step when \`DIFFUSION_STUDIO=1\` (default on)`,
    `- CLI: \`npm run dse magmos\` or \`npm run diffusion\` `,
    `- Cascades with freecut edit-auto + HyperFrames + Venice T2V`,
  ].join("\n");
  const runbookPath = join(dir, "RUNBOOK.md");
  writeFileSync(runbookPath, runbook);
  writeFileSync(
    join(dir, "meta.json"),
    JSON.stringify(
      {
        id,
        projectId,
        repo: DIFFUSION_STUDIO_REPO,
        compositionPath,
        dapiAvailable,
        at: Date.now(),
      },
      null,
      2,
    ),
  );

  let status: DiffusionStudioJob["status"] = "scaffolded";
  let outputPath: string | undefined;

  const wantExec = opts.execute ?? env("DIFFUSION_STUDIO_EXECUTE", "0") === "1";
  if (wantExec && dapiAvailable) {
    log.push("[dapi] open (headless if -b supported)");
    const open = await runDapi(["open", "-b"], dir).catch(() => runDapi(["open"], dir));
    log.push(open.out.slice(0, 300) || (open.ok ? "open ok" : "open skip"));
    log.push(`[dapi] mount ${basename(compositionPath)}`);
    const mount = await runDapi(["mount", compositionPath], dir);
    log.push(mount.out.slice(0, 400));
    if (mount.ok) status = "mounted";
    const outMp4 = join(dir, "out.mp4");
    log.push(`[dapi] node render -o out.mp4`);
    const render = await runDapi(["node", "render", "-o", outMp4], dir);
    log.push(render.out.slice(0, 400));
    if (render.ok && existsSync(outMp4)) {
      status = "rendered";
      outputPath = outMp4;
    } else {
      status = status === "mounted" ? "partial" : "failed";
    }
  } else if (!dapiAvailable) {
    log.push("Install dapi to auto-render; composition is ready for /editor skill.");
  }

  remember({
    kind: "oss",
    title: "Diffusion Studio editor (dapi)",
    importance: 5,
    source: "diffusionstudio/editor",
    url: DIFFUSION_STUDIO_REPO,
    tags: ["editor", "dapi", "composition", "video", "agent"],
    body: `Agent TSX video editor. kiln writes compositions to data/studio/diffusion-studio. Skills: ${DIFFUSION_STUDIO_SKILLS}. Last job ${id} status=${status}`,
  });

  learn({
    projectId,
    feature: "edit-auto",
    outcome: status === "rendered" ? "success" : status === "failed" ? "fail" : "partial",
    summary: `diffusion-studio ${status} ${compositionPath}`,
    lessons: [
      "Diffusion Studio = agent TSX compositions + dapi mount/render (FFmpeg for agents)",
      "Always ship promo.tsx + RUNBOOK even when dapi not installed",
      "Pair with MCSLA craft for generate.image/video plates",
    ],
    meta: { id, dapiAvailable, compositionPath },
  });

  return {
    id,
    projectId,
    compositionPath,
    runbookPath,
    dir,
    dapiAvailable,
    status,
    outputPath,
    log,
  };
}

/** Footage polish brief — dapi media inspect chain for an agent */
export function buildFootageEditBrief(opts: {
  footagePath: string;
  projectId?: string;
  goal?: string;
}): string {
  const goal =
    opts.goal ??
    "15s vertical social cut, readable captions, strong first 1.5s hook, Magmos plain voice";
  return [
    `# Diffusion Studio footage polish`,
    ``,
    `Footage: \`${opts.footagePath}\``,
    `Goal: ${goal}`,
    ``,
    "```bash",
    `dapi open ${opts.footagePath}`,
    `dapi media probe ${opts.footagePath}`,
    `dapi media filmstrip ${opts.footagePath}`,
    `dapi media waveform ${opts.footagePath}`,
    `dapi media transcribe ${opts.footagePath}`,
    `# then: agent patches timeline / dapi node render -o polished.mp4`,
    "```",
    ``,
    `Cursor: ${DAPI_SKILL_HINT}`,
    `  turn this footage into a polished 15s waitlist UGC — no forge jargon`,
  ].join("\n");
}

export async function polishFootageWithDiffusionStudio(opts: {
  footagePath: string;
  projectId?: string;
  goal?: string;
}): Promise<DiffusionStudioJob> {
  if (!existsSync(opts.footagePath)) {
    throw new Error(`Footage not found: ${opts.footagePath}`);
  }
  const job = await runDiffusionStudio({
    projectId: opts.projectId,
    footagePath: opts.footagePath,
    execute: env("DIFFUSION_STUDIO_EXECUTE", "0") === "1",
  });
  const brief = buildFootageEditBrief(opts);
  writeFileSync(join(job.dir, "FOOTAGE-EDIT.md"), brief);
  job.log.push(`Footage brief: ${join(job.dir, "FOOTAGE-EDIT.md")}`);
  return job;
}

export function formatDiffusionStudio(j: DiffusionStudioJob): string {
  return [
    `# Diffusion Studio — ${j.status}`,
    `dapi: ${j.dapiAvailable}`,
    `Composition: ${j.compositionPath}`,
    `Runbook: ${j.runbookPath}`,
    j.outputPath ? `MP4: ${j.outputPath}` : "",
    "",
    ...j.log,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Soft install helper text — does not force clone */
export function diffusionStudioInstallNotes(): string {
  return [
    `Clone: git clone ${DIFFUSION_STUDIO_REPO}`,
    `Skills: ${DIFFUSION_STUDIO_SKILLS}`,
    `CLI docs: ${DIFFUSION_STUDIO_REPO}#cli-at-a-glance`,
    `Kiln: npm run dse  |  DIFFUSION_STUDIO=1 npm run pack`,
  ].join("\n");
}
