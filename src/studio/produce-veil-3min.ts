import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { DATA_DIR, assertDataDir, env } from "../config.js";
import { newId } from "../store.js";
import { runChainDemo, chainToMintShape, formatChainDemo } from "../qa/sandbox-chain.js";
import { fundSandboxFromVeil } from "../qa/fund-sandbox.js";
import { captureVeil3Min } from "../qa/veil-3min-capture.js";
import {
  veil3MinBeats,
  veil3MinNarration,
  VEIL_3MIN_TARGET_SEC,
} from "./veil-3min-script.js";
import { writeSortedLaunch } from "./sort-launch.js";
import { defaultVeilLaunchBrief, formatEddyLaunchBrief } from "./eddy-launch.js";
import type { CaptionBeat, CutPoint, EditManifest, BrollSlot, SfxCue } from "../edit/manifest.js";
import { buildManifestFromFootage, saveManifest } from "../edit/manifest.js";
import type { VeilDemoBeat } from "./veil-3min-script.js";
import { analyzeFootage } from "../edit/analyze-footage.js";
import { renderEditorV2 } from "../edit/render.js";
import { ensureWorkDir, hasFfmpeg, probeDuration, runFfmpeg, normalizeToMp4 } from "../edit/ffmpeg-util.js";
import { generateSegmentedVoiceover } from "../edit/voiceover.js";
import {
  applySmartPlanToManifest,
  buildSmartEditPlan,
  cutCaptureRanges,
  finalizeBeatWindows,
  remapBeatsAfterCut,
} from "../edit/smart-editor.js";
import { loadCaptureEvents } from "../qa/capture-events.js";
import { checkVeilHealth, formatVeilHealth } from "../qa/veil-health.js";
import { isLiveOnly, retryLive } from "../qa/live-only.js";
import { prepareVeilLiveDemo } from "../qa/veil-demo-prep.js";
import { loadLatestEditRecipe } from "../discover/auto-learn.js";
import { hasVenice } from "../integrations/venice.js";

export interface Veil3MinReport {
  id: string;
  at: number;
  rawVideoPath?: string;
  outputPath?: string;
  mintDigest?: string;
  explorerUrl?: string;
  status: "done" | "failed" | "partial";
  voiceoverPath?: string;
  log: string[];
}

/** Beat-synced editor plan — subtle zoom + SFX on VO sections; b-roll only on landing beats. */
function buildJudgeBeatEdits(beats: VeilDemoBeat[], targetSec: number): {
  cuts: CutPoint[];
  sfx: SfxCue[];
  broll: BrollSlot[];
} {
  const cuts: CutPoint[] = [
    { atSec: 0, type: "zoom-punch", scale: 1.05, note: "hook open" },
  ];
  const sfx: SfxCue[] = [
    { atSec: 0, sound: "impact", reason: "hook hit" },
    { atSec: 1.2, sound: "whoosh", reason: "into demo" },
  ];
  const broll: BrollSlot[] = [];

  for (const beat of beats) {
    if (beat.startSec <= 0 || beat.startSec >= targetSec - 10) continue;

    cuts.push({
      atSec: beat.startSec,
      type: "zoom-punch",
      scale: beat.startSec < 32 ? 1.04 : 1.03,
      note: beat.onScreen,
    });

    sfx.push({
      atSec: beat.startSec + 0.15,
      sound: beat.startSec === 32 ? "whoosh" : beat.startSec >= 118 ? "rise" : "ding",
      reason: beat.visual,
    });

    // Cinematic b-roll only on landing/problem — never over dashboard clicks
    if (beat.startSec === 12 && beat.endSec <= 35) {
      broll.push({
        atSec: 18,
        durationSec: 2.5,
        prompt: "dark order book alpha leak trading cinematic abstract horizontal",
        provider: "seedance",
      });
    }
    if (beat.startSec === 118) {
      broll.push({
        atSec: 122,
        durationSec: 3,
        prompt: "TEE secure enclave attestation purple dark cinematic horizontal",
        provider: "seedance",
      });
    }
  }

  sfx.push({ atSec: Math.max(0, targetSec - 2.5), sound: "rise", reason: "cta" });

  return { cuts, sfx, broll };
}

