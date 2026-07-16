/**
 * Local Magmos/Veil ad compositor — ZERO GooseWorks credits.
 *
 * Pipeline (Goose remix idea, built in-house):
 *  1. Optional product UI capture (only when layout needs it)
 *  2. Venice atmosphere / photography plate (NO TEXT)
 *  3. Goose-level HTML layouts with crisp Magmos mustard brand type
 *  4. Playwright HTML → PNG
 *
 * Taste bar: data/ads/reference/magmos-goose (user Goose dashboard ads).
 */
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  copyFileSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { DATA_DIR, assertDataDir, env } from "../config.js";
import { hasVenice, veniceGenerateImage } from "../integrations/venice.js";
import { newId } from "../store.js";
import { learn } from "../brain/self-learn.js";
import { MAGMOS_BRAND } from "./magmos-brand.js";
import { launchChromium } from "../qa/playwright-launch.js";

export type LocalAdRatio = "1:1" | "4:5" | "9:16";

export interface LocalAdConcept {
  direction: string;
  headline: string;
  subheadline: string;
  cta?: string;
  subject?: string;
  /** Per-ad Venice plate prompt — never asks for text */
  platePrompt?: string;
  /** Override batch ratio */
  ratio?: LocalAdRatio;
  /** Include live UI screenshot (default: false for Goose concept layouts) */
  useUiShot?: boolean;
}

export interface LocalAdResult {
  id: string;
  projectId: string;
  concept: LocalAdConcept;
  htmlPath: string;
  pngPath: string;
  screenshotPath?: string;
  platePath?: string;
}

const RATIOS: Record<LocalAdRatio, { w: number; h: number }> = {
  "1:1": { w: 1080, h: 1080 },
  "4:5": { w: 1080, h: 1350 },
  "9:16": { w: 1080, h: 1920 },
};

const M = MAGMOS_BRAND;

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Allow intentional line breaks from concept headlines */
function linesHtml(s: string): string {
  return esc(s).replace(/\n/g, "<br/>");
}

function toFileUri(p: string): string {
  return pathToFileURL(p).href;
}

function magmosMark(opts?: { dark?: boolean; size?: "sm" | "md" }): string {
  const fill = opts?.dark ? M.ink : M.white;
  const sz = opts?.size === "sm" ? 28 : 36;
  return `<div class="magmark" style="color:${fill}">
    <svg width="${sz}" height="${sz}" viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <rect width="40" height="40" rx="10" fill="${opts?.dark ? M.ink : "rgba(255,255,255,.12)"}"/>
      <path d="M10 26V14l10 8 10-8v12" stroke="${opts?.dark ? M.mustard : M.mustard}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
    <span>${esc(M.name)}</span>
  </div>`;
}

