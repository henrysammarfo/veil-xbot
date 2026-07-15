/**
 * Venice credit budget — quote before spend, ledger, session caps.
 * @see https://docs.venice.ai/api-reference/endpoint/video/quote
 * @see https://docs.venice.ai/api-reference/endpoint/billing/balance
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { env, DATA_DIR, assertDataDir } from "../config.js";
import { veniceConfig, veniceHeaders, hasVenice } from "./venice.js";

export interface CreditLedger {
  startingBudgetUsd: number;
  spentUsd: number;
  entries: Array<{
    at: number;
    projectId?: string;
    modality: string;
    model: string;
    usd: number;
    note: string;
  }>;
}

export interface VeniceBalance {
  usdRemaining?: number;
  diemRemaining?: number;
  raw: Record<string, unknown>;
}

const LEDGER_PATH = () => join(DATA_DIR, "venice", "credit-ledger.json");

/** User-declared pool (e.g. 8000 credits ≈ $8000 USD prepaid). Override via API balance when available. */
export function configuredBudgetUsd(): number {
  return Number(env("VENICE_CREDIT_BUDGET", env("VENICE_BUDGET_USD", "8000")));
}

export function sessionBudgetUsd(): number {
  return Number(env("VENICE_SESSION_BUDGET_USD", "25"));
}

export function autoApproveMaxUsd(): number {
  return Number(env("VENICE_AUTO_MAX_USD", "2"));
}

export function loadLedger(): CreditLedger {
  assertDataDir();
  const dir = join(DATA_DIR, "venice");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  if (!existsSync(LEDGER_PATH())) {
    return { startingBudgetUsd: configuredBudgetUsd(), spentUsd: 0, entries: [] };
  }
  try {
    return JSON.parse(readFileSync(LEDGER_PATH(), "utf8")) as CreditLedger;
  } catch {
    return { startingBudgetUsd: configuredBudgetUsd(), spentUsd: 0, entries: [] };
  }
}

export function saveLedger(ledger: CreditLedger): void {
  assertDataDir();
  const dir = join(DATA_DIR, "venice");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(LEDGER_PATH(), JSON.stringify(ledger, null, 2));
}

export function recordSpend(
  usd: number,
  entry: Omit<CreditLedger["entries"][0], "at" | "usd">,
): CreditLedger {
  const ledger = loadLedger();
  ledger.entries.push({ ...entry, at: Date.now(), usd });
  ledger.spentUsd = Math.round((ledger.spentUsd + usd) * 10000) / 10000;
  saveLedger(ledger);
  return ledger;
}

export function ledgerRemainingUsd(ledger = loadLedger()): number {
  return Math.max(0, ledger.startingBudgetUsd - ledger.spentUsd);
}

/** GET /billing/balance — live wallet when API key has billing scope */
export async function fetchVeniceBalance(): Promise<VeniceBalance | null> {
  if (!hasVenice()) return null;
  const cfg = veniceConfig();
  try {
    const res = await fetch(`${cfg.baseUrl}/billing/balance`, { headers: veniceHeaders(cfg) });
    if (!res.ok) return null;
    const raw = (await res.json()) as Record<string, unknown>;
    const usd =
      Number(raw.usd_balance ?? raw.usdBalance ?? raw.balance_usd ?? raw.balanceUsd ?? NaN) ||
      undefined;
    const diem =
      Number(raw.diem_balance ?? raw.diemBalance ?? raw.remaining_diem ?? NaN) || undefined;
    return { usdRemaining: usd, diemRemaining: diem, raw };
  } catch {
    return null;
  }
}

/** Static image $/image from Venice pricing page (1K tier). */
export const IMAGE_USD_ESTIMATE: Record<string, number> = {
  "nano-banana-lite": 0.06,
  "nano-banana-2": 0.1,
  "nano-banana-pro": 0.18,
  "flux-2-pro": 0.03,
  "flux-dev": 0.03,
  "venice-sd35": 0.01,
  "qwen-image-2": 0.05,
};

export function estimateImageUsd(model: string): number {
  return IMAGE_USD_ESTIMATE[model] ?? 0.1;
}

