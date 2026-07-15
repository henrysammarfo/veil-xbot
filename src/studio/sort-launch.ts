/**
 * Venice AI — rank hooks + 30s script from live demo or project brief.
 */
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR, assertDataDir } from "../config.js";
import { chatCompletion, llmStatus } from "../ai/router.js";
import { getProject } from "../projects/registry.js";
import type { MintDemoResult } from "../qa/sandbox-mint.js";
import { defaultLaunchBrief, defaultVeilLaunchBrief, formatEddyLaunchBrief } from "./eddy-launch.js";

export interface LaunchBeat {
  sec: number;
  visual: string;
  onScreen?: string;
}

export interface SortedLaunch {
  rankedHooks: Array<{ text: string; score: number; why: string }>;
  script30s: {
    hook3s: string;
    beats: LaunchBeat[];
    cta: string;
  };
  deleteShots: string[];
  provider: string;
  model: string;
}

function fallbackSorted(mint: MintDemoResult, projectId?: string): SortedLaunch {
  const p = projectId ? getProject(projectId) : null;
  const brief = mint.mintDigest
    ? defaultVeilLaunchBrief(mint.mintDigest)
    : p
      ? defaultLaunchBrief({
          outcomeLine: p.tagline,
          proofShots: [p.ugcAngle],
          ctaLine: `Try it — ${p.primaryUrl}`,
        })
      : defaultVeilLaunchBrief();
  const hook = brief.outcomeLine;
  return {
    rankedHooks: [
      { text: hook, score: 10, why: "Outcome-first — no logo" },
      {
        text: mint.mintDigest
          ? `Real tx: ${mint.mintDigest.slice(0, 12)}…`
          : "Live testnet mint — not a mock",
        score: 9,
        why: "Proof beats polish",
      },
      { text: brief.problemLine, score: 7, why: "Pain before features" },
    ],
    script30s: {
      hook3s: hook,
      beats: [
        { sec: 0, visual: "Suiscan tx success — full screen", onScreen: hook },
        { sec: 3, visual: brief.problemLine, onScreen: "Everyone sees large orders" },
        { sec: 8, visual: "Veil dashboard intent → fill", onScreen: brief.solutionLine },
        { sec: 18, visual: brief.proofShots[0] ?? "Wallet balance delta" },
        { sec: 25, visual: "CTA card", onScreen: brief.ctaLine },
      ],
      cta: brief.ctaLine,
    },
    deleteShots: brief.forbidden,
    provider: "template",
    model: "eddy-default",
  };
}

/** Sort / rank launch assets — prefers Venice AI when configured. */
export async function sortLaunchFromDemo(
  mint: MintDemoResult,
  projectName: string,
  projectId?: string,
): Promise<SortedLaunch> {
  const proof = mint.explorerMint ?? (projectId ? getProject(projectId).primaryUrl : "(no tx — run demo again)");
  const strike = mint.strikeUsd ? `~$${Math.round(mint.strikeUsd).toLocaleString()}` : "ATM";

  const userPayload = {
    project: projectName,
    outcome: "Stealth on-chain execution — intent hidden, fills real",
    liveProof: {
      explorer: proof,
      digest: mint.mintDigest,
      strike,
      wallet: mint.wallet,
      preflightWarnings: mint.preflightWarnings ?? [],
    },
    eddyRules: [
      "First 3s = biggest outcome, no logo",
      "Sell change not features",
      "Show live proof not slides",
      "Hook → Problem → Solution → Proof → CTA",
      "Leave curiosity — don't explain every feature",
    ],
    task: "Return JSON: rankedHooks[{text,score,why}], script30s{hook3s,beats[{sec,visual,onScreen}],cta}, deleteShots[]",
  };

  try {
    const llm = await chatCompletion("launch", JSON.stringify(userPayload, null, 2), {
      context: projectName,
    });
    const parsed = JSON.parse(llm.content) as Partial<SortedLaunch>;
    return {
      rankedHooks: parsed.rankedHooks?.length ? parsed.rankedHooks : fallbackSorted(mint, projectId).rankedHooks,
      script30s: parsed.script30s ?? fallbackSorted(mint, projectId).script30s,
      deleteShots: parsed.deleteShots ?? defaultLaunchBrief().forbidden,
      provider: llm.provider,
      model: llm.model,
    };
  } catch {
    return fallbackSorted(mint, projectId);
  }
}

/** Rank launch hooks for any project — web2/web3, no on-chain demo required. */
export async function sortLaunchForProject(projectId: string): Promise<SortedLaunch> {
  const project = getProject(projectId);
  const emptyMint = { wallet: "", managerId: "", depositUsdc: 0, strikeUsd: 0 } as MintDemoResult;
  return sortLaunchFromDemo(emptyMint, project.name, projectId);
}

export async function writeSortedLaunchForProject(projectId: string): Promise<SortedLaunch> {
  assertDataDir();
  const project = getProject(projectId);
  const sorted = await sortLaunchForProject(projectId);
  const dir = join(DATA_DIR, "ops");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "LAUNCH-SORTED.md"), formatSortedLaunch(sorted));
  writeFileSync(join(dir, "launch-sorted.json"), JSON.stringify(sorted, null, 2));
  return sorted;
}

export async function writeSortedLaunch(
  mint: MintDemoResult,
  projectName: string,
  projectId?: string,
): Promise<SortedLaunch> {
  assertDataDir();
  const sorted = await sortLaunchFromDemo(mint, projectName, projectId);
  const dir = join(DATA_DIR, "ops");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "LAUNCH-SORTED.md"), formatSortedLaunch(sorted, mint));
  writeFileSync(join(dir, "launch-sorted.json"), JSON.stringify(sorted, null, 2));
  return sorted;
}

export function formatSortedLaunch(s: SortedLaunch, mint?: MintDemoResult): string {
  const lines = [
    `# Launch sorted — proof-first (Eddy structure)`,
    ``,
    `_${s.provider} · ${s.model}_ · ${llmStatus()}`,
    ``,
    `## Ranked hooks (use #1 on screen in first 3 seconds)`,
    ...s.rankedHooks.map((h, i) => `${i + 1}. **(${h.score}/10)** ${h.text}\n   _${h.why}_`),
    ``,
    `## 30s script — show, don't explain`,
    `**0–3s on screen:** ${s.script30s.hook3s}`,
    ``,
  ];
  for (const b of s.script30s.beats) {
    lines.push(`- **${b.sec}s** ${b.visual}${b.onScreen ? ` → _"${b.onScreen}"_` : ""}`);
  }
  lines.push(``, `**CTA:** ${s.script30s.cta}`, ``, `## Delete these shots`, ...s.deleteShots.map((d) => `- ${d}`));
  if (mint?.explorerMint) {
    lines.push(``, `## Live proof URL`, mint.explorerMint);
  }
  lines.push(``, `---`, formatEddyLaunchBrief(defaultVeilLaunchBrief(mint?.mintDigest)));
  return lines.join("\n");
}
