/**
 * Live-only mode — no fallbacks, no step skips; wait until success or hard fail.
 */
import { env } from "../config.js";

export function isLiveOnly(): boolean {
  return env("LIVE_ONLY", "1") !== "0";
}

export async function waitUntilReachable(
  url: string,
  opts?: { label?: string; intervalMs?: number; maxWaitMs?: number },
): Promise<void> {
  const interval = opts?.intervalMs ?? 5000;
  const maxWait = opts?.maxWaitMs ?? Number(env("LIVE_WAIT_MS", "600000"));
  const label = opts?.label ?? url;
  const start = Date.now();
  let attempt = 0;
  while (Date.now() - start < maxWait) {
    attempt++;
    try {
      const res = await fetch(url, { method: "GET", signal: AbortSignal.timeout(15000) });
      if (res.ok || res.status < 500) {
        console.log(`  ✓ ${label} reachable (${res.status}) after ${attempt} attempt(s)`);
        return;
      }
      console.log(`  … ${label} returned ${res.status} — retry ${attempt}`);
    } catch (e) {
      console.log(`  … waiting for ${label} (${attempt}) — ${e instanceof Error ? e.message : e}`);
    }
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new Error(`${label} not reachable after ${maxWait / 1000}s — live-only, no fallback`);
}

export async function retryLive<T>(
  label: string,
  fn: () => Promise<T>,
  opts?: { attempts?: number; delayMs?: number },
): Promise<T> {
  const attempts = opts?.attempts ?? Number(env("LIVE_RETRY_ATTEMPTS", "5"));
  const delayMs = opts?.delayMs ?? Number(env("LIVE_RETRY_DELAY_MS", "15000"));
  let lastErr: Error | undefined;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
      if (i < attempts) {
        console.log(`  … ${label} failed (${i}/${attempts}): ${lastErr.message} — retry in ${delayMs / 1000}s`);
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }
  throw lastErr ?? new Error(`${label} failed after ${attempts} attempts`);
}
