/**
 * Google-Ads-style site → creatives.
 * Input: product URL. Output: fresh concepts + Venice images + optional short Seedance clips.
 * Goose reference PNGs are TASTE BAR only — not the only generation path.
 */
import { writeFileSync, mkdirSync, existsSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import { DATA_DIR, assertDataDir, env } from "../config.js";
import { newId } from "../store.js";
import { getProject } from "../projects/registry.js";
import { smartChat, smartResearch } from "../brain/smart.js";
import { hasVenice, veniceGenerateImage, veniceGenerateVideo } from "../integrations/venice.js";
import { hasFfmpeg, runFfmpeg } from "../edit/ffmpeg-util.js";
import { learn, lessonsFor } from "../brain/self-learn.js";
import { MAGMOS_BRAND } from "./magmos-brand.js";
import { loadLatestSocialMax } from "../discover/social-max.js";

export interface SiteAdConcept {
  id: string;
  angle: string;
  headline: string;
  subhead: string;
  cta: string;
  visualPrompt: string;
  ratio: "1:1" | "4:5" | "9:16";
}

export interface SiteAdResult {
  id: string;
  projectId: string;
  url: string;
  screenshotPath?: string;
  concepts: SiteAdConcept[];
  stills: Array<{ conceptId: string; path: string }>;
  clips: Array<{ conceptId: string; path: string }>;
  dir: string;
  log: string[];
}

async function captureSite(url: string, outPath: string): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: outPath, type: "png", fullPage: false });
  } finally {
    await browser.close();
  }
}

function plainVoiceBlock(projectId: string): string {
  const social = loadLatestSocialMax();
  const lessons = lessonsFor({ projectId }).slice(0, 8);
  return `
PUBLIC VOICE (hard rules):
- Plain, warm, easy English. Like explaining to a smart friend.
- NEVER say: forge, smelt, refine, melt, thermal, council, Magma governance jargon in ads.
- Product truth in one line: Magmos is a digital dollar on Sui that stays worth $1 and can earn while you hold it. Reserves are on-chain. No lockups. No APY promises.
- Brand mustard #E8B84A + black + white.
- Steal rhythm from winning social hooks: ${(social?.winningHooks ?? []).slice(0, 5).join(" | ") || "Still $1. Still earning."}
- Craft lessons: ${lessons.join("; ") || "short copy, real UI, no AI faces"}
`.trim();
}

