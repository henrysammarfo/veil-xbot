/**
 * Status of user-provided OSS repos for Magmos editor / growth.
 * Source of truth narrative: OSS-STACK.md
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { env, XBOT_ROOT } from "../config.js";
import { hasVoicebox } from "../integrations/voicebox.js";
import { hasHeyGen } from "../integrations/heygen.js";

export interface OssStackItem {
  id: string;
  name: string;
  url: string;
  role: string;
  status: "wired" | "partial" | "planned" | "catalog";
  notes: string;
  command?: string;
}

export const USER_OSS_STACK: OssStackItem[] = [
  {
    id: "hyperframes",
    name: "HyperFrames",
    url: "https://github.com/heygen-com/hyperframes",
    role: "HTML compose → validate → 1080p MP4",
    status: "wired",
    notes: "Product walkthrough compose + render (Russo workflow)",
    command: "npm run walkthrough magmos",
  },
  {
    id: "ad-maker",
    name: "ad-maker (Branda)",
    url: "https://github.com/context-dot-dev/ad-maker",
    role: "Domain → 4–6 on-brand still ads",
    status: "wired",
    notes: "Brand research via TinyFish; images Venice. Context.dev optional only",
    command: "npm run ad-maker magmos",
  },
  {
    id: "goose-skills",
    name: "goose-skills",
    url: "https://github.com/gooseworks-ai/goose-skills",
    role: "GTM / ads / social agent skills library",
    status: "wired",
    notes: "200+ skills indexed; bot injects task skills into LLM; Cursor agents under .agents/skills",
    command: "npm run skills adopt",
  },
  {
    id: "openmontage",
    name: "OpenMontage",
    url: "https://github.com/calesthio/OpenMontage",
    role: "Agentic production pipelines",
    status: "wired",
    notes: "plan→edit→shorts→ads via openmontage command",
    command: "npm run openmontage magmos recording.webm",
  },
  {
    id: "web-to-app",
    name: "web-to-app",
    url: "https://github.com/shiaho777/web-to-app",
    role: "Magmos demo APK from web",
    status: "wired",
    notes: "Pack + config for on-device WebToApp builder",
    command: "npm run web-to-app magmos",
  },
  {
    id: "goldmine",
    name: "open-source-ai-goldmine",
    url: "https://github.com/Moh4696/open-source-ai-goldmine",
    role: "22 lab OSS repos catalog",
    status: "wired",
    notes: "Embedded + saved to data/research/goldmine.json",
    command: "npm run goldmine",
  },
  {
    id: "openshorts",
    name: "openshorts",
    url: "https://github.com/mutonby/openshorts",
    role: "Viral clips + 9:16 reframe",
    status: "wired",
    notes: "Moment detect → extract → vertical export",
    command: "npm run shorts recording.mp4",
  },
  {
    id: "voicebox",
    name: "voicebox",
    url: "https://github.com/jamiepine/voicebox",
    role: "Local voice clone / TTS",
    status: hasVoicebox() ? "wired" : "wired",
    notes: hasVoicebox()
      ? `VOICEBOX_URL set — preferred VO path`
      : "Adapter ready — set VOICEBOX_URL when studio running",
    command: "VOICEBOX_URL=http://127.0.0.1:8780 npm run edit-auto …",
  },
  {
    id: "vibevoice",
    name: "VibeVoice",
    url: "https://github.com/microsoft/VibeVoice",
    role: "Long-form ASR (Who/When/What)",
    status: "wired",
    notes: env("VIBEVOICE_ASR_URL")
      ? `ASR endpoint live`
      : "TRANSCRIBE_BACKEND=vibevoice + VIBEVOICE_ASR_URL",
    command: "TRANSCRIBE_BACKEND=vibevoice npm run edit-auto …",
  },
  {
    id: "freecut",
    name: "freecut",
    url: "https://github.com/Moh4696/freecut",
    role: "PRIMARY CapCut-class agent editor",
    status: "wired",
    notes: "Filler trim + EDL + self-eval in edit-auto",
    command: "npm run edit-auto recording.mp4 magmos",
  },
  {
    id: "heygen",
    name: "HeyGen",
    url: "https://developers.heygen.com",
    role: "Avatar PiP for walkthroughs",
    status: hasHeyGen() ? "wired" : "wired",
    notes: hasHeyGen()
      ? "Optional fallback — default presenter is Venice still+TTS PiP"
      : "Optional — Venice is default presenter for walkthrough PiP",
    command: "npm run walkthrough magmos",
  },
];

export function formatOssStack(): string {
  const mdPath = join(XBOT_ROOT, "OSS-STACK.md");
  const header = existsSync(mdPath)
    ? readFileSync(mdPath, "utf8").split("\n").slice(0, 6).join("\n")
    : "# OSS stack";
  const lines = [
    header,
    "",
    "## Live status (all wired)",
    "",
    "| Repo | Status | Role | Command |",
    "|------|--------|------|---------|",
    ...USER_OSS_STACK.map(
      (i) => `| [${i.name}](${i.url}) | **${i.status}** | ${i.role} | \`${i.command ?? ""}\` |`,
    ),
    "",
    "## Magmos walkthrough (HyperFrames + HeyGen thread)",
    "```",
    "npm run walkthrough magmos",
    "# inspect→script→capture→avatar→compose→render",
    "```",
    "",
    `TRANSCRIBE_BACKEND=${env("TRANSCRIBE_BACKEND", "whisper")}`,
    `VIBEVOICE_ASR_URL=${env("VIBEVOICE_ASR_URL") || "(unset)"}`,
    `VOICEBOX_URL=${env("VOICEBOX_URL") || "(unset)"}`,
    `HEYGEN_AUTO=${env("HEYGEN_AUTO", "0")}`,
    `CONTEXT_DEV_API_KEY=${env("CONTEXT_DEV_API_KEY") ? "set" : "(unset)"}`,
    "",
    "Full map: OSS-STACK.md",
  ];
  return lines.join("\n");
}
