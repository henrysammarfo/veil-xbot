/**
 * Paid growth playbook — X Premium (blue tick), promoted posts, TikTok ads.
 * Creative is autonomous (edit-auto); this module handles distribution + budget.
 */
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR, assertDataDir, env } from "../config.js";
import { getProject } from "../projects/registry.js";
import { brandVoice } from "../brands.js";
import { firstPostAlgorithmChecklist } from "../algorithm/x-signals.js";
import { adStyleForBrand } from "../edit/styles.js";
import { tierReport } from "../studio/tiers.js";
import { formatBudgetReport, configuredBudgetUsd } from "../integrations/venice-credits.js";
import { newId } from "../store.js";

export interface PaidGrowthPack {
  id: string;
  projectId: string;
  at: number;
  outputPath: string;
  markdown: string;
  weeklyBudgetUsd: number;
  blueTickReady: boolean;
}

function weeklyBudget(): number {
  return Number(env("MAGOS_AD_BUDGET_USD", env("PAID_GROWTH_BUDGET_USD", "500")));
}

function blueTickMonthlyUsd(): number {
  return Number(env("X_PREMIUM_BUDGET_USD", "8"));
}

export function buildPaidGrowthPack(projectId: string): PaidGrowthPack {
  const project = getProject(projectId);
  const voice = brandVoice(projectId);
  const adStyle = adStyleForBrand(projectId);
  const weekly = weeklyBudget();
  const premium = blueTickMonthlyUsd();

  const algo = firstPostAlgorithmChecklist();
  const sections: string[] = [
    `# PAID GROWTH — ${project.name}`,
    `_${new Date().toISOString()}_`,
    ``,
    `**Focus:** Magmos forge ads + verified account + promoted distribution.`,
    `**Weekly ad budget (env):** $${weekly}`,
    `**X Premium (blue tick):** ~$${premium}/mo — purchase manually at x.com/i/premium_sign_up`,
    ``,
    `## 1. Blue tick (X Premium)`,
    `- [ ] Subscribe X Premium on **@henrysammarfo** (or dedicated Magmos account)`,
    `- [ ] Complete verification — government ID if prompted`,
    `- [ ] Pin forge ad video after first promoted post`,
    `- [ ] Enable **Premium+** only if running long-form video ads (optional)`,
  ];

  if (projectId === "magmos") {
    sections.push(
      ``,
      `## 2. Magmos ad creative (autonomous — no CapCut)`,
      `\`\`\`bash`,
      `npm run edit-auto forge-recording.mp4 magmos`,
      `npm run magmos-ad forge-recording.mp4`,
      `\`\`\``,
      ``,
      `Style: **${adStyle.id}** — beat-sync, music bed, captions, b-roll, SFX`,
      `Hook on screen: **Forge tx landed. Not a mockup.**`,
      ``,
      `## 3. X Ads — week 1 test ($${Math.round(weekly * 0.6)}/wk)`,
      `- Objective: **Video views** or **Engagement** (not followers cold)`,
      `- Placement: X feed + profile`,
      `- Creative: 9:16 from \`export-ads\` — first 1.5s = hook text burned in`,
      `- Audience: Sui, DeFi, crypto builders — interest + keyword @SuiNetwork followers`,
      `- Budget: $25–50/day × 5 days → read CTR, kill losers by day 3`,
      `- CTA link: ${voice.link()}`,
      `- Repo proof (reply only): ${voice.waitlistUrl() || env("MAGOS_REPO_URL", "https://github.com/henrysammarfo/magmoslabs")}`,
      ``,
      `## 4. TikTok / Spark Ads ($${Math.round(weekly * 0.25)}/wk)`,
      `- Same 9:16 master — Spark from organic post if possible`,
      `- Interest: cryptocurrency, fintech, investing`,
      `- Hook: terminal / forge UI — no stock scientist`,
      ``,
      `## 5. Organic + paid flywheel`,
      `- Post organic **before** promoting (social proof on ad)`,
      `- Reply to 15 accounts in first 30 min on launch day`,
      `- Quote-tweet 3 trending DeFi posts same day (\`npm run engage-batch 5 magmos\`)`,
      `- Cross-tag Veil only after Magmos post is 30+ min old`,
    );
  } else {
    sections.push(
      ``,
      `## 2. Ad creative`,
      `Use \`npm run edit-auto <file> ${projectId}\` — style **${adStyle.id}**`,
      ``,
      `## 3. X Ads test budget`,
      `- $25/day video views · link ${voice.link()}`,
    );
  }

  sections.push(
    ``,
    `## 6. Cheap paid floors (maximize views — verified research)`,
    `| Platform | Technical floor | Practical learn | Cheapest objective |`,
    `|----------|-----------------|-----------------|---------------------|`,
    `| **X Ads** | ~$5/day | $20–50/day | Video views (~$0.01–0.03) / engagement CPC ~$0.50–2 |`,
    `| **Meta / IG** | $1–5/day | Awareness $10–25/day · Conv $50+/day | Video views / Reach / ThruPlay |`,
    `| **Google** | ~$1/day | Display $5–15 · YT $10–20 · Search $20–50 | YouTube CPV / Display CPC ~$0.63 |`,
    ``,
    `### Magmos $${weekly}/wk split (floor-first)`,
    `- **X video views** — ${Math.round(weekly * 0.4)} — start $10–25/day, kill losers day 3`,
    `- **Meta/IG Reels views** — ${Math.round(weekly * 0.35)} — $10–25/day awareness, 1–2 ad sets only`,
    `- **Google YouTube / Demand Gen** — ${Math.round(weekly * 0.25)} — $10–20/day view hunting`,
    `- Avoid Search auctions early (higher CPC). Product must be on-screen from second 1.`,
    ``,
    `## 7. Studio budget (Venice / gen)`,
    formatBudgetReport(),
    ``,
    `Configured session cap: $${configuredBudgetUsd()}`,
    ``,
    `## 8. Algorithm checklist (organic still runs)`,
    ...algo.map((a) => `- [ ] ${a}`),
    ``,
    `## 9. Media tier`,
    tierReport(),
    ``,
    `## 10. Day-0 commands`,
    `\`\`\`bash`,
    `npm run grow ${project.primaryUrl}`,
    `npm run ops ${projectId}`,
    `npm run launch ${projectId} ${adStyle.id}`,
    `npm run growth-check ${projectId}`,
    `npm run engage-batch 5 ${projectId}`,
    `npm run serve   # dashboard :3947`,
    `\`\`\``,
    ``,
    `## 11. KPI (week 1 with ads)`,
    `| Metric | Target |`,
    `|--------|--------|`,
    `| Promoted video views | 50k–1M+ (floor objectives) |`,
    `| Profile visits | 500+ |`,
    `| Repo / site clicks | 100+ |`,
    `| Waitlist / DM signups | 25+ |`,
  );

  const markdown = sections.join("\n");
  assertDataDir();
  const dir = join(DATA_DIR, "growth");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const id = newId("growth");
  const outputPath = join(dir, "PAID-GROWTH.md");
  writeFileSync(outputPath, markdown);
  writeFileSync(join(dir, `${id}.json`), JSON.stringify({ id, projectId, at: Date.now(), weeklyBudgetUsd: weekly }, null, 2));

  return {
    id,
    projectId,
    at: Date.now(),
    outputPath,
    markdown,
    weeklyBudgetUsd: weekly,
    blueTickReady: true,
  };
}
