declare module "@veil/sdk" {
  export const PREDICT_TESTNET: Record<string, unknown>;
  export const MIN_INTENT_MS: number;
  export const SEAL_BUFFER_MS: number;
  export const MANAGER_MINT_RESERVE_USDC: number;
  export function microToUsdc(micro: number | string): number;
  export function usdcToMicro(usdc: number | string): number;
  export function fetchActiveOracle(...args: unknown[]): Promise<unknown>;
  export function fetchOracleForward(...args: unknown[]): Promise<unknown>;
  export function fetchOracleForHorizon(...args: unknown[]): Promise<unknown>;
  export function fetchHorizonCatalog(...args: unknown[]): Promise<unknown[]>;
  export function validateIntentHorizon(...args: unknown[]): { ok: boolean; [k: string]: unknown };
  export function resolveMintStrike(...args: unknown[]): number;
  export function fetchManagerForOwner(...args: unknown[]): Promise<unknown>;
  export function fetchManagerOnChain(...args: unknown[]): Promise<unknown>;
  export function fetchManagerSummary(...args: unknown[]): Promise<{ balanceMicro?: number } | null>;
  export function preflightMint(...args: unknown[]): Promise<{ ok: boolean; reason?: string }>;
  export function fetchServerStatus(...args: unknown[]): Promise<unknown>;
  export function fetchQuoteAssets(...args: unknown[]): Promise<unknown[]>;
  export function fetchAskBounds(...args: unknown[]): Promise<unknown>;
}
