/**
 * Judge-ready browser capture — full viewport, wallet inject, precise step runner.
 */
import {
  writeFileSync,
  mkdirSync,
  existsSync,
  readdirSync,
  copyFileSync,
  statSync,
} from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { env, DATA_DIR } from "../config.js";
import type { ProjectDef } from "../projects/registry.js";
import {
  asChainProject,
  getWalletMode,
  type CaptureDevice,
  type CaptureStep,
} from "../projects/chain.js";
import { veilWalletInitScript } from "./veil-wallet-inject.js";
import { CaptureTimeline } from "./capture-events.js";
import { waitForPageReady, detectPageErrors } from "./smart-wait.js";
import { isLiveOnly } from "./live-only.js";
import { verifyManagerBalance, skipVeilOnboarding } from "./veil-demo-prep.js";

export interface DemoCaptureResult {
  videoPath?: string;
  capturePaths: string[];
  log: string[];
  eventsPath?: string;
}

const DEVICE_PRESETS: Record<
  CaptureDevice,
  { width: number; height: number; isMobile: boolean; userAgent?: string }
> = {
  desktop: { width: 1920, height: 1080, isMobile: false },
  mobile: {
    width: 390,
    height: 844,
    isMobile: true,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  },
};

function copyLatestWebm(capDir: string, dest: string): string | null {
  const webms = readdirSync(capDir)
    .filter((f) => f.endsWith(".webm"))
    .map((f) => ({ path: join(capDir, f), mtime: 0 }));
  if (!webms.length) return null;
  for (const w of webms) {
    try {
      w.mtime = statSync(w.path).mtimeMs;
    } catch {
      /* */
    }
  }
  webms.sort((a, b) => b.mtime - a.mtime);
  copyFileSync(webms[0].path, dest);
  return dest;
}

function interpolateUrl(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? "");
}

function buildUrlList(project: ProjectDef, explorerTx?: string): string[] {
  const ext = asChainProject(project);
  if (ext.demoUrls?.length) {
    const vars = {
      primaryUrl: project.primaryUrl,
      explorerTx: explorerTx ?? "",
      secondaryUrl: project.secondaryUrl ?? "",
    };
    return ext.demoUrls
      .map((u) => interpolateUrl(u, vars))
      .filter((u) => u.startsWith("http"));
  }
  const urls: string[] = [];
  if (explorerTx) urls.push(explorerTx);
  if (project.primaryUrl) urls.push(project.primaryUrl);
  if (project.secondaryUrl?.startsWith("http")) urls.push(project.secondaryUrl);
  return urls;
}

async function clickSelector(
  page: import("playwright").Page,
  selector: string,
  note?: string,
): Promise<void> {
  const selectors = selector.includes(",")
    ? selector.split(",").map((s) => s.trim())
    : [selector, "button:has-text('CONNECT')", "button:has-text('CONNECT SUI WALLET')"];
  let lastErr: Error | undefined;
  for (const sel of selectors) {
    try {
      const loc = page.locator(sel).first();
      await loc.waitFor({ state: "visible", timeout: 25000 });
      await loc.scrollIntoViewIfNeeded();
      await page.waitForTimeout(400);
      await loc.click({ timeout: 15000 });
      if (note) console.log(`  → click: ${note}`);
      return;
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
    }
  }
  throw lastErr ?? new Error(`click failed: ${selector}`);
}

const BALANCE_ERROR_RE =
  /check manager balance|insufficient|manager balance|no on-chain fills|TWAP failed/i;

async function dismissOnboardingModal(page: import("playwright").Page): Promise<boolean> {
  let dismissed = false;
  for (let pass = 0; pass < 5; pass++) {
    let acted = false;
    for (const sel of [
      'button:has-text("Skip tour")',
      '[aria-label="Dismiss onboarding"]',
      'button:has-text("Done")',
      'button:has-text("Next")',
    ]) {
      const loc = page.locator(sel).first();
      if (await loc.isVisible().catch(() => false)) {
        await loc.click({ timeout: 5000 });
        await page.waitForTimeout(500);
        acted = true;
        dismissed = true;
        break;
      }
    }
    if (!acted) {
      const dialog = page.locator('[role="dialog"]').first();
      if (await dialog.isVisible().catch(() => false)) {
        await page.keyboard.press("Escape");
        await page.waitForTimeout(300);
        dismissed = true;
      } else {
        break;
      }
    }
  }
  return dismissed;
}

