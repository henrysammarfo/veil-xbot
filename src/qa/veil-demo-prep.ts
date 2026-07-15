/**
 * Pre-capture prep — skip onboarding tour, verify manager balance before live demo.
 */
import { env } from "../config.js";
import { loadOrCreateWallet } from "./sui-wallet.js";
import { fetchManagerIdleUsdc } from "./predict-sdk.js";
import { cachedManagerForWallet } from "./predict-cache.js";
import { fetchManagerForOwner } from "./predict-sdk.js";
import { ensureManagerFundedForDemo } from "./sandbox-mint.js";
import { fundSandboxFromVeil } from "./fund-sandbox.js";
import { getSandboxNetwork } from "./sui-wallet.js";
import { PREDICT_TESTNET } from "./predict-sdk.js";
import { microToUsdc } from "@veil/sdk";
import { withSuiRpcRetry } from "./sui-rpc.js";

function resolveApiUrl(): string {
  const explicit = env("VEIL_API_URL") || env("VEIL_API_UPSTREAM");
  if (explicit) return explicit.replace(/\/$/, "");
  return "http://51.103.219.168:8787";
}

/** Persist prefs so onboarding wizard never blocks capture. */
export async function skipVeilOnboarding(address: string): Promise<void> {
  const api = resolveApiUrl();
  try {
    const res = await fetch(`${api}/api/prefs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        trader: address,
        onboardingWizardDone: true,
        onboardingDismissed: true,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok) {
      console.log("  ✓ Onboarding tour skipped (server prefs)");
    }
  } catch (e) {
    console.warn("  … prefs skip failed (capture will dismiss UI):", e instanceof Error ? e.message : e);
  }
}

export async function resolveManagerId(address: string): Promise<string | null> {
  return (await fetchManagerForOwner(address)) ?? cachedManagerForWallet(address);
}

async function walletDusdcBalance(address: string): Promise<number> {
  const network = getSandboxNetwork("veil");
  const coins = await withSuiRpcRetry(
    "wallet dUSDC",
    (c) => c.getCoins({ owner: address, coinType: PREDICT_TESTNET.dusdcType }),
    network,
  );
  const total = coins.data.reduce((s, c) => s + BigInt(c.balance), 0n);
  return microToUsdc(total);
}

/** Top up sandbox wallet from Veil dev wallet when dUSDC is low. */
export async function ensureSandboxWalletFunded(minUsdc: number): Promise<void> {
  const wallet = loadOrCreateWallet("veil");
  let bal = await walletDusdcBalance(wallet.address);
  if (bal >= minUsdc) return;
  console.log(`  … sandbox wallet ${bal.toFixed(1)} dUSDC — funding from Veil dev wallet…`);
  try {
    const r = await fundSandboxFromVeil("veil");
    bal = r.dusdcBalance;
    console.log(`  ✓ Funded sandbox → ${bal.toFixed(1)} dUSDC`);
  } catch (e) {
    throw new Error(
      `${e instanceof Error ? e.message : e} — need ≥${minUsdc} dUSDC for live orders`,
    );
  }
  if (bal < minUsdc) {
    throw new Error(`Sandbox wallet ${bal.toFixed(1)} dUSDC < ${minUsdc} after fund`);
  }
}

/** Fund manager + verify idle balance before any live orders. */
export async function prepareVeilLiveDemo(opts?: {
  targetManagerUsdc?: number;
  minOrderUsdc?: number;
}): Promise<{ address: string; managerId: string; idleUsdc: number }> {
  const wallet = loadOrCreateWallet("veil");
  const target = opts?.targetManagerUsdc ?? Number(env("VEIL_DEMO_MANAGER_USDC", "55"));
  const minOrder = opts?.minOrderUsdc ?? Number(env("VEIL_MIN_ORDER_USDC", "25"));
  const needBoth = minOrder * 2;

  await ensureSandboxWalletFunded(target);
  await skipVeilOnboarding(wallet.address);

  const { managerId, idleUsdc } = await ensureManagerFundedForDemo("veil", target);
  if (idleUsdc < needBoth) {
    await ensureSandboxWalletFunded(target);
    const retry = await ensureManagerFundedForDemo("veil", target);
    if (retry.idleUsdc < needBoth) {
      throw new Error(
        `Manager ${retry.idleUsdc.toFixed(1)} dUSDC idle — need ≥${needBoth} for bull+bear. Fund sandbox wallet.`,
      );
    }
    return { address: wallet.address, managerId: retry.managerId, idleUsdc: retry.idleUsdc };
  }
  return { address: wallet.address, managerId, idleUsdc };
}

export async function verifyManagerBalance(
  minUsdc: number,
  managerId?: string,
  autoFund = true,
): Promise<number> {
  const wallet = loadOrCreateWallet("veil");
  const mid = managerId ?? (await resolveManagerId(wallet.address));
  if (!mid) throw new Error("No PredictManager — run mint first");
  let idle = await fetchManagerIdleUsdc(mid);
  if (idle < minUsdc && autoFund) {
    console.log(`  … manager ${idle.toFixed(1)} dUSDC < ${minUsdc} — stop, fund, retry…`);
    await ensureSandboxWalletFunded(Number(env("VEIL_DEMO_MANAGER_USDC", "55")));
    await ensureManagerFundedForDemo("veil", Number(env("VEIL_DEMO_MANAGER_USDC", "55")));
    idle = await fetchManagerIdleUsdc(mid);
  }
  if (idle < minUsdc) {
    throw new Error(
      `Manager balance ${idle.toFixed(1)} dUSDC < ${minUsdc} required — run: npm start wallet fund veil`,
    );
  }
  return idle;
}
