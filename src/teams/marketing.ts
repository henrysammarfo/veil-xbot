import OpenAI from "openai";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { requireEnv, DATA_DIR, assertDataDir } from "../config.js";
import { getProject } from "../projects/registry.js";
import { tasteSystemSuffix } from "../taste.js";
import { newId } from "../store.js";

export interface CampaignBrief {
  id: string;
  projectId: string;
  name: string;
  positioning: string;
  keyMessages: string[];
  contentPillars: string[];
  weeklyThemes: string[];
  antiSlop: string[];
  createdAt: number;
}

/** Marketing team — positioning, pillars, weekly themes. */
export async function buildCampaign(projectId: string, goal?: string): Promise<CampaignBrief> {
  const project = getProject(projectId);
  const openai = new OpenAI({ apiKey: requireEnv("OPENAI_API_KEY") });

  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.5,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `Marketing lead for ${project.name}. GTM-ready, no agency slop.${tasteSystemSuffix()}`,
      },
      {
        role: "user",
        content: `Tagline: ${project.tagline}
Pillars: ${project.pillars.join("; ")}
Goal: ${goal || "awareness + waitlist on testnet proof"}

Return JSON: name, positioning (2 sentences), keyMessages[], contentPillars[], weeklyThemes[7], antiSlop[]`,
      },
    ],
  });

  const parsed = JSON.parse(res.choices[0]?.message?.content ?? "{}") as Omit<
    CampaignBrief,
    "id" | "projectId" | "createdAt"
  >;

  const brief: CampaignBrief = {
    id: newId("campaign"),
    projectId,
    createdAt: Date.now(),
    name: parsed.name || `${project.name} launch`,
    positioning: parsed.positioning,
    keyMessages: parsed.keyMessages ?? [],
    contentPillars: parsed.contentPillars ?? [],
    weeklyThemes: parsed.weeklyThemes ?? [],
    antiSlop: parsed.antiSlop ?? [],
  };

  assertDataDir();
  const dir = join(DATA_DIR, "marketing");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${brief.id}.json`), JSON.stringify(brief, null, 2));
  writeFileSync(join(dir, "latest-campaign.json"), JSON.stringify(brief, null, 2));
  return brief;
}

export function formatCampaign(c: CampaignBrief): string {
  return [
    `# Campaign — ${c.name}`,
    c.positioning,
    "",
    "## Key messages",
    ...c.keyMessages.map((m) => `- ${m}`),
    "",
    "## Content pillars",
    ...c.contentPillars.map((p) => `- ${p}`),
    "",
    "## Weekly themes",
    ...c.weeklyThemes.map((t, i) => `Day ${i + 1}: ${t}`),
    "",
    "## Anti-slop",
    ...c.antiSlop.map((a) => `- ${a}`),
  ].join("\n");
}
