import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { env, DATA_DIR, assertDataDir } from "../config.js";
import { getProject } from "../projects/registry.js";
import { newId } from "../store.js";
import { fundSandboxWallet, loadOrCreateWallet, getSuiBalance, getSandboxNetwork } from "./sui-wallet.js";
import { getCoinBalance } from "./fund-sandbox.js";
import { PREDICT_TESTNET } from "./predict-sdk.js";

export type ViewportId = "phone" | "tablet" | "laptop" | "desktop";

const VIEWPORTS: Record<ViewportId, { width: number; height: number }> = {
  phone: { width: 390, height: 844 },
  tablet: { width: 768, height: 1024 },
  laptop: { width: 1280, height: 800 },
  desktop: { width: 1920, height: 1080 },
};

export interface SandboxReport {
  id: string;
  projectId: string;
  url: string;
  at: number;
  viewports: ViewportId[];
  screenshots: string[];
  checks: Array<{ id: string; pass: boolean; note: string }>;
  bugs: string[];
  wallet?: {
    address: string;
    network: string;
    balanceSui: string;
    balanceDusdc?: string;
    dusdcFaucetUrl?: string;
  };
  readyForDemo: boolean;
}

/** QA sandbox — real browser test + screenshots (needs playwright). */
export async function runSandbox(projectId: string): Promise<SandboxReport> {
  const project = getProject(projectId);
  const url = project.primaryUrl;
  const report: SandboxReport = {
    id: newId("sandbox"),
    projectId,
    url,
    at: Date.now(),
    viewports: ["phone", "tablet", "laptop", "desktop"],
    screenshots: [],
    checks: [],
    bugs: [],
    readyForDemo: false,
  };

  assertDataDir();
  const shotDir = join(DATA_DIR, "sandbox", report.id);
  if (!existsSync(shotDir)) mkdirSync(shotDir, { recursive: true });

  // Chain-matched wallet + balances
  if (project.id === "veil" || project.id === "magmos" || env("SANDBOX_WALLET") === "1") {
    try {
      const wallet = loadOrCreateWallet(projectId);
      const network = getSandboxNetwork(projectId);
      await fundSandboxWallet(projectId).catch(() => null);
      const balanceMist = await getSuiBalance(wallet.address, network);
      const balanceSui = (Number(balanceMist) / 1e9).toFixed(4);
      let balanceDusdc = "0";
      if (projectId === "veil") {
        const raw = await getCoinBalance(wallet.address, PREDICT_TESTNET.dusdcType, network);
        balanceDusdc = (Number(raw) / 1e6).toFixed(2);
      }
      report.wallet = {
        address: wallet.address,
        network: wallet.network,
        balanceSui,
        balanceDusdc,
        dusdcFaucetUrl: wallet.dusdcFaucetUrl,
      };
      const minSui = 0.01;
      report.checks.push({
        id: "wallet-funded",
        pass: Number(balanceSui) >= minSui,
        note: `${balanceSui} SUI · ${balanceDusdc} dUSDC on ${wallet.network}`,
      });
      if (Number(balanceSui) < minSui) {
        report.bugs.push(`Low SUI (${balanceSui}) — run: npm start wallet fund veil`);
      }
      if (projectId === "veil") {
        const minDusdc = 1;
        report.checks.push({
          id: "dusdc-balance",
          pass: Number(balanceDusdc) >= minDusdc,
          note: `${balanceDusdc} dUSDC (need ≥${minDusdc} for test mints)`,
        });
        if (Number(balanceDusdc) < minDusdc && wallet.dusdcFaucetUrl) {
          report.bugs.push(`Low dUSDC — run: npm start wallet fund veil`);
        }
      }
    } catch (e) {
      report.bugs.push(e instanceof Error ? e.message : String(e));
    }
  }

  const gotoTimeout = Number(env("SANDBOX_GOTO_TIMEOUT_MS", "90000"));
  const waitUntil = (env("SANDBOX_WAIT_UNTIL", "domcontentloaded") ||
    "domcontentloaded") as "load" | "domcontentloaded" | "networkidle";

  try {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    page.setDefaultTimeout(gotoTimeout);
    page.setDefaultNavigationTimeout(gotoTimeout);

    const email = env("SANDBOX_TEST_EMAIL");
    const password = env("SANDBOX_TEST_PASSWORD");

    for (const vp of report.viewports) {
      const size = VIEWPORTS[vp];
      await page.setViewportSize(size);
      try {
        await page.goto(url, { waitUntil, timeout: gotoTimeout });
        await page.waitForTimeout(1500);
      } catch (navErr) {
        report.bugs.push(
          `${vp}: navigation — ${navErr instanceof Error ? navErr.message : String(navErr)}`,
        );
      }
      const path = join(shotDir, `${vp}.png`);
      await page.screenshot({ path, fullPage: false });
      report.screenshots.push(path);
    }

    // Basic health checks
    const title = await page.title();
    report.checks.push({
      id: "page-loads",
      pass: title.length > 0,
      note: `Title: ${title}`,
    });

    const bodyText = await page.locator("body").innerText();
    report.checks.push({
      id: "has-content",
      pass: bodyText.length > 50,
      note: `${bodyText.length} chars visible`,
    });

    // Auth flow if credentials provided
    if (email && password) {
      report.checks.push({
        id: "auth-configured",
        pass: true,
        note: "SANDBOX_TEST_EMAIL set — extend sandbox.ts with your wallet/auth selectors",
      });
    } else {
      report.checks.push({
        id: "auth-configured",
        pass: false,
        note: "Set SANDBOX_TEST_EMAIL + SANDBOX_TEST_PASSWORD for full account test",
      });
    }

    await browser.close();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("Cannot find package 'playwright'")) {
      report.bugs.push("Install: npm install playwright && npx playwright install chromium");
    } else {
      report.bugs.push(msg);
    }
  }

  const hardBugs = report.bugs.filter(
    (b) => !b.includes("navigation") && !b.startsWith("Low SUI") && !b.startsWith("Low dUSDC"),
  );
  report.readyForDemo =
    hardBugs.length === 0 &&
    report.screenshots.length >= 2 &&
    report.checks.filter((c) => c.id === "page-loads" || c.id === "has-content").every((c) => c.pass);

  writeFileSync(join(DATA_DIR, "sandbox", `${report.id}.json`), JSON.stringify(report, null, 2));
  writeFileSync(join(DATA_DIR, "sandbox", "latest.json"), JSON.stringify(report, null, 2));
  return report;
}

