/**
 * Automated on-chain demo — sandbox wallet creates manager, deposits, mints BULL.
 */
import { config } from "dotenv";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import type { Transaction } from "@mysten/sui/transactions";
import { env, DATA_DIR, assertDataDir } from "../config.js";
import { withSuiRpcRetry } from "./sui-rpc.js";
import { loadOrCreateWallet, getSandboxNetwork } from "./sui-wallet.js";
import {
  PREDICT_TESTNET,
  fetchActiveOracle,
  fetchOracleForward,
  resolveMintStrike,
  fetchManagerForOwner,
  fetchManagerOnChain,
  fetchManagerIdleUsdc,
  fetchHorizonCatalog,
  preflightMint,
  fetchAskBounds,
  buildMintPtb,
  buildCreateManagerPtb,
  buildDepositManagerAmountPtb,
  microToUsdc,
} from "./predict-sdk.js";
import { cachedManagerForWallet } from "./predict-cache.js";

const xbotRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

function loadVeilEnv(): void {
  config({ path: join(xbotRoot, ".env") });
  config({ path: join(xbotRoot, "../veil/.env") });
}

export interface MintDemoResult {
  wallet: string;
  managerId: string;
  createDigest?: string;
  depositDigest?: string;
  mintDigest?: string;
  depositUsdc: number;
  strikeUsd: number;
  explorerMint?: string;
  preflightWarnings?: string[];
  oracleHorizon?: string;
  error?: string;
}

async function executeTx(
  label: string,
  keypair: Ed25519Keypair,
  tx: Transaction,
  showObjects = false,
): Promise<{ digest: string; objectChanges?: Array<{ type: string; objectType?: string; objectId?: string }> }> {
  const network = getSandboxNetwork("veil");
  tx.setSenderIfNotSet(keypair.getPublicKey().toSuiAddress());
  const result = await withSuiRpcRetry(
    label,
    (c) =>
      c.signAndExecuteTransaction({
        transaction: tx,
        signer: keypair,
        options: { showEffects: true, showObjectChanges: showObjects },
      }),
    network,
  );
  const digest =
    (result as { digest?: string }).digest ??
    (result as { transaction?: { digest?: string } }).transaction?.digest;
  if (!digest) throw new Error("No tx digest");
  await new Promise((r) => setTimeout(r, 3000));
  return {
    digest,
    objectChanges: (result as { objectChanges?: Array<{ type: string; objectType?: string; objectId?: string }> })
      .objectChanges,
  };
}

async function resolveSandboxManagerId(address: string): Promise<string | null> {
  const fromIndexer = await fetchManagerForOwner(address);
  if (fromIndexer) return fromIndexer;
  const cached = cachedManagerForWallet(address);
  if (cached) return cached;
  return fetchManagerOnChain(address);
}

async function ensureSandboxManager(keypair: Ed25519Keypair, address: string): Promise<{
  managerId: string;
  createDigest?: string;
}> {
  let managerId = await resolveSandboxManagerId(address);
  if (managerId) return { managerId };

  const { digest, objectChanges } = await executeTx(
    "create PredictManager",
    keypair,
    buildCreateManagerPtb(),
    true,
  );
  const created = objectChanges?.find(
    (c) => c.type === "created" && String(c.objectType).includes("predict_manager::PredictManager"),
  );
  if (created?.objectId) return { managerId: created.objectId, createDigest: digest };

  // Poll indexer + on-chain after create
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 2500));
    managerId = await resolveSandboxManagerId(address);
    if (managerId) return { managerId, createDigest: digest };
  }
  throw new Error("PredictManager created but id not found (indexer + on-chain lookup failed)");
}

async function simulateMintTx(
  keypair: Ed25519Keypair,
  tx: Transaction,
  network: ReturnType<typeof getSandboxNetwork>,
): Promise<void> {
  tx.setSenderIfNotSet(keypair.getPublicKey().toSuiAddress());
  await withSuiRpcRetry("simulate BULL mint", (c) =>
    c.core.simulateTransaction({ transaction: tx }),
  network);
}

