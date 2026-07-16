/**
 * Ad-maker (Branda pattern) — domain → on-brand still ads.
 * Brand research: TinyFish fetch/search (default) · optional Context.dev if key present.
 * Images: Venice (default) · poster fallback.
 * Flow kept; backends swappable — never drop this capability.
 */
import { writeFileSync, mkdirSync, existsSync, readFileSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR, assertDataDir, env, XBOT_ROOT } from "../config.js";
import { newId } from "../store.js";
import { getProject } from "../projects/registry.js";
import { chatCompletion } from "../ai/router.js";
import { hasVenice, veniceGenerateImage } from "../integrations/venice.js";
import { generatePoster } from "../generate/poster.js";
import { hasTinyfish, tinyfishFetchText, tinyfishSearch } from "../research/tinyfish.js";
import { remember } from "../brain/memory.js";
import { learn } from "../brain/self-learn.js";
import { smartCritique } from "../brain/smart.js";
import { prepareUnifiedSystem, unifiedContextSuffix } from "../brain/unified-context.js";
import { composeLocalAdBatch } from "./local-ad-compositor.js";
import {
  GOOSE_LEVEL_CONCEPTS,
  ingestGooseMagmosReferences,
} from "./magmos-brand.js";
import { runGooseStaticStack, probeStack } from "./goose-stack.js";

export const AD_MAKER_REPO = "https://github.com/context-dot-dev/ad-maker";

export interface AdMakerConcept {
  direction: string;
  headline: string;
  subheadline: string;
  subject: "company" | "product";
  productName?: string;
}

export interface AdMakerRun {
  id: string;
  domain: string;
  projectId: string;
  concepts: AdMakerConcept[];
  images: Array<{ concept: AdMakerConcept; path: string }>;
  outputPath: string;
  status: "done" | "partial" | "failed";
  log: string[];
}

const DIRECTIONS = [
  "yellow_split",
  "lifestyle_yellow",
  "clarity_overlay",
  "pain_tags",
  "builders_night",
  "compound_room",
  "spotlight_object",
  "gazette",
  "product_hero",
  "typographic",
  "editorial_spread",
] as const;

/** Magmos default = Goose taste bar concepts (mustard, metaphor, short copy). */
function magmosGooseConcepts(): AdMakerConcept[] {
  return GOOSE_LEVEL_CONCEPTS.slice(0, 6).map((c) => ({
    direction: c.layout,
    headline: c.headline,
    subheadline: c.subheadline || c.cta || "Composable yield on Sui",
    subject: "product" as const,
    productName: "AURUM",
  }));
}

function hasContextDev(): boolean {
  return Boolean(env("CONTEXT_DEV_API_KEY")?.trim());
}

/** Primary brand research via TinyFish; Context.dev only if key set. */
async function fetchBrandContext(domain: string): Promise<{
  name?: string;
  description?: string;
  homepageMd?: string;
  backend: "tinyfish" | "context.dev" | "none";
}> {
  const out: {
    name?: string;
    description?: string;
    homepageMd?: string;
    backend: "tinyfish" | "context.dev" | "none";
  } = { backend: "none" };

  if (hasTinyfish()) {
    try {
      const homepageMd = await tinyfishFetchText(`https://${domain}`);
      out.homepageMd = homepageMd.slice(0, 4000);
      out.backend = "tinyfish";
      const hits = await tinyfishSearch(`${domain} brand product`, 3);
      out.description = hits.map((h) => h.snippet ?? h.title).filter(Boolean).join(" · ").slice(0, 600);
      out.name = domain.split(".")[0];
    } catch {
      /* fall through */
    }
  }

  if (out.backend === "none" && hasContextDev()) {
    const key = env("CONTEXT_DEV_API_KEY");
    const base = env("CONTEXT_DEV_API_URL", "https://api.context.dev");
    try {
      const brandRes = await fetch(`${base}/v1/brand`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ type: "by_domain", domain }),
      });
      if (brandRes.ok) {
        const j = (await brandRes.json()) as {
          data?: { name?: string; description?: string };
          name?: string;
          description?: string;
        };
        out.name = j.data?.name ?? j.name;
        out.description = j.data?.description ?? j.description;
        out.backend = "context.dev";
      }
    } catch {
      /* optional */
    }
    try {
      const mdRes = await fetch(`${base}/v1/web/markdown`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ url: `https://${domain}`, useMainContentOnly: true }),
      });
      if (mdRes.ok) {
        const j = (await mdRes.json()) as { data?: string; markdown?: string };
        out.homepageMd = (j.data ?? j.markdown ?? "").slice(0, 4000);
        out.backend = "context.dev";
      }
    } catch {
      /* optional */
    }
  }

  return out;
}