async function dismissAllOnboarding(page: import("playwright").Page, timeline?: CaptureTimeline): Promise<boolean> {
  let any = false;
  for (let i = 0; i < 6; i++) {
    if (!(await dismissOnboardingModal(page))) break;
    timeline?.log("click", "dismiss onboarding tour", { url: page.url() });
    any = true;
  }
  return any;
}

async function waitForWalletSession(page: import("playwright").Page, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const ready = await page
      .evaluate(() => Boolean((window as unknown as { __VEIL_WALLET_READY?: boolean }).__VEIL_WALLET_READY))
      .catch(() => false);
    if (ready) return;
    await page.waitForTimeout(400);
  }
}

async function clickConnectWallet(page: import("playwright").Page): Promise<boolean> {
  for (const sel of [
    "button:has-text('CONNECT SUI WALLET')",
    "button:has-text('CONNECTING')",
    "button.site-cta-btn--solid:has-text('CONNECT')",
  ]) {
    const loc = page.locator(sel).first();
    if (await loc.isVisible().catch(() => false)) {
      await loc.click({ timeout: 15000 });
      return true;
    }
  }
  return false;
}

async function forceDappKitConnect(page: import("playwright").Page): Promise<boolean> {
  return page.evaluate(async () => {
    const w = window as unknown as {
      __veilSandboxConnect?: () => Promise<boolean>;
      __VEIL_WALLET_READY?: boolean;
    };
    if (typeof w.__veilSandboxConnect === "function") {
      for (let i = 0; i < 40; i++) {
        if (await w.__veilSandboxConnect()) return true;
        await new Promise((r) => setTimeout(r, 400));
      }
    }
    return location.pathname.includes("/dashboard");
  });
}

async function waitForDashboard(page: import("playwright").Page, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (page.url().includes("/dashboard")) {
      const verifying = await page.locator("text=Verifying session").isVisible().catch(() => false);
      if (!verifying) return;
    }
    await page.waitForTimeout(400);
  }
  throw new Error(`Dashboard not reached — stuck on ${page.url()}`);
}

/** Establish wallet session before recording — avoids auth page in the demo. */
async function warmVeilBrowserSession(
  page: import("playwright").Page,
  demoUrl: string,
  walletAddress: string,
  timeline: CaptureTimeline | undefined,
  gotoTimeout: number,
  navWait: "domcontentloaded" | "networkidle",
): Promise<void> {
  const base = demoUrl.replace(/\/$/, "");
  console.log("  → warming Veil session (prefs + wallet + skip tour)…");
  await skipVeilOnboarding(walletAddress);
  timeline?.log("navigate", "warm session", { url: base });
  await ensureVeilAuthenticated(page, `${base}/dashboard/modes`, timeline, gotoTimeout, navWait);
  await dismissAllOnboarding(page, timeline);
  await page.goto(base, { waitUntil: navWait, timeout: gotoTimeout });
  await page.waitForTimeout(800);
  timeline?.log("ready", "session warm — back at landing", { url: page.url() });
  console.log("  ✓ session warm — capture starts at landing (wallet already connected)");
}

