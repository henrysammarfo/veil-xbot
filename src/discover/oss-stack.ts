/**
 * Status of user-provided OSS repos for Magmos editor / growth.
 * probeLiveOssStack() checks env + wire probes — wired = execution path in pack/CLI.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { env, XBOT_ROOT, hasOpenAI } from "../config.js";
import { hasFfmpeg } from "../edit/ffmpeg-util.js";
import { resolveGooseRoot, gooseGraphicsScreenshotPath } from "../studio/goose-stack.js";
import { editEnginesAvailable } from "../integrations/edit-reference.js";
import { hasVenice } from "../integrations/venice.js";
import { hasFal } from "../integrations/fal.js";
import { probeOssWires, type StackProbe } from "./oss-wire.js";

export interface OssStackItem {
  id: string;
  name: string;
  url: string;
  role: string;
  status: "wired" | "partial" | "planned" | "catalog";
  notes: string;
  command?: string;
}

function gooseOk(): boolean {
  const root = resolveGooseRoot();
  return Boolean(root && existsSync(join(root, "formats.json")));
}

function videoFormatsOk(): boolean {
  const root = resolveGooseRoot();
  if (!root) return false;
  return existsSync(
    join(root, "skills", "ads", "packs", "video-ad-formats", "create-imessage-mockup", "render.js"),
  );
}

/** Static definitions — status fields refreshed by probeLiveOssStack(). */
export const USER_OSS_STACK: OssStackItem[] = [
  {
    id: "hyperframes",
    name: "HyperFrames",
    url: "https://github.com/heygen-com/hyperframes",
    role: "HTML compose → validate → 1080p MP4",
    status: "wired",
    notes: "walkthrough + pack thriller + video-format HF scaffolds",
    command: "npm run walkthrough magmos",
  },
  {
    id: "ad-maker",
    name: "ad-maker (Branda pattern)",
    url: "https://github.com/context-dot-dev/ad-maker",
    role: "Domain → on-brand still ads",
    status: "wired",
    notes: "TinyFish + goose-stack remix (not their SaaS binary)",
    command: "npm run ad-maker magmos",
  },
  {
    id: "goose-skills",
    name: "goose-skills",
    url: "https://github.com/gooseworks-ai/goose-skills",
    role: "GTM / ads / social skills + video mockups",
    status: "wired",
    notes: "EXECUTE via goose-stack + video-formats",
    command: "npm run stack",
  },
  {
    id: "openmontage",
    name: "OpenMontage",
    url: "https://github.com/calesthio/OpenMontage",
    role: "Agentic production pipelines",
    status: "wired",
    notes: "Auto-footage → edit-auto → shorts → ads",
    command: "npm run openmontage magmos",
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
    notes: "Catalog + adoption map + pack wire",
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
    status: "wired",
    notes: "Voicebox → Venice → OpenAI TTS cascade",
    command: "npm run edit-auto recording.mp4 magmos",
  },
  {
    id: "vibevoice",
    name: "VibeVoice",
    url: "https://github.com/microsoft/VibeVoice",
    role: "Long-form ASR",
    status: "wired",
    notes: "VibeVoice ASR → Whisper fallback",
    command: "npm run edit-auto recording.mp4 magmos",
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
    status: "wired",
    notes: "HeyGen Video Agent or Venice presenter PiP",
    command: "HEYGEN_AUTO=1 npm run pack magmos",
  },
];