export async function planAdMakerConcepts(
  domain: string,
  projectId: string,
): Promise<AdMakerConcept[]> {
  // Magmos gold standard = distilled Goose dashboard ads (concept > UI paste).
  if (projectId === "magmos" && env("AD_CONCEPTS", "goose") !== "llm") {
    return magmosGooseConcepts();
  }

  const project = getProject(projectId);
  const brand = await fetchBrandContext(domain);
  const unified = prepareUnifiedSystem({
    projectId,
    task: "ad-maker",
    feature: "ad-maker",
  });
  const knowledgePath = join(XBOT_ROOT, "knowledge", `${projectId}.md`);
  const knowledge = existsSync(knowledgePath)
    ? readFileSync(knowledgePath, "utf8").slice(0, 2000)
    : "";

  const context = [
    `Domain: ${domain}`,
    `Project: ${project.name} — ${project.tagline}`,
    brand.name ? `Brand: ${brand.name}` : "",
    brand.description ? `Desc: ${brand.description}` : "",
    brand.homepageMd ? `Homepage:\n${brand.homepageMd.slice(0, 2500)}` : "",
    knowledge ? `Product truth:\n${knowledge}` : "",
    `Unified OS context file: ${unified.paths.contextFile}`,
    `Prior lessons: ${unified.lessons.slice(0, 6).join(" | ")}`,
    `TASTE BAR: match Goose Magmos ads — mustard #E8B84A, metaphor/lifestyle/editorial, short stacked copy, Magmos wordmark.`,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const llm = await chatCompletion(
      "ad-maker",
      `${context}

${unified.promptBlock.slice(0, 5000)}

You follow Goose Magmos gold-standard ads (concept photography + crisp type), NOT dashboard screenshots with labels:
- Directions must be from: ${DIRECTIONS.join(" | ")}
- Mustard yellow brand energy. Short stacked headlines (line breaks OK as \\n).
- Spell COMPOSABLE correctly (never Compostible). No APY.
- Concept > UI paste. Metaphor, lifestyle, editorial newspaper, builders night, pain tags.

Return JSON:
{"concepts":[{"direction":"one of the directions above","headline":"punchy","subheadline":"short","subject":"company|product","productName":"optional"}]}

Exactly 4–6 concepts. Distinct directions.`,
      { context: projectId, projectId, feature: "ad-maker", failover: true },
    );
    const parsed = JSON.parse(llm.content.replace(/```json|```/g, "").trim()) as {
      concepts?: AdMakerConcept[];
    };
    if (parsed.concepts?.length) return parsed.concepts.slice(0, 6);
  } catch {
    /* fallback */
  }

  return magmosGooseConcepts().slice(0, 4);
}

function buildAdImagePrompt(
  c: AdMakerConcept,
  projectName: string,
  projectId: string,
): string {
  const isMagmos = projectId === "magmos";
  return [
    `Static social ad 1:1 (Goose remix-graphic-ad / format=static, remix_mode=ui).`,
    `Direction=${c.direction}.`,
    `EXACT on-image copy only: headline "${c.headline}" · sub "${c.subheadline}". Spell every word correctly.`,
    isMagmos
      ? "Show Magmos Labs WEB forge dashboard / AURUM composable-dollar UI in frame (dark industrial SaaS). NEVER invent physical gadgets, speakers, cubes, or fake product hardware. NEVER write Compostible."
      : "Show real product UI / screen POV. No fake faces.",
    `Brand: ${projectName}. No people faces. No APY promises. No hex codes printed.`,
    "Premium fintech editorial — high contrast, sharp type, scrap prior generic coin-splash looks if they fight the UI hero.",
  ].join(" ");
}