/** Kokoro ≈ $3.50 / 1M chars */
export function estimateTtsUsd(text: string, model = "tts-kokoro"): number {
  const perM =
    model.includes("kokoro") ? 3.5 : model.includes("xai") ? 18.75 : 50;
  return (text.length / 1_000_000) * perM;
}

/** Cheap text — ~500 in + 800 out tokens */
export function estimateTextUsd(model: string): number {
  if (model.includes("deepseek") || model.includes("glm-4.7-flash")) return 0.001;
  if (model.includes("venice-uncensored")) return 0.002;
  return 0.01;
}

export async function quoteVideoUsd(params: {
  model: string;
  duration?: string;
  resolution?: string;
  aspectRatio?: string;
  audio?: boolean;
}): Promise<number> {
  const cfg = veniceConfig();
  const res = await fetch(`${cfg.baseUrl}/video/quote`, {
    method: "POST",
    headers: veniceHeaders(cfg),
    body: JSON.stringify({
      model: params.model,
      duration: params.duration ?? "5s",
      resolution: params.resolution ?? "720p",
      aspect_ratio: params.aspectRatio ?? "16:9",
      audio: params.audio ?? false,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`video quote ${res.status}: ${err.slice(0, 200)}`);
  }
  const data = (await res.json()) as { quote?: number };
  if (typeof data.quote !== "number") throw new Error("video quote missing");
  return data.quote;
}

export class VeniceBudgetError extends Error {
  constructor(
    message: string,
    public readonly estimatedUsd: number,
    public readonly remainingUsd: number,
  ) {
    super(message);
    this.name = "VeniceBudgetError";
  }
}

/** Refuse spend above session cap or auto-approve max unless force=true */
export function assertCanSpend(
  estimatedUsd: number,
  opts?: { force?: boolean; label?: string },
): void {
  const ledger = loadLedger();
  const remaining = ledgerRemainingUsd(ledger);
  const sessionCap = sessionBudgetUsd();

  if (estimatedUsd > remaining) {
    throw new VeniceBudgetError(
      `${opts?.label ?? "Request"} $${estimatedUsd.toFixed(2)} exceeds ledger remaining $${remaining.toFixed(2)} — raise VENICE_CREDIT_BUDGET or reset ledger`,
      estimatedUsd,
      remaining,
    );
  }
  if (!opts?.force && estimatedUsd > autoApproveMaxUsd()) {
    throw new VeniceBudgetError(
      `${opts?.label ?? "Request"} $${estimatedUsd.toFixed(2)} > auto cap $${autoApproveMaxUsd()} — pass --force or raise VENICE_AUTO_MAX_USD`,
      estimatedUsd,
      remaining,
    );
  }
  if (!opts?.force && ledger.spentUsd + estimatedUsd > sessionCap && sessionCap > 0) {
    throw new VeniceBudgetError(
      `Session budget $${sessionCap} would be exceeded (+$${estimatedUsd.toFixed(2)}) — pass --force or raise VENICE_SESSION_BUDGET_USD`,
      estimatedUsd,
      remaining,
    );
  }
}

export function formatBudgetReport(): string {
  const ledger = loadLedger();
  const remaining = ledgerRemainingUsd(ledger);
  const lines = [
    `# Venice credit budget`,
    `Configured pool: $${ledger.startingBudgetUsd.toFixed(2)} (VENICE_CREDIT_BUDGET)`,
    `Spent (ledger): $${ledger.spentUsd.toFixed(2)}`,
    `Remaining (ledger): $${remaining.toFixed(2)}`,
    `Session cap: $${sessionBudgetUsd()} · Auto-approve max: $${autoApproveMaxUsd()}`,
    "",
    "## Recent spend",
  ];
  for (const e of ledger.entries.slice(-8).reverse()) {
    lines.push(
      `- $${e.usd.toFixed(2)} · ${e.modality} · ${e.model} · ${e.note}${e.projectId ? ` (${e.projectId})` : ""}`,
    );
  }
  if (!ledger.entries.length) lines.push("- (none yet)");
  return lines.join("\n");
}

export function resetLedger(startingUsd?: number): CreditLedger {
  const ledger: CreditLedger = {
    startingBudgetUsd: startingUsd ?? configuredBudgetUsd(),
    spentUsd: 0,
    entries: [],
  };
  saveLedger(ledger);
  return ledger;
}