function apply3MinManifest(
  base: EditManifest,
  mintDigest: string | undefined,
  actualDuration: number,
): EditManifest {
  const target = Math.min(VEIL_3MIN_TARGET_SEC, Math.max(actualDuration, 60));
  const beats = veil3MinBeats(mintDigest);
  const { cuts, sfx, broll } = buildJudgeBeatEdits(beats, target);
  const captions: CaptionBeat[] = beats
    .filter((b) => b.startSec < target)
    .map((b) => ({
      start: b.startSec,
      end: Math.min(b.endSec, target),
      text: b.onScreen,
      style: b.startSec < 12 ? "hook" : b.startSec >= target - 15 ? "cta" : "body",
    }));

  return {
    ...base,
    style: "cinematic-broll",
    durationSec: target,
    hookLine: beats[0]?.onScreen ?? base.hookLine,
    captions,
    cuts,
    sfx,
    broll,
    renderNotes: [
      ...base.renderNotes,
      `3-min judge demo — ${target.toFixed(0)}s target`,
      "Beat-synced editor: subtle zoom on VO sections, SFX, selective b-roll",
      "Segmented voiceover sync",
      "Veil wow features: stealth, Kelly, live mint, TEE, DeepBook Predict",
    ],
  };
}

/** Trim to target; never pad with frozen frames (avoids landing-page tail). */
function fitVideoToDuration(input: string, output: string, targetSec: number, allowPad = false): void {
  const dur = probeDuration(input);
  if (Math.abs(dur - targetSec) < 1.5) {
    runFfmpeg(["-y", "-i", input, "-c", "copy", output], "fit-copy");
    return;
  }
  if (dur < targetSec) {
    if (!allowPad) {
      runFfmpeg(["-y", "-i", input, "-c", "copy", output], "fit-no-pad");
      return;
    }
    const pad = targetSec - dur;
    runFfmpeg(
      [
        "-y",
        "-i",
        input,
        "-vf",
        `tpad=stop_mode=clone:stop_duration=${pad.toFixed(2)}`,
        "-c:v",
        "libx264",
        "-preset",
        "fast",
        "-crf",
        "20",
        "-c:a",
        "aac",
        output,
      ],
      "fit-pad",
    );
    return;
  }
  runFfmpeg(
    [
      "-y",
      "-i",
      input,
      "-t",
      String(targetSec),
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-crf",
      "20",
      "-c:a",
      "aac",
      output,
    ],
    "fit-trim",
  );
}

