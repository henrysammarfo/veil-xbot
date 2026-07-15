import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { env, DATA_DIR, assertDataDir } from "../config.js";
import { newId } from "../store.js";
import { buildFirstPostPack, formatFirstPostPack } from "./first-post.js";
import { discoverClips } from "../discover/clips.js";
import { discoverHashtags } from "../discover/hashtags.js";
import { getMusicPlan, formatMusicPlan, saveMusicPlan } from "./music.js";
import { firstPostAlgorithmChecklist, xAlgorithmPromptBlock } from "../algorithm/x-signals.js";
import { styleForBrand } from "../edit/styles.js";
import type { BrandKey } from "../brands.js";
import { hasTinyfish } from "../research/tinyfish.js";
import { launchBriefForProject, formatEddyLaunchBrief } from "../studio/eddy-launch.js";
import { chatCompletion } from "../ai/router.js";

export interface LaunchPack {
  id: string;
  brand: BrandKey;
  createdAt: number;
  markdown: string;
}

/** ONE command — no loose ends. First post + clips + tags + music + algorithm + communities. */
export async function buildLaunchPack(brand: BrandKey, style?: string): Promise<LaunchPack> {
  const styleDef = styleForBrand(brand, style);
  const music = getMusicPlan(styleDef.id);
  saveMusicPlan(music);

  const first = await buildFirstPostPack(brand, styleDef.id);
  const tags = hasTinyfish() ? await discoverHashtags(brand) : null;
  const clips = hasTinyfish() ? await discoverClips({ niche: brand === "veil" ? "trading dark screen" : "forge fire abstract", limit: 8 }) : [];

  const algo = firstPostAlgorithmChecklist();
  const eddyBrief = formatEddyLaunchBrief(launchBriefForProject(brand));

  let launchScript = "";
  try {
    const llm = await chatCompletion(
      "launch",
      `Brand: ${brand}. Style: ${styleDef.id}. Write a 30s launch video script JSON:
{"hook3s":"on-screen text","beats":[{"sec":3,"visual":"..."}],"cta":"..."}
Outcome-first. Live proof. No logo open.`,
      { context: brand },
    );
    launchScript = llm.content;
  } catch {
    launchScript = "(Set OPENAI_API_KEY or VERNICE_API_* for AI script)";
  }

  let md = `# LAUNCH PACK — ${brand.toUpperCase()}\n\n`;
  md += `> Complete playbook. Keys: OpenAI / Vernice AI + TinyFish. No watermarked Kling/HeyGen.\n\n`;
  md += `## 0. LAUNCH VIDEO (Eddy rules — outcome first)\n\n${eddyBrief}\n\n`;
  md += `### AI script (${env("LLM_PROVIDER") || "auto"})\n\n\`\`\`json\n${launchScript}\n\`\`\`\n\n`;
  md += `## 1. WHAT TO POST FIRST (new channel)\n\n`;
  md += brand === "veil"
    ? `**Main feed:** 42s video — hook on screen: *I lost $5.05 on testnet. On purpose.*\n\n**NOT your first post:** feature thread, APY, tagging @SuiNetwork\n`
    : `**Main feed:** 42s forge tx screen — hook: *Forge tx landed. Not a mockup.*\n\n`;
  md += `## 2. POST COPY\n\n${first.draft}\n\n`;
  md += `## 3. HASHTAGS (max 2 on post)\n\n`;
  md += tags ? tags.hashtags.join(" ") + `\n\nEngage (don't spam): ${tags.tags.join(" ")}\n` : "Run with TinyFish for live tags\n";
  md += `\n## 4. MUSIC (${music.bpm} BPM)\n\n${formatMusicPlan(music)}\n\n`;
  md += `## 5. EDIT TIMELINE\n\n${first.manifestHuman}\n\n`;
  md += `## 6. B-ROLL CLIPS (bot found — download, no watermark)\n\n`;
  for (const c of clips) md += `- [${c.source}] ${c.title}\n  ${c.url}\n  → ${c.downloadHint}\n`;
  if (!clips.length) md += `npm run clips 8 crypto\n`;
  md += `\n## 7. X ALGORITHM (open source)\n\n\`\`\`\n${xAlgorithmPromptBlock()}\n\`\`\`\n\n`;
  md += algo.map((a) => `- [ ] ${a}`).join("\n") + "\n\n";
  md += `## 8. COMMUNITIES\n\n`;
  md += `Join on X → Communities:\n`;
  md += `- Build in Public (post day 1 as reply-style)\n`;
  md += `- DeFi\n`;
  md += `- ${brand === "veil" ? "Web3 Developers" : "Sui"}\n`;
  md += `Full list: COMMUNITIES.md\n\n`;
  md += `## 9. TEASER (12s for community / quote)\n\n`;
  md += `\`npm run teaser your-recording.mp4 ${brand}\`\n\n`;
  md += `## 10. DAY-OF CHECKLIST\n\n`;
  md += first.checklist.map((c) => `- [ ] ${c}`).join("\n") + "\n\n";
  md += `## 11. DOWNLOADS\n\nSee DOWNLOADS.md — SFX → assets/sfx/, music → assets/music/beat.mp3\n\n`;
  md += `## 12. ENGAGE TARGETS\n\n`;
  for (const t of first.targets) md += `- ${t.title}\n  ${t.url}\n`;

  const pack: LaunchPack = { id: newId("launch"), brand, createdAt: Date.now(), markdown: md };
  assertDataDir();
  const dir = join(DATA_DIR, "launch");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "LAUNCH.md"), md);
  writeFileSync(join(dir, "latest-launch.json"), JSON.stringify(pack, null, 2));
  return pack;
}
