/**
 * jamiepine/voicebox — local voice studio TTS adapter.
 * API: POST {VOICEBOX_URL}/v1/tts  { text, voice? } → audio/mpeg|wav
 * Fallback paths documented in OSS-STACK.md
 */
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR, assertDataDir, env } from "../config.js";

export function hasVoicebox(): boolean {
  return Boolean(env("VOICEBOX_URL")?.trim());
}

export function voiceboxBaseUrl(): string {
  return (env("VOICEBOX_URL") || "").replace(/\/$/, "");
}

export interface VoiceboxTtsResult {
  path: string;
  bytes: number;
  provider: "voicebox";
}

export async function voiceboxTextToSpeech(
  text: string,
  opts?: { outName?: string; voice?: string },
): Promise<VoiceboxTtsResult> {
  const base = voiceboxBaseUrl();
  if (!base) throw new Error("Set VOICEBOX_URL (e.g. http://127.0.0.1:8780)");

  assertDataDir();
  const dir = join(DATA_DIR, "media", "voicebox");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const outName = opts?.outName ?? `vb-${Date.now()}.mp3`;
  const path = join(dir, outName);

  const endpoints = [
    `${base}/v1/tts`,
    `${base}/api/tts`,
    `${base}/tts`,
  ];

  let lastErr = "";
  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "audio/mpeg, audio/wav, application/json" },
        body: JSON.stringify({
          text,
          voice: opts?.voice ?? env("VOICEBOX_VOICE", "default"),
          format: "mp3",
        }),
      });
      if (!res.ok) {
        lastErr = `${url} → ${res.status}`;
        continue;
      }
      const ct = res.headers.get("content-type") ?? "";
      if (ct.includes("json")) {
        const j = (await res.json()) as { audio?: string; url?: string; path?: string };
        if (j.url) {
          const a = await fetch(j.url);
          const buf = Buffer.from(await a.arrayBuffer());
          writeFileSync(path, buf);
          return { path, bytes: buf.length, provider: "voicebox" };
        }
        if (j.audio) {
          const buf = Buffer.from(j.audio, "base64");
          writeFileSync(path, buf);
          return { path, bytes: buf.length, provider: "voicebox" };
        }
        lastErr = `${url} json without audio`;
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      writeFileSync(path, buf);
      return { path, bytes: buf.length, provider: "voicebox" };
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
  }
  throw new Error(`Voicebox TTS failed (${lastErr}). Is voicebox.sh running?`);
}
