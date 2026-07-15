/**
 * Extended Veil capture — ~3 minutes raw for judge demo. Live-only: no URL fallbacks.
 */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "../config.js";
import { getProject } from "../projects/registry.js";
import { captureDemoVideo } from "./demo-capture.js";
import { veil3MinCaptureSteps } from "../studio/veil-3min-script.js";
import { asChainProject, type ChainProjectDef, type CaptureDevice } from "../projects/chain.js";
import { loadOrCreateWallet } from "./sui-wallet.js";
import { isLiveOnly, waitUntilReachable } from "./live-only.js";

const DEFAULT_DEMO = "https://veil-reviewer.vercel.app";

/** Live-only — single URL, wait until reachable. No local/Vercel fallbacks. */
export async function resolveVeilDemoUrl(): Promise<string> {
  const base = (env("VEIL_DEMO_URL") || DEFAULT_DEMO).replace(/\/$/, "");
  console.log(`Live demo URL (no fallbacks): ${base}`);
  await waitUntilReachable(base, { label: "Veil reviewer app", maxWaitMs: Number(env("LIVE_WAIT_MS", "600000")) });
  return base;
}

export async function captureVeil3Min(opts: {
  capDir: string;
  exportVideo: string;
}): Promise<{ videoPath?: string; capturePaths: string[]; log: string[]; eventsPath?: string }> {
  const project = getProject("veil");
  const ext = asChainProject(project);
  const demoUrl = await resolveVeilDemoUrl();
  const wallet = loadOrCreateWallet("veil");
  const device = (env("SANDBOX_CAPTURE_DEVICE", "desktop") as CaptureDevice) || "desktop";
  const mobile = device === "mobile";

  const chainProject: ChainProjectDef = {
    ...project,
    ...ext,
    primaryUrl: demoUrl,
    capture: {
      device,
      fullscreen: !mobile,
      injectVeilWallet: true,
      walletAddress: wallet.address,
      deviceScaleFactor: Number(env("SANDBOX_DEVICE_SCALE", mobile ? "2" : "1")),
      headed: env("SANDBOX_HEADED", "1") === "1",
      steps: veil3MinCaptureSteps({ demoUrl, device }),
      ...ext.capture,
    },
  };

  return captureDemoVideo({
    project: chainProject,
    capDir: opts.capDir,
    exportVideo: opts.exportVideo,
    waitUntil: "domcontentloaded",
    liveOnly: isLiveOnly(),
  });
}
