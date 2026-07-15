/**
 * Pre-flight — verify Veil UI + API are live before judge capture.
 */
import { env } from "../config.js";

export interface VeilHealthReport {
  ok: boolean;
  demoUrl: string;
  uiReachable: boolean;
  uiStatus?: number;
  apiUrl: string;
  apiHealthy: boolean;
  apiDetail?: string;
  warnings: string[];
  blockers: string[];
}

async function probe(url: string, ms = 10000): Promise<{ ok: boolean; status?: number; body?: string }> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(ms) });
    const body = await res.text().catch(() => "");
    return { ok: res.ok, status: res.status, body: body.slice(0, 500) };
  } catch (e) {
    return { ok: false, body: e instanceof Error ? e.message : String(e) };
  }
}

function resolveApiUrl(demoUrl: string): string {
  const explicit = env("VEIL_API_URL") || env("VITE_VEIL_API_URL");
  if (explicit) return explicit.replace(/\/$/, "");
  const upstream = env("VEIL_API_UPSTREAM");
  if (upstream) return upstream.replace(/\/$/, "");
  if (demoUrl.includes("veil-reviewer.vercel.app") || demoUrl.includes("vercel.app")) {
    return "http://51.103.219.168:8787";
  }
  if (demoUrl.includes("127.0.0.1") || demoUrl.includes("localhost")) {
    return "http://127.0.0.1:8787";
  }
  return demoUrl.replace(/\/$/, "") + "/api";
}

export async function checkVeilHealth(demoUrl: string): Promise<VeilHealthReport> {
  const base = demoUrl.replace(/\/$/, "");
  const apiUrl = resolveApiUrl(base);
  const warnings: string[] = [];
  const blockers: string[] = [];

  const ui = await probe(base);
  if (!ui.ok) {
    blockers.push(`UI unreachable (${base}): ${ui.body ?? ui.status}`);
  }

  const apiHealth = await probe(`${apiUrl}/health`, 12000);
  let apiHealthy = apiHealth.ok;
  let apiDetail: string | undefined;
  if (apiHealth.body) {
    try {
      const j = JSON.parse(apiHealth.body) as { ok?: boolean; enclave?: string };
      apiHealthy = j.ok === true;
      apiDetail = JSON.stringify(j);
      if (!apiHealthy) blockers.push(`API /health not ok: ${apiDetail}`);
    } catch {
      apiDetail = apiHealth.body;
      if (!apiHealthy) warnings.push(`API /health returned non-JSON (${apiHealth.status})`);
    }
  } else if (!apiHealthy) {
    blockers.push(`API unreachable at ${apiUrl}/health — live capture blocked`);
  }

  const ok = ui.ok && apiHealthy && blockers.length === 0;
  return {
    ok,
    demoUrl: base,
    uiReachable: ui.ok,
    uiStatus: ui.status,
    apiUrl,
    apiHealthy,
    apiDetail,
    warnings,
    blockers,
  };
}

export function formatVeilHealth(r: VeilHealthReport): string {
  const lines = [
    `# Veil health — ${r.ok ? "READY" : "ISSUES"}`,
    `UI: ${r.uiReachable ? "✓" : "✗"} ${r.demoUrl} (${r.uiStatus ?? "?"})`,
    `API: ${r.apiHealthy ? "✓" : "⚠"} ${r.apiUrl}/health`,
  ];
  if (r.apiDetail) lines.push(`  ${r.apiDetail}`);
  for (const w of r.warnings) lines.push(`⚠ ${w}`);
  for (const b of r.blockers) lines.push(`✗ ${b}`);
  return lines.join("\n");
}
