import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { XBOT_ROOT } from "../config.js";
import OpenAI from "openai";
import { requireEnv } from "../config.js";
import { getProject } from "../projects/registry.js";
import { tasteSystemSuffix } from "../taste.js";
import { newId, saveQA, type QAResponse } from "../store.js";
import { readPlaybook } from "../store.js";
import { xAlgorithmPromptBlock } from "../algorithm/x-signals.js";

function loadKnowledge(projectId: string): string {
  const p = join(XBOT_ROOT, "knowledge", `${projectId}.md`);
  return existsSync(p) ? readFileSync(p, "utf8") : "";
}

/** Q&A team — answer mentions, replies, DMs (you paste manually). */
export async function answerQuestion(opts: {
  project: string;
  question: string;
  context?: string;
  channel?: "reply" | "dm" | "quote" | "community";
}): Promise<QAResponse> {
  const project = getProject(opts.project);
  const openai = new OpenAI({ apiKey: requireEnv("OPENAI_API_KEY") });
  const knowledge = loadKnowledge(project.id);
  const playbook = readPlaybook().slice(0, 1500);

  const channelGuide =
    opts.channel === "dm"
      ? "DM: helpful, 2-4 sentences, link once at end"
      : opts.channel === "community"
        ? "Community post: technical, no link in first sentence"
        : "Public reply: under 280 chars, dry, factual";

  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.4,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are the Q&A lead for ${project.name}. Factual only. No slop.${tasteSystemSuffix()}\n${xAlgorithmPromptBlock()}`,
      },
      {
        role: "user",
        content: `${channelGuide}

Question: ${opts.question}
Extra context: ${opts.context || "none"}

Product knowledge:
${knowledge}

Playbook tone:
${playbook}

Return JSON:
{
  "primary": "main answer",
  "short": "under 200 chars for X reply",
  "alternates": ["variant 2"],
  "shouldLink": true/false,
  "link": "url or empty",
  "escalate": "when to say 'DM us' or skip"
}`,
      },
    ],
  });

  const raw = res.choices[0]?.message?.content;
  if (!raw) throw new Error("Empty QA response");
  const parsed = JSON.parse(raw) as {
    primary: string;
    short: string;
    alternates?: string[];
    shouldLink?: boolean;
    link?: string;
    escalate?: string;
  };

  const qa: QAResponse = {
    id: newId("qa"),
    projectId: project.id,
    question: opts.question,
    channel: opts.channel ?? "reply",
    primary: parsed.primary,
    short: parsed.short,
    alternates: parsed.alternates ?? [],
    shouldLink: parsed.shouldLink ?? false,
    link: parsed.link || project.primaryUrl,
    escalate: parsed.escalate,
    createdAt: Date.now(),
    status: "draft",
  };
  saveQA(qa);
  return qa;
}

export function formatQA(q: QAResponse): string {
  let t = `[${q.channel.toUpperCase()}] Q: ${q.question}\n\n${q.primary}\n\nShort: ${q.short}`;
  if (q.alternates.length) t += "\n\nAlt:\n" + q.alternates.map((a, i) => `${i + 1}. ${a}`).join("\n");
  if (q.shouldLink) t += `\n\nLink: ${q.link}`;
  if (q.escalate) t += `\n\nEscalate: ${q.escalate}`;
  return t;
}
