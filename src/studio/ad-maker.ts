/**
 * Ad-maker (Branda pattern) — domain → on-brand still ads.
 * Brand research: TinyFish fetch/search (default) · optional Context.dev if key present.
 * Images: Venice (default) · poster fallback.
 * Flow kept; backends swappable — never drop this capability.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR, assertDataDir, env } from "../config.js";
import { newId } from "../store.js";
import { getProject } from "../projects/registry.js";
import { chatCompletion } from "../ai/router.js";
import { hasVenice, veniceGenerateImage } from "../integrations/venice.js";
import { generatePoster } from "../generate/poster.js";
import { hasTinyfish, tinyfishFetchText, tinyfishSearch } from "../research/tinyfish.js";
import { remember } from "../brain/memory.js";

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
  "product_hero",
  "isometric",
  "typographic",
  "gradient_field",
  "blueprint",
  "data_viz",
  "editorial_spread",
  "sculptural_object",
] as const;

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
  const project = getProject(projectId);
  const brand = await fetchBrandContext(domain);
  const context = [
    `Domain: ${domain}`,
    `Project: ${project.name} — ${project.tagline}`,
    brand.name ? `Brand: ${brand.name}` : "",
    brand.description ? `Desc: ${brand.description}` : "",
    brand.homepageMd ? `Homepage:\n${brand.homepageMd.slice(0, 2500)}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const llm = await chatCompletion(
      "ad-maker",
      `${context}

You are Branda/ad-maker. Return JSON:
{"concepts":[{"direction":"one of ${DIRECTIONS.join("|")}","headline":"≤6 words","subheadline":"≤12 words","subject":"company|product","productName":"optional"}]}

Exactly 4 concepts: 3 company + 1 product. No APY promises. Fact-grounded. Distinct directions.`,
      { context: projectId },
    );
    const parsed = JSON.parse(llm.content.replace(/```json|```/g, "").trim()) as {
      concepts?: AdMakerConcept[];
    };
    if (parsed.concepts?.length) return parsed.concepts.slice(0, 6);
  } catch {
    /* fallback */
  }

  return [
    {
      direction: "typographic",
      headline: projectId === "magmos" ? "Forge tx landed" : "Stealth fills",
      subheadline: "Real testnet. Not a mockup.",
      subject: "company",
    },
    {
      direction: "blueprint",
      headline: "On-chain lifecycle",
      subheadline: project.tagline.slice(0, 48),
      subject: "company",
    },
    {
      direction: "gradient_field",
      headline: "Built on Sui",
      subheadline: "Open source · try the demo",
      subject: "company",
    },
    {
      direction: "product_hero",
      headline: projectId === "magmos" ? "AURUM forge" : "Predict TWAP",
      subheadline: "Live product surface",
      subject: "product",
      productName: projectId === "magmos" ? "AURUM" : "Veil Modes",
    },
  ];
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

  const brand = await fetchBrandContext(domain);
  log.push(`ad-maker (Branda pattern) · ${AD_MAKER_REPO}`);
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
  for (let i = 0; i < concepts.length; i++) {
    const c = concepts[i];
    const prompt = [
      `Square 1:1 marketing ad, direction=${c.direction}.`,
      `Headline only text: "${c.headline}". Sub: "${c.subheadline}".`,
      `Brand: ${project.name}. No people, no APY, no hex codes printed on art.`,
      `Dark premium fintech / industrial forge mood for Magmos; clean stealth for Veil.`,
    ].join(" ");

    try {
      if (hasVenice()) {
        const img = await veniceGenerateImage(prompt, {
          outName: `ad-${i}-${c.direction}.png`,
          projectId,
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

  const md = [
    `# Ad Maker — ${project.name}`,
    `Domain: ${domain}`,
    `Source pattern: ${AD_MAKER_REPO}`,
    "",
    ...concepts.map(
      (c, i) =>
        `## ${i + 1}. ${c.direction} (${c.subject})\n**${c.headline}**\n${c.subheadline}\n${images[i] ? images[i].path : "(no image)"}`,
    ),
    "",
    "## Next",
    "- Download stills for X static ads",
    "- Or promote with `npm run export-ads` after video master",
  ].join("\n");

  const outputPath = join(dir, "AD-MAKER.md");
  writeFileSync(outputPath, md);
  writeFileSync(join(dir, "RESULT.json"), JSON.stringify({ id, domain, concepts, images, log }, null, 2));

  return {
    id,
    domain,
    projectId,
    concepts,
    images,
    outputPath,
    status: images.length ? (images.length === concepts.length ? "done" : "partial") : "failed",
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
