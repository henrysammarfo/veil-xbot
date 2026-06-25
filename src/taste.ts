import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { XBOT_ROOT } from "./config.js";

const TASTE_PATH = join(XBOT_ROOT, "taste.md");
const MAX_IN_PROMPT = 4500;

/** Human taste gate — injected into every generation prompt. */
export function readTaste(): string {
  if (!existsSync(TASTE_PATH)) return "";
  const raw = readFileSync(TASTE_PATH, "utf8");
  return raw.length > MAX_IN_PROMPT ? raw.slice(0, MAX_IN_PROMPT) + "\n…(truncated)" : raw;
}

export function tasteSystemSuffix(): string {
  const t = readTaste();
  if (!t) return "";
  return `\n\n--- TASTE.MD (reject output that violates this) ---\n${t}`;
}
