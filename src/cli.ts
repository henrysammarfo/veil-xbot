#!/usr/bin/env npx tsx
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { hasOpenAI, env } from "./config.js";
import { watchVideo, buildPlaybook, watchMany } from "./video/watch.js";
import { generateDraft, generateCalendar, formatDraftForCopy } from "./generate/draft.js";
import {
  queueSunoMusic,
  queueHeyGen,
  queueKling,
  queueVeed,
  queueNanoBanana,
} from "./media/providers.js";
import { listLearnings, listDrafts } from "./store.js";
import { startServer } from "./server.js";
import { tinyfishSearch, hasTinyfish } from "./research/tinyfish.js";
import { discoverOssTools, formatOssCatalog } from "./discover/oss-tools.js";
import { formatOssStack, probeLiveOssStackAsync } from "./discover/oss-stack.js";
import { wireFullOssStack, formatOssWire } from "./discover/oss-wire.js";
import { runPaidHeyGen } from "./integrations/paid-media.js";
import { hasHeyGen } from "./integrations/heygen.js";
import { scaffoldSimplePrompt, renderHyperframes } from "./integrations/hyperframes.js";
import { fundSandboxWallet, formatWallet, loadOrCreateWallet } from "./qa/sui-wallet.js";
import { getProjectChain, getWalletMode } from "./projects/chain.js";
import { loadOrCreateStellarWallet, formatStellarWallet, getStellarBalance } from "./qa/stellar-wallet.js";
import { loadOrCreateEvmWallet, formatEvmWallet, checkEvmFunding } from "./qa/evm-wallet.js";
import { fundSandboxFromVeil, formatFundResult, withdrawManagerToRecipient } from "./qa/fund-sandbox.js";
import { llmStatus } from "./ai/router.js";
import { discoverTrending, autoLearn } from "./discover/auto-learn.js";
import { autoEdit, planEdit, formatManifestForHuman } from "./edit/pipeline.js";
import { autonomousEdit, renderFromSavedManifest } from "./edit/autonomous.js";
import {
  loadManifestFile,
  reviseManifest,
  parseReviseArgs,
  saveRevisedManifest,
} from "./edit/manifest-revise.js";
import { exportAdFormats, formatExportAdsResult } from "./edit/export-ads.js";
import { buildPaidGrowthPack } from "./growth/paid-growth.js";
import { buildXProfilePack } from "./growth/x-profile.js";
import { produceMagmosAd, formatMagmosAdReport } from "./studio/produce-magmos-ad.js";
import { runOpenMontage, formatOpenMontage } from "./studio/openmontage.js";
import {
  produceProductWalkthrough,
  formatWalkthrough,
} from "./studio/product-walkthrough.js";
import { runAdMaker, formatAdMaker } from "./studio/ad-maker.js";
import {
  formatStackProbe,
  probeStack,
  runGooseStaticStack,
} from "./studio/goose-stack.js";
import { extractViralClips, formatViralClips } from "./edit/viral-clips.js";
import { formatGoldmine } from "./discover/goldmine.js";
import { buildWebToAppPack } from "./mobile/web-to-app-pack.js";
import { growFromUrl, formatGrow } from "./growth/grow-from-url.js";
import { produceFullPack, formatProducePack } from "./growth/produce-pack.js";
import { prepareUnifiedSystem } from "./brain/unified-context.js";
import { formatBrain, recall } from "./brain/memory.js";
import { seedGrowthBrain } from "./brain/seed.js";
import { formatSelfLearn, lessonsFor, learn } from "./brain/self-learn.js";
import { formatSmartStatus, smartChat, smartResearch, smartCritique } from "./brain/smart.js";
import {
  formatSkills,
  rebuildSkillCatalog,
  adoptSkillsIntoBrain,
  readSkillBody,
  getSkill,
  ensureGooseVendorLink,
} from "./skills/catalog.js";
import type { AutonomousEditOptions } from "./edit/autonomous.js";
import { EDIT_STYLES } from "./edit/styles.js";
import { buildLaunchPack } from "./generate/launch-pack.js";
import { buildFirstPostPack, formatFirstPostPack } from "./generate/first-post.js";
import { discoverClips } from "./discover/clips.js";
import { discoverHashtags } from "./discover/hashtags.js";
import { getMusicPlan, formatMusicPlan } from "./generate/music.js";
import { renderTeaser } from "./edit/teaser.js";
import type { BrandKey } from "./brands.js";
import { TREND_CATEGORIES, listCategoryIds, type TrendCategory } from "./discover/categories.js";
import { generatePoster, type PosterKind } from "./generate/poster.js";
import {
  generateEngage,
  generateEngageFromTrends,
  formatEngageForCopy,
  type EngageType,
} from "./generate/engage.js";
import { listEngage, listGraphics, listQA, listCreative } from "./store.js";
import { runGrowthOps } from "./teams/ops.js";
import { answerQuestion, formatQA } from "./teams/qa.js";
import { generateCreative, formatCreative } from "./teams/creative.js";
import { buildCampaign, formatCampaign } from "./teams/marketing.js";
import { listProjects, getProject } from "./projects/registry.js";
import { produceTrailer, formatTrailer } from "./studio/trailer.js";
import { CONTENT_PHASES, launchWeekPlan } from "./studio/phases.js";
import { tierReport } from "./studio/tiers.js";
import { runSandbox, formatSandboxReport } from "./qa/sandbox.js";
import { runFullSandboxDemo, formatFullDemo, loadLatestDemo } from "./qa/sandbox-demo.js";
import { remixVeil3MinVoiceover } from "./studio/remix-veil-vo.js";
import { printHorizonCatalog } from "./qa/horizons-cli.js";
import { writeSortedLaunch, formatSortedLaunch, writeSortedLaunchForProject } from "./studio/sort-launch.js";
import {
  produceVeniceLaunch,
  formatVeniceLaunchMd,
  quoteLaunchPackUsd,
  listVeniceModels,
  hasVenice,
  VENICE_LAUNCH_PRESETS,
} from "./studio/venice-studio.js";
import { formatVeniceStatus } from "./integrations/venice.js";
import {
  formatBudgetReport,
  fetchVeniceBalance,
  resetLedger,
  configuredBudgetUsd,
} from "./integrations/venice-credits.js";
import type { ContentPhase } from "./studio/phases.js";

