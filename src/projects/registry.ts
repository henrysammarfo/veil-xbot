/**
 * Multi-project registry — Veil, Magmos, web2 SaaS, anything.
 *
 * Add a project:
 *   1. Copy projects/_template.json → projects/my-app.json
 *   2. Optional: knowledge/my-app.md for Q&A truth
 *   3. npm start ops my-app
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export type ProjectId = string;

export type ProjectVertical = "web3" | "web2" | "other";

export interface ProjectDef {
  id: ProjectId;
  name: string;
  tagline: string;
  /** web3 = on-chain demo paths; web2 = product/marketing only */
  vertical?: ProjectVertical;
  pillars: string[];
  avoid: string[];
  primaryUrl: string;
  secondaryUrl?: string;
  handles: string[];
  ugcAngle: string;
  qaTopics: string[];
}

const xbotRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

const PROJECTS: Record<string, ProjectDef> = {
  veil: {
    id: "veil",
    name: "Veil",
    tagline: "Stealth execution on Sui — intent off-chain, slices on DeepBook Predict",
    vertical: "web3",
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
    vertical: "web3",
    pillars: [
      "Forge · smelt · refine lifecycle (USDC → AURUM → sAURUM)",
      "Thermal limits + Forge Council risk controls",
      "Live testnet app — real Move txs, wallet-gated dashboard",
      "MAGMA governance + VYSS + liquidity layer",
    ],
    avoid: ["APY guarantees", "confusing with Veil trading", "stablecoin yield promises"],
    /** Live app first — repo is secondary proof */
    primaryUrl: process.env.MAGOS_DEMO_URL || "https://magmoslabs.vercel.app",
    secondaryUrl: process.env.MAGOS_REPO_URL || "https://github.com/henrysammarfo/magmoslabs",
    handles: [
      process.env.MAGOS_X_HANDLE ? `@${process.env.MAGOS_X_HANDLE.replace(/^@/, "")}` : "@henrysammarfo",
      "@SuiNetwork",
    ],
    ugcAngle: "Founder POV of magmoslabs.vercel.app /aurum forge — real wallet, real tx. No stock scientist.",
    qaTopics: ["AURUM", "sAURUM", "forge", "smelt", "refine", "thermal limits", "Forge Council", "testnet"],
  },
};

function loadJsonProjects(): void {
  const dir = join(xbotRoot, "projects");
  if (!existsSync(dir)) return;
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".json") || file.startsWith("_")) continue;
    try {
      const def = JSON.parse(readFileSync(join(dir, file), "utf8")) as ProjectDef;
      if (def.id) PROJECTS[def.id] = { vertical: "web2", ...def, id: def.id };
    } catch {
      /* skip invalid */
    }
  }
}

loadJsonProjects();

export function getProject(id: string): ProjectDef {
  const p = PROJECTS[id];
  if (!p) {
    throw new Error(
      `Unknown project "${id}". Known: ${listProjects().join(", ")}\n` +
        `Add projects/<id>.json from projects/_template.json`,
    );
  }
  return p;
}

export function listProjects(): string[] {
  return Object.keys(PROJECTS).sort();
}

/** Legacy alias — any registered project id works for marketing/GTM */
export type BrandKey = ProjectId;

export function isBrandKey(id: string): id is BrandKey {
  return id in PROJECTS;
}

/** On-chain sandbox / Predict demo — web3 projects only */
export function isWeb3Project(id: string): boolean {
  if (!isBrandKey(id)) return false;
  return getProject(id).vertical !== "web2";
}

export function registerProject(def: ProjectDef): void {
  PROJECTS[def.id] = def;
}

export function projectKnowledgePath(id: string): string {
  return join(xbotRoot, "knowledge", `${id}.md`);
}

export function loadProjectKnowledge(id: string): string {
  const p = projectKnowledgePath(id);
  if (!existsSync(p)) return "";
  return readFileSync(p, "utf8");
}
