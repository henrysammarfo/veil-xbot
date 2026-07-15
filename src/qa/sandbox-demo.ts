/**
 * Full automated sandbox — mint on-chain + browser capture + demo assets.
 */
import {
  writeFileSync,
  mkdirSync,
  existsSync,
  readFileSync,
} from "node:fs";
import { join } from "node:path";
import { env, DATA_DIR, assertDataDir } from "../config.js";
import { getProject, isWeb3Project } from "../projects/registry.js";
import { formatMintResult, type MintDemoResult } from "./sandbox-mint.js";
import { runChainDemo, chainToMintShape, formatChainDemo } from "./sandbox-chain.js";
import { captureDemoVideo } from "./demo-capture.js";
import { getProjectChain, getWalletMode } from "../projects/chain.js";
import { runSandbox, type SandboxReport } from "./sandbox.js";
import { scaffoldSimplePrompt } from "../integrations/hyperframes.js";
import { newId } from "../store.js";
import {
  defaultLaunchBrief,
  defaultVeilLaunchBrief,
  formatEddyLaunchBrief,
} from "../studio/eddy-launch.js";
import { writeSortedLaunch } from "../studio/sort-launch.js";
import { autoEdit } from "../edit/pipeline.js";
import { styleForBrand, type EditStyleId } from "../edit/styles.js";

export interface FullDemoReport {
  id: string;
  projectId: string;
  at: number;
  sandbox: SandboxReport;
  mint: MintDemoResult;
  chain?: string;
  walletMode?: string;
  fundingNote?: string;
  videoPath?: string;
  editedVideoPath?: string;
  editStatus?: "done" | "failed" | "skipped";
  voiceoverScript?: string;
  capturePaths: string[];
  hyperframesDir?: string;
}

export async function runFullSandboxDemo(projectId: string): Promise<FullDemoReport> {
  assertDataDir();
  const project = getProject(projectId);
  const id = newId("demo");

  // 1) On-chain demo — Sui / Stellar / EVM / web2
  const chainDemo = await runChainDemo(projectId);
  const mint = chainToMintShape(chainDemo);
  const chain = getProjectChain(project);
  const walletMode = getWalletMode(project);

  if (isWeb3Project(projectId)) {
    console.log(formatChainDemo(chainDemo));
    if (chainDemo.fundingNote) console.log(chainDemo.fundingNote);
  } else {
    console.log(`# Demo — ${project.name} (web2 — no on-chain tx)`);
  }

  // 2) Premium browser capture — retina, proof-first, optional MetaMask
  const capDir = join(DATA_DIR, "sandbox", id);
  const exportDir = join(DATA_DIR, "exports");
  if (!existsSync(exportDir)) mkdirSync(exportDir, { recursive: true });
  const exportVideo = join(exportDir, `${id}-demo.webm`);

  const capture = await captureDemoVideo({
    project,
    capDir,
    exportVideo,
    explorerTx: chainDemo.explorerTx ?? chainDemo.explorerMint,
  });
  const capturePaths = capture.capturePaths;
  let videoPath = capture.videoPath;
  capture.log.forEach((l) => console.log(`  capture: ${l}`));

  // 3) HyperFrames scaffold — Eddy hook-first (outcome, not logo)
  const launchBrief = isWeb3Project(projectId)
    ? defaultVeilLaunchBrief(mint.mintDigest)
    : defaultLaunchBrief({
        outcomeLine: project.tagline,
        proofShots: [project.ugcAngle],
        ctaLine: `Try it — ${project.primaryUrl}`,
      });
  const hf = scaffoldSimplePrompt(
    launchBrief.outcomeLine.slice(0, 48),
    mint.mintDigest
      ? `LIVE PROOF · ${mint.mintDigest.slice(0, 10)}…`
      : "Stealth execution on Sui testnet",
  );
  writeFileSync(
    join(DATA_DIR, "ops", "LAUNCH-VIDEO-BRIEF.md"),
    formatEddyLaunchBrief(launchBrief),
  );

  // 3b) Venice AI — rank hooks + 30s script from live proof
  let sortedLaunch: Awaited<ReturnType<typeof writeSortedLaunch>> | undefined;
  try {
    sortedLaunch = await writeSortedLaunch(mint, project.name, projectId);
    console.log("\n--- Launch sorted (top hook) ---");
    console.log(sortedLaunch.rankedHooks[0]?.text ?? launchBrief.outcomeLine);
  } catch (e) {
    console.warn("Launch sort:", e instanceof Error ? e.message : e);
  }

  // 4) Standard sandbox QA pass
  const sandbox = await runSandbox(projectId);

  // 5) Editor v2 — Venice b-roll + voiceover + zoom/captions/SFX → judge-ready MP4
  let editedVideoPath: string | undefined;
  let editStatus: FullDemoReport["editStatus"] = videoPath ? undefined : "skipped";
  let voiceoverScript: string | undefined;
  if (videoPath && existsSync(videoPath)) {
    try {
      console.log("\n--- Editor v2 (Venice b-roll + voiceover) ---");
      const editStyle = styleForBrand(projectId).id as EditStyleId;
      const hfMp4 = join(hf.projectDir, "output.mp4");
      const editJob = await autoEdit(videoPath, projectId, editStyle, {
        hyperframesMp4: existsSync(hfMp4) ? hfMp4 : undefined,
        veniceBroll: env("DEMO_VENICE_BROLL", "1") !== "0",
        veniceTier: env("DEMO_VENICE_TIER", "standard"),
        veniceVideoModel: env("DEMO_VENICE_VIDEO_MODEL") || undefined,
        veniceForce: env("DEMO_VENICE_FORCE", "0") === "1",
        voiceover: env("DEMO_VOICEOVER", "1") !== "0",
        voiceoverForce: env("DEMO_VENICE_FORCE", "0") === "1",
        launchBrief: sortedLaunch,
        projectId,
      });
      editStatus = editJob.status;
      voiceoverScript = editJob.voiceoverScript;
      if (editJob.status === "done") {
        editedVideoPath = editJob.outputPath;
        console.log(`Judge-ready MP4: ${editJob.outputPath}`);
      } else {
        console.warn("Editor v2 failed — see data/exports for logs");
      }
    } catch (e) {
      editStatus = "failed";
      console.warn("Editor v2:", e instanceof Error ? e.message : e);
    }
  }

  const report: FullDemoReport = {
    id,
    projectId,
    at: Date.now(),
    sandbox,
    mint,
    chain,
    walletMode,
    fundingNote: chainDemo.fundingNote,
    videoPath,
    editedVideoPath,
    editStatus,
    voiceoverScript,
    capturePaths,
    hyperframesDir: hf.projectDir,
  };

  writeFileSync(join(DATA_DIR, "sandbox", "latest-demo.json"), JSON.stringify(report, null, 2));
  writeFileSync(join(DATA_DIR, "ops", "DEMO-RESULT.md"), formatFullDemo(report));
  return report;
}

