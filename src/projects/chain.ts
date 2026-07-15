import type { ProjectDef } from "./registry.js";

export type ChainId = "sui" | "evm" | "stellar" | "none";
export type WalletMode = "self-fund" | "sandbox-funded" | "metamask";

export type CaptureStepAction =
  | "goto"
  | "wait"
  | "click"
  | "scroll"
  | "screenshot"
  | "type"
  | "fill"
  | "waitForSelector"
  | "waitForUrl"
  | "waitForReady"
  | "scene"
  | "hover"
  | "waitForOrderDone"
  | "ensureVeilAuth"
  | "dismissOnboarding"
  | "assertManagerBalance"
  | "observe"
  | "assertNoErrors";

export interface CaptureStep {
  action: CaptureStepAction;
  url?: string;
  ms?: number;
  selector?: string;
  text?: string;
  note?: string;
  /** assertManagerBalance — minimum idle dUSDC required */
  minUsdc?: number;
  /** scroll amount as fraction of viewport height (default 0.4) */
  scrollFrac?: number;
  /** waitForUrl — substring match */
  urlContains?: string;
}

export type CaptureDevice = "desktop" | "mobile";

export interface ProjectCaptureConfig {
  width?: number;
  height?: number;
  deviceScaleFactor?: number;
  headed?: boolean;
  steps?: CaptureStep[];
  /** desktop = 1920×1080 full app; mobile = 390×844 with bottom nav */
  device?: CaptureDevice;
  /** Maximize browser window (headed) — fills desktop recording */
  fullscreen?: boolean;
  /** Inject sandbox Sui wallet before navigation (Veil capture) */
  injectVeilWallet?: boolean;
  walletAddress?: string;
}

export interface ChainProjectDef extends ProjectDef {
  chain?: ChainId;
  /** EVM chain id — 11155111 Sepolia, 84532 Base Sepolia, etc. */
  evmChainId?: number;
  walletMode?: WalletMode;
  rpcUrl?: string;
  explorerTxTemplate?: string;
  /** Stellar: testnet | public */
  stellarNetwork?: "testnet" | "public";
  nativeSymbol?: string;
  faucetUrl?: string;
  /** Override browser capture order — supports {{primaryUrl}} {{explorerTx}} */
  demoUrls?: string[];
  capture?: ProjectCaptureConfig;
}

export function getProjectChain(p: ProjectDef): ChainId {
  const ext = p as ChainProjectDef;
  if (ext.chain) return ext.chain;
  if (p.vertical === "web3") {
    if (p.id === "veil" || p.id === "magmos") return "sui";
    return "evm";
  }
  return "none";
}

export function getWalletMode(p: ProjectDef): WalletMode {
  const ext = p as ChainProjectDef;
  if (ext.walletMode) return ext.walletMode;
  const chain = getProjectChain(p);
  if (chain === "stellar") return "self-fund";
  if (chain === "evm") return "sandbox-funded";
  return "self-fund";
}

export function explorerTxUrl(p: ProjectDef, txHash: string): string {
  const ext = p as ChainProjectDef;
  if (ext.explorerTxTemplate) {
    return ext.explorerTxTemplate.replace("{tx}", txHash);
  }
  const chain = getProjectChain(p);
  if (chain === "sui") return `https://suiscan.xyz/testnet/tx/${txHash}`;
  if (chain === "stellar") {
    const net = ext.stellarNetwork === "public" ? "public" : "testnet";
    return `https://stellar.expert/explorer/${net}/tx/${txHash}`;
  }
  if (chain === "evm") {
    const id = ext.evmChainId ?? 11155111;
    if (id === 11155111) return `https://sepolia.etherscan.io/tx/${txHash}`;
    if (id === 84532) return `https://sepolia.basescan.org/tx/${txHash}`;
    return `https://etherscan.io/tx/${txHash}`;
  }
  return txHash;
}

export function asChainProject(p: ProjectDef): ChainProjectDef {
  return p as ChainProjectDef;
}
