/**
 * Goose + OSS stack orchestrator — EXECUTE skills, don't just prompt them.
 *
 * formats.json:
 *   static → remix-graphic-ad-from-reference
 *   brand-research → brand-research
 *
 * Engine cascade for static remix (no GooseWorks credits required):
 *   1. FAL gpt-image edit-on-reference (if FAL_API_KEY) — Goose Phase 2B
 *   2. HTML finish on the REAL Goose reference plate + crisp type — Phase 2A
 *   3. Local concept compositor (invented plate) — last resort
 *
 * Companion skills run as structured JSON next to every ad batch.
 */
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  copyFileSync,
  readdirSync,
} from "node:fs";
import { join, dirname, basename } from "node:path";
import { pathToFileURL } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { chromium } from "playwright";
import { DATA_DIR, XBOT_ROOT, assertDataDir, env } from "../config.js";
import { chatCompletion } from "../ai/router.js";
import { readSkillBody, getSkill } from "../skills/catalog.js";
import { learn } from "../brain/self-learn.js";
import { remember } from "../brain/memory.js";
import { magmosReferenceDir, MAGMOS_BRAND, GOOSE_LEVEL_CONCEPTS } from "./magmos-brand.js";
import {
  composeLocalAdBatch,
  type LocalAdConcept,
  type LocalAdResult,
  type LocalAdRatio,
} from "./local-ad-compositor.js";
import { newId } from "../store.js";
import { editEnginesAvailable } from "../integrations/edit-reference.js";
import { hasFal } from "../integrations/fal.js";
import { hasVenice } from "../integrations/venice.js";
import { hasOpenAI } from "../config.js";

const execFileAsync = promisify(execFile);

export type GooseFormat = "static" | "brand-research" | "imessage" | "chatgpt" | "apple-notes";

export interface StackProbe {
  gooseRoot: string | null;
  formats: Record<string, string>;
  skillBodies: Record<string, boolean>;
  fal: boolean;
  venice: boolean;
  openai: boolean;
  editEngines: string[];
  gooseGraphicsScreenshot: string | null;
  referenceAds: string[];
  ossHonesty: string[];
}

export interface RemixJob {
  referencePath: string;
  conceptId: string;
  layout: string;
  headline: string;
  subheadline: string;
  cta?: string;
  ratio: LocalAdRatio;
}

export interface StackAdResult {
  engine: "venice-edit" | "openai-edit" | "fal-edit" | "ref-html-finish" | "local-concept";
  format: GooseFormat;
  skill: string;
  pngPath: string;
  referencePath?: string;
  concept: RemixJob;
}

export interface StackBatchResult {
  dir: string;
  format: GooseFormat;
  probe: StackProbe;
  ads: StackAdResult[];
  companions: {
    anglesPath?: string;
    metaBriefPath?: string;
    stackReportPath: string;
  };
  log: string[];
}

const SKILL_ALIASES: Record<string, string> = {
  "meta-ads": "meta-ads-campaign-builder",
  "trending-ad-hook": "trending-ad-hook-spotter",
  ugc: "ugc-filmloop",
  "paid-channel": "paid-channel-prioritizer",
};

const REF_TO_CONCEPT: Array<{ match: RegExp; conceptId: string }> = [
  { match: /masks|yellow.?split|hello/i, conceptId: "yellow-split-hello" },
  { match: /hero|lifestyle|earns/i, conceptId: "lifestyle-earns" },
  { match: /clarity|jargon|lockups/i, conceptId: "clarity-no-jargon" },
  { match: /dollar.?going|where|wallet|pain/i, conceptId: "dollar-leaking" },
  { match: /builders|late.?night/i, conceptId: "late-night-builders" },
  { match: /compound/i, conceptId: "compound-dreams" },
  { match: /hidden|reserves|spend/i, conceptId: "hidden-reserves" },
  { match: /gazette|defi/i, conceptId: "defi-gazette" },
];

