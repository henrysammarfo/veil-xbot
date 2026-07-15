/** CLI: live Predict oracle horizon catalog */
import { fetchHorizonCatalog, validateIntentHorizon } from "./predict-sdk.js";

export async function printHorizonCatalog(asset = "BTC"): Promise<void> {
  const catalog = await fetchHorizonCatalog(asset);
  console.log(`# Predict horizons — ${asset} testnet`);
  console.log(`Fetched: ${new Date(catalog.fetchedAtMs).toISOString()}`);
  console.log(`Shortest intent: ${catalog.minIntentMinutes} minutes (5m NOT supported)`);
  console.log(`Slot grid: ~${catalog.shortSlotIntervalMinutes}m near term`);
  console.log(`Longest listed: ~${catalog.maxIntentDays} days`);
  console.log(`Active slots: ${catalog.slots.length}\n`);

  const sample = catalog.slots.slice(0, 12);
  for (const s of sample) {
    const ttlMin = Math.round(s.ttlMs / 60_000);
    console.log(
      `  ${s.bucket.padEnd(6)} ttl=${String(ttlMin).padStart(5)}m  expiry=${new Date(s.expiry).toISOString()}  ${s.oracleId.slice(0, 14)}…`,
    );
  }
  if (catalog.slots.length > sample.length) {
    console.log(`  … +${catalog.slots.length - sample.length} more`);
  }

  console.log("\n# Intent validation samples");
  for (const h of [0.083, 0.25, 1, 24, 24 * 7, 24 * 30]) {
    const label = h < 1 ? `${Math.round(h * 60)}m` : h < 24 ? `${h}h` : `${Math.round(h / 24)}d`;
    const v = validateIntentHorizon(h, catalog);
    console.log(`  ${label.padEnd(5)} → ${v.ok ? "OK" : `NO — ${v.error}`}`);
  }
}
