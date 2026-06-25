import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { env, DATA_DIR, assertDataDir } from "../config.js";
import { getProject } from "../projects/registry.js";
import { newId } from "../store.js";

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

  try {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    const email = env("SANDBOX_TEST_EMAIL");
    const password = env("SANDBOX_TEST_PASSWORD");

    for (const vp of report.viewports) {
      const size = VIEWPORTS[vp];
      await page.setViewportSize(size);
      await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 });
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

  report.readyForDemo =
    report.bugs.length === 0 && report.checks.every((c) => c.pass || c.id === "auth-configured");

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
