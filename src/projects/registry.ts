/**
 * Multi-project registry — Veil, Magmos, + future launches.
 * Add a project: copy template, fill knowledge/<id>.md, run npm run ops <id>
 */
export type ProjectId = string;

export interface ProjectDef {
  id: ProjectId;
  name: string;
  tagline: string;
  pillars: string[];
  avoid: string[];
  primaryUrl: string;
  secondaryUrl?: string;
  handles: string[];
  /** Realistic UGC angle — no fake influencer */
  ugcAngle: string;
  qaTopics: string[];
}

const PROJECTS: Record<string, ProjectDef> = {
  veil: {
    id: "veil",
    name: "Veil",
    tagline: "Stealth execution on Sui — intent off-chain, slices on DeepBook Predict",
    pillars: [
      "Stealth execution — parent intent off-chain, slices on DeepBook Predict",
      "TEE-attested fills — provable, not trust-me",
      "Plain-English intent → BULL/BEAR/EARN/PARLAY",
      "Testnet live — real mints, real settlement, real losses",
    ],
    avoid: ["guaranteed profits", "100x", "hype without demo", "AI fake trading receipts"],
    primaryUrl: process.env.VEIL_DEMO_URL || "https://veil-reviewer.vercel.app",
    secondaryUrl: process.env.VEIL_WAITLIST_URL,
    handles: ["@SuiNetwork", "@DeepBookonSui"],
    ugcAngle: "Founder POV screen recording — real dashboard, real loss/win. No AI face.",
    qaTopics: ["settlement", "stealth", "TEE", "Kelly stake", "15m orders", "waitlist"],
  },
  magmos: {
    id: "magmos",
    name: "Magmos Labs",
    tagline: "Composable yield-dollar on Sui — AURUM / sAURUM",
    pillars: [
      "Forge · smelt · refine lifecycle",
      "Thermal limits + Forge Council",
      "Testnet Move contracts — not a mockup",
    ],
    avoid: ["APY guarantees", "confusing with Veil trading", "stablecoin yield promises"],
    primaryUrl: process.env.MAGOS_REPO_URL || "https://github.com/henrysammarfo/magmoslabs",
    handles: ["@SuiNetwork"],
    ugcAngle: "Terminal/forge screen + optional hands on keyboard. No stock-photo scientist.",
    qaTopics: ["AURUM", "forge", "sAURUM", "thermal limits", "testnet"],
  },
};

export function getProject(id: string): ProjectDef {
  const p = PROJECTS[id];
  if (!p) throw new Error(`Unknown project "${id}". Known: ${listProjects().join(", ")}`);
  return p;
}

export function listProjects(): string[] {
  return Object.keys(PROJECTS);
}

export function isBrandKey(id: string): id is "veil" | "magmos" {
  return id === "veil" || id === "magmos";
}

/** Register runtime project (future launches without code change if env set) */
export function registerProject(def: ProjectDef): void {
  PROJECTS[def.id] = def;
}
