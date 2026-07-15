/**
 * Seed the growth brain with repos, UGC workflows, ad floors, directives.
 * Idempotent — safe to re-run.
 */
import { remember } from "./memory.js";
import { adoptSkillsIntoBrain, ensureGooseVendorLink } from "../skills/catalog.js";

export function seedGrowthBrain(): { counted: number } {
  ensureGooseVendorLink();
  let counted = 0;
  const keep = (e: Parameters<typeof remember>[0]) => {
    remember(e);
    counted++;
  };

  keep({
    kind: "directive",
    title: "Replace backends — never drop flows",
    importance: 5,
    source: "user-2026-07",
    tags: ["architecture", "ad-maker", "agent", "venice"],
    body: `Ad-maker flow stays (domain→concepts→stills→ads) but Context.dev key is optional —
prefer TinyFish fetch + Venice image. Avatar/agent PiP flow stays (walkthrough) but
HeyGen is optional — prefer Venice presenter (character still + TTS → avatar MP4).
One connected brain: URL in → research → ads → edit → distribute. Self-learning via
TinyFish + Venice 24/7.`,
  });

  keep({
    kind: "directive",
    title: "URL → full growth OS",
    importance: 5,
    source: "user-2026-07",
    tags: ["grow", "url", "unified"],
    body: `Primary UX: give a website URL and the bot runs research (TinyFish), brand digest,
ad-maker stills, paid growth pack (Google/Meta/X low floors), creative briefs, and
queues product walkthrough / edit-auto when footage exists.`,
  });

  keep({
    kind: "workflow",
    title: "MakeUGC ultra-realistic UGC pipeline",
    importance: 5,
    source: "user-article-makeugc",
    tags: ["ugc", "prompt", "kling", "venice", "polish"],
    body: `1) Craft killer image prompt: subject, product interaction, setting, feeling, framing.
2) Text→Image (GPT Image 2 / Venice flux-nano) portrait or 9:16.
3) Scenes/I2V with motion prompt 10–15 sentences; Kling v3 / Seedance / Veo; 9:16; 10–15s.
4) Polish in CapCut-class editor: captions, music, cuts, CTA, logo.
5) Export → TikTok / Reels / Shorts / Meta / TikTok Ads.
Product must be in frame and named — demo-led UGC converts; vibe-only does not.`,
  });

  keep({
    kind: "insight",
    title: "350K downloads UGC campaign field notes",
    importance: 5,
    source: "user-article-hardlaunch",
    tags: ["ugc", "growth", "icp", "platforms"],
    body: `350k real downloads / 4 weeks / 27M views / ~1.3% view→download vs 0.1–0.25% typical.
Rules: (1) build product to be inherently viral; (2) creators match ICP exactly;
(3) product IS the content from second 1; (4) test many angles before scaling;
(5) three platforms not one; (6) report verified installs not vanity views.`,
  });

  keep({
    kind: "workflow",
    title: "Russo HyperFrames product walkthrough",
    importance: 4,
    source: "x-thread-rames-jusso",
    tags: ["hyperframes", "walkthrough", "playwright", "timing"],
    url: "https://github.com/heygen-com/hyperframes",
    body: `inspect → script/storyboard/timing contract → Playwright capture → presenter PiP
→ HyperFrames HTML compose → check/snapshot/inspect/render 1080p. Timing plan is the
contract between VO, screen, captions, SFX.`,
  });

  const oss: Array<{ title: string; url: string; role: string }> = [
    { title: "HyperFrames", url: "https://github.com/heygen-com/hyperframes", role: "HTML→MP4 compose" },
    { title: "ad-maker Branda", url: "https://github.com/context-dot-dev/ad-maker", role: "domain→still ads pattern" },
    { title: "OpenMontage", url: "https://github.com/calesthio/OpenMontage", role: "agentic edit pipelines" },
    { title: "freecut", url: "https://github.com/Moh4696/freecut", role: "CapCut-class EDL editor" },
    { title: "VibeVoice", url: "https://github.com/microsoft/VibeVoice", role: "long-form ASR" },
    { title: "voicebox", url: "https://github.com/jamiepine/voicebox", role: "local voice clone TTS" },
    { title: "openshorts", url: "https://github.com/mutonby/openshorts", role: "viral 9:16 clips" },
    { title: "web-to-app", url: "https://github.com/shiaho777/web-to-app", role: "demo APK pack" },
    { title: "open-source-ai-goldmine", url: "https://github.com/Moh4696/open-source-ai-goldmine", role: "lab OSS catalog" },
    { title: "goose-skills", url: "https://github.com/gooseworks-ai/goose-skills", role: "GTM/ads/social agent skills" },
  ];
  for (const o of oss) {
    keep({
      kind: "oss",
      title: o.title,
      url: o.url,
      importance: 4,
      source: "user-repos",
      tags: ["oss", "stack"],
      body: o.role,
    });
  }

  keep({
    kind: "ad-pricing",
    title: "Google Ads lowest practical floors 2026",
    importance: 5,
    source: "research-2026-07",
    tags: ["google", "ads", "budget"],
    body: `No hard platform minimum (~$1/day possible). Practical: Display $5–15/day for awareness
(CPC ~$0.20–$1, avg ~$0.63). Search $20–50/day to learn (CPC often $2–5). YouTube CPV
~$0.01–$0.30 — cheapest view volume path. Prefer Demand Gen / YouTube / Display for
million-view hunting; Search only for high-intent keywords.`,
  });

  keep({
    kind: "ad-pricing",
    title: "Meta Ads lowest practical floors 2026",
    importance: 5,
    source: "research-2026-07",
    tags: ["meta", "instagram", "ads", "budget"],
    body: `Technical floor ~$1/day (impressions) / ~$5/day (clicks/conversions). Practical
awareness/ugc test: $10–25/day. Traffic: $15–50/day. Conversions need ~$50–150/day to
exit learning (~50 events/week). For million views: objective=Video views / ThruPlay
or Reach with cheap UGC creative; consolidate ad sets — don't fragment budget.`,
  });

  keep({
    kind: "ad-pricing",
    title: "X Ads lowest practical floors 2026",
    importance: 5,
    source: "research-2026-07",
    tags: ["x", "twitter", "ads", "budget"],
    body: `Often ~$5/day platform floor (sometimes no hard min). Practical learn budget $20–50/day.
CPC ~$0.50–$2, CPM ~$6–10. Video views can be ~$0.01–$0.03. Best cheap path for Magmos:
Promoted video views / engagement on forge UGC, keyword+interest crypto/Sui builders.`,
  });

  keep({
    kind: "insight",
    title: "Magmos cheap-reach allocation (weekly $500)",
    importance: 5,
    source: "veil-xbot-paid-growth",
    tags: ["magmos", "budget", "allocation"],
    body: `Maximize views at floor prices: X video views 40% ($5–25/day tests), Meta/IG Reels
views 35% ($10–25/day awareness), Google YouTube/Demand Gen 25% ($10–20/day). Kill
losers by day 3. Creative from edit-auto/export-ads/ad-maker — product on screen first.`,
  });

  keep({
    kind: "brand",
    title: "Magmos product truth",
    importance: 5,
    source: "knowledge/magmos",
    tags: ["magmos", "product"],
    url: "https://magmoslabs.vercel.app",
    body: `Composable yield-dollar on Sui. Real Move txs, AURUM forge. Demo URL magmoslabs.vercel.app.
X @henrysammarfo. UGC angle: founder POV of live forge — real wallet, real tx. No stock scientist.`,
  });

  const skills = adoptSkillsIntoBrain(120);
  counted += skills.adopted;

  return { counted };
}
