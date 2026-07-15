/**
 * Fund sandbox wallet from Veil dev wallet (SUI_PRIVATE_KEY in veil/.env).
 */
import { config } from "dotenv";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { env } from "../config.js";
import { PREDICT_TESTNET, usdcToMicro, fetchManagerIdleUsdc, fetchManagerForOwner, MANAGER_MINT_RESERVE_USDC } from "./predict-sdk.js";

const DUSDC_DECIMALS = 6;
import {
  loadOrCreateWallet,
  getSuiBalance,
  getSandboxNetwork,
  type SandboxWallet,
} from "./sui-wallet.js";

const xbotRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

function loadVeilEnv(): void {
  config({ path: join(xbotRoot, ".env") });
  config({ path: join(xbotRoot, "../veil/.env") });
  config({ path: join(process.cwd(), ".env") });
}

function fundKeypair(): Ed25519Keypair {
  loadVeilEnv();
  const key = env("SUI_PRIVATE_KEY") || env("VEIL_FUND_PRIVATE_KEY");
  if (!key) {
    throw new Error(
      "Set SUI_PRIVATE_KEY in veil/.env (Veil dev wallet) or VEIL_FUND_PRIVATE_KEY in veil-xbot/.env",
    );
  }
  return Ed25519Keypair.fromSecretKey(key);
}

function client(network: "testnet" | "devnet" | "mainnet"): SuiJsonRpcClient {
  return new SuiJsonRpcClient({
    url: env("SUI_RPC_URL") || getJsonRpcFullnodeUrl(network),
    network,
  });
}

export async function getCoinBalance(
  owner: string,
  coinType: string,
  network: "testnet" | "devnet" | "mainnet",
): Promise<bigint> {
  const c = client(network);
  const coins = await c.getCoins({ owner, coinType });
  return coins.data.reduce((sum, coin) => sum + BigInt(coin.balance), 0n);
}

export interface FundSandboxResult {
  from: string;
  to: string;
  suiSent: number;
  dusdcSent: number;
  suiBalance: number;
  dusdcBalance: number;
  digests: string[];
}

/** Withdraw idle dUSDC from PredictManager → recipient (sandbox wallet) */
export async function withdrawManagerToRecipient(
  recipient: string,
  amountUsdc: number,
): Promise<{ digest: string; amountUsdc: number; managerBalanceBefore: number }> {
  loadVeilEnv();
  const managerId = env("PREDICT_MANAGER_ID");
  if (!managerId) throw new Error("PREDICT_MANAGER_ID missing in veil/.env");

  const network = getSandboxNetwork("veil");
  const sender = fundKeypair();
  const from = sender.getPublicKey().toSuiAddress();
  const c = client(network);

  const managerBal = await fetchManagerIdleUsdc(managerId);
  const idle = managerBal - MANAGER_MINT_RESERVE_USDC;
  if (idle < 1) {
    throw new Error(
      `Manager idle dUSDC too low: ${managerBal} total, reserve ${MANAGER_MINT_RESERVE_USDC} — idle ${idle.toFixed(2)}`,
    );
  }

  const actualUsdc = Math.min(amountUsdc, idle);
  if (actualUsdc < 1) throw new Error(`Withdraw amount ${amountUsdc} exceeds idle ${idle.toFixed(2)}`);

  const tx = new Transaction();
  tx.setSender(from);
  const coin = tx.moveCall({
    target: `${PREDICT_TESTNET.packageId}::predict_manager::withdraw`,
    typeArguments: [PREDICT_TESTNET.dusdcType],
    arguments: [tx.object(managerId), tx.pure.u64(usdcToMicro(actualUsdc))],
  });
  tx.transferObjects([coin], tx.pure.address(recipient));

  const result = await c.signAndExecuteTransaction({
    transaction: tx,
    signer: sender,
    options: { showEffects: true },
  });

  return {
    digest: result.digest,
    amountUsdc: actualUsdc,
    managerBalanceBefore: managerBal,
  };
}

