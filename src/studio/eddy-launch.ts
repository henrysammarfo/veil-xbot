/**
 * Eddy Thakur (@Motionsbyeddy) launch video rules — outcome-first, proof over polish.
 * Wired into trailer/launch LLM prompts and HyperFrames scaffolds.
 */
export const EDDY_LAUNCH_STRUCTURE = [
  "hook",
  "problem",
  "solution",
  "proof",
  "cta",
] as const;

export type EddyLaunchBeat = (typeof EDDY_LAUNCH_STRUCTURE)[number];

export interface EddyLaunchBrief {
  hookSec: number;
  outcomeLine: string;
  problemLine: string;
  solutionLine: string;
  proofShots: string[];
  ctaLine: string;
  forbidden: string[];
}

/** System suffix for LLM tasks — keeps prompts locked across providers. */
export function eddyLaunchSystemSuffix(): string {
  return `
Launch video rules (Eddy / outcome-first):
- First 3 seconds: biggest OUTCOME on screen — no logo, no intro, no "hi I'm…"
- Sell what CHANGES, not features ("12 hours back" not "AI CRM")
- SHOW live proof (real tx, real screen, real wallet) — not a slide deck
- Every scene must answer: "Why keep watching?" — delete curiosity-killers
- Structure: Hook → Problem → Solution → Proof → CTA (simple wins)
- Do NOT explain every feature — leave curiosity for the click
- Proof beats polish — authentic demo > perfect animation
- One job: make viewer think "I need to try this" — not "cool editing"
`.trim();
}

export function defaultLaunchBrief(opts?: {
  outcomeLine?: string;
  problemLine?: string;
  solutionLine?: string;
  proofShots?: string[];
  ctaLine?: string;
  mintDigest?: string;
}): EddyLaunchBrief {
  const txProof = opts?.mintDigest
    ? `Suiscan tx ${opts.mintDigest.slice(0, 10)}… — sandbox wallet, real Predict mint`
    : "Live product proof — screen recording, not a slide deck";
  return {
    hookSec: 3,
    outcomeLine: opts?.outcomeLine ?? "Your intent executes on-chain — without broadcasting size.",
    problemLine: opts?.problemLine ?? "Large orders leak alpha. Everyone sees you coming.",
    solutionLine: opts?.solutionLine ?? "Veil slices TWAP through DeepBook Predict — stealth fills.",
    proofShots: opts?.proofShots ?? [
      txProof,
      "Playwright capture: landing → explorer → filled BULL position",
      "Wallet balance before/after — real dUSDC, real testnet",
    ],
    ctaLine: opts?.ctaLine ?? "Try the demo — link in bio.",
    forbidden: [
      "Logo splash open",
      "Founder intro first",
      "Feature bullet list",
      "APY / guaranteed returns",
      "Mock transaction hash",
    ],
  };
}

export function defaultVeilLaunchBrief(mintDigest?: string): EddyLaunchBrief {
  return defaultLaunchBrief({ mintDigest });
}

export function defaultMagmosLaunchBrief(txDigest?: string): EddyLaunchBrief {
  const txProof = txDigest
    ? `Suiscan tx ${txDigest.slice(0, 10)}… — forge smelt on testnet`
    : "Live forge terminal — real Move tx, not a mockup";
  return defaultLaunchBrief({
    outcomeLine: "Forge tx landed. Your yield-dollar lifecycle is on-chain.",
    problemLine: "Most DeFi yield is a slide deck. No proof you can verify.",
    solutionLine: "Magmos AURUM — forge · smelt · refine on Sui testnet.",
    proofShots: [
      txProof,
      "Terminal / forge UI — smelt flow with tx hash visible",
      "Repo README contracts — Move modules deployed",
    ],
    ctaLine: "Star the repo — link in bio. Forge walkthrough in replies.",
  });
}

export function launchBriefForProject(projectId: string, txDigest?: string): EddyLaunchBrief {
  if (projectId === "magmos") return defaultMagmosLaunchBrief(txDigest);
  return defaultVeilLaunchBrief(txDigest);
}

export function formatEddyLaunchBrief(b: EddyLaunchBrief): string {
  return [
    `# Launch video brief (Eddy structure)`,
    ``,
    `## Hook (0–${b.hookSec}s) — OUTCOME ONLY`,
    b.outcomeLine,
    ``,
    `## Problem`,
    b.problemLine,
    ``,
    `## Solution (show, don't explain)`,
    b.solutionLine,
    ``,
    `## Proof (live)`,
    ...b.proofShots.map((s) => `- ${s}`),
    ``,
    `## CTA`,
    b.ctaLine,
    ``,
    `## Delete these`,
    ...b.forbidden.map((f) => `- ${f}`),
  ].join("\n");
}

/** JSON shape for trailer LLM task */
export function eddyTrailerJsonSchema(): string {
  return `{
  "title": "working title",
  "logline": "outcome in one sentence — what CHANGES for the viewer",
  "hookOutcome": "text on screen in first 3 seconds — no logo",
  "acts": [
    {"name":"Hook","durationSec":3,"shots":["outcome visual only"]},
    {"name":"Problem","durationSec":8,"shots":["pain on screen"]},
    {"name":"Solution","durationSec":12,"shots":["live product proof"]},
    {"name":"Proof","durationSec":15,"shots":["real tx / real demo"]}
  ],
  "ending": {"type":"fade-black","text":"CTA — try it","fadeSec":2},
  "cast": {"role":"screen-only or founder demo","look":"authentic not studio","provider":"screen-only"},
  "music": "tension → release, sync cuts",
  "referenceVibe": "live proof not presentation"
}`;
}
