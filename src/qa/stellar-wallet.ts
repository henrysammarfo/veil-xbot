/**
 * Stellar sandbox wallet — self-fund via Friendbot on testnet.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { Keypair, Networks, TransactionBuilder, Operation, Asset, BASE_FEE, Horizon } from "@stellar/stellar-sdk";
import { DATA_DIR, assertDataDir } from "../config.js";

export interface StellarSandboxWallet {
  projectId: string;
  network: "testnet" | "public";
  address: string;
  secretKey: string;
  createdAt: number;
  lastFundedAt?: number;
}

const HORIZON_TESTNET = "https://horizon-testnet.stellar.org";
const HORIZON_PUBLIC = "https://horizon.stellar.org";
const FRIENDBOT = "https://friendbot.stellar.org";

function walletPath(projectId: string): string {
  return join(DATA_DIR, "sandbox", `wallet-stellar-${projectId}.json`);
}

export function loadOrCreateStellarWallet(
  projectId: string,
  network: "testnet" | "public" = "testnet",
): StellarSandboxWallet {
  assertDataDir();
  const dir = join(DATA_DIR, "sandbox");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const path = walletPath(projectId);
  if (existsSync(path)) {
    return JSON.parse(readFileSync(path, "utf8")) as StellarSandboxWallet;
  }

  const kp = Keypair.random();
  const wallet: StellarSandboxWallet = {
    projectId,
    network,
    address: kp.publicKey(),
    secretKey: kp.secret(),
    createdAt: Date.now(),
  };
  writeFileSync(path, JSON.stringify(wallet, null, 2));
  return wallet;
}

export async function fundStellarFriendbot(address: string): Promise<boolean> {
  const res = await fetch(`${FRIENDBOT}?addr=${encodeURIComponent(address)}`);
  return res.ok;
}

export async function getStellarBalance(
  address: string,
  network: "testnet" | "public" = "testnet",
): Promise<string> {
  const horizon = network === "public" ? HORIZON_PUBLIC : HORIZON_TESTNET;
  const res = await fetch(`${horizon}/accounts/${address}`);
  if (!res.ok) return "0";
  const data = (await res.json()) as {
    balances?: Array<{ asset_type: string; balance: string }>;
  };
  const native = data.balances?.find((b) => b.asset_type === "native");
  return native?.balance ?? "0";
}

/** Self-fund + send 0.0000001 XLM payment to self as live demo tx. */
export async function runStellarDemoTx(projectId: string): Promise<{
  wallet: string;
  txHash?: string;
  balance: string;
  funded: boolean;
  error?: string;
}> {
  const w = loadOrCreateStellarWallet(projectId, "testnet");
  let funded = false;
  try {
    funded = await fundStellarFriendbot(w.address);
    if (funded) {
      w.lastFundedAt = Date.now();
      writeFileSync(walletPath(projectId), JSON.stringify(w, null, 2));
    }
    await new Promise((r) => setTimeout(r, 4000));
  } catch (e) {
    return {
      wallet: w.address,
      balance: "0",
      funded: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  const balance = await getStellarBalance(w.address, w.network);
  if (parseFloat(balance) < 0.5) {
    return {
      wallet: w.address,
      balance,
      funded,
      error: funded ? "Friendbot funded but balance low — retry in 10s" : "Friendbot failed — fund manually",
    };
  }

  try {
    const server = new Horizon.Server(HORIZON_TESTNET);
    const kp = Keypair.fromSecret(w.secretKey);
    const account = await server.loadAccount(kp.publicKey());

    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(
        Operation.payment({
          destination: kp.publicKey(),
          asset: Asset.native(),
          amount: "0.0000001",
        }),
      )
      .setTimeout(30)
      .build();
    tx.sign(kp);

    const result = await server.submitTransaction(tx);
    return { wallet: w.address, txHash: result.hash, balance, funded: true };
  } catch (e) {
    return {
      wallet: w.address,
      balance,
      funded,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export function formatStellarWallet(w: StellarSandboxWallet, balance?: string): string {
  return [
    `# Stellar sandbox — ${w.projectId}`,
    `Network: ${w.network}`,
    `Address: ${w.address}`,
    balance !== undefined ? `Balance: ${balance} XLM` : "",
    `Self-fund: Friendbot (testnet) — automatic on demo`,
    `Key file: ${walletPath(w.projectId)}`,
  ]
    .filter(Boolean)
    .join("\n");
}