export function formatFullDemo(r: FullDemoReport): string {
  const lines = [
    `# Automated demo — ${r.projectId}`,
    `_${new Date(r.at).toISOString()}_`,
    "",
    formatMintResult(r.mint),
    "",
    `Sandbox ready: ${r.sandbox.readyForDemo ? "YES" : "NO"}`,
    "",
    "## Captures",
    ...r.capturePaths.map((p) => `- ${p}`),
  ];
  if (r.videoPath) lines.push(`- Raw capture: ${r.videoPath}`);
  if (r.editedVideoPath) lines.push(`- **Judge-ready MP4: ${r.editedVideoPath}**`);
  else if (r.editStatus === "failed") lines.push("- Editor v2: failed (check ffmpeg + VENICE_API_KEY + OPENAI_API_KEY)");
  else if (r.editStatus === "skipped") lines.push("- Editor v2: skipped (no capture)");
  if (r.chain && r.chain !== "none") {
    lines.push(`- Chain: ${r.chain} (${r.walletMode ?? "?"})`);
    if (r.mint.wallet) lines.push(`- Sandbox wallet: ${r.mint.wallet}`);
    if (r.fundingNote) lines.push(`- Funding: ${r.fundingNote}`);
  }
  if (r.voiceoverScript) lines.push("", "## Voiceover script", r.voiceoverScript);
  if (r.hyperframesDir) lines.push(`- HyperFrames: ${r.hyperframesDir}`);
  lines.push(`- Launch brief: ${join(DATA_DIR, "ops", "LAUNCH-VIDEO-BRIEF.md")}`);
  lines.push(`- Sorted launch (Venice/router): ${join(DATA_DIR, "ops", "LAUNCH-SORTED.md")}`);
  const brief = defaultVeilLaunchBrief(r.mint.mintDigest);
  lines.push("", "## First 3 seconds (on-screen text)", brief.outcomeLine);
  lines.push("", "## Post copy (manual X — do not auto-post)", "");
  if (r.mint.mintDigest) {
    lines.push(
      `Live testnet BULL mint from sandbox wallet. Real tx, real Predict fill.`,
      ``,
      `${r.mint.explorerMint ?? ""}`,
      ``,
      `@SuiNetwork @DeepBookonSui #SuiOverflow #StealthTrading`,
    );
  }
  return lines.join("\n");
}

export function loadLatestDemo(): FullDemoReport | null {
  const p = join(DATA_DIR, "sandbox", "latest-demo.json");
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf8")) as FullDemoReport;
}
