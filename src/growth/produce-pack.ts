/**
 * ONE connected creative flow — research → thriller → ads → post → UGC → engage → learn.
 * This is the "use every smart feature" pack the bot should run when you say generate content.
 */
import { existsSync, mkdirSync, writeFileSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR, assertDataDir } from "../config.js";
import { newId } from "../store.js";
import { hasFfmpeg, runFfmpeg } from "../edit/ffmpeg-util.js";
import { hasVenice, veniceGenerateImage, veniceTextToSpeech } from "../integrations/venice.js";
import { scaffoldFromTrailer, renderHyperframes } from "../integrations/hyperframes.js";
import { produceTrailer, formatTrailer } from "../studio/trailer.js";
import { runAdMaker, formatAdMaker } from "../studio/ad-maker.js";
import { generateDraft, formatDraftForCopy } from "../generate/draft.js";
import { generateCreative, formatCreative } from "../teams/creative.js";
import { generateEngage } from "../generate/engage.js";
import { buildPaidGrowthPack } from "./paid-growth.js";
import { learn } from "../brain/self-learn.js";
import { smartCritique, smartResearch, smartStatus, smartChat } from "../brain/smart.js";
import { prepareUnifiedSystem } from "../brain/unified-context.js";
import { getProject } from "../projects/registry.js";
import type { BrandKey } from "../brands.js";
import { activateGoldmine } from "../discover/goldmine.js";
import { probeOssWires } from "../discover/oss-wire.js";
import { runOpenMontage, formatOpenMontage } from "../studio/openmontage.js";
import { env } from "../config.js";
import { hasHeyGen } from "../integrations/heygen.js";
import { runPaidHeyGen } from "../integrations/paid-media.js";

export interface ProducePackResult {
  id: string;
  projectId: string;
  packDir: string;
  status: "done" | "partial" | "failed";
  log: string[];
  paths: Record<string, string>;
}