async function waitForMintOracleReady(
  oracleId: string,
  strikeUsd: number,
): Promise<{ strike: number; expiry: number; usedAtm: boolean }> {
  const maxWait = Number(env("LIVE_MINT_ORACLE_WAIT_MS", "300000"));
  const interval = Number(env("LIVE_MINT_ORACLE_POLL_MS", "8000"));
  const start = Date.now();
  let attempt = 0;
  while (Date.now() - start < maxWait) {
    attempt++;
    const bounds = await fetchAskBounds(oracleId);
    const mintKey = await resolveMintStrike(oracleId, strikeUsd);
    if (mintKey) {
      if (bounds) {
        console.log(`  ✓ Oracle ready (attempt ${attempt}) — ask bounds ${bounds.minAsk}–${bounds.maxAsk}`);
      } else {
        console.log(`  ✓ Oracle strike resolved (attempt ${attempt}) — ask-bounds pending, proceeding to simulate`);
      }
      return mintKey;
    }
    console.log(`  … waiting for predict oracle (attempt ${attempt}) — strike unresolved`);
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new Error(`Oracle not ready after ${maxWait / 1000}s — ask-bounds/strike unavailable`);
}

async function fetchWalletDusdc(
  address: string,
  network: ReturnType<typeof getSandboxNetwork>,
): Promise<number> {
  const coins = await withSuiRpcRetry(
    "wallet dUSDC balance",
    (c) => c.getCoins({ owner: address, coinType: PREDICT_TESTNET.dusdcType }),
    network,
  );
  const total = coins.data.reduce((s, c) => s + BigInt(c.balance), 0n);
  return microToUsdc(total);
}

/** Top up PredictManager to target idle balance — required before live 25 dUSDC orders. */
export async function ensureManagerFundedForDemo(
  projectId = "veil",
  targetUsdc?: number,
): Promise<{ managerId: string; idleUsdc: number; depositDigest?: string }> {
  loadVeilEnv();
  assertDataDir();
  const wallet = loadOrCreateWallet(projectId);
  const keypair = Ed25519Keypair.fromSecretKey(wallet.secretKey);
  const address = keypair.getPublicKey().toSuiAddress();
  const network = getSandboxNetwork(projectId);
  const target = targetUsdc ?? Number(env("VEIL_DEMO_MANAGER_USDC", "55"));
  const minOrderUsdc = Number(env("VEIL_MIN_ORDER_USDC", "25"));

  const { managerId } = await ensureSandboxManager(keypair, address);
  let idleUsdc = 0;
  try {
    idleUsdc = await fetchManagerIdleUsdc(managerId);
  } catch {
    /* optional */
  }

  const walletUsdc = await fetchWalletDusdc(address, network);
  let depositDigest: string | undefined;
  const need = Math.max(0, target - idleUsdc);

  if (need >= 1) {
    const coins = await withSuiRpcRetry(
      "fetch dUSDC coins",
      (c) => c.getCoins({ owner: address, coinType: PREDICT_TESTNET.dusdcType }),
      network,
    );
    if (!coins.data.length) {
      throw new Error(
        `Sandbox wallet has no dUSDC (wallet ${walletUsdc.toFixed(1)}). Run: npm start wallet fund veil`,
      );
    }

    let remaining = need;
    for (const coin of [...coins.data].sort(
      (a, b) => Number(BigInt(b.balance) - BigInt(a.balance)),
    )) {
      if (remaining < 0.5) break;
      const coinUsdc = microToUsdc(BigInt(coin.balance));
      const chunk = Math.min(remaining, Math.floor(coinUsdc * 100) / 100);
      if (chunk < 0.5) continue;

      const depositTx = buildDepositManagerAmountPtb({
        managerId,
        coinId: coin.coinObjectId,
        amountUsdc: chunk,
      });
      depositDigest = (await executeTx(`deposit ${chunk} dUSDC`, keypair, depositTx)).digest;
      idleUsdc += chunk;
      remaining -= chunk;
      console.log(`  ✓ Deposited ${chunk} dUSDC → manager (${idleUsdc.toFixed(1)} idle)`);
    }
  }

  const needBoth = minOrderUsdc * 2;
  if (idleUsdc < needBoth) {
    throw new Error(
      `Manager needs ≥${needBoth} dUSDC for bull+bear orders (have ${idleUsdc.toFixed(1)} idle, wallet ${walletUsdc.toFixed(1)}). Fund sandbox wallet.`,
    );
  }
  if (idleUsdc < target - 0.5) {
    console.warn(
      `  ⚠ Manager ${idleUsdc.toFixed(1)} dUSDC idle (target ${target}) — OK for demo if ≥${needBoth}`,
    );
  }
  console.log(`  ✓ Manager ready: ${idleUsdc.toFixed(1)} dUSDC idle (target ${target})`);
  return { managerId, idleUsdc, depositDigest };
}

/** Sandbox wallet: own manager → deposit dUSDC → mint BULL */
export async function runSandboxMint(projectId = "veil"): Promise<MintDemoResult> {
  loadVeilEnv();
  assertDataDir();
  const wallet = loadOrCreateWallet(projectId);
  const keypair = Ed25519Keypair.fromSecretKey(wallet.secretKey);
  const address = keypair.getPublicKey().toSuiAddress();

  const out: MintDemoResult = {
    wallet: address,
    managerId: "",
    depositUsdc: Number(env("SANDBOX_MINT_DEPOSIT_USDC", "55")),
    strikeUsd: 0,
  };

  try {
    const { managerId, createDigest } = await ensureSandboxManager(keypair, address);
    out.managerId = managerId;
    out.createDigest = createDigest;

    const oracle = await fetchActiveOracle("BTC");
    if (!oracle) {
      throw new Error(
        "No active BTC oracle (predict-server unreachable — set PREDICT_ORACLE_ID in veil/.env or SANDBOX_BTC_ORACLE_ID)",
      );
    }

    try {
      const catalog = await fetchHorizonCatalog("BTC");
      const slot = catalog.slots.find((s) => s.oracleId === oracle.oracleId);
      if (slot) {
        out.oracleHorizon = `${Math.round(slot.ttlMs / 60_000)}m to expiry (${catalog.shortSlotIntervalMinutes}m grid)`;
      }
    } catch {
      // optional
    }

    const forward = await fetchOracleForward(oracle.oracleId);
    out.strikeUsd = forward ? forward / 1_000_000_000 : 95000;

    const network = getSandboxNetwork("veil");
    const funded = await ensureManagerFundedForDemo(projectId, out.depositUsdc);
    out.managerId = funded.managerId;
    out.depositDigest = funded.depositDigest;
    const idleUsdc = funded.idleUsdc;

    const mintKey = await waitForMintOracleReady(oracle.oracleId, out.strikeUsd);

    const mintTx = buildMintPtb({
      managerId,
      oracleId: oracle.oracleId,
      expiry: mintKey.expiry,
      strike: mintKey.strike,
      isUp: true,
      quantity: 1,
    });

    const pre = await preflightMint({
      managerId,
      oracleId: oracle.oracleId,
      mintTx: mintTx as never,
    });
    if (pre.warnings.length) out.preflightWarnings = pre.warnings;
    if (!pre.ok) {
      throw new Error(`Preflight failed: ${pre.errors.join("; ")}`);
    }
    await simulateMintTx(keypair, mintTx, network);

    out.mintDigest = (await executeTx("mint BULL position", keypair, mintTx)).digest;
    out.explorerMint = `https://suiscan.xyz/testnet/tx/${out.mintDigest}`;
  } catch (e) {
    out.error = e instanceof Error ? e.message : String(e);
  }

  saveMintResult(out);
  return out;
}

function saveMintResult(r: MintDemoResult): void {
  const dir = join(DATA_DIR, "sandbox");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "latest-mint.json"), JSON.stringify(r, null, 2));
}

export function formatMintResult(r: MintDemoResult): string {
  if (r.error) return `# Mint demo failed\n${r.error}`;
  const lines = [
    "# Sandbox mint — live testnet",
    `Wallet: ${r.wallet}`,
    `Manager: ${r.managerId}`,
  ];
  if (r.createDigest) lines.push(`Created manager: ${r.createDigest}`);
  if (r.oracleHorizon) lines.push(`Oracle horizon: ${r.oracleHorizon}`);
  if (r.preflightWarnings?.length) {
    lines.push(`Preflight warnings: ${r.preflightWarnings.join("; ")}`);
  }
  if (r.depositDigest) {
    lines.push(`Deposited ${r.depositUsdc} dUSDC → ${r.depositDigest}`);
  } else {
    lines.push(`Deposit skipped (manager already has ≥${r.depositUsdc} dUSDC idle)`);
  }
  lines.push(`Mint BULL @ ~$${r.strikeUsd.toFixed(0)} → ${r.mintDigest}`);
  if (r.explorerMint) lines.push(`Explorer: ${r.explorerMint}`);
  return lines.join("\n");
}
