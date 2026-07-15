/**
 * Smart page waits — full load, no spinners, detect fetch/sync errors.
 */
import type { Page } from "playwright";
import type { CaptureTimeline } from "./capture-events.js";

const ERROR_PATTERNS = [
  /fetch failed/i,
  /sync error/i,
  /failed to load/i,
  /network error/i,
  /couldn't load/i,
  /503/i,
  /502/i,
];

const LOADING_SELECTORS = [
  "text=Verifying session",
  "[data-testid='loading']",
  ".animate-pulse",
  "text=Loading",
];

export async function detectPageErrors(page: Page): Promise<string[]> {
  const text = await page.evaluate(() => document.body?.innerText?.slice(0, 8000) ?? "");
  const found = ERROR_PATTERNS.filter((re) => re.test(text)).map((re) => re.source);
  const toasts = await page
    .locator("[data-sonner-toast], [role='alert'], .text-red-500, .text-red-400")
    .allTextContents()
    .catch(() => [] as string[]);
  for (const t of toasts) {
    if (t && ERROR_PATTERNS.some((re) => re.test(t))) found.push(t.trim().slice(0, 120));
  }
  return [...new Set(found)];
}

export async function waitForPageReady(
  page: Page,
  opts: {
    timeline?: CaptureTimeline;
    note?: string;
    selector?: string;
    timeoutMs?: number;
    settleMs?: number;
  } = {},
): Promise<{ ok: boolean; errors: string[] }> {
  const timeout = opts.timeoutMs ?? 45000;
  const settle = opts.settleMs ?? 1200;
  const note = opts.note ?? "page ready";

  opts.timeline?.loadingStart(note);

  const isRemote = /vercel\.app|https:\/\//.test(page.url()) || note.includes("vercel");
  const isLanding = /landing|stealth hook|cta landing/i.test(note);
  try {
    await page.waitForLoadState("load", { timeout: Math.min(timeout, isLanding ? 25000 : 60000) });
  } catch {
    await page.waitForLoadState("domcontentloaded", { timeout: 20000 }).catch(() => {});
  }
  if (!isRemote) {
    try {
      await page.waitForLoadState("networkidle", { timeout: 15000 });
    } catch {
      /* remote/CDN — skip networkidle */
    }
  }

  if (opts.selector) {
    await page.locator(opts.selector).first().waitFor({ state: "visible", timeout });
  } else if (isLanding) {
    await page
      .locator("h1, [data-testid='hero'], main")
      .first()
      .waitFor({ state: "visible", timeout: Math.min(timeout, 20000) })
      .catch(() => {});
  }

  const spinnerPasses = isLanding ? 6 : 20;
  for (let i = 0; i < spinnerPasses; i++) {
    let anyLoading = false;
    for (const sel of LOADING_SELECTORS) {
      const vis = await page.locator(sel).first().isVisible().catch(() => false);
      if (vis) {
        anyLoading = true;
        break;
      }
    }
    if (!anyLoading) break;
    await page.waitForTimeout(500);
  }

  await page.waitForTimeout(isLanding ? Math.min(settle, 600) : settle);

  const errors = await detectPageErrors(page);
  const title = await page.title().catch(() => "");
  opts.timeline?.loadingEnd(errors.length ? "loaded-with-errors" : "ready");
  opts.timeline?.log("ready", note, { url: page.url(), pageTitle: title, errors: errors.length ? errors : undefined });

  if (errors.length) {
    console.warn(`  ⚠ page errors (${note}):`, errors.join("; "));
  } else {
    console.log(`  ✓ ready: ${note}`);
  }

  return { ok: errors.length === 0, errors };
}
