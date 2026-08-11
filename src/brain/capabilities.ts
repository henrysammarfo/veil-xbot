/**
 * Honest capability map for the 3-key production stack.
 * Keys: VENICE_API_KEY + OPENAI_API_KEY + TINYFISH_API_KEY
 * System: ffmpeg on PATH (not a key — install once)
 *
 * "partial" must NEVER mean "skill unwired" when cascade covers the job.
 */
import { hasOpenAI, env } from "../config.js";
import { hasVenice } from "../integrations/venice.js";
import { hasTinyfish } from "../research/tinyfish.js";
import { hasFfmpeg } from "../edit/ffmpeg-util.js";
import { hasHeyGen } from "../integrations/heygen.js";
import { hasVoicebox } from "../integrations/voicebox.js";
import { hasFal } from "../integrations/fal.js";
import { gooseStackReady } from "../skills/paths.js";

export interface StackKeys {
  venice: boolean;
  openai: boolean;
  tinyfish: boolean;
  /** All three operator keys present */
  triple: boolean;
}

export interface SystemDeps {
  ffmpeg: boolean;
  goose: boolean;
}

export function keyStack(): StackKeys {
  const venice = hasVenice();
  const openai = hasOpenAI();
  const tinyfish = hasTinyfish();
  return { venice, openai, tinyfish, triple: venice && openai && tinyfish };
}

export function systemDeps(): SystemDeps {
  return { ffmpeg: hasFfmpeg(), goose: gooseStackReady() };
}

/** What each product surface needs for green "wired" */
export function cascadeWireStatus(): Array<{
  id: string;
  status: "wired" | "partial" | "blocked";
  via: string;
  needs: string;
}> {
  const k = keyStack();
  const s = systemDeps();
  const tts = hasVoicebox() || k.venice || k.openai;
  const asr = Boolean(env("VIBEVOICE_ASR_URL")) || k.openai;
  const presenter = hasHeyGen() || k.venice;
  const editMedia = s.ffmpeg;
  const research = k.tinyfish || k.venice; // tinyfish preferred; venice can still draft from registry

  return [
    {
      id: "llm",
      status: k.venice || k.openai ? "wired" : "blocked",
      via: k.venice ? "venice→openai cascade" : k.openai ? "openai" : "none",
      needs: "VENICE_API_KEY (preferred) or OPENAI_API_KEY",
    },
    {
      id: "research",
      status: k.tinyfish ? "wired" : research ? "partial" : "blocked",
      via: k.tinyfish ? "tinyfish" : "registry-only",
      needs: "TINYFISH_API_KEY",
    },
    {
      id: "image",
      status: k.venice || k.openai || hasFal() ? "wired" : "blocked",
      via: k.venice ? "venice image" : k.openai ? "openai image" : hasFal() ? "fal" : "none",
      needs: "VENICE_API_KEY",
    },
    {
      id: "video-t2v",
      status: k.venice ? "wired" : "partial",
      via: k.venice ? "venice seedance" : "still+VO fallback",
      needs: "VENICE_API_KEY",
    },
    {
      id: "tts",
      status: tts ? "wired" : "blocked",
      via: hasVoicebox() ? "voicebox" : k.venice ? "venice-tts" : k.openai ? "openai-tts" : "none",
      needs: "VENICE_API_KEY (or VOICEBOX_URL)",
    },
    {
      id: "asr",
      status: asr ? "wired" : "blocked",
      via: env("VIBEVOICE_ASR_URL") ? "vibevoice" : k.openai ? "whisper-1" : "none",
      needs: "OPENAI_API_KEY for Whisper",
    },
    {
      id: "presenter",
      status: presenter ? "wired" : "blocked",
      via: hasHeyGen() ? "heygen" : k.venice ? "venice-presenter-pip" : "none",
      needs: "VENICE_API_KEY (HeyGen optional)",
    },
  {
    id: "edit-ffmpeg",
    status: editMedia ? "wired" : "partial",
    via: editMedia ? "ffmpeg on PATH" : "no-ffmpeg",
    needs: "SYSTEM: install ffmpeg (not an API key)",
  },
  {
    id: "diffusion-studio",
    status: "wired",
    via: "tsx compositions → dapi when installed",
    needs: "optional: dapi on PATH (github.com/diffusionstudio/editor)",
  },
  {
    id: "goose-ads",
    status: s.goose ? "wired" : "partial",
    via: s.goose ? ".agents/skills flat" : "missing skills",
    needs: "npm run activate",
  },
    {
      id: "link-fleet",
      status: k.triple && s.goose ? (s.ffmpeg ? "wired" : "partial") : "blocked",
      via: "grow → pack → ops",
      needs: k.triple
        ? s.ffmpeg
          ? "ready"
          : "ffmpeg for 4K master export"
        : "VENICE + OPENAI + TINYFISH",
    },
  ];
}

export function formatCapabilityReport(): string {
  const k = keyStack();
  const s = systemDeps();
  const rows = cascadeWireStatus();
  return [
    "# Capability report — 3-key production stack",
    "",
    "## Keys",
    `- Venice: ${k.venice ? "SET" : "MISSING"}`,
    `- OpenAI: ${k.openai ? "SET" : "MISSING"}`,
    `- TinyFish: ${k.tinyfish ? "SET" : "MISSING"}`,
    `- Triple (all 3): ${k.triple ? "YES" : "NO"}`,
    "",
    "## System (not keys)",
    `- ffmpeg: ${s.ffmpeg ? "on PATH" : "INSTALL REQUIRED"}`,
    `- goose skills: ${s.goose ? "ready" : "run npm run activate"}`,
    "",
    "## Cascades (green when path exists with your keys)",
    ...rows.map((r) => `- **${r.id}**: ${r.status} via ${r.via} — needs: ${r.needs}`),
    "",
    k.triple && s.ffmpeg
      ? "ALL GREEN for link → ads / video / UGC / GTM fleet."
      : k.triple
        ? "Keys complete — install ffmpeg to clear remaining media partials."
        : "Set VENICE_API_KEY + OPENAI_API_KEY + TINYFISH_API_KEY in .env",
  ].join("\n");
}

export function blockersForFleet(): string[] {
  const out: string[] = [];
  const k = keyStack();
  if (!k.venice) out.push("VENICE_API_KEY");
  if (!k.openai) out.push("OPENAI_API_KEY");
  if (!k.tinyfish) out.push("TINYFISH_API_KEY");
  if (!hasFfmpeg()) out.push("ffmpeg (system install)");
  if (!gooseStackReady()) out.push("npm run activate");
  return out;
}
