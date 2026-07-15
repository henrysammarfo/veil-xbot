import { config } from "dotenv";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchManagerIdleUsdc, fetchManagerForOwner } from "../src/qa/predict-sdk.js";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: join(root, "../veil/.env") });

const key = process.env.SUI_PRIVATE_KEY;
if (!key) {
  console.log("SUI_PRIVATE_KEY missing");
  process.exit(1);
}
const owner = Ed25519Keypair.fromSecretKey(key).getPublicKey().toSuiAddress();
let mgr = process.env.PREDICT_MANAGER_ID?.trim();
if (!mgr) mgr = (await fetchManagerForOwner(owner)) ?? undefined;
console.log("owner", owner);
console.log("manager", mgr ?? "NOT FOUND");
if (mgr) {
  const idle = await fetchManagerIdleUsdc(mgr);
  console.log("manager idle dUSDC", idle);
}