export function formatSandboxReport(r: SandboxReport): string {
  const lines = [
    `# Sandbox — ${r.projectId}`,
    `URL: ${r.url}`,
    `Ready for demo: ${r.readyForDemo ? "YES" : "NO"}`,
    "",
    "## Screenshots",
    ...r.screenshots.map((s) => `- ${s}`),
    "",
    "## Checks",
    ...r.checks.map((c) => `- [${c.pass ? "x" : " "}] ${c.id}: ${c.note}`),
  ];
  if (r.wallet) {
    lines.push(
      "",
      "## Wallet",
      `Address: ${r.wallet.address}`,
      `Network: ${r.wallet.network} · ${r.wallet.balanceSui} SUI${r.wallet.balanceDusdc ? ` · ${r.wallet.balanceDusdc} dUSDC` : ""}`,
    );
    if (r.wallet.dusdcFaucetUrl) lines.push(`dUSDC: ${r.wallet.dusdcFaucetUrl}`);
  }
  if (r.bugs.length) {
    lines.push("", "## Bugs / blockers", ...r.bugs.map((b) => `- ${b}`));
  }
  if (r.readyForDemo) {
    lines.push("", "→ Run: npm run produce veil trailer");
  } else {
    lines.push("", "→ Fix bugs first, then re-run: npm run sandbox veil");
  }
  return lines.join("\n");
}

export function loadLatestSandbox(): SandboxReport | null {
  const p = join(DATA_DIR, "sandbox", "latest.json");
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf8")) as SandboxReport;
}