async function ensureVeilAuthenticated(
  page: import("playwright").Page,
  targetUrl: string,
  timeline: CaptureTimeline | undefined,
  gotoTimeout: number,
  navWait: "domcontentloaded" | "networkidle",
): Promise<void> {
  console.log(`  → ensure auth → ${targetUrl}`);
  timeline?.log("navigate", "ensure dashboard session", { url: targetUrl });

  await waitForWalletSession(page, 10000);

  await page.goto(targetUrl, { waitUntil: navWait, timeout: gotoTimeout });
  await page.waitForTimeout(1200);

  const deadline = Date.now() + Math.min(gotoTimeout, 90000);
  while (Date.now() < deadline) {
    const url = page.url();

    if (url.includes("/dashboard")) {
      await waitForDashboard(page, 15000);
      await dismissAllOnboarding(page, timeline);
      break;
    }

    if (url.includes("/auth")) {
      await waitForWalletSession(page, 3000);
      const clicked = await clickConnectWallet(page);
      if (clicked) {
        console.log("  → auto-connect sandbox wallet");
        timeline?.log("click", "auto-connect sandbox wallet", { url });
      }
      await forceDappKitConnect(page);
      await page.waitForTimeout(1000);
      if (!page.url().includes("/dashboard")) {
        await page.goto(targetUrl, { waitUntil: navWait, timeout: gotoTimeout });
      }
    } else {
      await forceDappKitConnect(page);
      await page.waitForTimeout(600);
    }
  }

  if (!page.url().includes("/dashboard")) {
    await page.goto(targetUrl, { waitUntil: navWait, timeout: gotoTimeout });
    await clickConnectWallet(page);
    await forceDappKitConnect(page);
  }

  await waitForDashboard(page, gotoTimeout);
  await dismissAllOnboarding(page, timeline);
  await waitForPageReady(page, { timeline, note: "dashboard session ready", settleMs: 700, timeoutMs: gotoTimeout });
  timeline?.log("ready", "dashboard authenticated", { url: page.url() });
  console.log(`  ✓ dashboard: ${page.url()}`);
}

async function observePageContext(
  page: import("playwright").Page,
  timeline: CaptureTimeline | undefined,
  note: string,
): Promise<void> {
  const snapshot = await page.evaluate(() => {
    const h1 = document.querySelector("h1")?.textContent?.trim() ?? "";
    const parsed = document.querySelector("p.text-emerald-400")?.textContent?.trim() ?? "";
    const toast = document.querySelector("[data-sonner-toast]")?.textContent?.trim() ?? "";
    const intent = (document.querySelector("textarea") as HTMLTextAreaElement | null)?.value?.trim().slice(0, 80) ?? "";
    const modeCard = document.querySelector("h2")?.textContent?.trim() ?? "";
    const orderLink = document.querySelector("a[href*='/dashboard/orders/']")?.textContent?.trim() ?? "";
    const err = [...document.querySelectorAll(".text-red-500, .text-red-400")]
      .map((el) => el.textContent?.trim())
      .filter(Boolean)
      .join("; ");
    return { h1, parsed, toast, intent, modeCard, orderLink, err, path: location.pathname };
  });
  const parts = [snapshot.h1, snapshot.parsed || snapshot.intent, snapshot.toast, snapshot.orderLink]
    .filter(Boolean)
    .join(" · ");
  timeline?.log("scene", `${note}: ${parts || snapshot.path}`, { url: page.url() });
  console.log(`  ◈ observe: ${note} — ${parts || snapshot.path}`);
  if (snapshot.err && BALANCE_ERROR_RE.test(snapshot.err)) {
    throw new Error(`Page error visible: ${snapshot.err}`);
  }
}

async function assertPageHealthy(
  page: import("playwright").Page,
  timeline: CaptureTimeline | undefined,
  note: string,
): Promise<void> {
  const errors = await detectPageErrors(page);
  const body = await page.locator("body").innerText().catch(() => "");
  const fatal = [...errors, body.match(BALANCE_ERROR_RE)?.[0] ?? ""].filter(Boolean);
  if (fatal.length) {
    timeline?.log("error", note, { errors: fatal, url: page.url() });
    throw new Error(`${note}: ${fatal.join("; ")}`);
  }
}