export function resolveGooseRoot(): string | null {
  const fromVendor = join(XBOT_ROOT, "vendor", "goose-skills", "ROOT.txt");
  if (existsSync(fromVendor)) {
    const root = readFileSync(fromVendor, "utf8").trim();
    if (root && existsSync(root)) return root;
  }
  const desktop = "c:\\Users\\RICHEY_SON\\Desktop\\goose-skills";
  if (existsSync(desktop)) return desktop;
  const agents = join(XBOT_ROOT, ".agents", "skills");
  if (existsSync(agents)) return agents;
  return null;
}

export function loadFormatsMap(): Record<string, string> {
  const root = resolveGooseRoot();
  const candidates = [
    root ? join(root, "formats.json") : "",
    join(XBOT_ROOT, "vendor", "goose-skills", "formats.json"),
  ].filter(Boolean);
  for (const p of candidates) {
    if (existsSync(p)) {
      try {
        return JSON.parse(readFileSync(p, "utf8")) as Record<string, string>;
      } catch {
        /* skip */
      }
    }
  }
  return {
    static: "skills/ads/composites/remix-graphic-ad-from-reference",
    "brand-research": "skills/ads/composites/brand-research",
  };
}

export function resolveSkillSlug(slugOrAlias: string): string {
  return SKILL_ALIASES[slugOrAlias] ?? slugOrAlias;
}

export function gooseGraphicsScreenshotPath(): string | null {
  const root = resolveGooseRoot();
  if (!root) return null;
  const p = join(root, "skills", "design", "composites", "goose-graphics", "screenshot", "screenshot.js");
  return existsSync(p) ? p : null;
}

export function probeStack(): StackProbe {
  const gooseRoot = resolveGooseRoot();
  const formats = loadFormatsMap();
  const skillBodies: Record<string, boolean> = {};
  for (const slug of [
    "remix-graphic-ad-from-reference",
    "goose-graphics",
    "brand-research",
    "ad-angle-miner",
    "meta-ads-campaign-builder",
    "trending-ad-hook-spotter",
    "ugc-filmloop",
  ]) {
    skillBodies[slug] = Boolean(readSkillBody(slug, 200) || getSkill(slug));
  }
  const refDir = magmosReferenceDir();
  const referenceAds = existsSync(refDir)
    ? readdirSync(refDir).filter((f) => /\.(png|jpg|webp)$/i.test(f))
    : [];
  const ossHonesty = [
    "goose-skills: EXECUTE via goose-stack (formats → remix) — not prompt-only",
    "Edit-on-ref cascade: Venice /image/edit → OpenAI images/edits → FAL (FAL optional)",
    "Video formats: create-imessage/chatgpt/apple-notes-mockup + HyperFrames in pack",
    "goldmine: catalog bookmarks unless a lab is imported",
    "ad-maker Branda: pattern + TinyFish + this stack, not their SaaS binary",
  ];
  return {
    gooseRoot,
    formats,
    skillBodies,
    fal: hasFal(),
    venice: hasVenice(),
    openai: hasOpenAI(),
    editEngines: editEnginesAvailable(),
    gooseGraphicsScreenshot: gooseGraphicsScreenshotPath(),
    referenceAds,
    ossHonesty,
  };
}

function conceptById(id: string) {
  return GOOSE_LEVEL_CONCEPTS.find((c) => c.id === id) ?? GOOSE_LEVEL_CONCEPTS[0];
}

function jobsFromReferences(): RemixJob[] {
  const refDir = magmosReferenceDir();
  if (!existsSync(refDir)) return [];
  const files = readdirSync(refDir).filter((f) => /\.(png|jpg|webp)$/i.test(f));
  const jobs: RemixJob[] = [];
  const used = new Set<string>();
  for (const f of files) {
    const hit = REF_TO_CONCEPT.find((r) => r.match.test(f));
    const conceptId = hit?.conceptId ?? "lifestyle-earns";
    if (used.has(conceptId)) continue;
    used.add(conceptId);
    const c = conceptById(conceptId);
    jobs.push({
      referencePath: join(refDir, f),
      conceptId: c.id,
      layout: c.layout,
      headline: c.headline,
      subheadline: c.subheadline,
      cta: c.cta,
      ratio: c.ratio,
    });
  }
  return jobs;
}