function usage(): void {
  console.log(`
Veil X Bot — Growth OS (marketing · GTM · distribution · Q&A)

  ops <project>                              Full team run → data/ops/TODAY.md (default: magmos)
  projects                                   List projects (veil, magmos, + projects/*.json)
  campaign <project>                         Marketing brief
  ugc <project> [topic]                      Realistic UGC shot list
  clip <project>                             42s clip brief + b-roll URLs
  qa <project> "<question>"                  Q&A reply draft
  sandbox <project>                          Auto demo: mint + browser + QA
  demo <project>                             Same as sandbox
  veil-demo-3min                             [PAUSED] Veil judge video — use edit-auto for edits
  magmos-ad <recording.mp4>                  Magmos paid ad: autonomous edit → 9:16/1:1/16:9 + growth pack
  walkthrough [project]                      HyperFrames + Venice presenter PiP walkthrough
  openmontage [project] [footage]            OpenMontage plan→edit→shorts→ads
  ad-maker [project] [domain]                Goose stack still ads (formats.static → remix + companions)
  stack [probe|run] [project]                Probe / execute Goose+OSS stack (formats, refs, FAL, skills)
  video-formats [project]                    Goose imessage/chatgpt/apple-notes mockups + HyperFrames
  grow <url> [project]                       ONE connected flow: research→ads→paid floors→UGC
  pack [project]                             FULL creative pack: research→thriller→ads→post→UGC→engage→learn
  unified [project]                          Arm skills+brain+knowledge+OSS+lessons as ONE context
  brain [seed|search <q>]                    Unified growth memory (OSS/UGC/ads/insights)
  learn [show|seed] [project]                Project-wide self-learn store (data/improve/SELF-LEARN*)
  smart [status|research <q>|critique <feature>]  Venice→OpenAI cascade + TinyFish
  skills [list|search <q>|show <slug>|adopt] Goose+HyperFrames skill runtime the bot uses
  shorts <recording.mp4>                     OpenShorts viral moments → 9:16 clips
  goldmine                                   22 lab OSS repos catalog
  web-to-app [project]                       Magmos/Veil APK pack for WebToApp
  x-profile [project]                        FULL X profile setup (bio, banner, pin, communities) — DO FIRST
  growth-check <project>                     Blue tick + X/TikTok ads playbook → data/growth/
  horizons [BTC]                             Predict oracle time slots (15m–26d)
  wallet <project>                           Faucet + show sandbox wallet
  wallet fund <project>                      Send SUI+dUSDC from veil/.env wallet
  oss-discover                               TinyFish OSS catalog → data/research/
  oss-stack                                  OSS repos — live wired status table
  oss-wire [project] [--no-montage] [--no-heygen]  Full wire: goldmine + montage + probes
  social-max [project]                           Daily learn: X/YT/TikTok/Reddit → craft rules
  site-ads [project] [url]                       Google-style site → Venice stills + Seedance clips
  ship [project]                                 ONE pipeline: social-max → pack (enterprise ship)
  produce <project> <phase> [feature]        Trailer/teaser/intro production brief
  phases                                     Content mix (intro → teaser → launch)
  tier                                       Free vs paid media quality report

  discover [top] [category|all] [brand]        What's winning — any niche
  categories                                   List trend categories
  autolearn [top] [brand]                      Discover → watch → improve recipe
  engage quote|reply <brand> --under "…"       Quote/reply under a viral post
  engage-batch [top] [brand]                   Top trends → quote + reply drafts
  poster <brand> [kind] "<topic>"              AI poster / quote card / header
  edit <recording.mp4> <project> [style]   Basic edit — Whisper, dead-space, b-roll → MP4
  edit-auto <recording.mp4> <project> [style]  Autonomous CapCut-class (beat-sync, music, VO) — USE THIS
  edit-revise <manifest.json> <recording.mp4> [--hook "…"] [--cta "…"] [--add-cut 12 zoom-punch]
  export-ads <master.mp4> [project]          9:16 + 1:1 + 16:9 + caption variants for paid upload
  edit-plan <brand> [style] [topic]        Timeline: cuts, SFX, b-roll (no video)
  styles                                     List edit styles
  first-post <project> [style]           Full 1k launch pack
  launch <project> [style]               EVERYTHING — read data/launch/LAUNCH.md
  sort-launch [project]                      Rank hooks + 30s script (Venice AI text)
  venice status                              Venice balance + credit ledger
  venice budget [--reset]                    Show / reset local spend ledger
  venice quote <project> [--tier draft|standard|hero|premium]  Estimate $ before run
  venice models [text|image|video|tts|all]   List Venice models
  venice launch <project> [--tier] [--video-model kling|veo|seedance] [--force]
  clips [niche] [limit]                      Bot finds Pexels/Pixabay b-roll URLs
  hashtags <veil|magmos>                   Trending tags (max 2 on post)
  music [style]                              Seasoned editor music plan + Suno
  teaser <recording.mp4> <brand>             12s hook clip for communities
  watch <url> [--notes "…"]     Analyze one link → learnings DB
  watch-batch <url> [url…]      Analyze multiple URLs + rebuild playbook
  playbook                        Rebuild MASTER.md from learnings
  draft <veil|magmos> [--topic]   Generate post draft
  calendar <veil|magmos> [days]   Generate N daily drafts (default 7)
  list                            List drafts + learnings counts
  search "<query>"                TinyFish trend search (free)
  trends [category|all]                        Scan booming niches (not Sui-only)
  serve                           Local dashboard :3947

Media queues (free-tier manual workflow + API hooks):
  music "<prompt>"                Suno queue
  heygen "<script>"               HeyGen avatar
  kling "<prompt>"                Kling b-roll
  hyperframes "<prompt>"          Hyperframes motion
  veed "<notes>"                  VEED captions workflow
  thumb "<prompt>"                Nano / image thumbnail

Env: copy tools/x-bot/.env.example → tools/x-bot/.env
`);
}