async function runOneCaptureStep(
  page: import("playwright").Page,
  step: CaptureStep,
  capDir: string,
  vars: Record<string, string>,
  timeline: CaptureTimeline | undefined,
  gotoTimeout: number,
  navWait: "domcontentloaded" | "networkidle",
  shotN: { n: number },
  liveOnly: boolean,
): Promise<string[]> {
  const shots: string[] = [];
  if (step.action === "goto" && step.url) {
    const url = interpolateUrl(step.url, vars);
    if (url.startsWith("http")) {
      console.log(`  → goto: ${step.note ?? url}`);
      timeline?.log("navigate", step.note ?? url, { url });
      await page.goto(url, { waitUntil: navWait, timeout: gotoTimeout });
      await waitForPageReady(page, {
        timeline,
        note: step.note ?? "after navigate",
        selector: step.selector,
        timeoutMs: gotoTimeout,
      });
      if (page.url().includes("/dashboard")) {
        await dismissOnboardingModal(page);
      }
    }
  } else if (step.action === "waitForReady") {
    await waitForPageReady(page, {
      timeline,
      note: step.note ?? "ready",
      selector: step.selector,
      timeoutMs: step.ms ?? gotoTimeout,
    });
  } else if (step.action === "scene") {
    const url = page.url();
    if (!url.includes("/dashboard") && step.note?.includes("wallet")) {
      throw new Error(`Scene "${step.note}" but not on dashboard — ${url}`);
    }
    timeline?.log("scene", step.note ?? "scene", { url });
    console.log(`  ◆ scene: ${step.note}`);
  } else if (step.action === "wait") {
    await page.waitForTimeout(step.ms ?? 2000);
  } else if (step.action === "click" && step.selector) {
    await clickSelector(page, step.selector, step.note);
    timeline?.log("click", step.note ?? step.selector, { selector: step.selector, url: page.url() });
    await waitForPageReady(page, { timeline, note: `after ${step.note ?? "click"}`, settleMs: 800, timeoutMs: gotoTimeout });
  } else if (step.action === "type" && step.selector && step.text) {
    await page.fill(step.selector, step.text, { timeout: gotoTimeout });
  } else if (step.action === "fill" && step.selector && step.text !== undefined) {
    const loc = page.locator(step.selector).first();
    await loc.waitFor({ state: "visible", timeout: gotoTimeout });
    await loc.fill(step.text);
    if (step.note) console.log(`  → fill: ${step.note}`);
    timeline?.log("fill", step.note ?? step.text.slice(0, 40), { selector: step.selector });
  } else if (step.action === "hover" && step.selector) {
    await page.locator(step.selector).first().hover({ timeout: gotoTimeout });
  } else if (step.action === "waitForSelector" && step.selector) {
    await page.locator(step.selector).first().waitFor({
      state: "visible",
      timeout: step.ms ?? gotoTimeout,
    });
  } else if (step.action === "waitForUrl") {
    const needle = step.urlContains ?? step.url ?? "";
    await page.waitForURL(
      (u) => u.href.includes(needle) || u.pathname.includes(needle),
      { timeout: step.ms ?? gotoTimeout, waitUntil: "domcontentloaded" },
    );
    if (step.note) console.log(`  → url: ${step.note}`);
    timeline?.log("ready", step.note ?? needle, { url: page.url() });
    await waitForPageReady(page, { timeline, note: step.note ?? "after url", settleMs: 900, timeoutMs: gotoTimeout });
  } else if (step.action === "scroll") {
    const frac = step.scrollFrac ?? 0.45;
    await page.evaluate((f) => {
      window.scrollBy({ top: window.innerHeight * f, behavior: "smooth" });
    }, frac);
    await page.waitForTimeout(900);
    timeline?.log("scroll", step.note ?? `scroll ${Math.round(frac * 100)}%`, { url: page.url() });
  } else if (step.action === "screenshot") {
    if (!liveOnly) {
      const shot = join(capDir, `step-${++shotN.n}.png`);
      await page.screenshot({ path: shot, fullPage: false });
      shots.push(shot);
    }
  } else if (step.action === "waitForOrderDone") {
    const timeout = step.ms ?? gotoTimeout;
    console.log(`  … waiting for live order (${step.note ?? "sealed"})…`);
    timeline?.log("wait", step.note ?? "enclave order sealing", { url: page.url() });
    timeline?.loadingStart(step.note ?? "enclave order sealing");

    const pollMs = 2000;
    const start = Date.now();
    let sealed = false;
    while (Date.now() - start < timeout) {
      const errToast = page.locator("[data-sonner-toast]").filter({
        hasText: /failed|error|Execute failed|balance|TWAP|manager/i,
      });
      if (await errToast.first().isVisible().catch(() => false)) {
        const msg = (await errToast.first().textContent().catch(() => "")) ?? "order failed";
        timeline?.loadingEnd("order error");
        throw new Error(`Live order failed: ${msg.trim()}`);
      }

      const okToast = page
        .locator("[data-sonner-toast]")
        .filter({ hasText: /^Order\s+[a-f0-9-]+/i });
      if (await okToast.first().isVisible().catch(() => false)) {
        sealed = true;
        break;
      }

      await page.waitForTimeout(pollMs);
    }
    if (!sealed) {
      timeline?.loadingEnd("order timeout");
      throw new Error(`Live order not sealed within ${timeout / 1000}s — ${step.note ?? "no fallback"}`);
    }

    await page.waitForTimeout(600);
    timeline?.loadingEnd("order sealed");
    timeline?.log("ready", step.note ?? "order sealed", { url: page.url() });
    console.log(`  ✓ order sealed: ${step.note ?? ""}`);
  } else if (step.action === "ensureVeilAuth") {
    const url = step.url ? interpolateUrl(step.url, vars) : `${vars.demoUrl}/dashboard/modes`;
    await ensureVeilAuthenticated(page, url, timeline, gotoTimeout, navWait);
    await dismissAllOnboarding(page, timeline);
    timeline?.log("scene", step.note ?? "wallet connected modes", { url: page.url() });
  } else if (step.action === "dismissOnboarding") {
    if (await dismissAllOnboarding(page, timeline)) {
      console.log("  ✓ dismissed onboarding tour");
    }
  } else if (step.action === "assertManagerBalance") {
    const minOrder = Number(env("VEIL_MIN_ORDER_USDC", "25"));
    const min = step.minUsdc ?? minOrder;
    const idle = await verifyManagerBalance(min);
    console.log(`  ✓ manager balance check: ${idle.toFixed(1)} dUSDC idle (need ≥${min})`);
    timeline?.log("ready", `manager ${idle.toFixed(1)} dUSDC`, { url: page.url() });
  } else if (step.action === "assertNoErrors") {
    await assertPageHealthy(page, timeline, step.note ?? "page health");
    console.log(`  ✓ ${step.note ?? "no page errors"}`);
  } else if (step.action === "observe") {
    await observePageContext(page, timeline, step.note ?? "screen context");
  }
  return shots;
}

