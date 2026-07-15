/**
 * Sandbox Sui wallet — generate keypair, match network, fund testnet.
 * dUSDC: manual Tally faucet (no public API).
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { getFaucetHost, requestSuiFromFaucetV2, FaucetRateLimitError } from "@mysten/sui/faucet";
import { DATA_DIR, env, assertDataDir } from "../config.js";
import { getProject } from "../projects/registry.js";

export type SuiNetwork = "testnet" | "devnet" | "mainnet";

export interface SandboxWallet {
  projectId: string;
  network: SuiNetwork;
  address: string;
  /** Hex secret — sandbox only, never commit */
  secretKey: string;
  createdAt: number;
  lastFundedAt?: number;
  dusdcFaucetUrl?: string;
}

const VEIL_DUSDC_FAUCET = "https://tally.so/r/Xx102L";

function walletPath(projectId: string): string {
  return join(DATA_DIR, "sandbox", `wallet-${projectId}.json`);
}

export function getSandboxNetwork(projectId: string): SuiNetwork {
  const override = env("SUI_NETWORK") as SuiNetwork;
  if (override === "testnet" || override === "devnet" || override === "mainnet") return override;
  if (projectId === "veil" || projectId === "magmos") return "testnet";
  return "testnet";
}

/** Load existing or create new Ed25519 wallet for sandbox */
export function loadOrCreateWallet(projectId: string): SandboxWallet {
  assertDataDir();
  const dir = join(DATA_DIR, "sandbox");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const path = walletPath(projectId);
  if (existsSync(path)) {
    return JSON.parse(readFileSync(path, "utf8")) as SandboxWallet;
  }

  const keypair = Ed25519Keypair.generate();
  const secretKey = keypair.getSecretKey();
  const wallet: SandboxWallet = {
    projectId,
    network: getSandboxNetwork(projectId),
    address: keypair.getPublicKey().toSuiAddress(),
    secretKey,
    createdAt: Date.now(),
    dusdcFaucetUrl: projectId === "veil" ? env("SANDBOX_DUSDC_FAUCET_URL", VEIL_DUSDC_FAUCET) : undefined,
  };
  writeFileSync(path, JSON.stringify(wallet, null, 2));
  return wallet;
}

export async function getSuiBalance(address: string, network: SuiNetwork): Promise<bigint> {
  const client = new SuiJsonRpcClient({
    url: env("SUI_RPC_URL") || getJsonRpcFullnodeUrl(network),
    network,
  });
  const bal = await client.getBalance({ owner: address });
  return BigInt(bal.totalBalance);
}

/** Request testnet/devnet SUI from Mysten faucet */
export async function fundSandboxWallet(projectId: string): Promise<{
  wallet: SandboxWallet;
  funded: boolean;
  balanceMist: bigint;
  note: string;
}> {
  const wallet = loadOrCreateWallet(projectId);
  const network = wallet.network;

  if (network === "mainnet") {
    return {
      wallet,
      funded: false,
      balanceMist: await getSuiBalance(wallet.address, network),
      note: "Mainnet — no auto-faucet. Fund wallet manually.",
    };
  }

  let funded = false;
  try {
    await requestSuiFromFaucetV2({
      host: env("SANDBOX_FAUCET_URL") || getFaucetHost(network),
      recipient: wallet.address,
    });
    funded = true;
    wallet.lastFundedAt = Date.now();
    writeFileSync(walletPath(projectId), JSON.stringify(wallet, null, 2));
  } catch (e) {
    if (e instanceof FaucetRateLimitError) {
      // rate limited — continue with balance check
    } else {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes("429") && !msg.includes("Too many")) throw e;
    }
  }

  // Brief wait for faucet credit
  await new Promise((r) => setTimeout(r, 3000));
  const balanceMist = await getSuiBalance(wallet.address, network);

  const project = getProject(projectId);
  let note = funded ? "SUI faucet requested." : "Faucet may be rate-limited — retry in 1h or fund manually.";
  if (wallet.dusdcFaucetUrl) {
    note += ` For ${project.name} dUSDC: open ${wallet.dusdcFaucetUrl} and paste address ${wallet.address}`;
  }

  return { wallet, funded, balanceMist, note };
}

export function formatWallet(w: SandboxWallet, balanceMist?: bigint): string {
  const sui = balanceMist !== undefined ? (Number(balanceMist) / 1e9).toFixed(4) : "?";
  const lines = [
    `# Sandbox wallet — ${w.projectId}`,
    `Network: ${w.network}`,
    `Address: ${w.address}`,
    `Balance: ${sui} SUI`,
    `Key file: ${walletPath(w.projectId)} (gitignore this)`,
  ];
  if (w.dusdcFaucetUrl) lines.push(`dUSDC faucet: ${w.dusdcFaucetUrl}`);
  return lines.join("\n");
}
