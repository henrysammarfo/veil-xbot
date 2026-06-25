import { config } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync, existsSync } from "node:fs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: join(root, ".env") });
config({ path: join(process.cwd(), ".env") });

export const XBOT_ROOT = root;
export const DATA_DIR =
  process.env.XBOT_DATA_DIR?.trim() || join(root, "data");
export const XBOT_PORT = Number(process.env.XBOT_PORT || 3947);

export function env(key: string, fallback = ""): string {
  return process.env[key]?.trim() || fallback;
}

export function requireEnv(key: string): string {
  const v = env(key);
  if (!v) throw new Error(`Missing ${key} — copy tools/x-bot/.env.example to .env`);
  return v;
}

export function hasOpenAI(): boolean {
  return Boolean(env("OPENAI_API_KEY"));
}

export function assertDataDir(): void {
  for (const sub of [
    "learnings", "drafts", "media", "playbook", "improve", "exports", "graphics", "engage",
    "qa", "creative", "ops", "marketing", "launch", "clips", "tags", "sandbox", "studio",
  ]) {
    const p = join(DATA_DIR, sub);
    if (!existsSync(p)) mkdirSync(p, { recursive: true });
  }
}
