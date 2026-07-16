/**
 * Shared Playwright Chromium launcher — always prefer user-local ms-playwright
 * over Cursor sandbox cache paths that break after reinstalls.
 */
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { chromium, type Browser, type LaunchOptions } from "playwright";
import { env } from "../config.js";

export function ensurePlaywrightBrowsersPath(): string | undefined {
  const explicit = env("PLAYWRIGHT_BROWSERS_PATH") || env("SANDBOX_PLAYWRIGHT_BROWSERS_PATH");
  if (explicit && existsSync(explicit)) {
    process.env.PLAYWRIGHT_BROWSERS_PATH = explicit;
    return explicit;
  }
  const local = join(process.env.LOCALAPPDATA ?? homedir(), "ms-playwright");
  if (existsSync(local)) {
    process.env.PLAYWRIGHT_BROWSERS_PATH = local;
    return local;
  }
  return undefined;
}

export function resolveChromiumExecutable(browsersPath?: string): string | undefined {
  const custom = env("SANDBOX_CHROME_PATH");
  if (custom && existsSync(custom)) return custom;

  const root = browsersPath ?? join(process.env.LOCALAPPDATA ?? homedir(), "ms-playwright");
  if (existsSync(root)) {
    const versions = readdirSync(root)
      .filter((d) => d.startsWith("chromium-") && !d.includes("headless"))
      .sort()
      .reverse();
    for (const v of versions) {
      const ver = v.replace(/^chromium-/, "");
      const candidates = [
        join(root, v, "chrome-win64", "chrome.exe"),
        join(root, `chromium_headless_shell-${ver}`, "chrome-headless-shell-win64", "chrome-headless-shell.exe"),
      ];
      for (const exe of candidates) {
        if (existsSync(exe)) return exe;
      }
    }
  }

  for (const p of [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  ]) {
    if (existsSync(p)) return p;
  }
  return undefined;
}

/** Launch Chromium with resolved local browser — use this everywhere. */
export async function launchChromium(opts?: LaunchOptions): Promise<Browser> {
  const browsersPath = ensurePlaywrightBrowsersPath();
  const executablePath = resolveChromiumExecutable(browsersPath);
  return chromium.launch({
    headless: true,
    ...opts,
    ...(executablePath ? { executablePath } : {}),
  });
}

export function playwrightProbe(): {
  browsersPath: string | null;
  executable: string | null;
  ok: boolean;
} {
  const browsersPath = ensurePlaywrightBrowsersPath() ?? null;
  const executable = resolveChromiumExecutable(browsersPath ?? undefined) ?? null;
  return { browsersPath, executable, ok: Boolean(executable) };
}
