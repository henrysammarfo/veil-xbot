/** Resilient Sui JSON-RPC — retries transient fetch / network failures. */
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { env } from "../config.js";
import type { SuiNetwork } from "./sui-wallet.js";

const MAX_RETRIES = Number(process.env.SUI_RPC_RETRIES || "5");
const RETRY_BASE_MS = Number(process.env.SUI_RPC_RETRY_MS || "2000");

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function describeRpcError(label: string, err: unknown, url: string): string {
  if (err instanceof Error) {
    const cause = (err as { cause?: unknown }).cause;
    const causeMsg =
      cause instanceof Error ? cause.message : cause != null ? String(cause) : "";
    const detail = causeMsg && causeMsg !== err.message ? ` (${causeMsg})` : "";
    return `${label}: ${err.message}${detail} — ${url}`;
  }
  return `${label}: ${String(err)} — ${url}`;
}

export function suiRpcUrl(network: SuiNetwork = "testnet"): string {
  return env("SUI_RPC_URL") || getJsonRpcFullnodeUrl(network);
}

export function createSuiClient(network: SuiNetwork = "testnet"): SuiJsonRpcClient {
  return new SuiJsonRpcClient({ url: suiRpcUrl(network), network });
}

/** Retry wrapper for Sui RPC calls that may fail with transient `fetch failed`. */
export async function withSuiRpcRetry<T>(
  label: string,
  fn: (client: SuiJsonRpcClient) => Promise<T>,
  network: SuiNetwork = "testnet",
): Promise<T> {
  const url = suiRpcUrl(network);
  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const client = createSuiClient(network);
    try {
      return await fn(client);
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_BASE_MS * 2 ** attempt);
        continue;
      }
    }
  }
  throw new Error(describeRpcError(label, lastErr, url));
}
