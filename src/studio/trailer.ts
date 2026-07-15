import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { env, DATA_DIR, assertDataDir } from "../config.js";
import { getProject } from "../projects/registry.js";
import { listLearnings, readPlaybook, newId } from "../store.js";
import { getPhase, type ContentPhase } from "./phases.js";
import { activeTier, hasPaidAvatar } from "./tiers.js";
import {
  queuePaidAvatar,
  queuePaidBroll,
  runPaidHeyGen,
  queueHyperframesTrailer,
} from "../integrations/paid-media.js";
import { chatCompletion, llmStatus } from "../ai/router.js";
import { hasHeyGen } from "../integrations/heygen.js";

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

  const castNote = hasPaidAvatar()
    ? "PAID: HeyGen/Kling/FAL — office worker, 30s, casual, coffee spill hook allowed (Krea ad style)"
    : "FREE: No AI face — use hands + screen + VO text on screen. Describe shots that work without synthetic actor.";

  const llm = await chatCompletion(
    "trailer",
    `Phase: ${opts.phase} — ${phaseDef.label}
Feature: ${opts.feature || "general"}
Tier: ${tier}
${castNote}

Learnings from viral refs:
${learnings.map((l) => `${l.title}: ${l.analysis.editStyle} | ${l.analysis.hookPattern}`).join("\n")}

Playbook: ${playbook}

Return JSON per schema in system prompt. 3+ acts. First 3s = outcome only (no logo).`,
    { context: project.name },
  );

  const parsed = JSON.parse(llm.content) as Omit<
    TrailerProduction,
    "id" | "projectId" | "phase" | "createdAt" | "paidSlots"
  > & { hookOutcome?: string };

  const paidSlots: string[] = [];
  if (hasPaidAvatar() && parsed.cast?.dialogue) {
    const avatarJob = queuePaidAvatar(parsed.cast.dialogue, parsed.cast.look);
    paidSlots.push(avatarJob.id);
    if (env("HEYGEN_AUTO") === "1" && hasHeyGen()) {
      const run = await runPaidHeyGen(avatarJob.prompt, avatarJob.id);
      if (run.outputPath) paidSlots.push(`heygen-mp4:${run.outputPath}`);
    }
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
    logline: parsed.hookOutcome || parsed.logline || project.tagline,
    acts: parsed.acts ?? [],
    ending: parsed.ending ?? { type: "coming-soon", text: "Coming soon", fadeSec: 2.5 },
    cast: parsed.cast ?? { role: "founder POV", look: "screen only", provider: "screen-only" },
    music: parsed.music ?? "cinematic swell 90bpm",
    referenceVibe: parsed.referenceVibe ?? "teaser",
  };

  if (env("HYPERFRAMES_AUTO") === "1" || opts.phase === "teaser") {
    paidSlots.push(queueHyperframesTrailer(prod).id);
  }

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
    `**First 3s on screen:** ${p.logline}`,
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
  lines.push("", llmStatus());
  return lines.join("\n");
}