export async function runSiteAds(opts: {
  projectId?: string;
  url?: string;
  count?: number;
  makeVideo?: boolean;
}): Promise<SiteAdResult> {
  assertDataDir();
  const projectId = opts.projectId ?? "magmos";
  const project = getProject(projectId);
  const url = opts.url || project.primaryUrl;
  const id = newId("sitead");
  const log: string[] = [];
  const dir = join(DATA_DIR, "exports", "site-ads", id);
  mkdirSync(dir, { recursive: true });

  log.push(`[1] Capture site ${url}`);
  const screenshotPath = join(dir, "site-capture.png");
  try {
    await captureSite(url, screenshotPath);
  } catch (e) {
    log.push(`Capture warn: ${e instanceof Error ? e.message : e}`);
  }

  log.push("[2] TinyFish + concept brief (Google Ads style from site)");
  let siteNotes = "";
  try {
    const research = await smartResearch({
      query: `${project.name} ${url} digital dollar yield Sui waitlist`,
      projectId,
      fetchTop: true,
    });
    siteNotes = research.notes?.slice(0, 1500) ?? research.hits.map((h) => h.title).join("; ");
  } catch {
    siteNotes = project.tagline;
  }

  const count = opts.count ?? 6;
  let concepts: SiteAdConcept[] = [];
  try {
    const llm = await smartChat(
      "ad-maker",
      `${plainVoiceBlock(projectId)}

You are Google Ads Creative Studio. Site: ${url}
Brand: ${project.name}
Site notes: ${siteNotes}
Screenshot on disk: ${existsSync(screenshotPath) ? "yes" : "no"}

Return JSON only:
{"concepts":[{"id":"c1","angle":"...","headline":"≤6 words","subhead":"≤10 words","cta":"≤4 words","visualPrompt":"photoreal scene NO TEXT NO LOGOS for image model","ratio":"1:1|4:5|9:16"}]}

Exactly ${count} concepts. Mix: lifestyle, problem, product-UI-on-phone, quiet aspiration.
Headlines must be easy and human — not crypto-bro. No forge/smelt words.`,
      { projectId, feature: "ad-maker" },
    );
    const parsed = JSON.parse(llm.content.replace(/```json|```/g, "").trim()) as {
      concepts?: SiteAdConcept[];
    };
    concepts = (parsed.concepts ?? []).slice(0, count);
  } catch (e) {
    log.push(`LLM concepts fallback: ${e instanceof Error ? e.message : e}`);
    concepts = [
      {
        id: "c1",
        angle: "hold-earn",
        headline: "Your dollar can earn",
        subhead: "Still worth $1.00",
        cta: "Join waitlist",
        visualPrompt:
          "Warm lifestyle photo person checking phone at cafe, soft light, mustard yellow accent objects, empty space for text, NO TEXT NO LOGOS",
        ratio: "4:5",
      },
      {
        id: "c2",
        angle: "clarity",
        headline: "No lockups. No stress.",
        subhead: "Hold. Earn. Stay flexible.",
        cta: "See Magmos",
        visualPrompt:
          "Clean desk with phone showing blurry finance app UI, natural light, calm, NO readable screen text, NO LOGOS",
        ratio: "1:1",
      },
      {
        id: "c3",
        angle: "reserves",
        headline: "See where money sits",
        subhead: "On-chain reserves you can check",
        cta: "Learn more",
        visualPrompt:
          "Minimal product photo glass jar of coins on white, soft shadow, premium, NO TEXT",
        ratio: "1:1",
      },
    ];
  }

  writeFileSync(join(dir, "concepts.json"), JSON.stringify(concepts, null, 2));

  const stills: SiteAdResult["stills"] = [];
  const clips: SiteAdResult["clips"] = [];

  if (hasVenice()) {
    log.push("[3] Venice stills from concepts (not Goose-ref remix)");
    for (let i = 0; i < concepts.length; i++) {
      const c = concepts[i];
      try {
        const img = await veniceGenerateImage(
          `${c.visualPrompt}. Brand feel mustard ${MAGMOS_BRAND.mustard}. Photoreal, premium, calm. NO TEXT NO WATERMARKS.`,
          { outName: `sitead-${id}-${i}.png`, projectId, force: true },
        );
        const dest = join(dir, `still-${i}-${c.id}.png`);
        copyFileSync(img.path, dest);
        stills.push({ conceptId: c.id, path: dest });
        log.push(`Still ${i}: ${c.headline}`);
      } catch (e) {
        log.push(`Still ${i} fail: ${e instanceof Error ? e.message : e}`);
      }
    }

    const wantVideo = opts.makeVideo ?? env("SITE_ADS_VIDEO", "1") === "1";
    if (wantVideo) {
      log.push("[4] Venice Seedance short clips (2–4s)");
      for (let i = 0; i < Math.min(2, concepts.length); i++) {
        const c = concepts[i];
        try {
          const vid = await veniceGenerateVideo(
            `Smooth 4-second product mood film: ${c.visualPrompt}. Slow camera push, premium lighting, mustard accent, no text, no faces looking at camera.`,
            {
              durationSec: 4,
              aspectRatio: c.ratio === "9:16" ? "9:16" : "16:9",
              projectId,
              force: true,
            },
          );
          const dest = join(dir, `clip-${i}-${c.id}.mp4`);
          copyFileSync(vid.path, dest);
          clips.push({ conceptId: c.id, path: dest });
          log.push(`Clip ${i}: $${vid.usd.toFixed(2)}`);
        } catch (e) {
          log.push(`Clip ${i} fail: ${e instanceof Error ? e.message : e}`);
          // fallback: still → short loop
          if (stills[i] && hasFfmpeg()) {
            const loop = join(dir, `clip-${i}-${c.id}-loop.mp4`);
            try {
              runFfmpeg(
                [
                  "-y",
                  "-loop",
                  "1",
                  "-i",
                  stills[i].path,
                  "-vf",
                  "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,format=yuv420p",
                  "-t",
                  "4",
                  "-c:v",
                  "libx264",
                  loop,
                ],
                `sitead-loop-${i}`,
              );
              clips.push({ conceptId: c.id, path: loop });
            } catch {
              /* */
            }
          }
        }
      }
    }
  } else {
    log.push("Venice missing — concepts only");
  }

  writeFileSync(
    join(dir, "SITE-ADS.md"),
    [
      `# Site → ads — ${project.name}`,
      `URL: ${url}`,
      "",
      "## Concepts",
      ...concepts.map((c) => `- **${c.headline}** — ${c.subhead} (${c.angle})`),
      "",
      "## Stills",
      ...stills.map((s) => `- ${s.path}`),
      "",
      "## Clips",
      ...clips.map((c) => `- ${c.path}`),
      "",
      "## Log",
      ...log.map((l) => `- ${l}`),
    ].join("\n"),
  );

  learn({
    projectId,
    feature: "ad-maker",
    outcome: stills.length ? "success" : "partial",
    summary: `site-ads ${stills.length} stills ${clips.length} clips from ${url}`,
    lessons: [
      "Google-style path: site capture → concept brief → Venice stills/clips — Goose refs are taste bar only",
      "Public copy: plain English, no forge jargon",
      "Quote Venice video credits before queue; prefer 4s Seedance for mood clips",
    ],
  });

  return { id, projectId, url, screenshotPath: existsSync(screenshotPath) ? screenshotPath : undefined, concepts, stills, clips, dir, log };
}

export function formatSiteAds(r: SiteAdResult): string {
  return [
    `# Site ads — ${r.projectId}`,
    `Dir: ${r.dir}`,
    `Stills: ${r.stills.length} · Clips: ${r.clips.length}`,
    ...r.concepts.map((c) => `- ${c.headline} / ${c.subhead}`),
    "",
    ...r.log,
  ].join("\n");
}
