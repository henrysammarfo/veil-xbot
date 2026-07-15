/** Local cache for predict-server IDs — survives transient indexer outages. */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR } from "../config.js";

export interface PredictCache {
  wallet?: string;
  managerId?: string;
  oracle?: {
    oracleId: string;
    expiry: number;
    minStrike: number;
    tickSize: number;
    asset: string;
    cachedAtMs: number;
  };
}

const CACHE_PATH = join(DATA_DIR, "sandbox", "predict-cache.json");

export function loadPredictCache(): PredictCache {
  if (!existsSync(CACHE_PATH)) return {};
  try {
    return JSON.parse(readFileSync(CACHE_PATH, "utf8")) as PredictCache;
  } catch {
    return {};
  }
}

export function savePredictCache(patch: Partial<PredictCache>): void {
  const dir = join(DATA_DIR, "sandbox");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const prev = loadPredictCache();
  writeFileSync(CACHE_PATH, JSON.stringify({ ...prev, ...patch }, null, 2));
}

export function cachedManagerForWallet(wallet: string): string | null {
  const envId = process.env.SANDBOX_PREDICT_MANAGER_ID?.trim();
  if (envId) return envId;
  const cache = loadPredictCache();
  if (cache.wallet === wallet && cache.managerId) return cache.managerId;
  return null;
}

function envOracleMeta(asset: string): {
  oracleId: string;
  expiry: number;
  minStrike: number;
  tickSize: number;
} | null {
  if (asset !== "BTC") return null;
  const envId =
    process.env.SANDBOX_BTC_ORACLE_ID?.trim() ||
    process.env.PREDICT_ORACLE_ID?.trim();
  if (!envId) return null;
  const cache = loadPredictCache();
  if (cache.oracle?.oracleId === envId) {
    return {
      oracleId: cache.oracle.oracleId,
      expiry: cache.oracle.expiry,
      minStrike: cache.oracle.minStrike,
      tickSize: cache.oracle.tickSize,
    };
  }
  const expiry = Number(process.env.PREDICT_ORACLE_EXPIRY || "0") || Date.now() + 86400_000;
  return { oracleId: envId, expiry, minStrike: 0, tickSize: 1_000_000_000 };
}

export function cachedActiveOracle(asset = "BTC"): {
  oracleId: string;
  expiry: number;
  minStrike: number;
  tickSize: number;
} | null {
  const fromEnv = envOracleMeta(asset);
  if (fromEnv) return fromEnv;
  const cache = loadPredictCache();
  const o = cache.oracle;
  if (!o || o.asset !== asset || o.expiry <= Date.now()) return null;
  return {
    oracleId: o.oracleId,
    expiry: o.expiry,
    minStrike: o.minStrike,
    tickSize: o.tickSize,
  };
}