function argFlag(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

function parseCategory(s?: string): TrendCategory {
  const ids = listCategoryIds();
  if (!s || s === "all") return "all";
  if (ids.includes(s as TrendCategory)) return s as TrendCategory;
  return "all";
}

function parseAutonomousFlags(rest: string[]): { positional: string[]; opts: AutonomousEditOptions } {
  const positional: string[] = [];
  const opts: AutonomousEditOptions = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === "--no-beat-sync") opts.beatSync = false;
    else if (a === "--no-music") opts.autoMusic = false;
    else if (a === "--no-vo") opts.voiceover = false;
    else if (a === "--no-broll") opts.veniceBroll = false;
    else if (a === "--tier" && rest[i + 1]) {
      opts.veniceTier = rest[++i];
    } else if (!a.startsWith("--")) positional.push(a);
  }
  return { positional, opts };
}

async function main(): Promise<void> {
  const [, , cmd, ...rest] = process.argv;
  if (!cmd || cmd === "help" || cmd === "-h") {
    usage();
    return;
  }

  switch (cmd) {
    case "tier": {
      console.log(tierReport());
      console.log(llmStatus());
      break;
    }
    case "phases": {
      for (const p of CONTENT_PHASES) {
        console.log(`${p.id.padEnd(12)} ${p.label}\n  Hook: ${p.exampleHook}\n  End: ${p.ending}\n`);
      }
      console.log("Week plan:", launchWeekPlan("veil").join(" → "));
      break;
    }
    case "produce": {
      const project = rest[0] || "veil";
      const phase = (rest[1] as ContentPhase) || "trailer";
      const feature = rest.slice(2).join(" ");
      const prod = await produceTrailer({ project, phase, feature: feature || undefined });
      console.log(formatTrailer(prod));
      break;
    }
    case "sandbox":
    case "demo": {
      const project = rest[0] || "veil";
      const full = await runFullSandboxDemo(project);
      console.log(formatFullDemo(full));
      console.log("\n" + formatSandboxReport(full.sandbox));
      break;
    }
    case "veil-demo-3min": {
      console.log("Veil demo videos are paused. Focus: Magmos + autonomous editor.\n");
      console.log("  npm run edit-auto recording.mp4 magmos");
      console.log("  npm run magmos-ad forge-recording.webm");
      console.log("  npm run growth-check magmos");
      break;
    }
    case "veil-demo-remix-vo": {
      const input =
        rest[0] ||
        join(process.cwd(), "data/exports/veil_judge_demo_3min_veil3_mr2hb64r_jsqxh.mp4");
      console.log(`Remixing voiceover onto: ${input}\n`);
      const out = await remixVeil3MinVoiceover(input);
      console.log(`\nFINAL with VO:\n${out}`);
      break;
    }
    case "horizons": {
      await printHorizonCatalog(rest[0] || "BTC");
      break;
    }
    case "wallet": {
      if (rest[0] === "fund") {
        const project = rest[1] || "veil";
        const result = await fundSandboxFromVeil(project);
        console.log(formatFundResult(result, loadOrCreateWallet(project)));
        break;
      }
      if (rest[0] === "withdraw") {
        const project = rest[1] || "veil";
        const amount = Number(rest[2] || env("SANDBOX_FUND_DUSDC", "25"));
        const sandbox = loadOrCreateWallet(project);
        const w = await withdrawManagerToRecipient(sandbox.address, amount);
        console.log(`Withdrew ${w.amountUsdc} dUSDC → ${sandbox.address}`);
        console.log(`Tx: ${w.digest}`);
        break;
      }
      if (rest[0] === "withdraw-manager") {
        const project = rest[1] || "veil";
        const amount = Number(rest[2] || env("SANDBOX_FUND_DUSDC", "25"));
        const sandbox = loadOrCreateWallet(project);
        const w = await withdrawManagerToRecipient(sandbox.address, amount);
        console.log(
          `Withdrew ${w.amountUsdc} dUSDC from manager (was ${w.managerBalanceBefore}) → ${sandbox.address}\nTx: ${w.digest}`,
        );
        break;
      }
      if (rest[0] === "addresses") {
        const project = rest[1] || "veil";
        const p = getProject(project);
        const chain = getProjectChain(p);
        const mode = getWalletMode(p);
        console.log(`# ${p.name} — chain ${chain} (${mode})`);
        if (chain === "sui") {
          const w = loadOrCreateWallet(project);
          console.log(formatWallet(w));
        } else if (chain === "stellar") {
          const w = loadOrCreateStellarWallet(project);
          const bal = await getStellarBalance(w.address, w.network);
          console.log(formatStellarWallet(w, bal));
        } else if (chain === "evm") {
          const w = loadOrCreateEvmWallet(project);
          const { balanceEth, fundingNote } = await checkEvmFunding(project);
          console.log(formatEvmWallet(w, balanceEth));
          console.log(fundingNote);
        } else {
          console.log("No on-chain wallet for this project.");
        }
        break;
      }
      const project = rest[0] || "veil";
      const { wallet, balanceMist, note } = await fundSandboxWallet(project);
      console.log(formatWallet(wallet, balanceMist));
      console.log(note);
      break;
    }
    case "oss-discover": {
      if (!hasTinyfish()) throw new Error("Set TINYFISH_API_KEY");
      const catalog = await discoverOssTools();
      console.log(formatOssCatalog(catalog));
      break;
    }
    case "oss-stack": {
      const live = await probeLiveOssStackAsync();
      console.log(formatOssStack());
      console.log("\n## Async health");
      for (const i of live.filter((x) =>
        ["goldmine", "openmontage", "voicebox", "vibevoice", "heygen"].includes(x.id),
      )) {
        console.log(`- ${i.id}: **${i.status}** — ${i.notes}`);
      }
      break;
    }
    case "oss-wire": {
      const project = rest[0] || "magmos";
      const noMontage = rest.includes("--no-montage");
      const noHeygen = rest.includes("--no-heygen");
      const p = getProject(project);
      console.log(`OSS wire — ${project}...\n`);
      const wire = await wireFullOssStack({
        projectId: project,
        url: p.primaryUrl,
        runMontage: !noMontage,
        runHeyGen: !noHeygen,
      });
      console.log(formatOssWire(wire));
      break;
    }
    case "social-max": {
      const project = rest[0] || "magmos";
      console.log(`Social max — learn winners across platforms (${project})...\n`);
      const { runSocialMax, formatSocialMax } = await import("./discover/social-max.js");
      const r = await runSocialMax({
        projectId: project,
        skipWatch: rest.includes("--skip-watch"),
      });
      console.log(formatSocialMax(r));
      break;
    }
    case "site-ads": {
      const project = rest[0] || "magmos";
      const url = rest.find((a) => /^https?:\/\//i.test(a));
      console.log(`Site→ads (Google-style) — ${project}...\n`);
      const { runSiteAds, formatSiteAds } = await import("./studio/site-ads.js");
      const r = await runSiteAds({ projectId: project, url, makeVideo: !rest.includes("--no-video") });
      console.log(formatSiteAds(r));
      console.log(`\n→ ${r.dir}`);
      break;
    }
    case "ship": {
      const project = rest[0] || "magmos";
      console.log(`SHIP — one pipeline: social-max → full pack (${project})...\n`);
      const { runSocialMax, formatSocialMax } = await import("./discover/social-max.js");
      const smax = await runSocialMax({
        projectId: project,
        skipWatch: rest.includes("--skip-watch"),
      });
      console.log(formatSocialMax(smax));
      console.log("\n--- Pack ---\n");
      const result = await produceFullPack({ projectId: project });
      console.log(formatProducePack(result));
      console.log(`\n→ ${result.packDir}`);
      break;
    }
    case "ops": {
      const project = rest[0] || "magmos";
      const run = await runGrowthOps(project);
      console.log(`Growth ops done → ${run.outputPath}`);
      console.log(`Phases: ${run.phases.join(" → ")}`);
      break;
    }
    case "projects": {
      for (const p of listProjects()) {
        const def = getProject(p);
        console.log(`- ${p} (${def.vertical ?? "other"}) — ${def.name}`);
      }
      console.log(
        "\nAdd a project: copy projects/_template.json → projects/<id>.json",
        "\nOptional Q&A truth: knowledge/<id>.md",
        "\nWeb2 = marketing only · web3 = + on-chain sandbox demo",
      );
      break;
    }
    case "campaign": {
      const project = rest[0] || "veil";
      const c = await buildCampaign(project, rest.slice(1).join(" "));
      console.log(formatCampaign(c));
      break;
    }
    case "ugc": {
      const project = rest[0] || "veil";
      const topic = rest.slice(1).join(" ");
      const b = await generateCreative({ project, kind: "ugc", topic: topic || undefined });
      console.log(formatCreative(b));
      break;
    }
    case "clip": {
      const project = rest[0] || "veil";
      const b = await generateCreative({ project, kind: "clip" });
      console.log(formatCreative(b));
      break;
    }
    case "avatar": {
      const project = rest[0] || "veil";
      const b = await generateCreative({ project, kind: "avatar" });
      console.log(formatCreative(b));
      break;
    }
    case "qa": {
      const project = rest[0] || "veil";
      const q = rest.slice(1).join(" ").replace(/^["']|["']$/g, "");
      if (!q) throw new Error('qa veil "why is stake $5 not $25?"');
      const a = await answerQuestion({ project, question: q, channel: "reply" });
      console.log(formatQA(a));
      break;
    }
    case "categories": {
      for (const c of TREND_CATEGORIES) {
        console.log(`${c.id.padEnd(10)} ${c.label}`);
      }
      console.log("\nUse: npm run xbot discover 10 crypto");
      break;
    }
    case "discover": {
      if (!hasTinyfish()) throw new Error("Set TINYFISH_API_KEY in tools/x-bot/.env");
      const pos = rest.filter((a) => !a.startsWith("--"));
      const top = Number(argFlag(rest, "--top") ?? pos[0] ?? 15);
      const category = parseCategory(argFlag(rest, "--category") ?? pos[1]);
      const brand = (argFlag(rest, "--brand") ?? pos[2] ?? "both") as "veil" | "magmos" | "both";
      const hits = await discoverTrending({ limit: top, brand, categories: category });
      for (const h of hits) {
        console.log(
          `[${h.category}/${h.platform}] score=${Math.round(h.engagementScore)} ${h.engagementLabel}\n  ${h.title}\n  ${h.url}\n`,
        );
      }
      break;
    }
    case "autolearn": {
      if (!hasTinyfish()) throw new Error("Set TINYFISH_API_KEY in tools/x-bot/.env");
      const pos = rest.filter((a) => !a.startsWith("--"));
      const top = Number(argFlag(rest, "--top") ?? pos[0] ?? 5);
      const brand = (argFlag(rest, "--brand") ?? pos[1] ?? "both") as "veil" | "magmos" | "both";
      const run = await autoLearn({ top, brand, categories: "all" });
      console.log(JSON.stringify(run, null, 2));
      break;
    }
    case "poster": {
      const brand = (rest[0] as BrandKey) || "veil";
      const kinds: PosterKind[] = ["poster", "quote-card", "thread-header", "announcement"];
      let kind: PosterKind = "poster";
      let topicStart = 1;
      if (kinds.includes(rest[1] as PosterKind)) {
        kind = rest[1] as PosterKind;
        topicStart = 2;
      }
      const topicParts = rest.slice(topicStart).filter((a) => !a.startsWith("--"));
      const topic = topicParts.join(" ").replace(/^["']|["']$/g, "");
      if (!topic) throw new Error('Usage: poster veil [quote-card] "topic" --headline "text"');
      const headline = argFlag(rest, "--headline");
      const asset = await generatePoster({ brand, kind, topic, headline });
      console.log(`Saved: ${asset.localPath}`);
      console.log(`Kind: ${asset.kind} · Usage: ${asset.usage}`);
      break;
    }
    case "engage": {
      const type = (rest[0] as EngageType) || "quote";
      const brand = (rest[1] as BrandKey) || "veil";
      const under = argFlag(rest, "--under");
      if (!under) throw new Error('engage quote veil --under "viral post title" [--url ...]');
      const d = await generateEngage({
        brand,
        type,
        context: {
          title: under,
          url: argFlag(rest, "--url"),
          snippet: argFlag(rest, "--snippet"),
          category: parseCategory(argFlag(rest, "--category")),
          author: argFlag(rest, "--author"),
        },
        angle: argFlag(rest, "--angle"),
      });
      console.log(formatEngageForCopy(d));
      break;
    }
    case "engage-batch": {
      if (!hasTinyfish()) throw new Error("Set TINYFISH_API_KEY in tools/x-bot/.env");
      const pos = rest.filter((a) => !a.startsWith("--"));
      const top = Number(pos[0] ?? 5);
      const brand = (pos[1] as BrandKey) || "veil";
      const trends = await discoverTrending({ limit: top, categories: "all", brand });
      console.log(`Generating quote + reply for top ${trends.length} trends…\n`);
      const drafts = await generateEngageFromTrends(trends, brand, top);
      for (const d of drafts) {
        console.log("---\n" + formatEngageForCopy(d) + "\n");
      }
      console.log(`Saved ${drafts.length} engage drafts. Dashboard: npm run xbot:serve`);
      break;
    }
    case "styles": {
      for (const s of EDIT_STYLES) {
        console.log(`${s.id.padEnd(16)} ${s.label}\n  ${s.description}\n`);
      }
      break;
    }
    case "edit-plan": {
      const brand = (rest[0] as BrandKey) || "veil";
      const style = rest[1] as import("./edit/styles.js").EditStyleId | undefined;
      const topic = rest.slice(2).join(" ");
      const m = await planEdit(brand, style, topic || undefined);
      console.log(formatManifestForHuman(m));
      console.log(`\nSaved: data/exports/${m.id}-manifest.json`);
      break;
    }
    case "launch": {
      const brand = (rest[0] as BrandKey) || "veil";
      const style = rest[1];
      const pack = await buildLaunchPack(brand, style);
      console.log(pack.markdown);
      console.log("\n→ Saved: data/launch/LAUNCH.md");
      break;
    }
    case "sort-launch": {
      const projectId = rest[0] || "veil";
      const demo = loadLatestDemo();
      const sorted =
        demo?.mint?.mintDigest && demo.projectId === projectId
          ? await writeSortedLaunch(demo.mint, getProject(projectId).name, projectId)
          : await writeSortedLaunchForProject(projectId);
      console.log(formatSortedLaunch(sorted, demo?.mint));
      console.log("\n→ Saved: data/ops/LAUNCH-SORTED.md");
      break;
    }
    case "venice": {
      const sub = rest[0];
      if (sub === "status" || !sub) {
        console.log(formatVeniceStatus());
        console.log(llmStatus());
        console.log("");
        console.log(formatBudgetReport());
        const live = await fetchVeniceBalance();
        if (live?.usdRemaining != null) {
          console.log(`\nAPI balance: $${live.usdRemaining.toFixed(2)} USD`);
        }
        break;
      }
      if (sub === "budget") {
        if (rest.includes("--reset")) {
          resetLedger(configuredBudgetUsd());
          console.log(`Ledger reset — pool $${configuredBudgetUsd()}`);
        }
        console.log(formatBudgetReport());
        break;
      }
      if (sub === "quote") {
        const projectId = rest[1];
        if (!projectId) throw new Error("Usage: venice quote <project> [--tier standard]");
        const tierFlag = rest.indexOf("--tier");
        const tier = tierFlag >= 0 ? rest[tierFlag + 1] : "standard";
        const vmFlag = rest.indexOf("--video-model");
        const videoModel = vmFlag >= 0 ? rest[vmFlag + 1] : undefined;
        const q = await quoteLaunchPackUsd({
          tier,
          videoModel,
          includeVideo: !rest.includes("--no-video"),
        });
        console.log(`Launch quote — ${projectId} (${tier})\n`);
        for (const line of q.lines) console.log(line);
        break;
      }
      if (sub === "tiers") {
        for (const p of Object.values(VENICE_LAUNCH_PRESETS)) {
          console.log(`${p.tier.padEnd(10)} ~$${p.estimateUsd} — ${p.label}\n  ${p.notes}\n`);
        }
        break;
      }
      if (sub === "models") {
        const type = (rest[1] as import("./integrations/venice.js").VeniceModelType) || "all";
        const rows = await listVeniceModels(type);
        for (const m of rows) console.log(`${m.id}${m.type ? ` (${m.type})` : ""}`);
        break;
      }
      if (sub === "launch") {
        const projectId = rest[1];
        if (!projectId) {
          throw new Error(
            "Usage: venice launch <project> [--tier draft|standard|hero|premium] [--video-model seedance|kling|veo] [--force]",
          );
        }
        const tierFlag = rest.indexOf("--tier");
        const tier = tierFlag >= 0 ? rest[tierFlag + 1] : undefined;
        const vmFlag = rest.indexOf("--video-model");
        const videoModel = vmFlag >= 0 ? rest[vmFlag + 1] : undefined;
        const imFlag = rest.indexOf("--image-model");
        const imageModel = imFlag >= 0 ? rest[imFlag + 1] : undefined;
        const assets = await produceVeniceLaunch({
          projectId,
          tier,
          imageModel,
          videoModel,
          video: !rest.includes("--no-video"),
          audio: !rest.includes("--no-audio"),
          force: rest.includes("--force"),
        });
        console.log(formatVeniceLaunchMd(assets, getProject(projectId).name));
        break;
      }
      throw new Error(
        "Usage: venice status | budget | quote | tiers | models | launch",
      );
    }
    case "clips": {
      if (!hasTinyfish()) throw new Error("Set TINYFISH_API_KEY");
      const niche = rest[0] ?? "crypto technology dark";
      const limit = Number(rest[1] ?? 10);
      const clips = await discoverClips({ niche, limit });
      for (const c of clips) {
        console.log(`[${c.source}] ${c.title}\n  ${c.url}\n  ${c.downloadHint}\n`);
      }
      break;
    }
    case "hashtags": {
      if (!hasTinyfish()) throw new Error("Set TINYFISH_API_KEY");
      const brand = (rest[0] as BrandKey) || "veil";
      const t = await discoverHashtags(brand);
      console.log("Post (max 2):", t.hashtags.slice(0, 2).join(" "));
      console.log("Engage:", t.tags.join(" "));
      break;
    }
    case "music": {
      const plan = getMusicPlan(rest[0] as import("./edit/styles.js").EditStyleId | undefined);
      console.log(formatMusicPlan(plan));
      break;
    }
    case "teaser": {
      const input = rest[0];
      const brand = (rest[1] as BrandKey) || "veil";
      if (!input) throw new Error("Usage: teaser recording.mp4 veil");
      const job = await renderTeaser(input, brand);
      console.log(`Teaser: ${job.outputPath} (${job.status})`);
      console.log(`Hook: ${job.hookText}`);
      break;
    }
    case "first-post": {
      const brand = (rest[0] as BrandKey) || "veil";
      const style = rest[1];
      const pack = await buildFirstPostPack(brand, style);
      console.log(formatFirstPostPack(pack));
      console.log("\nSaved: data/launch/latest-first-post.md");
      break;
    }
    case "magmos-ad": {
      const input = rest[0];
      if (!input) throw new Error("Usage: magmos-ad forge-recording.webm");
      console.log("Magmos paid ad — autonomous edit + multi-format export...\n");
      const report = await produceMagmosAd(input);
      console.log(formatMagmosAdReport(report));
      if (report.status === "done" && report.masterPath) {
        console.log(`\nUpload-ready files:\n${report.adExports?.join("\n")}`);
      }
      break;
    }
    case "walkthrough": {
      const project = rest[0] || "magmos";
      const screenPath = rest.find((a) => !a.startsWith("--") && /\.(mp4|webm|mov)$/i.test(a));
      console.log(`Product walkthrough (HyperFrames + Venice presenter) — ${project}...\n`);
      const result = await produceProductWalkthrough({
        projectId: project,
        screenPath,
        skipAvatar: env("WALKTHROUGH_AVATAR", "0") !== "1",
        skipCapture: Boolean(screenPath),
      });
      console.log(formatWalkthrough(result));
      break;
    }
    case "grow": {
      const url = rest[0];
      if (!url) throw new Error("Usage: grow https://magmoslabs.vercel.app [magmos]");
      const project = rest[1] || "magmos";
      console.log(`Unified grow — ${url} → ${project}...\n`);
      const result = await growFromUrl({ url, projectId: project });
      console.log(formatGrow(result));
      console.log(`\n→ ${result.outputPath}`);
      break;
    }
    case "pack":
    case "produce-pack": {
      const project = rest[0] || "magmos";
      const hint = rest.slice(1).join(" ") || undefined;
      console.log(`Full creative pack — ${project} (research→thriller→ads→post→UGC→engage→learn)...\n`);
      const result = await produceFullPack({
        projectId: project,
        thrillerHint: hint,
      });
      console.log(formatProducePack(result));
      console.log(`\n→ ${result.packDir}`);
      break;
    }
    case "unified": {
      const project = rest[0] || "magmos";
      console.log(`Arming unified OS for ${project}...\n`);
      const u = prepareUnifiedSystem({ projectId: project, task: "pack", feature: "global" });
      console.log(
        [
          `# Unified OS — ${project}`,
          `Skills catalog: ${u.skillCatalogCount}`,
          `Brain seeded: ${u.brainSeeded} · skills adopted: ${u.skillsAdopted}`,
          `Lessons: ${u.lessons.length}`,
          `Knowledge: ${u.paths.knowledge ?? "(none)"}`,
          `Goldmine: ${u.paths.goldmine}`,
          `Context dump: ${u.paths.contextFile}`,
          "",
          "Lessons:",
          ...u.lessons.slice(0, 12).map((l) => `- ${l}`),
        ].join("\n"),
      );
      break;
    }
    case "brain": {
      const sub = rest[0] || "show";
      if (sub === "seed") {
        const r = seedGrowthBrain();
        console.log(`Seeded ${r.counted} memory entries`);
        console.log(formatBrain(20));
      } else if (sub === "search") {
        const q = rest.slice(1).join(" ");
        console.log(
          recall({ q, limit: 15 })
            .map((e) => `## ${e.title}\n${e.body.slice(0, 300)}\n`)
            .join("\n") || "(no hits — run: brain seed)",
        );
      } else {
        seedGrowthBrain();
        console.log(formatBrain(30));
      }
      break;
    }
    case "learn": {
      const sub = rest[0] || "show";
      const project = rest[1] || "magmos";
      if (sub === "seed") {
        learn({
          projectId: project,
          feature: "global",
          outcome: "success",
          summary: "Manual seed — smart stack + self-learn armed",
          lessons: [
            "Every feature writes lessons to SELF-LEARN.json",
            "Venice → OpenAI cascade via smartChat / failover",
            "TinyFish is the live web truth for grow/ops/ad-maker",
            "Use `npm run pack` for full creative flow — not one-off see-pack scripts",
            "Say COMPOSABLE not compostible; Magmos is web forge UI not hardware",
          ],
        });
        console.log(`Seeded self-learn for ${project}`);
      }
      console.log(formatSelfLearn(25));
      if (sub === "project" || rest[0] === project) {
        console.log("\n## Lessons for project\n" + lessonsFor({ projectId: project }).map((l) => `- ${l}`).join("\n"));
      }
      break;
    }
    case "smart": {
      const sub = rest[0] || "status";
      if (sub === "status") {
        console.log(await formatSmartStatus());
        console.log("\n" + llmStatus());
      } else if (sub === "research") {
        const q = rest.slice(1).join(" ");
        if (!q) throw new Error('Usage: smart research "magmos forge"');
        const r = await smartResearch({ query: q, projectId: rest.includes("--project") ? "magmos" : "magmos", fetchTop: true });
        console.log(`Hits: ${r.hits.length}`);
        for (const h of r.hits) console.log(`- ${h.title}\n  ${h.url}`);
        if (r.notes) console.log("\n---\n" + r.notes.slice(0, 1200));
      } else if (sub === "critique") {
        const feature = (rest[1] || "global") as "grow" | "walkthrough" | "ad-maker" | "ops" | "edit-auto" | "engage" | "global";
        const project = rest[2] || "magmos";
        const out = await smartCritique({
          projectId: project,
          feature,
          artifactSummary: `Manual critique for ${feature}/${project}`,
        });
        console.log(JSON.stringify(out, null, 2));
      } else if (sub === "chat") {
        const prompt = rest.slice(1).join(" ") || "Say hello and confirm cascade.";
        const res = await smartChat("ops", prompt, { projectId: "magmos", feature: "ops" });
        console.log(`via ${res.provider} (tried ${res.attempted.join("→")})\n\n${res.content}`);
      } else {
        console.log(await formatSmartStatus());
        console.log("\n" + llmStatus());
      }
      break;
    }
    case "skills": {
      const sub = rest[0] || "list";
      ensureGooseVendorLink();
      if (sub === "adopt" || sub === "rebuild") {
        const cat = rebuildSkillCatalog();
        const ad = adoptSkillsIntoBrain(150);
        console.log(`Catalog: ${cat.count} skills · adopted into brain: ${ad.adopted}`);
        console.log(formatSkills(25));
      } else if (sub === "search") {
        const q = rest.slice(1).join(" ") || "ugc ads";
        console.log(formatSkills(30, q));
      } else if (sub === "show") {
        const slug = rest[1];
        if (!slug) throw new Error("Usage: skills show <slug>");
        const meta = getSkill(slug);
        const body = readSkillBody(slug, 8000);
        console.log(meta ? JSON.stringify(meta, null, 2) : "(missing meta)");
        console.log("\n--- SKILL.md ---\n");
        console.log(body ?? "(SKILL.md not found — check vendor/goose-skills)");
      } else {
        rebuildSkillCatalog();
        console.log(formatSkills(40));
      }
      break;
    }
    case "openmontage": {
      const project = rest[0] || "magmos";
      const footage = rest[1];
      console.log(`OpenMontage — ${project}...\n`);
      const run = await runOpenMontage({ projectId: project, footagePath: footage });
      console.log(formatOpenMontage(run));
      break;
    }
    case "ad-maker": {
      const project = rest[0] || "magmos";
      const domain = rest[1];
      console.log(`Ad Maker (Goose stack) — ${project}...\n`);
      const run = await runAdMaker({ projectId: project, domain });
      console.log(formatAdMaker(run));
      console.log(`\n→ ${run.outputPath}`);
      break;
    }
    case "stack": {
      const mode = rest[0] || "probe";
      const project = rest[1] || "magmos";
      if (mode === "run") {
        const p = getProject(project);
        console.log(`Goose stack RUN — ${project}...\n`);
        const batch = await runGooseStaticStack({
          projectId: project,
          productUrl: p.primaryUrl,
          brand: p.name,
        });
        console.log(readFileSync(batch.companions.stackReportPath, "utf8"));
        console.log(`\n→ ${batch.dir}`);
      } else {
        console.log(formatStackProbe(probeStack()));
      }
      break;
    }
    case "video-formats": {
      const project = rest[0] || "magmos";
      console.log(`Video formats (Goose mockups + HF) — ${project}...\n`);
      const { runAllVideoFormats } = await import("./studio/video-formats.js");
      const vf = await runAllVideoFormats({ projectId: project });
      console.log(readFileSync(join(vf.dir, "VIDEO-FORMATS.md"), "utf8"));
      console.log(`\n→ ${vf.dir}`);
      break;
    }
    case "shorts": {
      const input = rest[0];
      if (!input) throw new Error("Usage: shorts recording.mp4");
      const job = await extractViralClips(input, { maxClips: Number(rest[1] || 4) });
      console.log(formatViralClips(job));
      break;
    }
    case "goldmine": {
      console.log(formatGoldmine());
      break;
    }
    case "web-to-app": {
      const project = rest[0] || "magmos";
      const pack = buildWebToAppPack(project);
      console.log(pack.markdown);
      console.log(`\n→ ${pack.outputPath}\n→ ${pack.configPath}`);
      break;
    }
    case "x-profile": {
      const project = rest[0] || "magmos";
      const pack = buildXProfilePack(project);
      console.log(pack.markdown);
      console.log(`\n→ Saved: ${pack.outputPath}`);
      console.log("Paste into x.com/settings/profile BEFORE first post or ads.");
      break;
    }
    case "growth-check": {
      const project = rest[0] || "magmos";
      const pack = buildPaidGrowthPack(project);
      console.log(pack.markdown);
      console.log(`\n→ Saved: ${pack.outputPath}`);
      break;
    }
    case "export-ads": {
      const master = rest[0];
      if (!master) throw new Error("Usage: export-ads master.mp4 [magmos]");
      const brand = (rest[1] as BrandKey) || "magmos";
      const result = await exportAdFormats(master, brand);
      console.log(formatExportAdsResult(result));
      break;
    }
    case "edit-auto": {
      const { positional, opts } = parseAutonomousFlags(rest);
      const input = positional[0];
      if (!input) throw new Error("Usage: edit-auto recording.mp4 magmos [magmos-forge]");
      const brand = (positional[1] as BrandKey) || "magmos";
      const style = positional[2] as import("./edit/styles.js").EditStyleId | undefined;
      console.log(`Autonomous edit — beat-sync, music, VO, b-roll (${brand})...\n`);
      const job = await autonomousEdit(input, brand, style, opts);
      console.log(job.log);
      console.log(`\nStatus: ${job.status}`);
      if (job.status === "done") console.log(`Finished MP4: ${job.outputPath}`);
      break;
    }
    case "edit-revise": {
      const manifestPath = rest[0];
      const input = rest[1];
      if (!manifestPath || !input) {
        throw new Error("Usage: edit-revise manifest.json recording.mp4 [--hook text] [--cta text]");
      }
      const reviseRest = rest.slice(2);
      const ops = parseReviseArgs(reviseRest);
      let manifest = loadManifestFile(manifestPath);
      manifest = reviseManifest(manifest, ops);
      saveRevisedManifest(manifest, manifestPath);
      console.log(`Revised manifest (${ops.length} op(s)) — re-rendering...\n`);
      const job = await renderFromSavedManifest(input, manifest);
      console.log(job.log);
      if (job.status === "done") console.log(`\nFinished MP4: ${job.outputPath}`);
      break;
    }
    case "edit": {
      const input = rest[0];
      if (!input) throw new Error("Usage: edit recording.webm magmos [magmos-forge]  — or edit-auto for full autonomous");
      const brand = (rest[1] as BrandKey) || "veil";
      const style = rest[2] as import("./edit/styles.js").EditStyleId | undefined;
      const job = await autoEdit(input, brand, style);
      console.log(job.log);
      console.log(`\nStatus: ${job.status}`);
      if (job.status === "done") console.log(`Finished MP4: ${job.outputPath}`);
      break;
    }
    case "watch": {
      const url = rest[0];
      if (!url) throw new Error("URL required");
      const notes = argFlag(rest, "--notes");
      const learning = await watchVideo(url, notes);
      buildPlaybook();
      console.log(JSON.stringify(learning, null, 2));
      if (!hasOpenAI()) console.warn("\n⚠ Set OPENAI_API_KEY for full analysis");
      break;
    }
    case "watch-batch": {
      if (!rest.length) throw new Error("URLs required");
      await watchMany(rest.filter((a) => !a.startsWith("--")));
      console.log(`Analyzed ${rest.length} videos. Playbook updated.`);
      break;
    }
    case "playbook": {
      console.log(buildPlaybook());
      break;
    }
    case "draft": {
      const brand = (rest[0] as BrandKey) || "veil";
      const topic = argFlag(rest, "--topic");
      const d = await generateDraft({ brand, topic });
      console.log(formatDraftForCopy(d));
      break;
    }
    case "calendar": {
      const brand = (rest[0] as BrandKey) || "veil";
      const days = Number(rest[1] || 7);
      const drafts = await generateCalendar(brand, days);
      console.log(`Created ${drafts.length} drafts. Open dashboard: npm run xbot:serve`);
      break;
    }
    case "list": {
      console.log(
        `Drafts: ${listDrafts().length}, Learnings: ${listLearnings().length}, Graphics: ${listGraphics().length}, Engage: ${listEngage().length}, QA: ${listQA().length}, Creative: ${listCreative().length}`,
      );
      break;
    }
    case "search": {
      const q = rest.join(" ");
      if (!q) throw new Error('Query required, e.g. search "sui defi build in public"');
      if (!hasTinyfish()) throw new Error("Set TINYFISH_API_KEY in tools/x-bot/.env");
      const hits = await tinyfishSearch(q);
      for (const h of hits) console.log(`- ${h.title}\n  ${h.url}\n  ${h.snippet ?? ""}\n`);
      break;
    }
    case "trends": {
      if (!hasTinyfish()) throw new Error("Set TINYFISH_API_KEY in tools/x-bot/.env");
      const pos = rest.filter((a) => !a.startsWith("--"));
      const category = parseCategory(pos[0]);
      const hits = await discoverTrending({ limit: 12, categories: category });
      console.log(`\n## Booming — ${category}\n`);
      for (const h of hits) {
        console.log(`[${h.category}/${h.platform}] ${h.engagementLabel}`);
        console.log(`  ${h.title}`);
        console.log(`  ${h.url}\n`);
      }
      break;
    }
    case "serve": {
      startServer();
      break;
    }
    case "music": {
      console.log(queueSunoMusic(rest.join(" ")));
      break;
    }
    case "heygen": {
      const prompt = rest.join(" ");
      if (!prompt) throw new Error('Usage: heygen "30s product explainer script"');
      if (!hasHeyGen()) {
        console.log(queueHeyGen(prompt));
        console.log("\nOr add HeyGen MCP (OAuth): https://mcp.heygen.com/mcp/v1/");
        break;
      }
      console.log("HeyGen Video Agent — polling (up to 20 min)…");
      const job = await runPaidHeyGen(prompt);
      console.log(JSON.stringify(job, null, 2));
      break;
    }
    case "kling": {
      console.log(queueKling(rest.join(" ")));
      break;
    }
    case "hyperframes": {
      const render = rest.includes("--render");
      const parts = rest.filter((a) => a !== "--render");
      const prompt = parts.join(" ");
      if (!prompt) throw new Error('Usage: hyperframes "title | body" [--render]');
      const [title, ...bodyParts] = prompt.split("|").map((s) => s.trim());
      const hf = scaffoldSimplePrompt(title || prompt, bodyParts.join(" ") || prompt);
      console.log(hf.log);
      if (render) {
        const result = await renderHyperframes(hf.projectDir);
        console.log(result.log);
        if (result.outputPath) console.log(`MP4: ${result.outputPath}`);
      }
      break;
    }
    case "veed": {
      console.log(queueVeed(rest.join(" ")));
      break;
    }
    case "thumb": {
      console.log(queueNanoBanana(rest.join(" ")));
      break;
    }
    default:
      usage();
      process.exit(1);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
