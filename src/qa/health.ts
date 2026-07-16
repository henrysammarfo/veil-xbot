/**
 * Full-stack health probe — capture, brain/smart, speech, TinyFish, Venice.
 */
import { existsSync, mkdirSync, writeFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR, assertDataDir, hasOpenAI } from "../config.js";
import { hasVenice, formatVeniceStatus } from "../integrations/venice.js";
import { hasTinyfish } from "../research/tinyfish.js";
import { smartStatus, smartChat } from "../brain/smart.js";
import { prepareUnifiedSystem } from "../brain/unified-context.js";
import { playwrightProbe, launchChromium } from "../qa/playwright-launch.js";
import { hasVoicebox, voiceboxBaseUrl } from "../integrations/voicebox.js";
import { env } from "../config.js";
import { hasFfmpeg } from "../edit/ffmpeg-util.js";

export interface HealthCheck {
  id: string;
  ok: boolean;
  detail: string;
}

export async function runHealthProbe(opts?: { capture?: boolean }): Promise<{
  checks: HealthCheck[];
  allOk: boolean;
  reportPath: string;
}> {
  assertDataDir();
  const checks: HealthCheck[] = [];

  const smart = smartStatus();
  checks.push({
    id: "smart-cascade",
    ok: smart.order.length > 0,
    detail: `order=${smart.order.join("→") || "none"} · venice=${smart.venice} openai=${smart.openai} tinyfish=${smart.tinyfish}`,
  });

  checks.push({
    id: "venice",
    ok: hasVenice(),
    detail: formatVeniceStatus(),
  });

  checks.push({
    id: "openai",
    ok: hasOpenAI(),
    detail: hasOpenAI() ? "OPENAI_API_KEY set" : "missing",
  });

  checks.push({
    id: "tinyfish",
    ok: hasTinyfish(),
    detail: hasTinyfish() ? "TINYFISH_API_KEY set" : "missing",
  });

  checks.push({
    id: "ffmpeg",
    ok: hasFfmpeg(),
    detail: hasFfmpeg() ? "ffmpeg on PATH" : "missing",
  });

  const pw = playwrightProbe();
  checks.push({
    id: "playwright",
    ok: pw.ok,
    detail: pw.ok ? `exe=${pw.executable}` : `browsersPath=${pw.browsersPath ?? "none"} — run npx playwright install`,
  });

  // Speech proxy / Voicebox
  let speechOk = false;
  let speechDetail = "VOICEBOX_URL unset";
  if (hasVoicebox()) {
    try {
      const res = await fetch(`${voiceboxBaseUrl()}/health`, { signal: AbortSignal.timeout(4000) });
      speechOk = res.ok;
      speechDetail = `VOICEBOX_URL=${voiceboxBaseUrl()} status=${res.status}`;
    } catch (e) {
      speechDetail = `VOICEBOX unreachable: ${e instanceof Error ? e.message : e}`;
    }
  }
  checks.push({ id: "speech", ok: speechOk || !hasVoicebox(), detail: speechDetail });

  // Brain / unified
  try {
    const u = prepareUnifiedSystem({ projectId: "magmos", task: "pack", feature: "global" });
    checks.push({
      id: "brain",
      ok: u.brainSeeded > 0 && u.lessons.length > 0,
      detail: `skills=${u.skillCatalogCount} brain=${u.brainSeeded} lessons=${u.lessons.length}`,
    });
  } catch (e) {
    checks.push({
      id: "brain",
      ok: false,
      detail: e instanceof Error ? e.message : String(e),
    });
  }

  // Live smart chat
  try {
    const chat = await smartChat(
      "ops",
      'Reply JSON only: {"ok":true,"msg":"cascade live"}',
      { projectId: "magmos", feature: "ops" },
    );
    const ok = /ok|true|cascade|live/i.test(chat.content);
    checks.push({
      id: "smart-chat",
      ok,
      detail: `via ${chat.provider} · ${chat.content.slice(0, 120).replace(/\n/g, " ")}`,
    });
  } catch (e) {
    checks.push({
      id: "smart-chat",
      ok: false,
      detail: e instanceof Error ? e.message : String(e),
    });
  }

  // Live capture smoke
  if (opts?.capture !== false && pw.ok) {
    const out = join(DATA_DIR, "exports", "health", `capture-${Date.now()}.png`);
    mkdirSync(join(DATA_DIR, "exports", "health"), { recursive: true });
    try {
      const browser = await launchChromium();
      try {
        const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
        await page.goto(env("MAGOS_DEMO_URL", "https://magmoslabs.vercel.app"), {
          waitUntil: "domcontentloaded",
          timeout: 60000,
        });
        await page.waitForTimeout(2000);
        await page.screenshot({ path: out, type: "png" });
      } finally {
        await browser.close();
      }
      const bytes = existsSync(out) ? statSync(out).size : 0;
      checks.push({
        id: "capture",
        ok: bytes > 10_000,
        detail: bytes > 10_000 ? `${out} (${Math.round(bytes / 1024)}KB)` : `too small: ${bytes}B`,
      });
    } catch (e) {
      checks.push({
        id: "capture",
        ok: false,
        detail: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const allOk = checks.every((c) => c.ok);
  const reportPath = join(DATA_DIR, "improve", "HEALTH.json");
  writeFileSync(reportPath, JSON.stringify({ at: Date.now(), allOk, checks }, null, 2));
  return { checks, allOk, reportPath };
}

export function formatHealth(r: Awaited<ReturnType<typeof runHealthProbe>>): string {
  return [
    `# Health — ${r.allOk ? "ALL GREEN" : "NEEDS ATTENTION"}`,
    "",
    ...r.checks.map((c) => `- ${c.ok ? "OK" : "FAIL"} **${c.id}**: ${c.detail}`),
    "",
    `Report: ${r.reportPath}`,
  ].join("\n");
}
