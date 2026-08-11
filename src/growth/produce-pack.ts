/**
 * ONE connected creative flow — research → thriller → ads → post → UGC → engage → learn.
 * This is the "use every smart feature" pack the bot should run when you say generate content.
 */
import { existsSync, mkdirSync, writeFileSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR, assertDataDir } from "../config.js";
import { newId } from "../store.js";
import { hasFfmpeg, runFfmpeg } from "../edit/ffmpeg-util.js";
import { hasVenice, veniceGenerateImage, veniceTextToSpeech, veniceGenerateVideo } from "../integrations/venice.js";
import { scaffoldFromTrailer, renderHyperframes } from "../integrations/hyperframes.js";
import { produceTrailer, formatTrailer } from "../studio/trailer.js";
import { runAdMaker, formatAdMaker } from "../studio/ad-maker.js";
import { runSiteAds, formatSiteAds } from "../studio/site-ads.js";
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
import { ensureGooseVendorBootstrap, gooseStackReady } from "../skills/paths.js";
import { runOpenMontage, formatOpenMontage } from "../studio/openmontage.js";
import { env } from "../config.js";
import { hasHeyGen } from "../integrations/heygen.js";
import { runPaidHeyGen } from "../integrations/paid-media.js";
import { runSocialMax, formatSocialMax } from "../discover/social-max.js";
import { MAGMOS_BRAND } from "../studio/magmos-brand.js";
import { xAlgorithmPromptBlock } from "../algorithm/x-signals.js";
import { craftVideoPrompt, seedCinematicCraft } from "../studio/cinematic-craft.js";
import { evolveHarness } from "../brain/evolve.js";

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
  const craftPath = seedCinematicCraft(projectId);
  log.push(`Cinematic craft (Higgsfield→Venice): ${craftPath}`);
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

  // --- 0b. OSS wire (goose vendor + goldmine + voice/asr/heygen probes) ---
  log.push("[0b/11] OSS wire");
  try {
    const boot = ensureGooseVendorBootstrap();
    log.push(`Goose root: ${boot.root} · ready=${gooseStackReady()}`);
    const goldminePath = activateGoldmine(projectId);
    paths.goldmine = goldminePath;
    const probes = await probeOssWires();
    writeFileSync(join(packDir, "OSS-WIRE.json"), JSON.stringify(probes, null, 2));
    log.push(...probes.map((p) => `OSS ${p.id}: ${p.status} via ${p.via}`));
  } catch (e) {
    log.push(`OSS wire warn: ${e instanceof Error ? e.message : e}`);
  }

  // --- 0c. Daily social max (X/YT/TikTok/Reddit → learn before create) ---
  if (env("SOCIAL_MAX", "1") === "1") {
    log.push("[0c/12] Social max learn");
    try {
      const smax = await runSocialMax({
        projectId,
        watchTop: Number(env("SOCIAL_MAX_WATCH", "3")),
        skipWatch: env("SOCIAL_MAX_SKIP_WATCH", "0") === "1",
      });
      writeFileSync(join(packDir, "SOCIAL-MAX.md"), formatSocialMax(smax));
      paths.socialMax = smax.reportPath;
      log.push(`Social max: ${smax.trends.length} trends · watched ${smax.watched.length}`);
    } catch (e) {
      log.push(`Social max warn: ${e instanceof Error ? e.message : e}`);
    }
  }

  // --- 1. TinyFish research ---
  log.push("[1/12] TinyFish research");
  try {
    const research = await smartResearch({
      query: `${project.name} ${url} digital dollar earn hold waitlist Sui`,
      projectId,
      fetchTop: true,
    });
    writeFileSync(join(packDir, "research.json"), JSON.stringify(research, null, 2));
    log.push(`Research hits: ${research.hits.length}`);
  } catch (e) {
    log.push(`Research warn: ${e instanceof Error ? e.message : e}`);
  }

  // --- 2. Thriller — REAL Venice video first, still+VO only as fallback ---
  log.push("[2/12] Thriller trailer (Venice T2V)");
  let thrillerMp4 = "";
  try {
    const thrillerHint =
      opts.thrillerHint ||
      "calm premium trailer: a digital dollar that stays $1 and can earn while you hold it — warm light, mustard accents, no jargon, no forge imagery";
    const thriller = await produceTrailer({
      project: projectId,
      phase: "trailer",
      feature: thrillerHint,
    });
    writeFileSync(join(packDir, "THRILLER.md"), formatTrailer(thriller));
    writeFileSync(join(packDir, "thriller.json"), JSON.stringify(thriller, null, 2));
    paths.thrillerBrief = join(packDir, "THRILLER.md");
    const hf = scaffoldFromTrailer(thriller);
    paths.hyperframes = hf.projectDir;

    const voScript =
      "Your dollar can earn while you hold it. Still worth one dollar. No lockups. Magmos — join the waitlist.";

    if (hasVenice() && env("THRILLER_VIDEO", "1") === "1") {
      try {
        const craft = craftVideoPrompt({
          job: "thriller",
          productName: project.name,
          productPromise: "a digital dollar that stays $1 and can earn while you hold it",
          seconds: 6,
          aspect: "16:9",
        });
        writeFileSync(join(packDir, "thriller-craft.json"), JSON.stringify(craft, null, 2));
        const t2v = await veniceGenerateVideo(craft.prompt, {
            durationSec: 6,
            aspectRatio: "16:9",
            projectId,
            force: true,
          },
        );
        copyFileSync(t2v.path, join(packDir, "thriller-venice.mp4"));
        paths.thrillerVenice = join(packDir, "thriller-venice.mp4");
        log.push(`Venice T2V thriller: $${t2v.usd.toFixed(2)}`);

        const vo = await veniceTextToSpeech(voScript, {
          outName: `pack-${id}-thriller-vo.mp3`,
          voice: "am_michael",
          projectId,
          force: true,
        });
        copyFileSync(vo.path, join(packDir, "thriller-vo.mp3"));

        if (hasFfmpeg()) {
          thrillerMp4 = join(packDir, "thriller.mp4");
          try {
            runFfmpeg(
              [
                "-y",
                "-i",
                paths.thrillerVenice,
                "-i",
                join(packDir, "thriller-vo.mp3"),
                "-c:v",
                "copy",
                "-c:a",
                "aac",
                "-shortest",
                thrillerMp4,
              ],
              "pack-thriller-t2v",
            );
            paths.thrillerMp4 = thrillerMp4;
          } catch (e) {
            copyFileSync(paths.thrillerVenice, thrillerMp4);
            paths.thrillerMp4 = thrillerMp4;
            log.push(`Thriller mux warn: ${e instanceof Error ? e.message : e}`);
          }
        } else {
          thrillerMp4 = paths.thrillerVenice;
          paths.thrillerMp4 = thrillerMp4;
        }
      } catch (e) {
        log.push(`Venice T2V failed → still+VO: ${e instanceof Error ? e.message : e}`);
      }
    }

    if (!thrillerMp4 && hasVenice()) {
      const poster = await veniceGenerateImage(
        `Premium calm Magmos brand still: soft morning light, mustard yellow accent, phone on desk, blurred UI, photoreal, NO TEXT, NO forge vault, NO molten metal`,
        { outName: `pack-${id}-thriller.png`, projectId, force: true },
      );
      copyFileSync(poster.path, join(packDir, "thriller-poster.png"));
      paths.thrillerPoster = join(packDir, "thriller-poster.png");
      const vo = await veniceTextToSpeech(voScript, {
        outName: `pack-${id}-thriller-vo.mp3`,
        voice: "am_michael",
        projectId,
        force: true,
      });
      copyFileSync(vo.path, join(packDir, "thriller-vo.mp3"));
      if (hasFfmpeg()) {
        thrillerMp4 = join(packDir, "thriller.mp4");
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
          "pack-thriller-still",
        );
        paths.thrillerMp4 = thrillerMp4;
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
        "Thriller = Venice T2V first; still+VO is fallback only",
        "Public narration: plain English — dollar earns while you hold, still $1, waitlist",
        `Never say in trailer: ${MAGMOS_BRAND.neverSay.slice(0, 6).join(", ")}`,
      ],
    });
  } catch (e) {
    log.push(`Thriller failed: ${e instanceof Error ? e.message : e}`);
  }

  // --- 3. Ads: Google-style site→ads FIRST, Goose stack as taste remix ---
  log.push("[3/12] Site→ads + Goose stack");
  try {
    const site = await runSiteAds({
      projectId,
      url,
      count: 6,
      makeVideo: env("SITE_ADS_VIDEO", "1") === "1",
    });
    writeFileSync(join(packDir, "SITE-ADS.md"), formatSiteAds(site));
    paths.siteAds = site.dir;
    for (const s of site.stills.slice(0, 4)) {
      if (existsSync(s.path)) {
        const name = s.path.split(/[/\\]/).pop()!;
        copyFileSync(s.path, join(packDir, name));
      }
    }
    for (const c of site.clips.slice(0, 2)) {
      if (existsSync(c.path)) {
        const name = c.path.split(/[/\\]/).pop()!;
        copyFileSync(c.path, join(packDir, name));
      }
    }
    log.push(`Site ads: ${site.stills.length} stills · ${site.clips.length} clips`);
  } catch (e) {
    log.push(`Site ads failed: ${e instanceof Error ? e.message : e}`);
  }

  try {
    const domain = new URL(url.includes("://") ? url : `https://${url}`).hostname;
    const ads = await runAdMaker({ projectId, domain });
    writeFileSync(join(packDir, "AD-MAKER.md"), formatAdMaker(ads));
    paths.ads = ads.outputPath;
    for (const img of ads.images.slice(0, 4)) {
      if (existsSync(img.path)) {
        const name = img.path.split(/[/\\]/).pop()!;
        copyFileSync(img.path, join(packDir, `goose-${name}`));
      }
    }
    log.push(`Goose stack ads: ${ads.images.length}/${ads.concepts.length}`);
  } catch (e) {
    log.push(`Goose ads failed: ${e instanceof Error ? e.message : e}`);
  }

  // --- 3b. Goose video formats (imessage / chatgpt / apple-notes) + HyperFrames ---
  log.push("[3b/12] Video formats (Goose mockups + HyperFrames)");
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
  log.push("[4/12] X post");
  try {
    const draft = await generateDraft({
      brand: projectId as BrandKey,
      topic:
        "waitlist open — digital dollar that stays $1 and can earn while you hold · calm clear proof · " +
        xAlgorithmPromptBlock().slice(0, 280),
    });
    const postText = formatDraftForCopy(draft);
    writeFileSync(join(packDir, "POST.md"), postText);
    paths.post = join(packDir, "POST.md");
    learn({
      projectId,
      feature: "draft",
      outcome: "success",
      summary: `pack post ${draft.id}`,
      lessons: [
        "Posts: waitlist CTA + plain English, max 2 hashtags",
        "Match x-algorithm: reply bait + quotable first line + video when possible",
        "Never forge/smelt jargon on X",
      ],
    });
  } catch (e) {
    log.push(`Post failed: ${e instanceof Error ? e.message : e}`);
  }

  // --- 5. UGC influencer (product UI only) ---
  log.push("[5/12] UGC influencer");
  try {
    const ugc = await generateCreative({
      project: projectId,
      kind: "ugc",
      topic:
        "Influencer desk phone POV — REAL Magmos web UI on screen only. Calm. Clear. No fake gadgets, no faces. Digital dollar that stays $1.",
    });
    writeFileSync(join(packDir, "UGC.md"), formatCreative(ugc));
    paths.ugc = join(packDir, "UGC.md");

    if (hasVenice()) {
      const ugcStill = await veniceGenerateImage(
        "Vertical 9:16 UGC: hands holding phone, Magmos web app on screen (dark calm UI, $1 dollar product — NOT industrial forge), desk keyboard, no face, authentic influencer POV, photoreal",
        { outName: `pack-${id}-ugc.png`, projectId, force: true },
      );
      copyFileSync(ugcStill.path, join(packDir, "ugc-influencer-pov.png"));
      paths.ugcStill = join(packDir, "ugc-influencer-pov.png");
      const ugcVo = await veniceTextToSpeech(
        "Holding a dollar that can earn while I hold it. Still one dollar. No lockups. Magmos waitlist is open.",
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
    log.push("[5b/12] OpenMontage");
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

  // --- 5b2. Diffusion Studio (agent TSX editor compositions) ---
  if (env("DIFFUSION_STUDIO", "1") === "1") {
    log.push("[5b2/12] Diffusion Studio composition");
    try {
      const { runDiffusionStudio, formatDiffusionStudio } = await import(
        "../integrations/diffusion-studio.js"
      );
      const footage =
        [
          join(packDir, "montage-master.mp4"),
          join(packDir, "ugc-influencer.mp4"),
          join(packDir, "thriller.mp4"),
          join(packDir, "thriller-venice.mp4"),
        ].find((p) => existsSync(p)) || undefined;
      const dse = await runDiffusionStudio({
        projectId,
        productName: project.name,
        promise: "Still $1. Can earn while you hold it.",
        siteUrl: url.replace(/^https?:\/\//, ""),
        footagePath: footage,
        aspect: "9:16",
        execute: env("DIFFUSION_STUDIO_EXECUTE", "0") === "1",
      });
      writeFileSync(join(packDir, "DIFFUSION-STUDIO.md"), formatDiffusionStudio(dse));
      paths.diffusionStudio = dse.dir;
      paths.diffusionComposition = dse.compositionPath;
      if (dse.outputPath && existsSync(dse.outputPath)) {
        copyFileSync(dse.outputPath, join(packDir, "diffusion-out.mp4"));
        paths.diffusionMp4 = join(packDir, "diffusion-out.mp4");
      }
      log.push(`Diffusion Studio: ${dse.status} · ${dse.compositionPath}`);
    } catch (e) {
      log.push(`Diffusion Studio warn: ${e instanceof Error ? e.message : e}`);
    }
  }

  // --- 5c. HeyGen presenter (when key + HEYGEN_AUTO) ---
  if (env("HEYGEN_AUTO", "1") === "1" && hasHeyGen()) {
    log.push("[5c/12] HeyGen presenter");
    try {
      const prompt =
        projectId === "magmos"
          ? "Professional presenter, waist-up, neutral background. Says: Magmos is a digital dollar that stays one dollar and can earn while you hold it. Join the waitlist."
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
  log.push("[6/12] Engage");
  try {
    if (projectId === "magmos" || projectId === "veil") {
      const eng = await generateEngage({
        brand: projectId as BrandKey,
        type: "quote",
        context: {
          title: "Who is shipping a clear digital dollar on Sui — no jargon, real app?",
          snippet: "Stay $1. Earn while you hold. On-chain reserves.",
        },
      });
      writeFileSync(join(packDir, "ENGAGE.md"), `${eng.primary}\n\n${(eng.alternates ?? []).join("\n")}`);
      paths.engage = join(packDir, "ENGAGE.md");
    }
  } catch (e) {
    log.push(`Engage warn: ${e instanceof Error ? e.message : e}`);
  }

  // --- 7. Paid floors ---
  log.push("[7/12] Paid growth floors");
  try {
    const paid = buildPaidGrowthPack(projectId);
    writeFileSync(join(packDir, "PAID.md"), paid.markdown.slice(0, 4000));
    paths.paid = paid.outputPath;
  } catch (e) {
    log.push(`Paid warn: ${e instanceof Error ? e.message : e}`);
  }

  // --- 8. End-to-end critique + smart learn ---
  log.push("[8/12] Smart critique + quality gate");
  const { scorePackQuality, formatQuality } = await import("./quality-gate.js");
  const quality = scorePackQuality({ packDir, paths, log });
  writeFileSync(join(packDir, "QUALITY.md"), formatQuality(quality));
  paths.quality = join(packDir, "QUALITY.md");
  log.push(`Quality: score=${quality.score} shippable=${quality.shippable}`);
  for (const f of quality.findings) log.push(`Q-${f.level}: ${f.code} — ${f.message}`);

  let status: ProducePackResult["status"] = quality.shippable
    ? "done"
    : quality.score >= 40
      ? "partial"
      : "failed";
  // Never call empty-ad packs done even if other bits exist
  if (
    log.some((l) => /Site ads: 0 stills/i.test(l)) &&
    log.some((l) => /Goose stack ads: 0\//i.test(l))
  ) {
    status = "failed";
  }

  const summary = [
    `# PACK ${id}`,
    `Project: ${projectId}`,
    `URL: ${url}`,
    `Quality: ${quality.score} · shippable=${quality.shippable} · status=${status}`,
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
    outcome: status === "done" ? "success" : status === "partial" ? "partial" : "fail",
    summary: `full produce-pack ${id} quality=${quality.score}`,
    errors: [
      ...log.filter((l) => /fail/i.test(l)),
      ...quality.findings.filter((f) => f.level === "fail").map((f) => f.message),
    ],
    lessons: [
      "ONE pipeline: social-max learn → research → Venice T2V thriller → site-ads → goose taste remix → formats → post → UGC → montage → engage → paid → quality gate",
      "Never mark pack done if site ads < 3 stills or post missing or social-max junk hooks",
      "Goose refs = taste bar only; Google-style site→ads is primary",
      "Public Magmos = plain English. No forge / APY / real yield / generic Own Your World copy",
    ],
    meta: { id, paths, quality },
  });

  try {
    await smartCritique({
      projectId,
      feature: "grow",
      artifactSummary: summary.slice(0, 3000),
      errors: log.filter((l) => /fail/i.test(l)),
    });
    await smartChat(
      "learn",
      `From this Magmos pack, return JSON {"lessons":["…"]} future runs must obey (plain voice, real video, social learn, no forge jargon, reject CapCut junk hooks).\n${summary.slice(0, 1500)}`,
      { projectId, feature: "grow" },
    );
  } catch {
    /* best-effort */
  }

  try {
    const er = await evolveHarness({
      projectId,
      trajectory: {
        feature: "grow",
        summary: summary.slice(0, 2000),
        outcome: status === "done" ? "success" : status === "partial" ? "partial" : "fail",
        errors: log.filter((l) => /fail/i.test(l)).slice(0, 8),
        log,
      },
    });
    log.push(`Evolve: promoted=${er.promoted} reflect=${er.reflections} pruned=${er.pruned}`);
    writeFileSync(join(packDir, "EVOLVE.md"), `See ${er.protocolPath}`);
  } catch (e) {
    log.push(`Evolve warn: ${e instanceof Error ? e.message : e}`);
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
    r.status === "failed" || r.status === "partial"
      ? "\n⚠ Not shippable as-is — check QUALITY.md and re-run after fixing failures."
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}
