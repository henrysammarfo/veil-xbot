/**
 * Multi-chain demo router — Sui / Stellar / EVM.
 */
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR, assertDataDir } from "../config.js";
import { getProject } from "../projects/registry.js";
import {
  getProjectChain,
  getWalletMode,
  explorerTxUrl,
  asChainProject,
  type ChainId,
  type WalletMode,
} from "../projects/chain.js";
import { runSandboxMint, type MintDemoResult } from "./sandbox-mint.js";
import { runStellarDemoTx } from "./stellar-wallet.js";
import { runEvmDemoTx, checkEvmFunding } from "./evm-wallet.js";

export interface ChainDemoResult {
  chain: ChainId;
  walletMode: WalletMode;
  wallet: string;
  txHash?: string;
  explorerTx?: string;
  balanceNative?: string;
  fundingNote?: string;
  error?: string;
  /** Veil/Sui fields (backward compat) */
  mintDigest?: string;
  explorerMint?: string;
  managerId?: string;
  depositUsdc?: number;
  strikeUsd?: number;
  preflightWarnings?: string[];
}

function saveChainDemo(r: ChainDemoResult, projectId: string): void {
  assertDataDir();
  const dir = join(DATA_DIR, "sandbox");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `latest-chain-${projectId}.json`), JSON.stringify(r, null, 2));
  writeFileSync(join(dir, "latest-chain-demo.json"), JSON.stringify({ projectId, ...r }, null, 2));
}

function fromMint(m: MintDemoResult): ChainDemoResult {
  return {
    chain: "sui",
    walletMode: "self-fund",
    wallet: m.wallet,
    txHash: m.mintDigest,
    explorerTx: m.explorerMint,
    mintDigest: m.mintDigest,
    explorerMint: m.explorerMint,
    managerId: m.managerId,
    depositUsdc: m.depositUsdc,
    strikeUsd: m.strikeUsd,
    preflightWarnings: m.preflightWarnings,
    error: m.error,
  };
}

export async function runChainDemo(projectId: string): Promise<ChainDemoResult> {
  const project = getProject(projectId);
  const chain = getProjectChain(project);
  const walletMode = getWalletMode(project);
  const ext = asChainProject(project);

  if (chain === "none" || project.vertical === "web2") {
    const r: ChainDemoResult = {
      chain: "none",
      walletMode: "self-fund",
      wallet: "",
      fundingNote: "Web2 — no on-chain demo",
    };
    saveChainDemo(r, projectId);
    return r;
  }

  if (chain === "sui") {
    const mint = await runSandboxMint(projectId);
    const r = fromMint(mint);
    saveChainDemo(r, projectId);
    return r;
  }

  if (chain === "stellar") {
    const demo = await runStellarDemoTx(projectId);
    const r: ChainDemoResult = {
      chain: "stellar",
      walletMode: "self-fund",
      wallet: demo.wallet,
      txHash: demo.txHash,
      mintDigest: demo.txHash,
      balanceNative: `${demo.balance} XLM`,
      explorerTx: demo.txHash ? explorerTxUrl(project, demo.txHash) : undefined,
      explorerMint: demo.txHash ? explorerTxUrl(project, demo.txHash) : undefined,
      error: demo.error,
    };
    saveChainDemo(r, projectId);
    return r;
  }

  if (chain === "evm") {
    if (walletMode === "metamask") {
      const { wallet, balanceEth, fundingNote } = await checkEvmFunding(
        projectId,
        ext.rpcUrl,
      );
      const r: ChainDemoResult = {
        chain: "evm",
        walletMode: "metamask",
        wallet: wallet.address,
        balanceNative: `${balanceEth} ETH`,
        fundingNote:
          "MetaMask mode — connect wallet in browser capture. Fund your MetaMask on testnet.",
        error: undefined,
      };
      saveChainDemo(r, projectId);
      return r;
    }

    const demo = await runEvmDemoTx(projectId, ext.rpcUrl);
    const r: ChainDemoResult = {
      chain: "evm",
      walletMode: "sandbox-funded",
      wallet: demo.wallet,
      txHash: demo.txHash,
      mintDigest: demo.txHash,
      balanceNative: `${demo.balanceEth} ETH`,
      explorerTx: demo.txHash ? explorerTxUrl(project, demo.txHash) : undefined,
      explorerMint: demo.txHash ? explorerTxUrl(project, demo.txHash) : undefined,
      error: demo.error,
      fundingNote: demo.error?.includes("Send") ? demo.error : undefined,
    };
    saveChainDemo(r, projectId);
    return r;
  }

  const r: ChainDemoResult = {
    chain,
    walletMode,
    wallet: "",
    error: `Unsupported chain: ${chain}`,
  };
  saveChainDemo(r, projectId);
  return r;
}

export function formatChainDemo(r: ChainDemoResult): string {
  if (r.error && !r.txHash && !r.mintDigest) {
    return `# Chain demo — ${r.chain}\n${r.error}${r.fundingNote ? `\n\n${r.fundingNote}` : ""}`;
  }
  const lines = [
    `# Chain demo — ${r.chain} (${r.walletMode})`,
    `Wallet: ${r.wallet}`,
  ];
  if (r.balanceNative) lines.push(`Balance: ${r.balanceNative}`);
  if (r.txHash || r.mintDigest) {
    lines.push(`Tx: ${r.txHash ?? r.mintDigest}`);
  }
  if (r.explorerTx || r.explorerMint) {
    lines.push(`Explorer: ${r.explorerTx ?? r.explorerMint}`);
  }
  if (r.managerId) lines.push(`Manager: ${r.managerId}`);
  if (r.fundingNote) lines.push(`Note: ${r.fundingNote}`);
  if (r.error) lines.push(`Warning: ${r.error}`);
  return lines.join("\n");
}

/** Backward compat — mint-shaped result for launch sort / demo report */
export function chainToMintShape(r: ChainDemoResult): MintDemoResult {
  return {
    wallet: r.wallet,
    managerId: r.managerId ?? "",
    mintDigest: r.mintDigest ?? r.txHash,
    explorerMint: r.explorerMint ?? r.explorerTx,
    depositUsdc: r.depositUsdc ?? 0,
    strikeUsd: r.strikeUsd ?? 0,
    preflightWarnings: r.preflightWarnings,
    error: r.error,
  };
}
