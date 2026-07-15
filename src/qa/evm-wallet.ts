/**
 * EVM sandbox wallet — user funds address OR MetaMask signs in browser capture.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createWalletClient, createPublicClient, http, parseEther, formatEther } from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { sepolia, baseSepolia, mainnet } from "viem/chains";
import { DATA_DIR, assertDataDir, env } from "../config.js";

export interface EvmSandboxWallet {
  projectId: string;
  chainId: number;
  address: string;
  privateKey: string;
  createdAt: number;
}

function walletPath(projectId: string): string {
  return join(DATA_DIR, "sandbox", `wallet-evm-${projectId}.json`);
}

export function defaultEvmChainId(projectId: string): number {
  const override = Number(env("EVM_CHAIN_ID", "0"));
  if (override > 0) return override;
  return 11155111;
}

export function chainFromId(id: number) {
  if (id === 11155111) return sepolia;
  if (id === 84532) return baseSepolia;
  if (id === 1) return mainnet;
  return sepolia;
}

export function loadOrCreateEvmWallet(projectId: string, chainId?: number): EvmSandboxWallet {
  assertDataDir();
  const dir = join(DATA_DIR, "sandbox");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const path = walletPath(projectId);
  if (existsSync(path)) {
    return JSON.parse(readFileSync(path, "utf8")) as EvmSandboxWallet;
  }

  const pk = generatePrivateKey();
  const account = privateKeyToAccount(pk);
  const wallet: EvmSandboxWallet = {
    projectId,
    chainId: chainId ?? defaultEvmChainId(projectId),
    address: account.address,
    privateKey: pk,
    createdAt: Date.now(),
  };
  writeFileSync(path, JSON.stringify(wallet, null, 2));
  return wallet;
}

export async function getEvmBalance(
  address: string,
  chainId: number,
  rpcUrl?: string,
): Promise<bigint> {
  const chain = chainFromId(chainId);
  const client = createPublicClient({
    chain,
    transport: http(rpcUrl || env("EVM_RPC_URL") || undefined),
  });
  return client.getBalance({ address: address as `0x${string}` });
}

export async function checkEvmFunding(projectId: string, rpcUrl?: string): Promise<{
  wallet: EvmSandboxWallet;
  balanceEth: string;
  funded: boolean;
  fundingNote: string;
}> {
  const wallet = loadOrCreateEvmWallet(projectId);
  const bal = await getEvmBalance(wallet.address, wallet.chainId, rpcUrl);
  const eth = formatEther(bal);
  const min = parseEther(env("SANDBOX_MIN_ETH", "0.005"));
  const funded = bal >= min;
  const chainName = wallet.chainId === 84532 ? "Base Sepolia" : wallet.chainId === 1 ? "Ethereum" : "Sepolia";
  const fundingNote = funded
    ? `Funded (${eth} ETH on ${chainName})`
    : `Send ≥${env("SANDBOX_MIN_ETH", "0.005")} ETH to ${wallet.address} on ${chainName} — then re-run demo`;
  return { wallet, balanceEth: eth, funded, fundingNote };
}

/** Send 0 ETH self-call tx when sandbox wallet is funded (visible on explorer). */
export async function runEvmDemoTx(projectId: string, rpcUrl?: string): Promise<{
  wallet: string;
  txHash?: string;
  balanceEth: string;
  error?: string;
}> {
  const { wallet, balanceEth, funded, fundingNote } = await checkEvmFunding(projectId, rpcUrl);
  if (!funded) {
    return { wallet: wallet.address, balanceEth, error: fundingNote };
  }

  try {
    const chain = chainFromId(wallet.chainId);
    const account = privateKeyToAccount(wallet.privateKey as `0x${string}`);
    const client = createWalletClient({
      account,
      chain,
      transport: http(rpcUrl || env("EVM_RPC_URL") || undefined),
    });
    const hash = await client.sendTransaction({
      to: account.address,
      value: 0n,
    });
    return { wallet: wallet.address, txHash: hash, balanceEth };
  } catch (e) {
    return {
      wallet: wallet.address,
      balanceEth,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export function formatEvmWallet(w: EvmSandboxWallet, balanceEth?: string): string {
  const chainName = w.chainId === 84532 ? "Base Sepolia" : w.chainId === 1 ? "Mainnet" : "Sepolia";
  return [
    `# EVM sandbox — ${w.projectId}`,
    `Chain: ${chainName} (${w.chainId})`,
    `Address: ${w.address}`,
    balanceEth !== undefined ? `Balance: ${balanceEth} ETH` : "",
    `Fund this address before demo (unless using MetaMask in browser)`,
    `Key file: ${walletPath(w.projectId)}`,
  ]
    .filter(Boolean)
    .join("\n");
}
