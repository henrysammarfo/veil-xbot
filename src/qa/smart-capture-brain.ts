/**
 * Smart capture brain — OpenAI/Venice decides next action + remembers failures.
 * This is the learning loop for walkthrough/demo recording.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "playwright";
import { DATA_DIR, assertDataDir, env } from "../config.js";
import { chatCompletion, listConfiguredProviders } from "../ai/router.js";
import type { CaptureTimeline } from "./capture-events.js";
import { learn } from "../brain/self-learn.js";

export type SmartAction =
  | { action: "ok"; reason: string }
  | { action: "wait"; ms: number; reason: string }
  | { action: "click"; selector: string; reason: string }
  | { action: "scroll"; amount: number; reason: string }
  | { action: "goto"; path: string; reason: string }
  | { action: "fail"; reason: string };

export interface WalkthroughCaptureRecipe {
  version: 1;
  updatedAt: number;
  projectId: string;
  viewport: { width: number; height: number; deviceScaleFactor: number; zoom: number };
  aspect: "16:9";
  knownGoodSelectors: string[];
  knownBadUrls: string[];
  lessons: string[];
  lastErrors: string[];
}

function recipePath(projectId: string): string {
  assertDataDir();
  const dir = join(DATA_DIR, "improve");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return join(dir, `walkthrough-recipe-${projectId}.json`);
}

export function loadCaptureRecipe(projectId: string): WalkthroughCaptureRecipe {
  const p = recipePath(projectId);
  if (existsSync(p)) {
    try {
      return JSON.parse(readFileSync(p, "utf8")) as WalkthroughCaptureRecipe;
    } catch {
      /* fall through */
    }
  }
  const w = Number(env("SANDBOX_CAPTURE_WIDTH", "1920"));
  const h = Number(env("SANDBOX_CAPTURE_HEIGHT", "1080"));
  return {
    version: 1,
    updatedAt: Date.now(),
    projectId,
    viewport: {
      width: w,
      height: h,
      deviceScaleFactor: Number(env("SANDBOX_DEVICE_SCALE", "1")),
      zoom: 1,
    },
    aspect: "16:9",
    knownGoodSelectors: [
      "button:has-text('Connect')",
      "button:has-text('Forge')",
      "[data-testid='forge']",
      "a[href*='aurum']",
    ],
    knownBadUrls: [],
    lessons: [
      "Never claim tx proof without a visible digest/hash on screen",
      "Empty Magmos shell title with no forge UI = fail the beat",
      "Prefer real clicks over blind scroll",
    ],
    lastErrors: [],
  };
}

export function saveCaptureRecipe(recipe: WalkthroughCaptureRecipe): void {
  recipe.updatedAt = Date.now();
  writeFileSync(recipePath(recipe.projectId), JSON.stringify(recipe, null, 2));
}

export function resolveCaptureGeometry(recipe: WalkthroughCaptureRecipe): {
  width: number;
  height: number;
  deviceScaleFactor: number;
  zoom: number;
  aspectOk: boolean;
} {
  let { width, height, deviceScaleFactor, zoom } = recipe.viewport;
  // Force true 16:9 for YouTube/X landscape masters
  if (Math.abs(width / height - 16 / 9) > 0.02) {
    height = Math.round((width * 9) / 16);
  }
  // Retina blur / tiny UI — clamp scale
  if (deviceScaleFactor < 1) deviceScaleFactor = 1;
  if (deviceScaleFactor > 2) deviceScaleFactor = 2;
  zoom = 1; // always 100% browser zoom for product UI
  return {
    width,
    height,
    deviceScaleFactor,
    zoom,
    aspectOk: Math.abs(width / height - 16 / 9) < 0.02,
  };
}

async function pageDigest(page: Page): Promise<{
  url: string;
  title: string;
  text: string;
  buttons: string[];
}> {
  return page.evaluate(() => {
    const text = (document.body?.innerText || "").slice(0, 2500);
    const buttons = [...document.querySelectorAll("button, a[href], [role='button']")]
      .slice(0, 30)
      .map((el) => (el.textContent || el.getAttribute("href") || "").trim().slice(0, 60))
      .filter(Boolean);
    return {
      url: location.href,
      title: document.title,
      text,
      buttons,
    };
  });
}