/** Transfer SUI + dUSDC from Veil wallet → sandbox wallet */
export async function fundSandboxFromVeil(projectId: string): Promise<FundSandboxResult> {
  const sandbox = loadOrCreateWallet(projectId);
  const network = getSandboxNetwork(projectId);
  const sender = fundKeypair();
  const from = sender.getPublicKey().toSuiAddress();
  const to = sandbox.address;

  if (from.toLowerCase() === to.toLowerCase()) {
    throw new Error("Sandbox address matches fund wallet — use a separate sandbox key");
  }

  const suiAmount = Number(env("SANDBOX_FUND_SUI", "0.25"));
  const dusdcAmount = Number(env("SANDBOX_FUND_DUSDC", "50"));
  const digests: string[] = [];
  let suiSent = 0;
  let dusdcSent = 0;

  // 1) dUSDC from PredictManager (idle above reserve)
  loadVeilEnv();
  if (env("PREDICT_MANAGER_ID") && projectId === "veil") {
    try {
      const w = await withdrawManagerToRecipient(to, dusdcAmount);
      digests.push(w.digest);
      dusdcSent = w.amountUsdc;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes("idle dUSDC too low")) console.warn("Manager withdraw:", msg);
    }
  }

  const c = client(network);
  const fromSui = await getSuiBalance(from, network);
  const fromDusdc = await getCoinBalance(from, PREDICT_TESTNET.dusdcType, network);

  const gasReserve = 50_000_000n;
  const suiMist = BigInt(Math.round(suiAmount * 1e9));
  const actualSuiMist =
    fromSui > gasReserve
      ? suiMist <= fromSui - gasReserve
        ? suiMist
        : fromSui - gasReserve
      : 0n;

  const dusdcStillNeeded = Math.max(0, dusdcAmount - dusdcSent);
  const dusdcRaw = BigInt(Math.round(dusdcStillNeeded * 1e6));
  const actualDusdcRaw =
    dusdcStillNeeded > 0 && fromDusdc >= dusdcRaw
      ? dusdcRaw
      : dusdcStillNeeded > 0 && fromDusdc > 0n
        ? fromDusdc
        : 0n;

  if (actualSuiMist === 0n && actualDusdcRaw === 0n && dusdcSent === 0) {
    throw new Error(
      `Nothing to send — wallet SUI: ${Number(fromSui) / 1e9}, dUSDC: ${Number(fromDusdc) / 1e6}. ` +
        `Manager withdraw failed or PREDICT_MANAGER_ID unset.`,
    );
  }

  if (actualSuiMist > 0n) {
    const tx = new Transaction();
    tx.setSender(from);
    const [coin] = tx.splitCoins(tx.gas, [actualSuiMist]);
    tx.transferObjects([coin], to);
    const result = await c.signAndExecuteTransaction({
      transaction: tx,
      signer: sender,
      options: { showEffects: true },
    });
    digests.push(result.digest);
    suiSent = Number(actualSuiMist) / 1e9;
  }

  if (actualDusdcRaw > 0n) {
    const coins = await c.getCoins({ owner: from, coinType: PREDICT_TESTNET.dusdcType });
    if (!coins.data.length) throw new Error("No dUSDC coins in Veil wallet");

    const tx = new Transaction();
    tx.setSender(from);
    const primary = tx.object(coins.data[0].coinObjectId);
    if (coins.data.length > 1) {
      tx.mergeCoins(
        primary,
        coins.data.slice(1).map((x) => tx.object(x.coinObjectId)),
      );
    }
    const [dCoin] = tx.splitCoins(primary, [actualDusdcRaw]);
    tx.transferObjects([dCoin], to);
    const result = await c.signAndExecuteTransaction({
      transaction: tx,
      signer: sender,
      options: { showEffects: true },
    });
    digests.push(result.digest);
    dusdcSent += Number(actualDusdcRaw) / 1e6;
  }

  await new Promise((r) => setTimeout(r, 2000));

  const suiBal = await getSuiBalance(to, network);
  const dusdcBal = await getCoinBalance(to, PREDICT_TESTNET.dusdcType, network);

  return {
    from,
    to,
    suiSent,
    dusdcSent,
    suiBalance: Number(suiBal) / 1e9,
    dusdcBalance: Number(dusdcBal) / 1e6,
    digests,
  };
}

export function formatFundResult(r: FundSandboxResult, w: SandboxWallet): string {
  return [
    `# Sandbox funded from Veil wallet`,
    `From: ${r.from}`,
    `To: ${r.to}`,
    `Sent: ${r.suiSent} SUI + ${r.dusdcSent} dUSDC`,
    `Sandbox now: ${r.suiBalance.toFixed(4)} SUI · ${r.dusdcBalance.toFixed(2)} dUSDC`,
    `Tx: ${r.digests.join(", ")}`,
    `Key: data/sandbox/wallet-${w.projectId}.json`,
  ].join("\n");
}
