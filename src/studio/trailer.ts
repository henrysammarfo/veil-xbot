import OpenAI from "openai";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { requireEnv, DATA_DIR, assertDataDir } from "../config.js";
import { getProject } from "../projects/registry.js";
import { tasteSystemSuffix } from "../taste.js";
import { listLearnings, readPlaybook, newId } from "../store.js";
import { getPhase, type ContentPhase } from "./phases.js";
import { activeTier, hasPaidAvatar } from "./tiers.js";
import { queuePaidAvatar, queuePaidBroll } from "../integrations/paid-media.js";

export interface TrailerProduction {
  id: string;
  projectId: string;
  phase: ContentPhase;
  title: string;
  logline: string;
  acts: Array<{ name: string; durationSec: number; shots: string[]; dialogue?: string }>;
  ending: { type: "fade-black" | "coming-soon" | "logo-hold"; text: string; fadeSec: number };
  cast: { role: string; look: string; provider: string; dialogue?: string };
  music: string;
  referenceVibe: string;
  paidSlots: string[];
  createdAt: number;
}

/** Movie-style production brief — trailer / teaser / intro / launch. */
export async function produceTrailer(opts: {
  project: string;
  phase: ContentPhase;
  feature?: string;
}): Promise<TrailerProduction> {
  const project = getProject(opts.project);
  const phaseDef = getPhase(opts.phase);
  const learnings = listLearnings().slice(0, 6);
  const playbook = readPlaybook().slice(0, 2000);
  const tier = activeTier();
  const openai = new OpenAI({ apiKey: requireEnv("OPENAI_API_KEY") });

  const castNote = hasPaidAvatar()
    ? "PAID: HeyGen/Kling/FAL — office worker, 30s, casual, coffee spill hook allowed (Krea ad style)"
    : "FREE: No AI face — use hands + screen + VO text on screen. Describe shots that work without synthetic actor.";

  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.65,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `Film director + trailer editor for ${project.name}. 200M-view short-form sync: cuts on beat, motion matches music, smooth transitions. No generic crypto slop.${tasteSystemSuffix()}`,
      },
      {
        role: "user",
        content: `Phase: ${opts.phase} — ${phaseDef.label}
Feature: ${opts.feature || "general"}
Tier: ${tier}
${castNote}

Learnings from viral refs:
${learnings.map((l) => `${l.title}: ${l.analysis.editStyle} | ${l.analysis.hookPattern}`).join("\n")}

Playbook: ${playbook}

Return JSON:
{
  "title": "working title",
  "logline": "one sentence",
  "acts": [{"name":"Act 1","durationSec":8,"shots":["..."],"dialogue":"optional"}],
  "ending": {"type":"fade-black|coming-soon|logo-hold","text":"Coming soon","fadeSec":2.5},
  "cast": {"role":"...","look":"...","provider":"heygen|kling|screen-only"},
  "music": "genre bpm for Suno",
  "referenceVibe": "e.g. Krea office ad / Apple teaser / phonk TikTok"
}
3 acts minimum for trailer. Ending MUST fade nicely. Sync cuts to BPM.`,
      },
    ],
  });

  const parsed = JSON.parse(res.choices[0]?.message?.content ?? "{}") as Omit<
    TrailerProduction,
    "id" | "projectId" | "phase" | "createdAt" | "paidSlots"
  >;

  const paidSlots: string[] = [];
  if (hasPaidAvatar() && parsed.cast?.dialogue) {
    paidSlots.push(queuePaidAvatar(parsed.cast.dialogue, parsed.cast.look).id);
  }
  if (tier === "paid" && opts.phase === "trailer") {
    paidSlots.push(queuePaidBroll(parsed.logline || project.tagline).id);
  }

  const prod: TrailerProduction = {
    id: newId("trailer"),
    projectId: project.id,
    phase: opts.phase,
    createdAt: Date.now(),
    paidSlots,
    title: parsed.title || `${project.name} ${opts.phase}`,
    logline: parsed.logline || project.tagline,
    acts: parsed.acts ?? [],
    ending: parsed.ending ?? { type: "coming-soon", text: "Coming soon", fadeSec: 2.5 },
    cast: parsed.cast ?? { role: "founder POV", look: "screen only", provider: "screen-only" },
    music: parsed.music ?? "cinematic swell 90bpm",
    referenceVibe: parsed.referenceVibe ?? "teaser",
  };

  assertDataDir();
  const dir = join(DATA_DIR, "studio");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${prod.id}.json`), JSON.stringify(prod, null, 2));
  writeFileSync(join(dir, "latest-trailer.json"), JSON.stringify(prod, null, 2));
  return prod;
}

export function formatTrailer(p: TrailerProduction): string {
  const lines = [
    `# ${p.phase.toUpperCase()} — ${p.title}`,
    p.logline,
    `Vibe: ${p.referenceVibe} · Music: ${p.music}`,
    `Cast: ${p.cast.role} (${p.cast.provider}) — ${p.cast.look}`,
    "",
  ];
  for (const a of p.acts) {
    lines.push(`## ${a.name} (${a.durationSec}s)`);
    if (a.dialogue) lines.push(`Dialogue: "${a.dialogue}"`);
    for (const s of a.shots) lines.push(`- ${s}`);
    lines.push("");
  }
  lines.push(`## Ending — ${p.ending.type}`);
  lines.push(`"${p.ending.text}" · fade ${p.ending.fadeSec}s`);
  if (p.paidSlots.length) lines.push(`\nPaid jobs queued: ${p.paidSlots.join(", ")}`);
  return lines.join("\n");
}
