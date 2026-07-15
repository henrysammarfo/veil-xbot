/** Market + config from @veil/sdk; PTBs built locally to avoid duplicate @mysten/sui types. */
export {
  PREDICT_TESTNET,
  fetchActiveOracle,
  fetchOracleForward,
  fetchOracleForHorizon,
  fetchHorizonCatalog,
  validateIntentHorizon,
  resolveMintStrike,
  fetchManagerForOwner,
  fetchManagerOnChain,
  fetchManagerSummary,
  preflightMint,
  fetchServerStatus,
  fetchQuoteAssets,
  fetchAskBounds,
  MIN_INTENT_MS,
  SEAL_BUFFER_MS,
  MANAGER_MINT_RESERVE_USDC,
  microToUsdc,
  usdcToMicro,
} from "@veil/sdk";

export { buildMintPtb, buildCreateManagerPtb, buildDepositManagerAmountPtb } from "./predict-ptb.js";

import { fetchManagerSummary, microToUsdc } from "@veil/sdk";

/** Idle dUSDC in PredictManager trading balance. */
export async function fetchManagerIdleUsdc(managerId: string): Promise<number> {
  const summary = await fetchManagerSummary(managerId);
  if (!summary) return 0;
  return microToUsdc(summary.balanceMicro);
}