async function runCaptureSteps(
  page: import("playwright").Page,
  steps: CaptureStep[],
  capDir: string,
  vars: Record<string, string>,
  timeline?: CaptureTimeline,
  liveOnly = false,
): Promise<string[]> {
  const shots: string[] = [];
  const shotN = { n: 0 };
  const gotoTimeout = Number(
    env("SANDBOX_GOTO_TIMEOUT_MS", vars.demoUrl?.includes("vercel") ? "180000" : "120000"),
  );
  const navWait = (env("SANDBOX_WAIT_UNTIL", "domcontentloaded") ||
    "domcontentloaded") as "domcontentloaded" | "networkidle";
  const stepRetries = Number(env("LIVE_STEP_RETRIES", liveOnly ? "2" : "1"));
  const noRetryActions = new Set([
    "ensureVeilAuth",
    "assertManagerBalance",
    "waitForOrderDone",
    "assertNoErrors",
    "observe",
  ]);

  for (const step of steps) {
    const label = step.note ?? step.action;
    const maxAttempts = noRetryActions.has(step.action) ? 1 : stepRetries;
    let lastErr: Error | undefined;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        shots.push(...(await runOneCaptureStep(page, step, capDir, vars, timeline, gotoTimeout, navWait, shotN, liveOnly)));
        lastErr = undefined;
        break;
      } catch (e) {
        lastErr = e instanceof Error ? e : new Error(String(e));
        const fatal = /balance|manager|TWAP|order failed|InsufficientCoin|Live order|auth|connect wallet|not on dashboard|Page error/i.test(
          lastErr.message,
        );
        if (liveOnly && fatal) throw lastErr;
        if (attempt < maxAttempts) {
          console.log(`  … retry ${attempt}/${maxAttempts} (${label}): ${lastErr.message}`);
          await page.waitForTimeout(Number(env("LIVE_RETRY_DELAY_MS", "12000")));
        }
      }
    }
    if (lastErr) {
      if (liveOnly) throw new Error(`Capture step failed (${label}): ${lastErr.message}`);
      console.warn(`Capture step skip (${label}):`, lastErr.message);
    }
  }
  return shots;
}