function defaultJobs(): RemixJob[] {
  return GOOSE_LEVEL_CONCEPTS.slice(0, 6).map((c) => ({
    referencePath: "",
    conceptId: c.id,
    layout: c.layout,
    headline: c.headline,
    subheadline: c.subheadline,
    cta: c.cta,
    ratio: c.ratio,
  }));
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function linesHtml(s: string): string {
  return esc(s).replace(/\n/g, "<br/>");
}

const RATIOS: Record<LocalAdRatio, { w: number; h: number; gg: string }> = {
  "1:1": { w: 1080, h: 1080, gg: "carousel" },
  "4:5": { w: 1080, h: 1350, gg: "poster" },
  "9:16": { w: 1080, h: 1920, gg: "story" },
};

/** Goose Phase 2A — finish crisp Magmos type on the REAL reference ad plate. */
async function finishReferenceWithHtml(opts: {
  job: RemixJob;
  workDir: string;
  index: number;
}): Promise<string> {
  const { w, h, gg } = RATIOS[opts.job.ratio];
  const plateUri = pathToFileURL(opts.job.referencePath).href;
  const htmlPath = join(opts.workDir, `remix-${opts.index}-finish.html`);
  const pngPath = join(opts.workDir, `remix-${opts.index}-finish.png`);

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/>
<style>
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=IBM+Plex+Sans:wght@500;600&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${w}px;height:${h}px;overflow:hidden}
#ad{width:${w}px;height:${h}px;position:relative;background:#111}
.plate{position:absolute;inset:0;background:url('${plateUri}') center/cover no-repeat}
/* Soft veil so new Magmos type reads — keeps reference composition visible */
.veil{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.15),rgba(0,0,0,.35))}
.copy{position:absolute;left:48px;right:48px;top:48px;z-index:2;color:#fff;text-shadow:0 2px 18px rgba(0,0,0,.55)}
h1{font:800 56px/.95 Syne,sans-serif;letter-spacing:-.03em;max-width:14ch}
.sub{margin-top:16px;font:600 28px/1.25 'IBM Plex Sans',sans-serif;color:${MAGMOS_BRAND.mustard}}
.mark{position:absolute;left:48px;bottom:48px;z-index:2;display:flex;align-items:center;gap:12px;
  font:700 26px/1 Syne,sans-serif;color:#fff}
.mark i{display:inline-block;width:36px;height:36px;border-radius:10px;background:${MAGMOS_BRAND.mustard}}
.cta{position:absolute;right:48px;bottom:52px;z-index:2;font:600 22px/1 Syne,sans-serif;color:${MAGMOS_BRAND.mustard}}
</style></head>
<body><div id="ad">
  <div class="plate"></div>
  <div class="veil"></div>
  <div class="copy">
    <h1>${linesHtml(opts.job.headline)}</h1>
    ${opts.job.subheadline ? `<p class="sub">${esc(opts.job.subheadline)}</p>` : ""}
  </div>
  <div class="mark"><i></i> ${esc(MAGMOS_BRAND.name)}</div>
  ${opts.job.cta ? `<p class="cta">${esc(opts.job.cta)}</p>` : ""}
</div></body></html>`;
  writeFileSync(htmlPath, html, "utf8");

  const ggScript = gooseGraphicsScreenshotPath();
  if (ggScript && env("GOOSE_GRAPHICS", "1") !== "0") {
    try {
      await execFileAsync(
        process.execPath,
        [ggScript, "--format", gg, "--input", htmlPath, "--output", pngPath, "--font-delay", "1200"],
        { timeout: 120_000, cwd: dirname(ggScript) },
      );
      if (existsSync(pngPath)) return pngPath;
    } catch {
      /* fall through to Playwright */
    }
  }

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: w, height: h },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(700);
    await page.screenshot({ path: pngPath, type: "png" });
  } finally {
    await browser.close();
  }
  return pngPath;
}

async function remixOne(opts: {
  job: RemixJob;
  workDir: string;
  index: number;
  productUrl: string;
  log: string[];
}): Promise<StackAdResult> {
  const skill = "remix-graphic-ad-from-reference";
  const format: GooseFormat = "static";

  // Phase 2B — edit-on-reference cascade (Venice → OpenAI → FAL)
  if (opts.job.referencePath && existsSync(opts.job.referencePath)) {
    try {
      const { editReferenceImage, editEnginesAvailable } = await import(
        "../integrations/edit-reference.js"
      );
      if (editEnginesAvailable().length) {
        const prompt = [
          "Edit this reference ad. KEEP layout, composition, camera, lighting, and visual energy EXACTLY.",
          "Replace on-image text with Magmos copy only:",
          `headline: ${opts.job.headline.replace(/\n/g, " / ")}`,
          `sub: ${opts.job.subheadline}`,
          opts.job.cta ? `cta: ${opts.job.cta}` : "",
          "Brand Magmos mustard yellow #E8B84A + black + white. SaaS yield-dollar on Sui — no hardware gadgets.",
          "Spell every word correctly. Clear old text; do not invent new layout zones.",
        ]
          .filter(Boolean)
          .join(" ");
        const out = join(opts.workDir, `remix-${opts.index}-edit.png`);
        const edited = await editReferenceImage({
          referencePath: opts.job.referencePath,
          prompt,
          outPath: out,
          aspect: opts.job.ratio,
          projectId: "magmos",
        });
        opts.log.push(`${edited.engine}-edit ← ${basename(opts.job.referencePath)}`);
        const engineMap = {
          venice: "venice-edit",
          openai: "openai-edit",
          fal: "fal-edit",
        } as const;
        return {
          engine: engineMap[edited.engine],
          format,
          skill,
          pngPath: edited.path,
          referencePath: opts.job.referencePath,
          concept: opts.job,
        };
      }
    } catch (e) {
      opts.log.push(`edit-on-ref failed → HTML finish: ${e instanceof Error ? e.message : e}`);
    }
  }

  // Phase 2A — finish on real Goose reference
  if (opts.job.referencePath && existsSync(opts.job.referencePath)) {
    const png = await finishReferenceWithHtml({
      job: opts.job,
      workDir: opts.workDir,
      index: opts.index,
    });
    opts.log.push(`ref-html-finish ← ${basename(opts.job.referencePath)} (+ goose-graphics or Playwright)`);
    return {
      engine: "ref-html-finish",
      format,
      skill,
      pngPath: png,
      referencePath: opts.job.referencePath,
      concept: opts.job,
    };
  }

  // Last resort — local concept compositor
  const batch = await composeLocalAdBatch({
    projectId: "magmos",
    productUrl: opts.productUrl,
    brand: MAGMOS_BRAND.name,
    concepts: [
      {
        direction: opts.job.layout,
        headline: opts.job.headline,
        subheadline: opts.job.subheadline,
        cta: opts.job.cta,
        platePrompt: conceptById(opts.job.conceptId).platePrompt,
        ratio: opts.job.ratio,
        useUiShot: conceptById(opts.job.conceptId).useUiShot,
      } satisfies LocalAdConcept,
    ],
    ratio: opts.job.ratio,
  });
  const r = batch.results[0] as LocalAdResult;
  const dest = join(opts.workDir, `remix-${opts.index}-local.png`);
  copyFileSync(r.pngPath, dest);
  opts.log.push(`local-concept ← ${opts.job.layout}`);
  return {
    engine: "local-concept",
    format,
    skill,
    pngPath: dest,
    concept: opts.job,
  };
}

/** Run companion Goose skills as structured JSON (executable output, not wallpaper). */
async function runCompanionSkills(opts: {
  workDir: string;
  projectId: string;
  ads: StackAdResult[];
  log: string[];
}): Promise<{ anglesPath?: string; metaBriefPath?: string }> {
  const summary = opts.ads
    .map(
      (a, i) =>
        `${i + 1}. [${a.engine}] ${a.concept.conceptId}: ${a.concept.headline.replace(/\n/g, " ")}`,
    )
    .join("\n");

  let anglesPath: string | undefined;
  let metaBriefPath: string | undefined;

  const angleSlug = resolveSkillSlug("ad-angle-miner");
  const angleBody = readSkillBody(angleSlug, 3500) || "";
  try {
    const llm = await chatCompletion(
      "ad-maker",
      `${angleBody.slice(0, 2800)}

You ARE executing skill ${angleSlug} for Magmos AURUM/sAURUM on Sui.
Ads just produced:
${summary}

Return JSON only:
{"angles":[{"hook":"...","proof":"...","cta":"...","channel":"meta|x|tiktok"}],"never_say":["APY","Compostible"],"steal_from_goose_refs":["..."]}
Exactly 5 angles.`,
      { context: opts.projectId, projectId: opts.projectId, feature: "ad-maker", failover: true },
    );
    anglesPath = join(opts.workDir, "SKILL-ad-angle-miner.json");
    writeFileSync(anglesPath, llm.content.replace(/```json|```/g, "").trim());
    opts.log.push(`Executed companion skill: ${angleSlug}`);
  } catch (e) {
    opts.log.push(`ad-angle-miner skip: ${e instanceof Error ? e.message : e}`);
  }

  const metaSlug = resolveSkillSlug("meta-ads");
  const metaBody = readSkillBody(metaSlug, 3500) || "";
  try {
    const llm = await chatCompletion(
      "ad-maker",
      `${metaBody.slice(0, 2800)}

You ARE executing skill ${metaSlug} for Magmos.
Creatives:
${summary}

Return JSON only:
{"campaign":{"objective":"waitlist|traffic","budget_daily_usd":20,"audiences":["..."],"placements":["feed","stories"],"primary_texts":["..."],"headlines":["..."],"cta_button":"Learn More","compliance_notes":["no APY"]}}`,
      { context: opts.projectId, projectId: opts.projectId, feature: "ad-maker", failover: true },
    );
    metaBriefPath = join(opts.workDir, "SKILL-meta-ads-campaign-builder.json");
    writeFileSync(metaBriefPath, llm.content.replace(/```json|```/g, "").trim());
    opts.log.push(`Executed companion skill: ${metaSlug}`);
  } catch (e) {
    opts.log.push(`meta-ads brief skip: ${e instanceof Error ? e.message : e}`);
  }

  return { anglesPath, metaBriefPath };
}

/**
 * Full Magmos still-ad stack: formats.static → remix skill cascade + companions.
 */
export async function runGooseStaticStack(opts: {
  projectId: string;
  productUrl: string;
  brand: string;
  limit?: number;
}): Promise<StackBatchResult> {
  assertDataDir();
  const log: string[] = [];
  const probe = probeStack();
  const format: GooseFormat = (env("AD_FORMAT", "static") as GooseFormat) || "static";
  const formats = probe.formats;
  const skillPath = formats[format] ?? formats.static;
  log.push(`format=${format} → ${skillPath}`);
  log.push(`gooseRoot=${probe.gooseRoot ?? "(missing)"} · editEngines=${editEnginesAvailable().join("+") || "none"} · refs=${probe.referenceAds.length}`);
  log.push(
    `Venice=${hasVenice()} OpenAI=${hasOpenAI()} FAL=${hasFal()} · goose-graphics=${probe.gooseGraphicsScreenshot ? "yes" : "no"}`,
  );

  const dir = join(DATA_DIR, "exports", "goose-stack", newId("gstk"));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "PROBE.json"), JSON.stringify(probe, null, 2));

  let jobs = jobsFromReferences();
  if (!jobs.length) {
    log.push("No Goose refs on disk — falling back to concept jobs (local compositor)");
    jobs = defaultJobs();
  }
  jobs = jobs.slice(0, opts.limit ?? 6);

  const ads: StackAdResult[] = [];
  for (let i = 0; i < jobs.length; i++) {
    const ad = await remixOne({
      job: jobs[i],
      workDir: dir,
      index: i,
      productUrl: opts.productUrl,
      log,
    });
    const dest = join(dir, `ad-${i}-${ad.concept.layout}.png`);
    copyFileSync(ad.pngPath, dest);
    ads.push({ ...ad, pngPath: dest });
  }

  const companions = await runCompanionSkills({
    workDir: dir,
    projectId: opts.projectId,
    ads,
    log,
  });

  const stackReportPath = join(dir, "STACK.md");
  writeFileSync(
    stackReportPath,
    [
      `# Goose stack run — ${opts.brand}`,
      `Format: \`${format}\` → \`${skillPath}\``,
      `Engines used: ${[...new Set(ads.map((a) => a.engine))].join(", ")}`,
      "",
      "## Probe",
      `- Goose root: ${probe.gooseRoot}`,
      `- Edit engines: ${probe.editEngines.join(" → ") || "none"} (Venice=${probe.venice} OpenAI=${probe.openai} FAL=${probe.fal})`,
      `- goose-graphics: ${probe.gooseGraphicsScreenshot ?? "missing"}`,
      `- Reference ads: ${probe.referenceAds.join(", ") || "(none)"}`,
      "",
      "## Honesty",
      ...probe.ossHonesty.map((l) => `- ${l}`),
      "",
      "## Ads",
      ...ads.map(
        (a, i) =>
          `${i + 1}. **${a.engine}** · ${a.concept.conceptId} · ref=${a.referencePath ? basename(a.referencePath) : "—"} → ${a.pngPath}`,
      ),
      "",
      "## Companion skill outputs",
      companions.anglesPath ? `- ${companions.anglesPath}` : "- angles: (skipped)",
      companions.metaBriefPath ? `- ${companions.metaBriefPath}` : "- meta brief: (skipped)",
      "",
      "## Log",
      ...log.map((l) => `- ${l}`),
    ].join("\n"),
  );

  remember({
    kind: "insight",
    title: "Goose stack executed (not prompt-only)",
    importance: 5,
    source: "goose-stack",
    tags: ["goose", "stack", "ad-maker", opts.projectId],
    body: `format=${format}; engines=${ads.map((a) => a.engine).join(",")}; refs=${probe.referenceAds.length}; fal=${probe.fal}`,
  });

  learn({
    projectId: opts.projectId,
    feature: "ad-maker",
    outcome: ads.length ? "success" : "fail",
    summary: `goose-stack ${format}: ${ads.length} ads · engines ${[...new Set(ads.map((a) => a.engine))].join("+")}`,
    lessons: [
      "EXECUTE formats.json → remix-graphic-ad-from-reference — do not only inject SKILL.md into prompts",
      "Cascade: FAL edit-on-ref → HTML finish on Goose ref (+ goose-graphics screenshot) → local concept",
      "Companion skills write JSON artifacts (ad-angle-miner, meta-ads-campaign-builder)",
      ...probe.ossHonesty.slice(0, 2),
    ],
    meta: { dir, engines: ads.map((a) => a.engine) },
  });

  return {
    dir,
    format,
    probe,
    ads,
    companions: { ...companions, stackReportPath },
    log,
  };
}