export async function runAdMaker(opts: {
  projectId: string;
  domain?: string;
}): Promise<AdMakerRun> {
  const id = newId("branda");
  const log: string[] = [];
  const projectId = opts.projectId || "magmos";
  const project = getProject(projectId);
  const domain =
    opts.domain ||
    (() => {
      try {
        return new URL(project.primaryUrl).hostname;
      } catch {
        return "magmoslabs.vercel.app";
      }
    })();

  assertDataDir();
  const dir = join(DATA_DIR, "exports", "ad-maker", id);
  mkdirSync(dir, { recursive: true });

  const gooseRefs =
    projectId === "magmos" ? ingestGooseMagmosReferences() : { files: 0, lessons: [] as string[] };

  const unified = prepareUnifiedSystem({
    projectId,
    task: "ad-maker",
    feature: "ad-maker",
  });
  writeFileSync(join(dir, "UNIFIED.md"), unified.promptBlock.slice(0, 12000));

  const brand = await fetchBrandContext(domain);
  log.push(`ad-maker · Goose taste bar + local compositor · ${AD_MAKER_REPO}`);
  log.push(
    `Unified OS: ${unified.skillCatalogCount} skills · brain ${unified.brainSeeded} · lessons ${unified.lessons.length}`,
  );
  if (gooseRefs.files) {
    log.push(`Goose Magmos refs ingested: ${gooseRefs.files} → data/ads/reference/magmos-goose`);
  }
  log.push(
    `Domain: ${domain} · research: ${brand.backend}` +
      (brand.backend === "none" ? " (LLM + project registry)" : ""),
  );

  const concepts = await planAdMakerConcepts(domain, projectId);
  log.push(`Concepts: ${concepts.length}`);
  writeFileSync(join(dir, "concepts.json"), JSON.stringify(concepts, null, 2));
  remember({
    kind: "insight",
    title: `Ad-maker run ${domain}`,
    importance: 3,
    source: "ad-maker",
    tags: ["ad-maker", projectId, domain],
    body: concepts.map((c) => `${c.direction}: ${c.headline} — ${c.subheadline}`).join("\n"),
  });

  const images: AdMakerRun["images"] = [];
  // Default stack: formats.json `static` → remix-graphic-ad-from-reference (EXECUTED).
  // AD_ENGINE=local → concept compositor only. AD_ENGINE=venice → text-in-image.
  // AD_ENGINE=stack|goose (default for magmos) → full Goose+OSS stack.
  const engine = env(
    "AD_ENGINE",
    projectId === "magmos" ? "stack" : "local",
  ).toLowerCase();
  const useStack = engine === "stack" || engine === "goose" || engine === "full";
  const useLocal = engine === "local";

  if (useStack) {
    log.push("Engine: GOOSE STACK (formats.static → remix + companions) — $0 GooseWorks");
    try {
      const stack = await runGooseStaticStack({
        projectId,
        productUrl: project.primaryUrl,
        brand: project.name,
        limit: Math.max(concepts.length, 6),
      });
      writeFileSync(join(dir, "STACK.md"), readFileSync(stack.companions.stackReportPath, "utf8"));
      if (stack.companions.anglesPath && existsSync(stack.companions.anglesPath)) {
        copyFileSync(stack.companions.anglesPath, join(dir, "SKILL-ad-angle-miner.json"));
      }
      if (stack.companions.metaBriefPath && existsSync(stack.companions.metaBriefPath)) {
        copyFileSync(stack.companions.metaBriefPath, join(dir, "SKILL-meta-ads-campaign-builder.json"));
      }
      writeFileSync(join(dir, "PROBE.json"), JSON.stringify(stack.probe, null, 2));
      for (let i = 0; i < stack.ads.length; i++) {
        const a = stack.ads[i];
        const dest = join(dir, `ad-${i}-${a.concept.layout}.png`);
        copyFileSync(a.pngPath, dest);
        const veniceMirror = join(
          DATA_DIR,
          "exports",
          "venice",
          `ad-${i}-${a.concept.layout}.png`,
        );
        mkdirSync(join(DATA_DIR, "exports", "venice"), { recursive: true });
        copyFileSync(a.pngPath, veniceMirror);
        images.push({
          concept: {
            direction: a.concept.layout,
            headline: a.concept.headline,
            subheadline: a.concept.subheadline,
            subject: "product",
            productName: "AURUM",
          },
          path: dest,
        });
        log.push(`Stack ad [${a.engine}]: ${dest}`);
      }
      log.push(...stack.log);
    } catch (e) {
      log.push(
        `Goose stack failed — falling back to local compositor: ${e instanceof Error ? e.message : e}`,
      );
    }
  }

  if (!images.length && (useLocal || useStack)) {
    log.push("Engine: LOCAL Goose-level (plates + HTML type + mustard brand) — $0 GooseWorks");
    try {
      const gooseByLayout = new Map(GOOSE_LEVEL_CONCEPTS.map((g) => [g.layout, g]));
      const batch = await composeLocalAdBatch({
        projectId,
        productUrl: project.primaryUrl,
        brand: project.name,
        concepts: concepts.map((c) => {
          const g = gooseByLayout.get(c.direction);
          return {
            direction: c.direction,
            headline: c.headline,
            subheadline: c.subheadline,
            cta: g?.cta ?? (projectId === "magmos" ? "magmoslabs.vercel.app" : undefined),
            subject: c.subject,
            platePrompt: g?.platePrompt,
            ratio: g?.ratio,
            useUiShot: g?.useUiShot ?? false,
          };
        }),
      });
      writeFileSync(join(dir, "LOCAL-BATCH.md"), readFileSync(join(batch.dir, "LOCAL-ADS.md"), "utf8"));
      if (batch.screenshotPath && existsSync(batch.screenshotPath)) {
        copyFileSync(batch.screenshotPath, join(dir, "ui-capture.png"));
      }
      for (let i = 0; i < batch.results.length; i++) {
        const r = batch.results[i];
        const dest = join(dir, `ad-${i}-${r.concept.direction}.png`);
        copyFileSync(r.pngPath, dest);
        const veniceMirror = join(
          DATA_DIR,
          "exports",
          "venice",
          `ad-${i}-${r.concept.direction}.png`,
        );
        mkdirSync(join(DATA_DIR, "exports", "venice"), { recursive: true });
        copyFileSync(r.pngPath, veniceMirror);
        images.push({ concept: concepts[i] ?? concepts[0], path: dest });
        log.push(`Local ad: ${dest}`);
      }
      if (batch.screenshotPath) log.push(`UI capture: ${batch.screenshotPath}`);
    } catch (e) {
      log.push(
        `Local engine failed — falling back to Venice text-in-image: ${e instanceof Error ? e.message : e}`,
      );
    }
  }

  if (!images.length) {
    log.push("Engine: Venice text-in-image (fallback)");
    for (let i = 0; i < concepts.length; i++) {
      const c = concepts[i];
      const prompt = buildAdImagePrompt(c, project.name, projectId);
      try {
        if (hasVenice()) {
          const img = await veniceGenerateImage(prompt, {
            outName: `ad-${i}-${c.direction}.png`,
            projectId,
            force: true,
          });
          images.push({ concept: c, path: img.path });
          log.push(`Venice image: ${img.path}`);
        } else {
          const poster = await generatePoster({
            brand: projectId as "magmos" | "veil",
            kind: "poster",
            topic: `${c.headline} — ${c.subheadline}`,
            headline: c.headline,
          });
          images.push({ concept: c, path: poster.localPath });
          log.push(`Poster: ${poster.localPath}`);
        }
      } catch (e) {
        log.push(`Image ${i} failed: ${e instanceof Error ? e.message : e}`);
      }
    }
  }

  const engineLabel = images.some((im) => /STACK\.md|goose-stack|ref-html|fal-edit/i.test(log.join("\n")))
    ? useStack
      ? "GOOSE STACK (formats.static → remix)"
      : "LOCAL compositor"
    : useStack && images.length
      ? "GOOSE STACK"
      : useLocal && images.length
        ? "LOCAL compositor"
        : "Venice / poster fallback";

  const md = [
    `# Ad Maker — ${project.name}`,
    `Domain: ${domain}`,
    `Engine: ${engineLabel}`,
    `AD_ENGINE=${engine} · AD_FORMAT=${env("AD_FORMAT", "static")}`,
    `Sources: goose-stack (formats.json + remix-graphic-ad-from-reference) · local-ad-compositor · TinyFish · ${AD_MAKER_REPO}`,
    `Skills: ${unified.skillCatalogCount} · Lessons: ${unified.lessons.slice(0, 2).join("; ") || "—"}`,
    `Stack probe: FAL=${probeStack().fal} · refs=${probeStack().referenceAds.length} · goose=${probeStack().gooseRoot ? "yes" : "no"}`,
    "",
    ...images.map(
      (im, i) =>
        `## ${i + 1}. ${im.concept.direction}\n**${im.concept.headline}**\n${im.concept.subheadline}\n${im.path}`,
    ),
    "",
    "## Next",
    "- Magmos default is AD_ENGINE=stack — remixes Goose refs, runs companion skills to JSON",
    "- Set FAL_API_KEY for Phase 2B edit-on-reference (no GooseWorks)",
    "- Upload 1:1 / 4:5 for Meta",
  ].join("\n");

  const outputPath = join(dir, "AD-MAKER.md");
  writeFileSync(outputPath, md);
  writeFileSync(join(dir, "RESULT.json"), JSON.stringify({ id, domain, concepts, images, log, engine }, null, 2));

  const status: AdMakerRun["status"] = images.length
    ? images.length >= Math.min(concepts.length, 4)
      ? "done"
      : "partial"
    : "failed";
  const spellingOk = !concepts.some(
    (c) => /compostible/i.test(c.headline + c.subheadline),
  );
  learn({
    projectId,
    feature: "ad-maker",
    outcome: status === "done" && spellingOk ? "success" : status === "partial" ? "partial" : "fail",
    summary: `unified ad-maker ${domain}: ${images.length} imgs · engine=${engine}`,
    errors: log.filter((l) => /fail/i.test(l)),
    lessons: [
      useStack && images.length
        ? "EXECUTED goose-stack: formats.static → remix cascade + companion skill JSON"
        : useLocal && images.length
          ? "Local compositor only — set AD_ENGINE=stack to run full Goose stack"
          : "Venice text-in-image fallback — prefer AD_ENGINE=stack",
      "Taste bar = data/ads/reference/magmos-goose — remix FROM refs, don't invent weaker layouts",
      "Companion skills must write artifacts (angles + meta brief), not only appear in UNIFIED.md",
      spellingOk ? "Composable spelling held in concepts" : "FAIL: Compostible typo in concepts",
      brand.backend !== "none"
        ? `Research backend ${brand.backend} grounded concepts`
        : "Wire TinyFish for live domain research",
      ...gooseRefs.lessons.slice(0, 3),
    ],
    meta: { id, domain, imageCount: images.length, engine, unified: unified.paths.contextFile },
  });
  if (status !== "failed") {
    try {
      await smartCritique({
        projectId,
        feature: "ad-maker",
        artifactSummary: md.slice(0, 2500) + "\n" + unifiedContextSuffix(projectId, 800),
        errors: log.filter((l) => /fail/i.test(l)),
      });
    } catch {
      /* best-effort */
    }
  }

  return {
    id,
    domain,
    projectId,
    concepts,
    images,
    outputPath,
    status,
    log,
  };
}

export function formatAdMaker(r: AdMakerRun): string {
  return [
    `# Ad Maker — ${r.status}`,
    `Domain: ${r.domain}`,
    `Concepts: ${r.concepts.length} · Images: ${r.images.length}`,
    `Out: ${r.outputPath}`,
    "",
    ...r.log,
  ].join("\n");
}