/** LLM (Venice preferred, else OpenAI via router) decides if this beat succeeded. */
export async function evaluateBeat(opts: {
  projectId: string;
  beatGoal: string;
  narration: string;
  page: Page;
  recipe: WalkthroughCaptureRecipe;
  timeline?: CaptureTimeline;
}): Promise<SmartAction> {
  const digest = await pageDigest(opts.page);
  const emptyShell =
    /^Magmos$/i.test(digest.title) &&
    digest.text.length < 200 &&
    !/forge|aurum|connect|wallet|tx|transaction/i.test(digest.text);

  const prompt = `You are a SMART product-demo recorder critic for ${opts.projectId}.
Goal beat: ${opts.beatGoal}
Narration claim: ${opts.narration}
URL: ${digest.url}
Title: ${digest.title}
Visible text (truncate):
${digest.text.slice(0, 1400)}
Buttons/links: ${digest.buttons.slice(0, 20).join(" | ")}
Past lessons: ${opts.recipe.lessons.slice(-8).join("; ")}
Known bad URLs: ${opts.recipe.knownBadUrls.join(", ") || "none"}

Return JSON ONLY one of:
{"action":"ok","reason":"..."}
{"action":"wait","ms":1500,"reason":"..."}
{"action":"click","selector":"CSS or text=…","reason":"..."}
{"action":"scroll","amount":400,"reason":"..."}
{"action":"goto","path":"/relative","reason":"..."}
{"action":"fail","reason":"why this beat is NOT shown on screen"}

Rules:
- If narration claims wallet connect / forge / tx proof but UI does not show it → fail
- Empty product shell is fail
- Prefer click Connect/Forge when goal needs it
- Prefer proof of product, not scroll theater`;

  // Local heuristics first (fast fail) — then LLM
  if (emptyShell) {
    return {
      action: "fail",
      reason: `Empty Magmos shell at ${digest.url} — title only, no product UI for "${opts.beatGoal}"`,
    };
  }
  if (/tx proof|transaction|on-chain/i.test(opts.beatGoal + opts.narration)) {
    if (!/0x[a-f0-9]{8,}|digest|transaction|explorer/i.test(digest.text)) {
      return {
        action: "fail",
        reason: "Claimed tx proof but no digest/tx hash visible on screen",
      };
    }
  }

  if (!listConfiguredProviders().length) {
    return { action: "ok", reason: "no LLM — heuristic pass" };
  }

  try {
    const res = await chatCompletion("walkthrough", prompt, {
      context: opts.projectId,
      projectId: opts.projectId,
      feature: "capture",
      failover: true,
    });
    const parsed = JSON.parse(res.content.replace(/```json|```/g, "").trim()) as SmartAction;
    if (parsed && typeof parsed === "object" && "action" in parsed) return parsed;
  } catch (e) {
    opts.timeline?.log("error", `smart-brain parse: ${e instanceof Error ? e.message : e}`);
  }

  return { action: "ok", reason: "LLM unavailable — continue" };
}

export function rememberCaptureOutcome(
  recipe: WalkthroughCaptureRecipe,
  outcome: {
    errors: string[];
    lessons?: string[];
    badUrl?: string;
    goodSelector?: string;
  },
): WalkthroughCaptureRecipe {
  const next = { ...recipe };
  next.lastErrors = [...outcome.errors].slice(-20);
  if (outcome.lessons?.length) {
    next.lessons = [...new Set([...next.lessons, ...outcome.lessons])].slice(-40);
  }
  if (outcome.badUrl) {
    next.knownBadUrls = [...new Set([...next.knownBadUrls, outcome.badUrl])].slice(-30);
  }
  if (outcome.goodSelector) {
    next.knownGoodSelectors = [...new Set([outcome.goodSelector, ...next.knownGoodSelectors])].slice(
      0,
      40,
    );
  }
  if (outcome.errors.length || outcome.lessons?.length) {
    learn({
      projectId: recipe.projectId,
      feature: "capture",
      outcome: outcome.errors.length ? "partial" : "success",
      summary: `capture recipe update · errors=${outcome.errors.length}`,
      errors: outcome.errors.slice(0, 6),
      lessons: outcome.lessons?.length ? outcome.lessons : outcome.errors.slice(0, 3),
    });
  }
  saveCaptureRecipe(next);
  return next;
}

/** Apply a smart action on the page. Returns fail reason if action is fail. */
export async function applySmartAction(
  page: Page,
  action: SmartAction,
  timeline?: CaptureTimeline,
): Promise<{ ok: boolean; fatal?: string }> {
  switch (action.action) {
    case "ok":
      timeline?.log("ready", action.reason);
      return { ok: true };
    case "wait":
      timeline?.log("wait", action.reason);
      await page.waitForTimeout(Math.min(action.ms, 5000));
      return { ok: true };
    case "scroll":
      timeline?.log("scroll", action.reason);
      await page.mouse.wheel(0, action.amount).catch(() => undefined);
      await page.waitForTimeout(600);
      return { ok: true };
    case "click": {
      timeline?.log("click", action.reason, { selector: action.selector });
      try {
        if (action.selector.startsWith("text=")) {
          await page.getByText(action.selector.slice(5), { exact: false }).first().click({ timeout: 5000 });
        } else {
          await page.locator(action.selector).first().click({ timeout: 5000 });
        }
        await page.waitForTimeout(900);
        return { ok: true };
      } catch (e) {
        return { ok: false, fatal: `click failed: ${action.selector} — ${e instanceof Error ? e.message : e}` };
      }
    }
    case "goto": {
      const base = new URL(page.url()).origin;
      const url = action.path.startsWith("http") ? action.path : `${base}${action.path.startsWith("/") ? action.path : `/${action.path}`}`;
      timeline?.log("navigate", action.reason, { url });
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
      return { ok: true };
    }
    case "fail":
      timeline?.log("error", action.reason);
      return { ok: false, fatal: action.reason };
  }
}