/** Resolve dead aliases when searching skills for prompts. */
export function expandSkillQueries(queries: string[]): string[] {
  const out: string[] = [];
  for (const q of queries) {
    out.push(q);
    const alias = SKILL_ALIASES[q];
    if (alias) out.push(alias);
  }
  return out;
}

export function formatStackProbe(p: StackProbe = probeStack()): string {
  return [
    `# Goose + OSS stack probe`,
    `Goose root: ${p.gooseRoot ?? "(missing)"}`,
    `Edit engines: ${p.editEngines.join(" → ") || "(none — set VENICE_API_KEY)"}`,
    `  Venice: ${p.venice} · OpenAI: ${p.openai} · FAL: ${p.fal}`,
    `goose-graphics: ${p.gooseGraphicsScreenshot ?? "(missing)"}`,
    `Refs: ${p.referenceAds.length} — ${p.referenceAds.join(", ") || "none"}`,
    "",
    "## formats.json",
    ...Object.entries(p.formats).map(([k, v]) => `- ${k} → ${v}`),
    "",
    "## Skill bodies resolvable",
    ...Object.entries(p.skillBodies).map(([k, ok]) => `- ${k}: ${ok ? "yes" : "NO"}`),
    "",
    "## Honesty",
    ...p.ossHonesty.map((l) => `- ${l}`),
  ].join("\n");
}
