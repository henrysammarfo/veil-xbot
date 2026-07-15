/** Local PTB builders — same targets as @veil/sdk, typed against xbot's @mysten/sui. */
import { Transaction } from "@mysten/sui/transactions";
import { PREDICT_TESTNET, usdcToMicro } from "./predict-sdk.js";

const PKG = PREDICT_TESTNET.packageId;
const DUSDC = PREDICT_TESTNET.dusdcType;

function buildMarketKey(
  tx: Transaction,
  params: { oracleId: string; expiry: number; strike: number; isUp: boolean },
) {
  return tx.moveCall({
    target: `${PKG}::market_key::new`,
    arguments: [
      tx.pure.id(params.oracleId),
      tx.pure.u64(params.expiry),
      tx.pure.u64(params.strike),
      tx.pure.bool(params.isUp),
    ],
  });
}

export function buildMintPtb(params: {
  managerId: string;
  oracleId: string;
  expiry: number;
  strike: number;
  isUp: boolean;
  quantity?: number;
}): Transaction {
  const tx = new Transaction();
  const key = buildMarketKey(tx, params);
  tx.moveCall({
    target: `${PKG}::predict::mint`,
    typeArguments: [DUSDC],
    arguments: [
      tx.object(PREDICT_TESTNET.predictObjectId),
      tx.object(params.managerId),
      tx.object(params.oracleId),
      key,
      tx.pure.u64(params.quantity ?? 1),
      tx.object.clock(),
    ],
  });
  return tx;
}

export function buildDepositManagerAmountPtb(params: {
  managerId: string;
  coinId: string;
  amountUsdc: number;
}): Transaction {
  const tx = new Transaction();
  const [depositCoin] = tx.splitCoins(tx.object(params.coinId), [
    tx.pure.u64(usdcToMicro(params.amountUsdc)),
  ]);
  tx.moveCall({
    target: `${PKG}::predict_manager::deposit`,
    typeArguments: [DUSDC],
    arguments: [tx.object(params.managerId), depositCoin],
  });
  return tx;
}

export function buildCreateManagerPtb(): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PKG}::predict::create_manager`,
    arguments: [],
  });
  return tx;
}
