import OpenAI from "openai";
import { requireEnv } from "../config.js";
import { brandVoice, brandLink, VEIL_VOICE, type BrandKey } from "../brands.js";
import { xAlgorithmPromptBlock } from "../algorithm/x-signals.js";
import { tasteSystemSuffix } from "../taste.js";
import { listLearnings, newId, readPlaybook, saveDraft, type PostDraft } from "../store.js";

export async function generateDraft(opts: {
  brand: BrandKey;
  topic?: string;
  style?: string;
}): Promise<PostDraft> {
  const voice = brandVoice(opts.brand);
  const openai = new OpenAI({ apiKey: requireEnv("OPENAI_API_KEY") });
  const learnings = listLearnings().slice(0, 5);
  const playbook = readPlaybook().slice(0, 3000);
  const topic = opts.topic || "build in public — testnet milestone";

  const link =
    opts.brand === "veil"
      ? `Demo: ${brandLink("veil")}${VEIL_VOICE.waitlistUrl() !== "[WAITLIST_URL]" ? `\nWaitlist: ${VEIL_VOICE.waitlistUrl()}` : ""}`
      : `Repo: ${brandLink("magmos")}`;

  const user = `Write ONE X post (manual paste — no auto-post).

Brand: ${voice.name}
Topic: ${topic}
Style hint: ${opts.style || "hook-first, concrete, no cringe"}

Voice pillars:
${voice.pillars.map((p) => `- ${p}`).join("\n")}

Avoid: ${voice.avoid.join(", ")}

Recent video learnings:
${learnings.map((l) => `- ${l.title}: hook=${l.analysis.hookPattern}`).join("\n") || "(none yet — run xbot watch)"}

Playbook excerpt:
${playbook || "(empty)"}

Links to weave in:
${link}

Return JSON:
{
  "hook": "first line only — max 100 chars",
  "body": "full post under 280 chars if possible, else thread-style single block",
  "thread": ["optional reply 1", "reply 2"] or [],
  "hashtags": ["tag1"],
  "mediaNotes": "what screen recording / clip to attach",
  "utm": "x_postN suggestion"
}`;

  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.7,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You write viral build-in-public X posts. Output JSON only. Follow taste.md strictly.${tasteSystemSuffix()}\n\n${xAlgorithmPromptBlock()}`,
      },
      { role: "user", content: user },
    ],
  });

  const raw = res.choices[0]?.message?.content;
  if (!raw) throw new Error("Empty draft from OpenAI");
  const parsed = JSON.parse(raw) as {
    hook: string;
    body: string;
    thread?: string[];
    hashtags: string[];
    mediaNotes: string;
    utm: string;
  };

  const draft: PostDraft = {
    id: newId("draft"),
    brand: opts.brand,
    createdAt: Date.now(),
    topic,
    hook: parsed.hook,
    body: parsed.body,
    thread: parsed.thread,
    hashtags: [...parsed.hashtags, ...voice.tags].slice(0, 6),
    mediaNotes: parsed.mediaNotes,
    status: "draft",
    utm: parsed.utm || `x_post_${Date.now().toString(36)}`,
  };

  saveDraft(draft);
  return draft;
}

export async function generateCalendar(
  brand: BrandKey,
  days: number,
): Promise<PostDraft[]> {
  const topics = [
    "stealth execution problem",
    "real testnet loss/win receipt",
    "TEE attestation proof",
    "waitlist CTA",
    "competitor contrast (public order flow)",
    "demo video clip",
    "judge-friendly 2-min path",
  ];
  const drafts: PostDraft[] = [];
  for (let i = 0; i < days; i++) {
    drafts.push(
      await generateDraft({
        brand,
        topic: topics[i % topics.length],
        style: i === 0 ? "strong hook — target 500+ impressions" : "value thread",
      }),
    );
  }
  return drafts;
}

export function formatDraftForCopy(d: PostDraft): string {
  const tags = d.hashtags.join(" ");
  let text = `${d.hook}\n\n${d.body}\n\n${tags}`;
  if (d.thread?.length) {
    text += "\n\n--- THREAD REPLIES ---\n" + d.thread.map((t, i) => `${i + 1}. ${t}`).join("\n");
  }
  text += `\n\n--- MEDIA ---\n${d.mediaNotes}`;
  text += `\n\nUTM: ?src=${d.utm}`;
  return text;
}