/** Avoid sandbox-cache misses — use user-local Playwright browsers when present. */
function ensurePlaywrightBrowsersPath(): string | undefined {
  const explicit = env("PLAYWRIGHT_BROWSERS_PATH") || env("SANDBOX_PLAYWRIGHT_BROWSERS_PATH");
  if (explicit && existsSync(explicit)) {
    process.env.PLAYWRIGHT_BROWSERS_PATH = explicit;
    return explicit;
  }
  const local = join(process.env.LOCALAPPDATA ?? homedir(), "ms-playwright");
  if (existsSync(local)) {
    process.env.PLAYWRIGHT_BROWSERS_PATH = local;
    return local;
  }
  return undefined;
}

function resolveChromiumExecutable(browsersPath?: string): string | undefined {
  const custom = env("SANDBOX_CHROME_PATH");
  if (custom && existsSync(custom)) return custom;

  const root = browsersPath ?? join(process.env.LOCALAPPDATA ?? homedir(), "ms-playwright");
  if (existsSync(root)) {
    const versions = readdirSync(root).filter((d) => d.startsWith("chromium-"));
    versions.sort().reverse();
    for (const v of versions) {
      const exe = join(root, v, "chrome-win64", "chrome.exe");
      if (existsSync(exe)) return exe;
    }
  }

  for (const p of [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  ]) {
    if (existsSync(p)) return p;
  }
  return undefined;
}

function resolveCaptureGeometry(captureCfg: ReturnType<typeof asChainProject>["capture"]) {
  const device = (captureCfg?.device ??
    env("SANDBOX_CAPTURE_DEVICE", "desktop")) as CaptureDevice;
  const preset = DEVICE_PRESETS[device] ?? DEVICE_PRESETS.desktop;
  const width = captureCfg?.width ?? Number(env("SANDBOX_CAPTURE_WIDTH", String(preset.width)));
  const height = captureCfg?.height ?? Number(env("SANDBOX_CAPTURE_HEIGHT", String(preset.height)));
  const scale = captureCfg?.deviceScaleFactor ?? Number(env("SANDBOX_DEVICE_SCALE", device === "mobile" ? "2" : "1"));
  const fullscreen =
    captureCfg?.fullscreen ?? env("SANDBOX_CAPTURE_FULLSCREEN", device === "desktop" ? "1" : "0") === "1";
  return { device, preset, width, height, scale, fullscreen };
}