export async function produceVeil3MinDemo(): Promise<Veil3MinReport> {
  assertDataDir();
  const id = newId("veil3");
  const log: string[] = [];
  const exportDir = join(DATA_DIR, "exports");
  if (!existsSync(exportDir)) mkdirSync(exportDir, { recursive: true });

  if (!hasFfmpeg()) {
    return { id, at: Date.now(), status: "failed", log: ["ffmpeg required"] };
  }

  log.push("=== Veil 3-min judge demo (smart capture + smart editor) ===");

  const capDir = join(DATA_DIR, "sandbox", id);
  const rawPath = join(exportDir, `${id}-raw.webm`);
  const reuseId = env("VEIL_REUSE_CAPTURE_ID");
  const skipCapture = env("VEIL_SKIP_CAPTURE") === "1" && reuseId;
  const skipMint = env("VEIL_SKIP_MINT") === "1" || skipCapture;
  const effectiveCapDir = skipCapture ? join(DATA_DIR, "sandbox", reuseId) : capDir;
  const effectiveRaw = skipCapture ? join(exportDir, `${reuseId}-raw.webm`) : rawPath;

  // 0) Health — UI + API must be live (wait/retry in live-only mode)
  console.log("\n[0/5] Veil health check...");
  const demoUrlPref = env("VEIL_DEMO_URL") || "https://veil-reviewer.vercel.app";
  const liveOnly = isLiveOnly();
  const health = liveOnly
    ? await retryLive(
        "Veil health",
        async () => {
          const h = await checkVeilHealth(demoUrlPref);
          if (!h.uiReachable || !h.apiHealthy) {
            throw new Error([...h.blockers, ...h.warnings].join("; ") || "Veil not ready");
          }
          return h;
        },
        { attempts: Number(env("LIVE_HEALTH_RETRIES", "24")), delayMs: Number(env("LIVE_RETRY_DELAY_MS", "15000")) },
      )
    : await checkVeilHealth(demoUrlPref);
  console.log(formatVeilHealth(health));
  log.push(formatVeilHealth(health));
  writeFileSync(join(DATA_DIR, "ops", "VEIL-HEALTH.md"), formatVeilHealth(health));
  if (!health.uiReachable) {
    return { id, at: Date.now(), status: "failed", log: [...log, "Veil UI unreachable"] };
  }
  if (liveOnly && !health.apiHealthy) {
    return { id, at: Date.now(), status: "failed", log: [...log, "API not healthy — live-only, no partial capture"] };
  }
  if (!health.apiHealthy) {
    console.warn("⚠ API not healthy — capture may show sync/fetch errors");
    log.push("WARN: API not healthy");
  }

  // 1) Live mint — retry until real on-chain tx (no VEIL_FALLBACK_TX)
  console.log("\n[1/5] On-chain mint (live-only, no fallback tx)...");
  if (!skipMint) {
    try {
      const r = await fundSandboxFromVeil("veil");
      log.push(`Funded sandbox: ${r.dusdcBalance.toFixed(1)} dUSDC`);
      console.log(`Funded sandbox: ${r.suiBalance.toFixed(4)} SUI · ${r.dusdcBalance.toFixed(1)} dUSDC`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log.push(`Wallet fund skip: ${msg}`);
      console.warn(`Wallet fund skip: ${msg}`);
    }
  }
  const chain = skipMint
    ? await (async () => {
        const { readFileSync, existsSync: ex } = await import("node:fs");
        const p = join(DATA_DIR, "sandbox", "latest-chain-veil.json");
        if (ex(p)) return JSON.parse(readFileSync(p, "utf8"));
        return runChainDemo("veil");
      })()
    : liveOnly
    ? await retryLive(
        "On-chain mint",
        async () => {
          const c = await runChainDemo("veil");
          if (!c.mintDigest && !c.explorerMint) {
            throw new Error(c.error ?? "Mint produced no digest");
          }
          return c;
        },
        { attempts: Number(env("LIVE_MINT_RETRIES", "5")), delayMs: Number(env("LIVE_MINT_DELAY_MS", "20000")) },
      )
    : await runChainDemo("veil");
  const mint = chainToMintShape(chain);
  if (liveOnly && !mint.mintDigest && !mint.explorerMint) {
    return { id, at: Date.now(), status: "failed", log: [...log, "Live mint failed — no fallback tx"] };
  }
  console.log(formatChainDemo(chain));
  log.push(formatChainDemo(chain));

  // 2) Smart capture
  console.log("\n[2/5] Smart capture (load waits + event timeline)...");
  let capture: Awaited<ReturnType<typeof captureVeil3Min>>;
  if (skipCapture) {
    capture = {
      videoPath: exExists(effectiveRaw) ? effectiveRaw : undefined,
      capturePaths: [],
      log: [`Reused capture ${reuseId}`],
      eventsPath: join(effectiveCapDir, "capture-events.json"),
    };
  } else {
    console.log("\n[1.5/5] Preflight — fund manager + skip onboarding tour...");
    await prepareVeilLiveDemo({ targetManagerUsdc: Number(env("VEIL_DEMO_MANAGER_USDC", "55")) });

    const maxCapture = Number(env("LIVE_CAPTURE_RETRIES", "2"));
    let lastCaptureErr: Error | undefined;
    capture = { videoPath: undefined, capturePaths: [], log: [] };
    for (let attempt = 1; attempt <= maxCapture; attempt++) {
      try {
        capture = await captureVeil3Min({ capDir, exportVideo: rawPath });
        lastCaptureErr = undefined;
        break;
      } catch (e) {
        lastCaptureErr = e instanceof Error ? e : new Error(String(e));
        const recoverable = /balance|manager|TWAP|order failed|order not sealed|auth|connect wallet|not on dashboard|Page error/i.test(
          lastCaptureErr.message,
        );
        if (recoverable && attempt < maxCapture) {
          console.log(`\n  ✗ Capture stopped: ${lastCaptureErr.message}`);
          console.log("  → Refunding manager and restarting capture…");
          await prepareVeilLiveDemo({ targetManagerUsdc: Number(env("VEIL_DEMO_MANAGER_USDC", "55")) });
          continue;
        }
        throw lastCaptureErr;
      }
    }
    if (lastCaptureErr) throw lastCaptureErr;
  }
  function exExists(p: string) {
    return existsSync(p);
  }
  log.push(...capture.log);
  if (!capture.videoPath || !existsSync(capture.videoPath)) {
    return {
      id,
      at: Date.now(),
      status: "failed",
      mintDigest: mint.mintDigest,
      explorerUrl: mint.explorerMint,
      log: [...log, "Capture failed — no video"],
    };
  }
  log.push(`Raw capture: ${capture.videoPath} (${probeDuration(capture.videoPath).toFixed(1)}s)`);

  // 3) Launch brief + sort
  writeFileSync(
    join(DATA_DIR, "ops", "VEIL-3MIN-BRIEF.md"),
    [
      formatEddyLaunchBrief(defaultVeilLaunchBrief(mint.mintDigest)),
      "",
      "## 3-min narration",
      veil3MinNarration(mint.mintDigest),
      "",
      "## Beats",
      ...veil3MinBeats(mint.mintDigest).map(
        (b) => `- ${b.startSec}s–${b.endSec}s: ${b.onScreen} — ${b.visual}`,
      ),
    ].join("\n"),
  );

  let sortedLaunch: Awaited<ReturnType<typeof writeSortedLaunch>> | undefined;
  try {
    sortedLaunch = await writeSortedLaunch(mint, "Veil", "veil");
  } catch {
    /* optional */
  }

  // 3) Smart editor brain — sync VO to capture events, cut loading, plan edits
  console.log("\n[3/5] Smart editor (event sync + cut loading + edit plan)...");
  const workDir = ensureWorkDir(DATA_DIR, id);
  const eventLog = loadCaptureEvents(skipCapture ? effectiveCapDir : capDir);
  const scriptBeats = veil3MinBeats(mint.mintDigest);
  const normalized = join(workDir, "normalized.mp4");
  normalizeToMp4(capture.videoPath, normalized);

  let cleaned = normalized;
  let syncedBeats = scriptBeats;
  let smartPlan = null as Awaited<ReturnType<typeof buildSmartEditPlan>> | null;

  if (eventLog) {
    smartPlan = await buildSmartEditPlan({
      scriptBeats,
      eventLog,
      rawVideoPath: normalized,
    });
    const cleanedPath = join(workDir, "cleaned.mp4");
    cutCaptureRanges(normalized, cleanedPath, smartPlan.removeRanges);
    cleaned = cleanedPath;
    syncedBeats = finalizeBeatWindows(
      remapBeatsAfterCut(smartPlan.beats, smartPlan.removeRanges),
      probeDuration(cleaned),
    );
    writeFileSync(join(workDir, "smart-edit-plan.json"), JSON.stringify({ ...smartPlan, beats: syncedBeats }, null, 2));
    log.push(`Smart editor: ${syncedBeats.length} synced beats, ${smartPlan.removeRanges.length} cuts removed`);
  } else if (liveOnly) {
    return {
      id,
      at: Date.now(),
      status: "failed",
      mintDigest: mint.mintDigest,
      explorerUrl: mint.explorerMint,
      rawVideoPath: capture.videoPath,
      log: [...log, "Missing capture-events.json — live-only requires event timeline"],
    };
  } else {
    log.push("WARN: no capture-events.json — using script beats (VO may desync)");
  }

  const cleanedDur = probeDuration(cleaned);
  const targetSec = liveOnly
    ? Math.min(VEIL_3MIN_TARGET_SEC, cleanedDur)
    : VEIL_3MIN_TARGET_SEC;
  const fittedRaw = join(workDir, "fitted-raw.mp4");
  fitVideoToDuration(cleaned, fittedRaw, targetSec, !liveOnly);
  const finalDur = probeDuration(fittedRaw);

  const analysis = await analyzeFootage(fittedRaw, workDir, "veil");
  analysis.trimmedDurationSec = finalDur;
  analysis.keepSegments = [{ start: 0, end: finalDur }];
  analysis.durationSec = finalDur;

  const baseManifest = buildManifestFromFootage(analysis, "veil", "cinematic-broll", fittedRaw);
  const manifest = smartPlan
    ? applySmartPlanToManifest(baseManifest, { ...smartPlan, beats: syncedBeats }, finalDur)
    : apply3MinManifest(baseManifest, mint.mintDigest, finalDur);
  saveManifest(manifest);

  console.log("\n[4/5] Voiceover (synced to capture timeline)...");
  const vo = await generateSegmentedVoiceover(syncedBeats, workDir, {
    force: env("DEMO_VENICE_FORCE", "0") === "1",
    projectId: "veil",
    targetDurationSec: finalDur,
  });
  log.push(vo.path ? `Voiceover: ${vo.path}` : "Voiceover: script only");

  const captureDevice = env("SANDBOX_CAPTURE_DEVICE", "desktop");
  const outputAspect = captureDevice === "mobile" ? "9:16" : "16:9";
  const veniceAspect = captureDevice === "mobile" ? "9:16" : "16:9";

  console.log("\n[5/5] Render (smart edits + VO)...");
  const render = await renderEditorV2(fittedRaw, {
    analysis,
    manifest,
    recipe: loadLatestEditRecipe() ?? undefined,
    outputAspect,
    preserveFraming: false,
    veniceBroll: hasVenice()
      ? {
          projectId: "veil",
          tier: env("DEMO_VENICE_TIER", "hero"),
          videoModel: env("DEMO_VENICE_VIDEO_MODEL", "seedance"),
          force: env("DEMO_VENICE_FORCE", "0") === "1",
          aspectRatio: veniceAspect,
        }
      : undefined,
    voiceoverPath: vo.path,
    voiceoverSegments: vo.segments,
  });

  const finalPath = join(exportDir, `veil_judge_demo_3min_${id}.mp4`);
  if (render.status === "done" && existsSync(render.outputPath)) {
    execSync(`ffmpeg -y -i "${render.outputPath}" -c copy "${finalPath}"`, { stdio: "ignore" });
  }

  const judgeReadme = join(exportDir, "VEIL-JUDGE-DEMO-README.txt");
  writeFileSync(
    judgeReadme,
    [
      "Veil 3-min judge demo",
      "=====================",
      "",
      "SUBMIT THIS VIDEO:",
      `  ${existsSync(finalPath) ? finalPath : render.outputPath}`,
      "",
      "ON-CHAIN PROOF (verify separately — not in the video):",
      mint.explorerMint ? `  ${mint.explorerMint}` : "  (run npm run veil-demo with funded sandbox for fresh mint)",
      mint.mintDigest ? `  Digest: ${mint.mintDigest}` : "",
      "",
      "CAPTURE:",
      `  Device: ${captureDevice} (${outputAspect})`,
      "  Flow: landing → connect wallet → modes/intent → portfolio → orders → proofs → CTA",
      "  No explorer pages in recording — judges verify tx via link above.",
      "",
      "NARRATION + BEATS:",
      "  data/ops/VEIL-3MIN-BRIEF.md",
      "",
      "RE-RUN:",
      "  npm run veil-demo          # full pipeline",
      "  npm run veil-demo-vo       # remix VO onto latest edit",
      "  SANDBOX_CAPTURE_DEVICE=mobile npm run veil-demo   # mobile app capture",
    ]
      .filter((l) => l !== "")
      .join("\n"),
  );

  const report: Veil3MinReport = {
    id,
    at: Date.now(),
    rawVideoPath: capture.videoPath,
    outputPath: existsSync(finalPath) ? finalPath : render.outputPath,
    mintDigest: mint.mintDigest,
    explorerUrl: mint.explorerMint,
    status: render.status === "done" ? "done" : "failed",
    voiceoverPath: vo.path,
    log: [...log, render.log],
  };

  writeFileSync(join(DATA_DIR, "ops", "VEIL-3MIN-RESULT.json"), JSON.stringify(report, null, 2));
  writeFileSync(
    join(DATA_DIR, "ops", "VEIL-3MIN-RESULT.md"),
    [
      `# Veil 3-min judge demo`,
      `Status: **${report.status}**`,
      ``,
      mint.mintDigest ? `Tx: ${mint.explorerMint}` : "",
      report.outputPath ? `**Output:** ${report.outputPath}` : "",
      report.rawVideoPath ? `Raw: ${report.rawVideoPath}` : "",
      vo.script ? `\n## Voiceover\n${vo.script.slice(0, 500)}...` : "",
    ]
      .filter(Boolean)
      .join("\n"),
  );

  return report;
}
