#!/usr/bin/env npx tsx
import { hasOpenAI } from "./config.js";
import { watchVideo, buildPlaybook, watchMany } from "./video/watch.js";
import { generateDraft, generateCalendar, formatDraftForCopy } from "./generate/draft.js";
import {
  queueSunoMusic,
  queueHeyGen,
  queueKling,
  queueHyperframes,
  queueVeed,
  queueNanoBanana,
} from "./media/providers.js";
import { listLearnings, listDrafts } from "./store.js";
import { startServer } from "./server.js";
import { tinyfishSearch, hasTinyfish } from "./research/tinyfish.js";
import { discoverTrending, autoLearn } from "./discover/auto-learn.js";
import { autoEdit } from "./edit/pipeline.js";
import type { BrandKey } from "./brands.js";
import { TREND_CATEGORIES, listCategoryIds, type TrendCategory } from "./discover/categories.js";
import { generatePoster, type PosterKind } from "./generate/poster.js";
import {
  generateEngage,
  generateEngageFromTrends,
  formatEngageForCopy,
  type EngageType,
} from "./generate/engage.js";
import { listEngage, listGraphics } from "./store.js";

function usage(): void {
  console.log(`
Veil X Bot — self-learning drafts + auto-edit (manual X post only)

  discover [top] [category|all] [brand]        What's winning — any niche
  categories                                   List trend categories
  autolearn [top] [brand]                      Discover → watch → improve recipe
  engage quote|reply <brand> --under "…"       Quote/reply under a viral post
  engage-batch [top] [brand]                   Top trends → quote + reply drafts
  poster <brand> [kind] "<topic>"              AI poster / quote card / header
  edit <screen-recording.mp4> [--brand veil]   Auto-render 9:16 clip (ffmpeg)
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

async function main(): Promise<void> {
  const [, , cmd, ...rest] = process.argv;
  if (!cmd || cmd === "help" || cmd === "-h") {
    usage();
    return;
  }

  switch (cmd) {
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
    case "edit": {
      const input = rest.find((a) => !a.startsWith("--"));
      if (!input) throw new Error("Usage: edit path/to/recording.mp4 [--brand veil]");
      const brand = (argFlag(rest, "--brand") ?? "veil") as BrandKey;
      const job = autoEdit(input, brand);
      console.log(job.log);
      console.log(`Status: ${job.status}`);
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
        `Drafts: ${listDrafts().length}, Learnings: ${listLearnings().length}, Graphics: ${listGraphics().length}, Engage: ${listEngage().length}`,
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
      console.log(queueHeyGen(rest.join(" ")));
      break;
    }
    case "kling": {
      console.log(queueKling(rest.join(" ")));
      break;
    }
    case "hyperframes": {
      console.log(queueHyperframes(rest.join(" ")));
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