export async function captureDemoVideo(opts: {
  project: ProjectDef;
  capDir: string;
  exportVideo: string;
  explorerTx?: string;
  waitUntil?: "domcontentloaded" | "networkidle";
  liveOnly?: boolean;
}): Promise<DemoCaptureResult> {
  const { project, capDir, exportVideo, explorerTx } = opts;
  const liveOnly = opts.liveOnly ?? isLiveOnly();
  const ext = asChainProject(project);
  const captureCfg = ext.capture ?? {};
  const { device, preset, width, height, scale, fullscreen } = resolveCaptureGeometry(captureCfg);
  const walletMode = getWalletMode(project);
  const metamaskPath = env("SANDBOX_METAMASK_EXTENSION_PATH");
  const useMetamask = walletMode === "metamask" && Boolean(metamaskPath) && existsSync(metamaskPath);
  const injectWallet = captureCfg.injectVeilWallet ?? project.id === "veil";
  const walletAddress = captureCfg.walletAddress ?? env("SANDBOX_WALLET_ADDRESS");
  const headed =
    captureCfg.headed ??
    (useMetamask || injectWallet || env("SANDBOX_HEADED", "0") === "1");

  if (!existsSync(capDir)) mkdirSync(capDir, { recursive: true });

  const log: string[] = [
    `Capture ${device} ${width}x${height} @${scale}x`,
    fullscreen && headed ? "Fullscreen window" : "Viewport recording",
    useMetamask ? `MetaMask extension: ${metamaskPath}` : injectWallet ? "Veil sandbox wallet inject" : "No wallet extension",
    headed ? "Headed browser" : "Headless",
    liveOnly ? "Live-only: retry steps, no skips" : "",
  ].filter(Boolean);

  const capturePaths: string[] = [];
  let videoPath: string | undefined;
  let eventsPath: string | undefined;
  const urls = buildUrlList(project, explorerTx);
  const vars = {
    primaryUrl: project.primaryUrl,
    explorerTx: explorerTx ?? "",
    secondaryUrl: project.secondaryUrl ?? "",
    demoUrl: project.primaryUrl,
  };

  try {
    const browsersPath = ensurePlaywrightBrowsersPath();
    const executablePath = resolveChromiumExecutable(browsersPath);
    const { chromium } = await import("playwright");
    const launchArgs = [
      "--disable-blink-features=AutomationControlled",
      "--window-position=0,0",
      "--force-device-scale-factor=1",
      "--high-dpi-support=1",
    ];
    if (fullscreen && headed) {
      launchArgs.push("--start-maximized");
    } else {
      launchArgs.push(`--window-size=${width},${height}`);
    }

    const contextOpts: import("playwright").BrowserContextOptions = {
      viewport: { width, height },
      deviceScaleFactor: scale,
      recordVideo: { dir: capDir, size: { width, height } },
      colorScheme: "dark",
      isMobile: preset.isMobile,
      hasTouch: preset.isMobile,
    };
    if (preset.userAgent) contextOpts.userAgent = preset.userAgent;
    if (browsersPath) log.push(`Playwright browsers: ${browsersPath}`);
    if (executablePath) log.push(`Chromium: ${executablePath}`);

    const launchOpts = {
      headless: !headed,
      args: launchArgs,
      ...(executablePath ? { executablePath } : {}),
    };

    if (useMetamask) {
      const userDataDir = join(capDir, "metamask-profile");
      const context = await chromium.launchPersistentContext(userDataDir, {
        ...launchOpts,
        headless: false,
        ...contextOpts,
        args: [
          `--disable-extensions-except=${metamaskPath}`,
          `--load-extension=${metamaskPath}`,
          ...launchArgs,
        ],
      });
      const page = context.pages()[0] ?? (await context.newPage());
      log.push("MetaMask loaded — approve connect/sign in browser window");

      if (captureCfg.steps?.length) {
        capturePaths.push(...(await runCaptureSteps(page, captureCfg.steps, capDir, vars, undefined, liveOnly)));
      } else {
        for (let i = 0; i < urls.length; i++) {
          const url = urls[i];
          try {
            await page.goto(url, {
              waitUntil: "networkidle",
              timeout: Number(env("SANDBOX_GOTO_TIMEOUT_MS", "90000")),
            });
            await page.waitForTimeout(3500);
            const shot = join(capDir, `step-${i + 1}.png`);
            await page.screenshot({ path: shot, fullPage: false });
            capturePaths.push(shot);
          } catch (e) {
            console.warn(`Capture skip ${url}:`, e instanceof Error ? e.message : e);
          }
        }
      }

      await page.waitForTimeout(1500);
      await context.close();
      videoPath = copyLatestWebm(capDir, exportVideo) ?? undefined;
      return { videoPath, capturePaths, log };
    }

    const usePersistentVeil =
      injectWallet && project.id === "veil" && env("SANDBOX_PERSIST_PROFILE", "1") === "1";
    let browser: import("playwright").Browser | undefined;
    let context: import("playwright").BrowserContext;

    if (usePersistentVeil) {
      const profileDir = join(DATA_DIR, "sandbox", "veil-judge-profile");
      if (!existsSync(profileDir)) mkdirSync(profileDir, { recursive: true });
      context = await chromium.launchPersistentContext(profileDir, {
        ...launchOpts,
        headless: !headed,
        ...contextOpts,
        args: launchArgs,
      });
      if (walletAddress) {
        await context.addInitScript(veilWalletInitScript(walletAddress));
      }
      log.push(`Persistent Veil profile: ${profileDir}`);
    } else {
      browser = await chromium.launch(launchOpts);
      context = await browser.newContext(contextOpts);
      if (injectWallet && walletAddress) {
        await context.addInitScript(veilWalletInitScript(walletAddress));
      }
    }

    if (injectWallet && walletAddress) {
      log.push(`Wallet inject: ${walletAddress.slice(0, 10)}…`);
    }

    const page = context.pages()[0] ?? (await context.newPage());
    const smartCapture = env("SMART_CAPTURE", "1") === "1";
    const timeline = smartCapture ? new CaptureTimeline(project.primaryUrl) : undefined;
    if (timeline) log.push("Smart capture: event timeline + load waits");

    const navWait = (env("SANDBOX_WAIT_UNTIL", "domcontentloaded") ||
      "domcontentloaded") as "domcontentloaded" | "networkidle";
    const gotoTimeout = Number(
      env("SANDBOX_GOTO_TIMEOUT_MS", project.primaryUrl?.includes("vercel") ? "180000" : "120000"),
    );

    if (injectWallet && project.id === "veil" && captureCfg.steps?.length && walletAddress) {
      await warmVeilBrowserSession(page, project.primaryUrl, walletAddress, timeline, gotoTimeout, navWait);
    }

    if (captureCfg.steps?.length) {
      console.log(`Running ${captureCfg.steps.length} capture steps…`);
      capturePaths.push(...(await runCaptureSteps(page, captureCfg.steps, capDir, vars, timeline, liveOnly)));
    } else {
      for (let i = 0; i < urls.length; i++) {
        const url = urls[i];
        if (!url) continue;
        try {
          await page.goto(url, {
            waitUntil: opts.waitUntil ?? "domcontentloaded",
            timeout: Number(env("SANDBOX_GOTO_TIMEOUT_MS", "45000")),
          });
          await page.waitForTimeout(3000);
          const shot = join(capDir, `step-${i + 1}.png`);
          await page.screenshot({ path: shot, fullPage: false });
          capturePaths.push(shot);
        } catch (e) {
          console.warn(`Capture skip ${url}:`, e instanceof Error ? e.message : e);
        }
      }
    }

    const video = page.video();
    eventsPath = timeline?.save(capDir);
    await context.close();
    if (browser) await browser.close();

    if (video) {
      try {
        const raw = await video.path();
        if (raw && existsSync(raw)) {
          copyFileSync(raw, exportVideo);
          videoPath = exportVideo;
        }
      } catch {
        videoPath = copyLatestWebm(capDir, exportVideo) ?? undefined;
      }
    }
    if (!videoPath) {
      videoPath = copyLatestWebm(capDir, exportVideo) ?? undefined;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log.push(`Capture error: ${msg}`);
    if (liveOnly) throw e instanceof Error ? e : new Error(msg);
    videoPath = copyLatestWebm(capDir, exportVideo) ?? undefined;
  }

  if (videoPath) log.push(`Video: ${videoPath}`);
  writeFileSync(join(capDir, "capture-log.json"), JSON.stringify({ log, capturePaths, videoPath, eventsPath }, null, 2));
  return { videoPath, capturePaths, log, eventsPath };
}