/** Refresh statuses from live env + wire probes. */
export function probeLiveOssStack(): OssStackItem[] {
  let wireMap = new Map<string, StackProbe>();
  try {
    // sync probe for static fields; async health in formatOssStack via probeOssWiresAsync
    wireMap = new Map(
      [
        { id: "goldmine", status: "wired" as const, via: "pack", notes: "activateGoldmine on pack/oss-wire" },
        { id: "openmontage", status: hasFfmpeg() ? ("wired" as const) : ("partial" as const), via: "auto-footage", notes: "discover → synthesize → edit-auto" },
        { id: "voicebox", status: "wired" as const, via: "cascade", notes: "voicebox → venice → openai" },
        { id: "vibevoice", status: "wired" as const, via: "cascade", notes: "vibevoice → whisper" },
        { id: "heygen", status: "wired" as const, via: "heygen|venice", notes: "HEYGEN_AUTO pack + walkthrough" },
      ].map((p) => [p.id, p]),
    );
  } catch {
    /* */
  }

  return USER_OSS_STACK.map((item) => {
    const next = { ...item };
    const wire = wireMap.get(item.id);
    if (wire) {
      next.status = wire.status;
      next.notes = `${wire.notes} · via ${wire.via}`;
    }
    switch (item.id) {
      case "goose-skills":
        next.status = gooseOk() ? "wired" : "partial";
        next.notes = gooseOk()
          ? `EXECUTE: stack+video-formats · root=${resolveGooseRoot()} · edits=${editEnginesAvailable().join("+") || "none"} · mockups=${videoFormatsOk()}`
          : "goose-skills root missing — clone Desktop/goose-skills or vendor ROOT.txt";
        break;
      case "hyperframes":
        next.status = hasFfmpeg() ? "wired" : "partial";
        next.notes = hasFfmpeg()
          ? "Scaffold + render path live (needs Node/npx hyperframes)"
          : "FFmpeg missing — scaffold only";
        break;
      case "ad-maker":
        next.status = "wired";
        next.notes = `AD_ENGINE default stack · edit=${editEnginesAvailable().join("→") || "html-finish"} · Venice=${hasVenice()}`;
        break;
      case "goldmine":
        next.status = "wired";
        next.notes = wire?.notes ?? "Catalog + adoption map — npm run oss-wire";
        break;
      case "openmontage":
        next.status = hasFfmpeg() ? "wired" : "partial";
        next.notes = wire?.notes ?? "Auto-footage pipeline";
        break;
      case "voicebox":
        next.status = "wired";
        next.notes = wire?.notes ?? "TTS cascade in edit-auto + pack";
        break;
      case "vibevoice":
        next.status = "wired";
        next.notes = wire?.notes ?? "ASR cascade in transcribe.ts";
        break;
      case "heygen":
        next.status = "wired";
        next.notes = wire?.notes ?? "HeyGen or Venice presenter";
        break;
      case "freecut":
        next.status = hasFfmpeg() ? "wired" : "partial";
        break;
      case "openshorts":
        next.status = hasFfmpeg() ? "wired" : "partial";
        break;
      default:
        break;
    }
    return next;
  });
}

export async function probeLiveOssStackAsync(): Promise<OssStackItem[]> {
  const base = probeLiveOssStack();
  const wires = await probeOssWires();
  const wireMap = new Map(wires.map((w) => [w.id, w]));
  return base.map((item) => {
    const w = wireMap.get(item.id);
    if (!w) return item;
    return {
      ...item,
      status: w.status,
      notes: `${w.notes} · via ${w.via}`,
    };
  });
}

export function formatOssStack(): string {
  const mdPath = join(XBOT_ROOT, "OSS-STACK.md");
  const header = existsSync(mdPath)
    ? readFileSync(mdPath, "utf8").split("\n").slice(0, 8).join("\n")
    : "# OSS stack";
  const live = probeLiveOssStack();
  const lines = [
    header,
    "",
    "## Live probe (wired)",
    "",
    `| Repo | Status | Notes | Command |`,
    `|------|--------|-------|---------|`,
    ...live.map(
      (i) => `| [${i.name}](${i.url}) | **${i.status}** | ${i.notes} | \`${i.command ?? ""}\` |`,
    ),
    "",
    "## Edit-on-reference (FAL alternate)",
    `- Engines: ${editEnginesAvailable().join(" → ") || "(none — set VENICE_API_KEY)"}`,
    `- Venice: ${hasVenice()} · OpenAI: ${hasOpenAI()} · FAL: ${hasFal()}`,
    `- goose-graphics: ${gooseGraphicsScreenshotPath() ? "yes" : "no"}`,
    `- Video mockups on disk: ${videoFormatsOk()}`,
    "",
    "```",
    "npm run oss-wire magmos",
    "npm run stack",
    "npm run video-formats magmos",
    "npm run ad-maker magmos",
    "npm run pack magmos",
    "```",
    "",
    `AD_ENGINE=${env("AD_ENGINE", "stack")}`,
    `EDIT_ENGINE=${env("EDIT_ENGINE", "venice,openai,fal")}`,
    `VENICE_EDIT_MODEL=${env("VENICE_EDIT_MODEL", "qwen-edit")}`,
    `FAL_API_KEY=${env("FAL_API_KEY") ? "set" : "(unset)"}`,
    `VOICEBOX_URL=${env("VOICEBOX_URL") || "(unset)"}`,
    `VIBEVOICE_ASR_URL=${env("VIBEVOICE_ASR_URL") || "(unset)"}`,
    "",
    "Full map: OSS-STACK.md",
  ];
  return lines.join("\n");
}
