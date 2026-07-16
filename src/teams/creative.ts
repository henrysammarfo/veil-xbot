import { getProject } from "../projects/registry.js";
import { newId, saveCreative, type CreativeBrief } from "../store.js";
import { listLearnings, readPlaybook } from "../store.js";
import { discoverClips } from "../discover/clips.js";
import { hasTinyfish } from "../research/tinyfish.js";
import { smartChat } from "../brain/smart.js";
import { learn } from "../brain/self-learn.js";

export type CreativeKind = "ugc" | "clip" | "avatar" | "teaser";

/**
 * Creative team — realistic UGC/clip briefs.
 * NO fake AI influencers. Screen POV, founder desk, real app.
 */
export async function generateCreative(opts: {
  project: string;
  kind: CreativeKind;
  topic?: string;
}): Promise<CreativeBrief> {
  const project = getProject(opts.project);
  const learnings = listLearnings().slice(0, 4);
  const playbook = readPlaybook().slice(0, 1200);

  const kindGuide: Record<CreativeKind, string> = {
    ugc: `Realistic UGC: ${project.ugcAngle}. Shot list for phone recording. NO AI-generated human face as "user". POV screen > talking head. Magmos UI is a WEB forge dashboard — never invent physical gadgets/speakers.`,
    clip: "42s vertical clip structure: hook 0-1.5s, demo, proof, CTA. Cuts + SFX beats.",
    avatar:
      "AVATAR POLICY: Do NOT use watermarked HeyGen/Kling faces. Options: (1) no face — screen only (2) real founder clip (3) text-on-screen hook.",
    teaser: "12s teaser for community: one hook line on screen, fastest cut.",
  };

  const user = `${kindGuide[opts.kind]}
Topic: ${opts.topic || "product proof on testnet"}
Product URL: ${project.primaryUrl}
Tagline: ${project.tagline}

Learnings: ${learnings.map((l) => l.analysis.hookPattern).join(" | ")}
Playbook: ${playbook}

Return JSON:
{
  "concept": "one line",
  "shotList": ["shot 1 with duration", "shot 2"],
  "hookOnScreen": "max 8 words",
  "voiceover": "optional script or empty",
  "sfxBeats": ["0.0s impact", "2.0s whoosh"],
  "musicMood": "genre bpm",
  "doNot": ["avoid these slop tropes"],
  "brollSearch": "pexels search terms",
  "realisticCheck": "why this does not look like AI slop"
}`;

  const res = await smartChat("creative", user, {
    projectId: opts.project,
    feature: "global",
  });
  const raw = res.content.replace(/```json|```/g, "").trim();
  if (!raw) throw new Error("Empty creative brief");
  const parsed = JSON.parse(raw) as Omit<
    CreativeBrief,
    "id" | "projectId" | "kind" | "createdAt" | "clipUrls"
  >;

  let clipUrls: string[] = [];
  if (hasTinyfish() && opts.kind !== "avatar") {
    const clips = await discoverClips({
      niche: parsed.brollSearch || "dark technology screen vertical",
      limit: 5,
    });
    clipUrls = clips.map((c) => c.url);
  }

  const brief: CreativeBrief = {
    id: newId("creative"),
    projectId: project.id,
    kind: opts.kind,
    createdAt: Date.now(),
    clipUrls,
    ...parsed,
  };
  saveCreative(brief);
  learn({
    projectId: opts.project,
    feature: "global",
    outcome: "success",
    summary: `creative ${opts.kind} via ${res.provider}`,
    lessons: [
      opts.kind === "ugc"
        ? "UGC = real Magmos web UI on phone — never invent hardware products"
        : `${opts.kind} brief from cascaded LLM`,
    ],
    meta: { attempted: res.attempted },
  });
  return brief;
}

export function formatCreative(b: CreativeBrief): string {
  const lines = [
    `# ${b.kind.toUpperCase()} — ${b.projectId}`,
    `Concept: ${b.concept}`,
    `Hook on screen: ${b.hookOnScreen}`,
    "",
    "## Shots",
    ...b.shotList.map((s) => `- ${s}`),
    "",
    "## SFX",
    ...b.sfxBeats.map((s) => `- ${s}`),
    `Music: ${b.musicMood}`,
  ];
  if (b.voiceover) lines.push("", `Voiceover: ${b.voiceover}`);
  if (b.doNot?.length) lines.push("", "## Do NOT", ...b.doNot.map((d) => `- ${d}`));
  lines.push("", `Realistic check: ${b.realisticCheck}`);
  if (b.clipUrls.length) {
    lines.push("", "## B-roll URLs (bot found)", ...b.clipUrls.map((u) => `- ${u}`));
  }
  return lines.join("\n");
}
