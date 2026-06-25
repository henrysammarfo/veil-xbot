export const VEIL_VOICE = {
  brand: "veil" as const,
  name: "Veil",
  pillars: [
    "Stealth execution — parent intent off-chain, slices on DeepBook Predict",
    "TEE-attested fills on Sui — provable, not trust-me",
    "Plain-English intent → BULL/BEAR/EARN/PARLAY",
    "Build in public on testnet — real mints, real settlement",
  ],
  avoid: ["guaranteed profits", "100x", "not financial advice without context", "hype without demo link"],
  tags: ["@SuiNetwork", "@DeepBookonSui", "#SuiOverflow", "#DeFi", "#StealthTrading"],
  demoUrl: () => process.env.VEIL_DEMO_URL || "https://veil-reviewer.vercel.app",
  waitlistUrl: () => process.env.VEIL_WAITLIST_URL || "[WAITLIST_URL]",
};

export const MAGOS_VOICE = {
  brand: "magmos" as const,
  name: "Magmos Labs",
  pillars: [
    "Composable yield-dollar on Sui — AURUM / sAURUM",
    "Forge · smelt · refine lifecycle",
    "Thermal limits + Forge Council risk controls",
    "Testnet live — real Move contracts",
  ],
  avoid: ["stablecoin yield guarantees", "APY without context", "confusing with Veil stealth trading"],
  tags: ["@SuiNetwork", "#SuiOverflow", "#DeFi", "#Yield"],
  repoUrl: () => process.env.MAGOS_REPO_URL || "https://github.com/henrysammarfo/magmoslabs",
};

export type BrandKey = "veil" | "magmos";

export function brandVoice(key: BrandKey) {
  return key === "magmos" ? MAGOS_VOICE : VEIL_VOICE;
}

export function brandLink(key: BrandKey): string {
  return key === "veil" ? VEIL_VOICE.demoUrl() : MAGOS_VOICE.repoUrl();
}