/** Capture live product UI — grounding asset for UI-led layouts only. */
export async function captureProductScreenshot(opts: {
  url: string;
  outPath: string;
  width?: number;
  height?: number;
  waitMs?: number;
}): Promise<string> {
  const dir = dirname(opts.outPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const browser = await launchChromium({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: {
        width: opts.width ?? 1280,
        height: opts.height ?? 800,
      },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    await page.goto(opts.url, {
      waitUntil: env("SANDBOX_WAIT_UNTIL", "domcontentloaded") as
        | "domcontentloaded"
        | "networkidle"
        | "load",
      timeout: Number(env("SANDBOX_GOTO_TIMEOUT_MS", "90000")),
    });
    await page.waitForTimeout(opts.waitMs ?? 2500);
    await page.addStyleTag({
      content: `[class*="cookie"],[id*="cookie"],[class*="consent"]{display:none!important}`,
    });
    await page.screenshot({ path: opts.outPath, type: "png" });
  } finally {
    await browser.close();
  }
  return opts.outPath;
}

/** Venice photography / texture only — never bake copy. */
export async function generateAtmospherePlate(opts: {
  projectId: string;
  outName: string;
  mood?: string;
}): Promise<string | undefined> {
  if (!hasVenice() || env("LOCAL_AD_PLATE", "1") === "0") return undefined;
  const mood =
    opts.mood ??
    "Editorial lifestyle photograph, soft natural light, empty negative space for typography, premium brand campaign still";
  try {
    const img = await veniceGenerateImage(
      `${mood}. PHOTOGRAPHY / SCENE ONLY. Absolutely NO text, NO letters, NO logos, NO watermarks, NO UI chrome, NO readable screens.`,
      { outName: opts.outName, projectId: opts.projectId, force: true },
    );
    return img.path;
  } catch {
    return undefined;
  }
}

function sharedCss(w: number, h: number): string {
  return `
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=Instrument+Serif:ital@0;1&family=IBM+Plex+Sans:wght@400;500;600&display=swap');
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{width:${w}px;height:${h}px;overflow:hidden;background:${M.black}}
  #ad{width:${w}px;height:${h}px;position:relative;overflow:hidden;font-family:'IBM Plex Sans',system-ui,sans-serif}
  .magmark{display:inline-flex;align-items:center;gap:14px;font:700 28px/1 Syne,sans-serif;letter-spacing:-.02em}
  .pill{display:inline-block;background:${M.mustard};color:${M.ink};font:700 28px/1 Syne,sans-serif;padding:16px 28px;border-radius:999px}
  .plate{position:absolute;inset:0;background-size:cover;background-position:center;background-repeat:no-repeat}
  .veil{position:absolute;inset:0;pointer-events:none}
`;
}

function buildAdHtml(opts: {
  concept: LocalAdConcept;
  ratio: LocalAdRatio;
  screenshotUri?: string;
  plateUri?: string;
  brand: string;
  url: string;
}): string {
  const { w, h } = RATIOS[opts.ratio];
  const c = opts.concept;
  const d = c.direction;
  const plateBg = opts.plateUri
    ? `background-image:url('${opts.plateUri}')`
    : `background:linear-gradient(160deg,#1a1a1a,#0a0a0a)`;
  const shot = opts.screenshotUri ?? "";

  let body = "";

  if (d === "yellow_split") {
    body = `
    <div class="ysplit">
      <div class="yleft">
        <h1>${linesHtml(c.headline)}</h1>
        <div class="yfoot">${magmosMark({ dark: true })}</div>
      </div>
      <div class="yright"><div class="plate" style="${plateBg}"></div></div>
    </div>
    <style>
      .ysplit{display:grid;grid-template-columns:46% 54%;height:100%;width:100%}
      .yleft{background:${M.mustard};color:${M.ink};padding:64px 48px;display:flex;flex-direction:column;justify-content:space-between}
      .yleft h1{font:800 78px/.88 Syne,sans-serif;letter-spacing:-.045em;text-transform:uppercase;overflow-wrap:anywhere}
      .yright{position:relative;overflow:hidden}
      .yright .plate{inset:0}
      .yfoot{margin-top:auto}
    </style>`;
  } else if (d === "lifestyle_yellow") {
    body = `
    <div class="life">
      <div class="plate" style="${plateBg}"></div>
      <div class="veil" style="background:linear-gradient(90deg,rgba(232,184,74,.92) 0%,rgba(232,184,74,.55) 38%,transparent 62%)"></div>
      <svg class="blob" viewBox="0 0 400 500" aria-hidden="true"><path fill="${M.mustard}" opacity=".9" d="M40,80 C120,20 280,40 340,120 C400,200 380,360 300,440 C220,520 60,480 30,360 C0,240 -20,140 40,80Z"/><path fill="none" stroke="rgba(0,0,0,.12)" stroke-width="1" d="M60 100h200M60 140h180M60 180h160M100 100v280"/></svg>
      <div class="copy">
        <h1>${linesHtml(c.headline)}</h1>
        ${c.subheadline ? `<p class="pill">${esc(c.subheadline)}</p>` : ""}
      </div>
      <div class="bot">
        ${magmosMark()}
        <p class="foot">${esc(c.cta || "Composable yield on Sui")}</p>
      </div>
    </div>
    <style>
      .life{position:relative;width:100%;height:100%;background:#cfc8bc}
      .blob{position:absolute;left:-40px;top:8%;width:58%;height:70%;z-index:1}
      .copy{position:absolute;left:56px;top:28%;z-index:2;max-width:48%}
      .copy h1{font:800 72px/.95 Syne,sans-serif;color:${M.ink};letter-spacing:-.03em;margin-bottom:28px}
      .copy .pill{margin-top:8px}
      .bot{position:absolute;left:56px;right:56px;bottom:56px;z-index:2;display:flex;justify-content:space-between;align-items:flex-end}
      .foot{font:600 26px/1.2 'IBM Plex Sans',sans-serif;color:#fff;text-shadow:0 2px 12px rgba(0,0,0,.45)}
    </style>`;
  } else if (d === "clarity_overlay") {
    body = `
    <div class="clarity">
      <div class="plate" style="${plateBg}"></div>
      <div class="veil" style="background:linear-gradient(180deg,rgba(20,12,8,.25),rgba(20,12,8,.55))"></div>
      ${shot ? `<div class="paper"><img src="${shot}" alt=""/></div>` : ""}
      <div class="top">${magmosMark()}<h1 class="gold">${linesHtml(c.headline)}</h1></div>
      <h2 class="gold bot-h">${linesHtml(c.subheadline || "Just yield onchain.")}</h2>
      <p class="tiny">${esc(c.cta || "100% on-chain reserves, verifiable via Walrus MemWal")}</p>
    </div>
    <style>
      .clarity{position:relative;width:100%;height:100%;background:#1a1410}
      .top{position:absolute;left:56px;right:56px;top:56px;z-index:2;display:flex;justify-content:space-between;align-items:flex-start;gap:24px}
      .top h1{font:700 64px/.95 Syne,sans-serif;text-align:right;max-width:9ch}
      .gold{color:${M.mustard}}
      .bot-h{position:absolute;right:56px;bottom:140px;z-index:2;font:800 72px/.95 Syne,sans-serif;text-align:right;max-width:10ch}
      .tiny{position:absolute;left:0;right:0;bottom:48px;z-index:2;text-align:center;font:500 22px/1.3 'IBM Plex Sans',sans-serif;color:rgba(255,255,255,.85)}
      .paper{position:absolute;right:8%;bottom:18%;width:42%;z-index:1;transform:rotate(-6deg);box-shadow:0 30px 60px rgba(0,0,0,.45);border-radius:8px;overflow:hidden;border:6px solid #f5f0e8}
      .paper img{display:block;width:100%;height:auto}
    </style>`;
  } else if (d === "pain_tags") {
    const tags = ["IDLE STABLECOINS", "OPAQUE RESERVES", "LOCKUP PERIODS", "LOW YIELD"];
    body = `
    <div class="pain">
      <div class="plate" style="${plateBg}"></div>
      <h1>${linesHtml(c.headline || "Where is your\ndollar going?")}</h1>
      <div class="tags">${tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>
      <div class="br">${magmosMark({ dark: true, size: "sm" })}</div>
    </div>
    <style>
      .pain{position:relative;width:100%;height:100%;background:#d8d6d2}
      .pain h1{position:absolute;left:0;right:0;top:72px;z-index:2;text-align:center;font:700 72px/1.05 'Instrument Serif',Georgia,serif;color:${M.mustardDeep}}
      .tags{position:absolute;left:8%;right:8%;top:38%;z-index:2;display:flex;flex-wrap:wrap;gap:14px;justify-content:center;max-width:70%;margin:0 auto}
      .tag{background:#fff;color:${M.ink};font:700 20px/1 Syne,sans-serif;letter-spacing:.04em;padding:14px 18px 14px 14px;border-left:8px solid ${M.mustard};box-shadow:0 8px 24px rgba(0,0,0,.12)}
      .br{position:absolute;right:48px;bottom:48px;z-index:2}
    </style>`;
  } else if (d === "builders_night") {
    body = `
    <div class="night">
      <div class="plate" style="${plateBg}"></div>
      <div class="veil" style="background:radial-gradient(ellipse at 70% 55%,transparent 20%,rgba(0,0,0,.55) 70%)"></div>
      <h1>${linesHtml(c.headline)}</h1>
      <div class="foot">${magmosMark()}<p>${esc(c.subheadline || "Magmos is for you.")}</p></div>
    </div>
    <style>
      .night{position:relative;width:100%;height:100%;background:#050505;color:#fff}
      .night h1{position:absolute;left:64px;right:64px;top:72px;z-index:2;font:700 56px/1.15 Syne,sans-serif;letter-spacing:-.02em;max-width:18ch}
      .foot{position:absolute;left:64px;bottom:64px;z-index:2;display:flex;flex-direction:column;gap:18px}
      .foot p{font:600 28px/1 Syne,sans-serif}
    </style>`;
  } else if (d === "compound_room") {
    body = `
    <div class="room">
      <div class="plate" style="${plateBg}"></div>
      <h1 class="because">${esc(c.headline || "Because")}</h1>
      <p class="yield">${esc(c.subheadline || "YIELD SHOULD COMPOUND")}</p>
      <svg class="doodle" viewBox="0 0 200 160" fill="none" stroke="#fff" stroke-width="2.2" aria-hidden="true">
        <rect x="10" y="40" width="50" height="90"/><line x1="10" y1="60" x2="60" y2="60"/><line x1="10" y1="80" x2="60" y2="80"/>
        <rect x="80" y="20" width="70" height="50"/><path d="M95 55 L115 35 L135 50"/><circle cx="115" cy="38" r="8" fill="#fff" stroke="none"/>
        <line x1="170" y1="30" x2="170" y2="110"/><path d="M155 30 h30 v20 h-30z"/>
      </svg>
      <div class="br">${magmosMark({ dark: true, size: "sm" })}</div>
    </div>
    <style>
      .room{position:relative;width:100%;height:100%;background:#c4b8a8}
      .because{position:absolute;left:0;right:0;top:64px;z-index:2;text-align:center;font:800 96px/1 Syne,sans-serif;color:${M.mustardDeep}}
      .yield{position:absolute;left:0;right:0;top:170px;z-index:2;text-align:center;font:600 32px/1 Syne,sans-serif;letter-spacing:.18em;color:${M.mustard}}
      .doodle{position:absolute;left:50%;top:42%;transform:translateX(-50%);width:55%;opacity:.85;z-index:2;mix-blend-mode:soft-light}
      .br{position:absolute;right:48px;bottom:48px;z-index:2}
    </style>`;
  } else if (d === "spotlight_object") {
    body = `
    <div class="spot">
      <div class="plate" style="${plateBg}"></div>
      <div class="veil" style="background:radial-gradient(ellipse at 30% 20%,rgba(255,255,255,.08),transparent 50%)"></div>
      <div class="top">${magmosMark()}</div>
      <h1>${linesHtml(c.headline).replace(/reserves/i, (m) => `<span class="gold">${m}</span>`)}</h1>
      <p class="sub">${esc(c.subheadline || "Magmos keeps 100% on-chain.")}</p>
      <p class="cta">${esc(c.cta || "See verifiable reserves →")}</p>
    </div>
    <style>
      .spot{position:relative;width:100%;height:100%;background:#0c0c0c;color:#fff}
      .top{position:absolute;left:56px;top:56px;z-index:2}
      .spot h1{position:absolute;left:56px;top:160px;z-index:2;font:800 64px/.98 Syne,sans-serif;max-width:14ch;letter-spacing:-.03em}
      .gold{color:${M.mustard}}
      .sub{position:absolute;left:56px;top:480px;z-index:2;font:500 32px/1.3 'IBM Plex Sans',sans-serif;color:rgba(255,255,255,.85)}
      .cta{position:absolute;left:56px;bottom:72px;z-index:2;font:700 28px/1 Syne,sans-serif;color:${M.mustard};text-decoration:underline;text-underline-offset:8px}
    </style>`;
  } else if (d === "gazette") {
    body = `
    <div class="gaz">
      <div class="mustard-stage"></div>
      <div class="paper">
        <div class="mast">
          <p class="date">MONDAY, END OF EPOCH — SUI SPECIAL EDITION</p>
          <h1 class="title">The DeFi Gazette</h1>
        </div>
        <h2 class="hed">${linesHtml(c.headline)}</h2>
        <p class="partners">Sui · Scallop · DeepBook · Aftermath</p>
        <div class="cols">
          <p><strong>AURUM</strong> holds $1.00 — mint 1:1 from USDC. No lockups.</p>
          <p><strong>sAURUM</strong> compounds daily via accumulation index across Scallop, DeepBook, Aftermath.</p>
          <p><strong>100% on-chain</strong> reserves. Verifiable via Walrus MemWal. Native Move on Sui.</p>
        </div>
        <blockquote>“Trust-minimized. Composable. Verifiable on-chain.”</blockquote>
        <div class="gfoot">${magmosMark({ dark: true, size: "sm" })}</div>
      </div>
    </div>
    <style>
      .gaz{position:relative;width:100%;height:100%;background:${M.mustard};display:flex;align-items:center;justify-content:center;padding:48px}
      .mustard-stage{position:absolute;inset:0;background:${M.mustard}}
      .paper{position:relative;z-index:1;width:88%;height:90%;background:#f3efe6;color:${M.ink};padding:48px 52px;box-shadow:0 24px 60px rgba(0,0,0,.25);display:flex;flex-direction:column}
      .date{font:600 18px/1 'IBM Plex Sans',sans-serif;letter-spacing:.14em;text-align:center;margin-bottom:12px}
      .title{font:700 72px/1 'Instrument Serif',Georgia,serif;text-align:center;margin-bottom:28px;letter-spacing:-.02em}
      .hed{font:800 42px/1.05 Syne,sans-serif;text-align:center;text-transform:uppercase;letter-spacing:-.02em;margin-bottom:18px}
      .partners{text-align:center;font:600 20px/1 Syne,sans-serif;letter-spacing:.08em;border-top:2px solid ${M.ink};border-bottom:2px solid ${M.ink};padding:12px 0;margin-bottom:28px}
      .cols{display:grid;grid-template-columns:1fr 1fr 1fr;gap:22px;font:400 22px/1.35 'IBM Plex Sans',sans-serif;flex:1}
      blockquote{margin-top:28px;font:700 32px/1.2 'Instrument Serif',Georgia,serif;text-align:center}
      .gfoot{margin-top:24px;display:flex;justify-content:flex-end}
    </style>`;
  } else if (d === "editorial_spread") {
    body = `
    <div class="ed">
      <div class="left">${shot ? `<img src="${shot}" alt=""/>` : `<div class="plate" style="${plateBg};position:absolute;inset:0"></div>`}</div>
      <div class="right">
        <p class="eyebrow">${esc(opts.brand)}</p>
        <h1>${linesHtml(c.headline)}</h1>
        <p class="sub">${esc(c.subheadline)}</p>
        <p class="cta">${esc(c.cta || "Live on Sui")}</p>
      </div>
    </div>
    <style>
      .ed{display:grid;grid-template-columns:1.1fr 1fr;height:100%;width:100%;background:${M.black};color:#fff}
      .left{position:relative;overflow:hidden;background:#111}
      .left img{width:100%;height:100%;object-fit:cover;object-position:top}
      .right{padding:72px 56px;display:flex;flex-direction:column;justify-content:center;background:rgba(10,10,10,.92)}
      .eyebrow{font:600 22px/1 Syne,sans-serif;letter-spacing:.18em;text-transform:uppercase;color:${M.mustard};margin-bottom:18px}
      .right h1{font:800 72px/.95 Syne,sans-serif;letter-spacing:-.03em}
      .sub{margin-top:22px;font:500 32px/1.3 'IBM Plex Sans',sans-serif;color:#d7d2c8}
      .cta{margin-top:28px;font:600 26px/1 Syne,sans-serif;color:${M.mustard}}
    </style>`;
  } else if (d === "typographic") {
    body = `
    <div class="type">
      <div class="plate" style="${plateBg}"></div>
      <div class="veil" style="background:linear-gradient(160deg,rgba(5,5,8,.4),rgba(5,5,8,.82))"></div>
      <div class="inner">
        ${magmosMark()}
        <h1 class="giant">${linesHtml(c.headline)}</h1>
        <p class="sub">${esc(c.subheadline)}</p>
        ${shot ? `<div class="strip"><img src="${shot}" alt=""/></div>` : ""}
        <p class="cta">${esc(c.cta || opts.url.replace(/^https?:\/\//, ""))}</p>
      </div>
    </div>
    <style>
      .type{position:relative;width:100%;height:100%;color:#fff}
      .inner{position:relative;z-index:1;height:100%;padding:64px;display:flex;flex-direction:column;justify-content:flex-end}
      .giant{font:800 110px/.88 Syne,sans-serif;letter-spacing:-.04em;margin:24px 0 16px;max-width:12ch}
      .sub{font:500 36px/1.25 'IBM Plex Sans',sans-serif;color:#d7d2c8;max-width:20ch}
      .strip{margin-top:32px;border-radius:16px;overflow:hidden;border:1px solid rgba(255,255,255,.12);max-height:280px}
      .strip img{width:100%;height:280px;object-fit:cover;object-position:top;display:block}
      .cta{margin-top:24px;font:600 26px/1 Syne,sans-serif;color:${M.mustard}}
    </style>`;
  } else {
    /* product_hero default */
    body = `
    <div class="hero">
      <div class="plate" style="${plateBg}"></div>
      <div class="veil" style="background:linear-gradient(160deg,rgba(5,5,8,.35),rgba(5,5,8,.78))"></div>
      <div class="row">
        <div class="copy">
          <p class="eyebrow">${esc(opts.brand)}</p>
          <h1>${linesHtml(c.headline)}</h1>
          <p class="sub">${esc(c.subheadline)}</p>
          <p class="cta">${esc(c.cta || "Try Magmos →")}</p>
        </div>
        ${
          shot
            ? `<div class="device"><img src="${shot}" alt="product"/></div>`
            : ""
        }
      </div>
    </div>
    <style>
      .hero{position:relative;width:100%;height:100%;color:#fff}
      .row{position:relative;z-index:1;height:100%;padding:64px;display:flex;align-items:center;gap:40px}
      .copy{flex:1}
      .eyebrow{font:600 22px/1 Syne,sans-serif;letter-spacing:.18em;text-transform:uppercase;color:${M.mustard};margin-bottom:18px}
      .copy h1{font:800 84px/.95 Syne,sans-serif;letter-spacing:-.03em;max-width:10ch}
      .sub{margin-top:22px;font:500 34px/1.25 'IBM Plex Sans',sans-serif;color:#d7d2c8;max-width:18ch}
      .cta{margin-top:28px;font:600 26px/1 Syne,sans-serif;color:${M.mustard}}
      .device{flex:0 0 42%;border-radius:28px;overflow:hidden;box-shadow:0 30px 80px rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.12);background:#0b0d10}
      .device img{display:block;width:100%;height:auto}
    </style>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<style>${sharedCss(w, h)}</style>
</head>
<body><div id="ad">${body}</div></body>
</html>`;
}

export async function renderHtmlToPng(opts: {
  htmlPath: string;
  outPath: string;
  ratio: LocalAdRatio;
}): Promise<string> {
  const { w, h } = RATIOS[opts.ratio];
  const dir = dirname(opts.outPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const browser = await launchChromium({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: w, height: h },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    await page.goto(toFileUri(opts.htmlPath), {
      waitUntil: "networkidle",
      timeout: 30000,
    });
    await page.waitForTimeout(800);
    await page.screenshot({ path: opts.outPath, type: "png" });
  } finally {
    await browser.close();
  }
  return opts.outPath;
}

const UI_LAYOUTS = new Set([
  "product_hero",
  "editorial_spread",
  "typographic",
  "isometric",
  "clarity_overlay",
]);

function needsUiShot(c: LocalAdConcept): boolean {
  if (c.useUiShot === true) return true;
  if (c.useUiShot === false) return false;
  return UI_LAYOUTS.has(c.direction);
}

/**
 * Full local ad: optional UI → plate → HTML type → PNG.
 */
export async function composeLocalAd(opts: {
  projectId: string;
  productUrl: string;
  brand: string;
  concept: LocalAdConcept;
  ratio?: LocalAdRatio;
  screenshotPath?: string;
  workDir: string;
  index?: number;
}): Promise<LocalAdResult> {
  assertDataDir();
  const id = newId("localad");
  const ratio = opts.concept.ratio ?? opts.ratio ?? "1:1";
  const i = opts.index ?? 0;
  if (!existsSync(opts.workDir)) mkdirSync(opts.workDir, { recursive: true });

  const wantUi = needsUiShot(opts.concept);
  let shotPath: string | undefined;
  if (wantUi) {
    shotPath =
      opts.screenshotPath && existsSync(opts.screenshotPath)
        ? opts.screenshotPath
        : join(opts.workDir, `ui-capture.png`);
    if (!opts.screenshotPath || !existsSync(opts.screenshotPath)) {
      await captureProductScreenshot({
        url: opts.productUrl,
        outPath: shotPath,
      });
    } else if (opts.screenshotPath !== shotPath) {
      copyFileSync(opts.screenshotPath, shotPath);
    }
  }

  const plate = await generateAtmospherePlate({
    projectId: opts.projectId,
    outName: `plate-${opts.projectId}-${i}-${opts.concept.direction}.png`,
    mood:
      opts.concept.platePrompt ??
      (opts.projectId === "magmos"
        ? "Editorial Magmos mustard brand campaign still, soft lifestyle photography, empty negative space"
        : "Dark stealth trading desk atmosphere, empty negative space"),
  });

  let plateLocal: string | undefined;
  if (plate && existsSync(plate)) {
    plateLocal = join(opts.workDir, `plate-${i}.png`);
    copyFileSync(plate, plateLocal);
  }

  const htmlPath = join(opts.workDir, `ad-${i}-${opts.concept.direction}.html`);
  const pngPath = join(opts.workDir, `ad-${i}-${opts.concept.direction}.png`);

  const html = buildAdHtml({
    concept: opts.concept,
    ratio,
    screenshotUri: shotPath ? toFileUri(shotPath) : undefined,
    plateUri: plateLocal ? toFileUri(plateLocal) : undefined,
    brand: opts.brand,
    url: opts.productUrl,
  });
  writeFileSync(htmlPath, html, "utf8");
  await renderHtmlToPng({ htmlPath, outPath: pngPath, ratio });

  return {
    id,
    projectId: opts.projectId,
    concept: opts.concept,
    htmlPath,
    pngPath,
    screenshotPath: shotPath,
    platePath: plateLocal,
  };
}

export async function composeLocalAdBatch(opts: {
  projectId: string;
  productUrl: string;
  brand: string;
  concepts: LocalAdConcept[];
  ratio?: LocalAdRatio;
  capturePath?: string;
}): Promise<{
  dir: string;
  results: LocalAdResult[];
  screenshotPath?: string;
}> {
  assertDataDir();
  const dir = join(DATA_DIR, "exports", "local-ads", newId("lad"));
  mkdirSync(dir, { recursive: true });

  const anyUi = opts.concepts.some(needsUiShot);
  let screenshotPath: string | undefined;
  if (anyUi) {
    const captureUrl =
      opts.capturePath ??
      (opts.projectId === "magmos"
        ? opts.productUrl.replace(/\/$/, "") + "/aurum"
        : opts.productUrl);
    screenshotPath = join(dir, "ui-capture.png");
    await captureProductScreenshot({ url: captureUrl, outPath: screenshotPath });
  }

  const results: LocalAdResult[] = [];
  for (let i = 0; i < opts.concepts.length; i++) {
    const r = await composeLocalAd({
      projectId: opts.projectId,
      productUrl: opts.productUrl,
      brand: opts.brand,
      concept: opts.concepts[i],
      ratio: opts.ratio,
      screenshotPath,
      workDir: dir,
      index: i,
    });
    results.push(r);
  }

  writeFileSync(
    join(dir, "LOCAL-ADS.md"),
    [
      `# Local ads — ${opts.brand} (Goose-level local · $0 GooseWorks)`,
      `Taste bar: data/ads/reference/magmos-goose`,
      screenshotPath ? `UI capture: ${screenshotPath}` : "UI capture: skipped (concept photography layouts)",
      "",
      ...results.map(
        (r, i) =>
          `## ${i + 1}. ${r.concept.direction}\n**${r.concept.headline.replace(/\n/g, " / ")}** — ${r.concept.subheadline}\n${r.pngPath}`,
      ),
    ].join("\n"),
  );

  learn({
    projectId: opts.projectId,
    feature: "ad-maker",
    outcome: results.length ? "success" : "fail",
    summary: `Goose-level local compositor ${results.length} ads`,
    lessons: [
      "Concept photography + HTML type beats UI-paste dashboard ads",
      "Mustard Magmos brand (#E8B84A) · short stacked copy · metaphor objects",
      "Venice = plate only; never bake headlines into the image model",
      "Reject outputs that look like dashboard screenshots with labels",
    ],
  });

  return { dir, results, screenshotPath };
}