export async function produceFullPack(opts: {
  projectId?: string;
  url?: string;
  thrillerHint?: string;
}): Promise<ProducePackResult> {
  const id = newId("pack");
  const projectId = opts.projectId || "magmos";
  const project = getProject(projectId);
  const url = opts.url || project.primaryUrl;
  const log: string[] = [];
  const paths: Record<string, string> = {};

  assertDataDir();
  const packDir = join(DATA_DIR, "studio", "packs", id);
  mkdirSync(packDir, { recursive: true });
  paths.packDir = packDir;

  // --- 0. Unified OS (skills + knowledge + OSS + lessons) ---
  const unified = prepareUnifiedSystem({
    projectId,
    task: "pack",
    feature: "grow",
  });
  writeFileSync(join(packDir, "UNIFIED.md"), unified.promptBlock);
  const prior = unified.lessons;
  log.push(
    `Unified OS: ${unified.skillCatalogCount} skills · brain ${unified.brainSeeded} · lessons ${prior.length}`,
  );
  log.push(`Smart: ${smartStatus().order.join("→") || "none"}`);
  writeFileSync(join(packDir, "PRIOR-LESSONS.md"), prior.map((l) => `- ${l}`).join("\n") || "(none)");
  paths.unified = unified.paths.contextFile;

  // --- 0b. OSS wire (goldmine + voice/asr/heygen probes) ---
  log.push("[0b/11] OSS wire");
  try {
    const goldminePath = activateGoldmine(projectId);
    paths.goldmine = goldminePath;
    const probes = await probeOssWires();
    writeFileSync(join(packDir, "OSS-WIRE.json"), JSON.stringify(probes, null, 2));
    log.push(...probes.map((p) => `OSS ${p.id}: ${p.status} via ${p.via}`));
  } catch (e) {
    log.push(`OSS wire warn: ${e instanceof Error ? e.message : e}`);
  }

  // --- 1. TinyFish research ---
  log.push("[1/11] TinyFish research");
  try {
    const research = await smartResearch({
      query: `${project.name} ${url} yield forge AURUM`,
      projectId,
      fetchTop: true,
    });
    writeFileSync(join(packDir, "research.json"), JSON.stringify(research, null, 2));
    log.push(`Research hits: ${research.hits.length}`);
  } catch (e) {
    log.push(`Research warn: ${e instanceof Error ? e.message : e}`);
  }

  // --- 2. Thriller / trailer ---
  log.push("[2/11] Thriller trailer");
  let thrillerMp4 = "";
  try {
    const thriller = await produceTrailer({
      project: projectId,
      phase: "trailer",
      feature: opts.thrillerHint || "thriller dark forge AURUM vault countdown — composable dollar, no compostible typo",
    });
    writeFileSync(join(packDir, "THRILLER.md"), formatTrailer(thriller));
    writeFileSync(join(packDir, "thriller.json"), JSON.stringify(thriller, null, 2));
    paths.thrillerBrief = join(packDir, "THRILLER.md");
    const hf = scaffoldFromTrailer(thriller);
    paths.hyperframes = hf.projectDir;

    if (hasVenice()) {
      const poster = await veniceGenerateImage(
        `Thriller cinematic Magmos: dark forge vault, crimson countdown, molten gold AURUM $1 composable dollar coin (NOT compostible), industrial, no people, 16:9. Lessons: ${prior.slice(0, 3).join("; ")}`,
        { outName: `pack-${id}-thriller.png`, projectId, force: true },
      );
      copyFileSync(poster.path, join(packDir, "thriller-poster.png"));
      paths.thrillerPoster = join(packDir, "thriller-poster.png");
      const vo = await veniceTextToSpeech(
        "Vault countdown. Magmos forges AURUM — the composable dollar. Join the waitlist.",
        { outName: `pack-${id}-thriller-vo.mp3`, voice: "am_michael", projectId, force: true },
      );
      copyFileSync(vo.path, join(packDir, "thriller-vo.mp3"));
    }

    if (hasFfmpeg() && existsSync(join(packDir, "thriller-poster.png"))) {
      thrillerMp4 = join(packDir, "thriller.mp4");
      try {
        runFfmpeg(
          [
            "-y",
            "-loop",
            "1",
            "-i",
            join(packDir, "thriller-poster.png"),
            "-i",
            join(packDir, "thriller-vo.mp3"),
            "-vf",
            "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,format=yuv420p",
            "-c:v",
            "libx264",
            "-t",
            "8",
            "-c:a",
            "aac",
            "-shortest",
            thrillerMp4,
          ],
          "pack-thriller",
        );
        paths.thrillerMp4 = thrillerMp4;
      } catch (e) {
        log.push(`Thriller ffmpeg: ${e instanceof Error ? e.message : e}`);
      }
    }

    try {
      const rendered = await renderHyperframes(hf.projectDir);
      if (rendered.outputPath && existsSync(rendered.outputPath)) {
        copyFileSync(rendered.outputPath, join(packDir, "thriller-hf.mp4"));
        paths.thrillerHf = join(packDir, "thriller-hf.mp4");
      }
    } catch (e) {
      log.push(`HF: ${e instanceof Error ? e.message : e}`);
    }

    learn({
      projectId,
      feature: "global",
      outcome: thrillerMp4 ? "success" : "partial",
      summary: `pack thriller ${thriller.title}`,
      lessons: [
        "Thriller pack must say COMPOSABLE not compostible",
        "Stills+VO fallback when Venice T2V times out",
        "Never invent Magmos hardware — product is forge UI / AURUM dollar",
      ],
    });
  } catch (e) {
    log.push(`Thriller failed: ${e instanceof Error ? e.message : e}`);
  }

  // --- 3. Ad-maker (Goose stack stills) ---
  log.push("[3/11] Ad-maker");
  try {
    const domain = new URL(url.includes("://") ? url : `https://${url}`).hostname;
    const ads = await runAdMaker({ projectId, domain });
    writeFileSync(join(packDir, "AD-MAKER.md"), formatAdMaker(ads));
    paths.ads = ads.outputPath;
    for (const img of ads.images.slice(0, 4)) {
      if (existsSync(img.path)) {
        const name = img.path.split(/[/\\]/).pop()!;
        copyFileSync(img.path, join(packDir, name));
      }
    }
    log.push(`Ads: ${ads.images.length}/${ads.concepts.length}`);
  } catch (e) {
    log.push(`Ads failed: ${e instanceof Error ? e.message : e}`);
  }

  // --- 3b. Goose video formats (imessage / chatgpt / apple-notes) + HyperFrames ---
  log.push("[3b/11] Video formats (Goose mockups + HyperFrames)");
  try {
    const { runAllVideoFormats } = await import("../studio/video-formats.js");
    const vf = await runAllVideoFormats({
      projectId,
      workDir: join(packDir, "video-formats"),
    });
    paths.videoFormats = join(vf.dir, "VIDEO-FORMATS.md");
    for (const r of vf.results) {
      if (r.pngPath && existsSync(r.pngPath)) {
        copyFileSync(r.pngPath, join(packDir, `${r.format}.png`));
      }
      if (r.mp4Path && existsSync(r.mp4Path)) {
        copyFileSync(r.mp4Path, join(packDir, `${r.format}.mp4`));
      }
      log.push(
        `Format ${r.format}: png=${r.pngPath ? "yes" : "no"} mp4=${r.mp4Path ? "yes" : "no"}`,
      );
    }
  } catch (e) {
    log.push(`Video formats failed: ${e instanceof Error ? e.message : e}`);
  }

  // --- 4. X post (via smartChat so cascade + lessons inject) ---
  log.push("[4/11] X post");
  try {
    const draft = await generateDraft({
      brand: projectId as BrandKey,
      topic: "thriller launch — forge live, AURUM composable dollar, waitlist open",
    });
    const postText = formatDraftForCopy(draft);
    writeFileSync(join(packDir, "POST.md"), postText);
    paths.post = join(packDir, "POST.md");
    learn({
      projectId,
      feature: "draft",
      outcome: "success",
      summary: `pack post ${draft.id}`,
      lessons: ["Posts: waitlist CTA + testnet proof, max 2 hashtags, no APY hype"],
    });
  } catch (e) {
    log.push(`Post failed: ${e instanceof Error ? e.message : e}`);
  }

  // --- 5. UGC influencer (product UI only) ---
  log.push("[5/11] UGC influencer");
  try {
    const ugc = await generateCreative({
      project: projectId,
      kind: "ugc",
      topic:
        "Influencer desk phone POV — REAL Magmos forge web UI on screen only. No fake gadgets, no invented hardware, no faces. Composable dollar AURUM.",
    });
    writeFileSync(join(packDir, "UGC.md"), formatCreative(ugc));
    paths.ugc = join(packDir, "UGC.md");

    if (hasVenice()) {
      const ugcStill = await veniceGenerateImage(
        "Vertical 9:16 UGC: hands holding phone, Magmos Labs forge DASHBOARD on screen (web UI dark industrial, AURUM forge, composable dollar — NOT a physical speaker/cube gadget), desk keyboard, no face, authentic influencer POV",
        { outName: `pack-${id}-ugc.png`, projectId, force: true },
      );
      copyFileSync(ugcStill.path, join(packDir, "ugc-influencer-pov.png"));
      paths.ugcStill = join(packDir, "ugc-influencer-pov.png");
      const ugcVo = await veniceTextToSpeech(
        "Forging AURUM live on Magmos. Real screen. Real waitlist. Not another APY story.",
        { outName: `pack-${id}-ugc-vo.mp3`, voice: "am_michael", projectId, force: true },
      );
      copyFileSync(ugcVo.path, join(packDir, "ugc-vo.mp3"));
      if (hasFfmpeg()) {
        const ugcMp4 = join(packDir, "ugc-influencer.mp4");
        try {
          runFfmpeg(
            [
              "-y",
              "-loop",
              "1",
              "-i",
              join(packDir, "ugc-influencer-pov.png"),
              "-i",
              join(packDir, "ugc-vo.mp3"),
              "-vf",
              "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,format=yuv420p",
              "-c:v",
              "libx264",
              "-t",
              "8",
              "-c:a",
              "aac",
              "-shortest",
              ugcMp4,
            ],
            "pack-ugc",
          );
          paths.ugcMp4 = ugcMp4;
        } catch (e) {
          log.push(`UGC ffmpeg: ${e instanceof Error ? e.message : e}`);
        }
      }
    }

    learn({
      projectId,
      feature: "global",
      outcome: paths.ugcMp4 ? "success" : "partial",
      summary: "pack UGC influencer",
      lessons: [
        "UGC must show Magmos web UI — never invent physical Magmos gadgets",
        "Hands + phone POV ok; no AI faces",
      ],
    });
    await smartCritique({
      projectId,
      feature: "global",
      artifactSummary: formatCreative(ugc).slice(0, 2000),
    });
  } catch (e) {
    log.push(`UGC failed: ${e instanceof Error ? e.message : e}`);
  }

  // --- 5b. OpenMontage (auto-footage → edit → shorts → ads) ---
  if (env("OPENMONTAGE_AUTO", "1") === "1") {
    log.push("[5b/11] OpenMontage");
    try {
      const footageCandidates = [
        join(packDir, "ugc-influencer.mp4"),
        join(packDir, "thriller.mp4"),
        join(packDir, "thriller-hf.mp4"),
        join(packDir, "imessage.mp4"),
        join(packDir, "chatgpt.mp4"),
        join(packDir, "apple-notes.mp4"),
      ].filter((p) => existsSync(p));
      const montage = await runOpenMontage({
        projectId,
        url,
        footageCandidates,
        autoFootage: true,
      });
      writeFileSync(join(packDir, "OPENMONTAGE.md"), formatOpenMontage(montage));
      paths.openmontage = montage.outputPath;
      if (montage.masterPath && existsSync(montage.masterPath)) {
        copyFileSync(montage.masterPath, join(packDir, "montage-master.mp4"));
        paths.montageMaster = join(packDir, "montage-master.mp4");
      }
      log.push(`OpenMontage: ${montage.status}`);
    } catch (e) {
      log.push(`OpenMontage failed: ${e instanceof Error ? e.message : e}`);
    }
  }

  // --- 5c. HeyGen presenter (when key + HEYGEN_AUTO) ---
  if (env("HEYGEN_AUTO", "1") === "1" && hasHeyGen()) {
    log.push("[5c/11] HeyGen presenter");
    try {
      const prompt =
        projectId === "magmos"
          ? "Professional presenter, waist-up, neutral background. Says: Magmos forges AURUM — the composable dollar on Sui. Link in bio."
          : `Professional presenter introduces ${project.name}. Link in bio.`;
      const job = await runPaidHeyGen(prompt);
      if (job.outputPath && existsSync(job.outputPath)) {
        copyFileSync(job.outputPath, join(packDir, "heygen-presenter.mp4"));
        paths.heygen = join(packDir, "heygen-presenter.mp4");
        log.push(`HeyGen: ${paths.heygen}`);
      } else {
        log.push(`HeyGen: ${job.instructions}`);
      }
    } catch (e) {
      log.push(`HeyGen warn: ${e instanceof Error ? e.message : e}`);
    }
  }

  // --- 6. Engage draft ---
  log.push("[6/11] Engage");
  try {
    if (projectId === "magmos" || projectId === "veil") {
      const eng = await generateEngage({
        brand: projectId as BrandKey,
        type: "quote",
        context: {
          title: "DeFi yield dollars on Sui — who is shipping real forge UX?",
          snippet: "Composable dollars and on-chain reserves",
        },
      });
      writeFileSync(join(packDir, "ENGAGE.md"), `${eng.primary}\n\n${(eng.alternates ?? []).join("\n")}`);
      paths.engage = join(packDir, "ENGAGE.md");
    }
  } catch (e) {
    log.push(`Engage warn: ${e instanceof Error ? e.message : e}`);
  }

  // --- 7. Paid floors ---
  log.push("[7/11] Paid growth floors");
  try {
    const paid = buildPaidGrowthPack(projectId);
    writeFileSync(join(packDir, "PAID.md"), paid.markdown.slice(0, 4000));
    paths.paid = paid.outputPath;
  } catch (e) {
    log.push(`Paid warn: ${e instanceof Error ? e.message : e}`);
  }

  // --- 8. End-to-end critique + smart learn ---
  log.push("[8/11] Smart critique whole pack");
  const status: ProducePackResult["status"] =
    paths.post || paths.ads || paths.thrillerMp4 ? "done" : "partial";
  const summary = [
    `# PACK ${id}`,
    `Project: ${projectId}`,
    `URL: ${url}`,
    "",
    "## Log",
    ...log.map((l) => `- ${l}`),
    "",
    "## Paths",
    ...Object.entries(paths).map(([k, v]) => `- ${k}: ${v}`),
    "",
    "## Prior lessons applied",
    ...prior.slice(0, 8).map((l) => `- ${l}`),
  ].join("\n");
  writeFileSync(join(packDir, "PACK.md"), summary);

  learn({
    projectId,
    feature: "grow",
    outcome: status === "done" ? "success" : "partial",
    summary: `full produce-pack ${id}`,
    errors: log.filter((l) => /fail/i.test(l)),
    lessons: [
      "Full pack = research → thriller → ads → post → UGC → engage → paid → learn (one flow)",
      "Do not ship see-pack scripts that skip learn()",
      "Composable spelling + real UI only",
    ],
    meta: { id, paths },
  });

  try {
    await smartCritique({
      projectId,
      feature: "grow",
      artifactSummary: summary.slice(0, 3000),
      errors: log.filter((l) => /fail/i.test(l)),
    });
    // Distill durable spellings / UI rules once more via learn task
    await smartChat(
      "learn",
      `From this Magmos pack, return JSON {"lessons":["…"]} that future runs must obey (typos, UI truth, faces).\n${summary.slice(0, 1500)}`,
      { projectId, feature: "grow" },
    );
  } catch {
    /* best-effort */
  }

  return { id, projectId, packDir, status, log, paths };
}

export function formatProducePack(r: ProducePackResult): string {
  return [
    `# Produce pack — ${r.status}`,
    `Dir: ${r.packDir}`,
    "",
    ...r.log,
    "",
    ...Object.entries(r.paths).map(([k, v]) => `${k}: ${v}`),
  ].join("\n");
}
