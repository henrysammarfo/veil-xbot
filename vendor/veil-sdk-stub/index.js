/**
 * Minimal @veil/sdk stub — growth OS runs without the sibling Veil monorepo.
 * For live predict/mint QA: point package.json at ../veil/packages/sdk.
 */
export const PREDICT_TESTNET = {
  stub: true,
  network: "testnet",
};

export const MIN_INTENT_MS = 60_000;
export const SEAL_BUFFER_MS = 5_000;
export const MANAGER_MINT_RESERVE_USDC = 1;

export function microToUsdc(micro) {
  return Number(micro || 0) / 1e6;
}

export function usdcToMicro(usdc) {
  return Math.round(Number(usdc || 0) * 1e6);
}

async function notWired(name) {
  throw new Error(
    `@veil/sdk stub: ${name} unavailable. Install real package: file:../veil/packages/sdk`,
  );
}

export async function fetchActiveOracle(..._args) {
  return null;
}
export async function fetchOracleForward(..._args) {
  return null;
}
export async function fetchOracleForHorizon(..._args) {
  return null;
}
export async function fetchHorizonCatalog(..._args) {
  return [];
}
export function validateIntentHorizon(..._args) {
  return { ok: true };
}
export function resolveMintStrike(..._args) {
  return 0;
}
export async function fetchManagerForOwner(..._args) {
  return null;
}
export async function fetchManagerOnChain(..._args) {
  return null;
}
export async function fetchManagerSummary(..._args) {
  return null;
}
export async function preflightMint(..._args) {
  return { ok: false, reason: "veil-sdk-stub" };
}
export async function fetchServerStatus(..._args) {
  return { ok: false, stub: true };
}
export async function fetchQuoteAssets(..._args) {
  return [];
}
export async function fetchAskBounds(..._args) {
  return null;
}

// keep tree-shake quiet
void notWired;
