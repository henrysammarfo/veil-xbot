import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR, assertDataDir } from "../config.js";
import { newId } from "../store.js";
import { discoverTrending } from "../discover/trending.js";
import { generateDraft, formatDraftForCopy } from "./draft.js";
import { generateEditManifest, formatManifestForHuman, queueMediaFromManifest } from "../edit/manifest.js";
import { generatePoster } from "./poster.js";
import { generateEngageFromTrends } from "./engage.js";
import { styleForBrand } from "../edit/styles.js";
import type { BrandKey } from "../brands.js";
import { hasTinyfish } from "../research/tinyfish.js";

export interface FirstPostPack {
  id: string;
  brand: BrandKey;
  createdAt: number;
  style: string;
  draft: string;
  manifestHuman: string;
  engageCount: number;
  targets: Array<{ title: string; url: string }>;
  checklist: string[];
}

/** Full launch pack: draft + edit manifest + poster + engage targets — optimized for 1k push. */
export async function buildFirstPostPack(brand: BrandKey, style?: string): Promise<FirstPostPack> {
  const styleDef = styleForBrand(brand, style);
  const topic =
    brand === "veil"
      ? "real testnet loss receipt — stealth order settled -100%"
      : "AURUM forge smelt on testnet — real Move tx";

  const draft = await generateDraft({
    brand,
    topic,
    style: "FIRST POST — hook in 1.2s, loss/controversy or proof, no blue tick playbook",
  });

  const manifest = await generateEditManifest({
    brand,
    style: styleDef.id,
    durationSec: 42,
    topic,
  });
  await queueMediaFromManifest(manifest);

  let engageCount = 0;
  const targets: Array<{ title: string; url: string }> = [];
  if (hasTinyfish()) {
    const trends = await discoverTrending({ limit: 8, categories: "all", brand });
    for (const t of trends.slice(0, 5)) targets.push({ title: t.title, url: t.url });
    const engages = await generateEngageFromTrends(trends, brand, 5);
    engageCount = engages.length;
  }

  let posterNote = "";
  try {
    const poster = await generatePoster({
      brand,
      kind: "quote-card",
      topic,
      headline: brand === "veil" ? "Lost $5. On chain." : "Forge live.",
    });
    posterNote = poster.localPath;
  } catch {
    posterNote = "(poster skipped — OpenAI billing)";
  }

  const checklist = FIRST_POST_CHECKLIST(brand);

  const pack: FirstPostPack = {
    id: newId("launch"),
    brand,
    createdAt: Date.now(),
    style: styleDef.id,
    draft: formatDraftForCopy(draft),
    manifestHuman: formatManifestForHuman(manifest) + `\n\nPoster: ${posterNote}`,
    engageCount,
    targets,
    checklist,
  };

  assertDataDir();
  const dir = join(DATA_DIR, "launch");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${pack.id}.json`), JSON.stringify(pack, null, 2));
  writeFileSync(join(dir, "latest-first-post.md"), formatFirstPostPack(pack));
  return pack;
}

function FIRST_POST_CHECKLIST(brand: BrandKey): string[] {
  const base = [
    "Post VIDEO not text-only — 42s max, 9:16",
    "Hook visible in first 1.5s without sound",
    "Zero hashtag spam — max 2, no #Web3",
    "Reply to your own post with demo link in 60s",
    "Quote-tweet 3 trending posts SAME DAY (engage-batch drafts)",
    "Reply to 15 accounts in first 30 min (real takes, not spam)",
    "Post Tue–Thu 2–5pm UTC (US wake + EU evening)",
    "Do NOT tag @SuiNetwork first post — earn it after traction",
  ];
  if (brand === "veil") {
    base.unshift("Lead with LOSS or visible size problem — not features");
    base.push("Pin reply with veil-reviewer.vercel.app + ?src=x_first");
  } else {
    base.unshift("Lead with forge tx hash or screen — not APY");
    base.push("Pin reply with github + ?src=x_first");
  }
  return base;
}

export function formatFirstPostPack(p: FirstPostPack): string {
  let out = `# FIRST POST — ${p.brand.toUpperCase()} (target 1k+ views, no blue tick)\n\n`;
  out += `Style: ${p.style}\n\n## POST COPY\n\n${p.draft}\n\n`;
  out += `## EDIT TIMELINE\n\n${p.manifestHuman}\n\n`;
  out += `## ENGAGE TARGETS (${p.engageCount} drafts saved)\n\n`;
  for (const t of p.targets) out += `- ${t.title}\n  ${t.url}\n`;
  out += `\n## CHECKLIST\n\n${p.checklist.map((c) => `- [ ] ${c}`).join("\n")}\n`;
  out += `\n_1k is not guaranteed — this stack is what maximizes odds without a blue tick._\n`;
  return out;
}
