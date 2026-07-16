import { brandVoice, type BrandKey } from "../brands.js";
import { xAlgorithmPromptBlock } from "../algorithm/x-signals.js";
import { listLearnings, newId, readPlaybook, saveDraft, type PostDraft } from "../store.js";
import { smartChat } from "../brain/smart.js";
import { learn } from "../brain/self-learn.js";

export async function generateDraft(opts: {
  brand: BrandKey;
  topic?: string;
  style?: string;
}): Promise<PostDraft> {
  const voice = brandVoice(opts.brand);
  const learnings = listLearnings().slice(0, 5);
  const playbook = readPlaybook().slice(0, 3000);
  const topic = opts.topic || "build in public — testnet milestone";

  const link = voice.waitlistUrl()
    ? `Product: ${voice.link()}\nWaitlist: ${voice.waitlistUrl()}`
    : `Link: ${voice.link()}`;

  const user = `${xAlgorithmPromptBlock()}

Write ONE X post (manual paste — no auto-post). JSON only.

Brand: ${voice.name}
Topic: ${topic}
Style hint: ${opts.style || "hook-first, concrete, no cringe"}

Voice pillars:
${voice.pillars.map((p) => `- ${p}`).join("\n")}

Avoid: ${voice.avoid.join(", ")}

Recent video learnings:
${learnings.map((l) => `- ${l.title}: hook=${l.analysis.hookPattern}`).join("\n") || "(none yet)"}

Playbook excerpt:
${playbook || "(empty)"}

Links:
${link}

Return JSON:
{
  "hook": "first line — max 100 chars",
  "body": "full post under 280 chars if possible",
  "thread": [],
  "hashtags": ["tag1"],
  "mediaNotes": "what screen recording / clip to attach",
  "utm": "x_postN suggestion"
}`;

  const res = await smartChat("draft", user, { projectId: opts.brand, feature: "draft" });
  const raw = res.content.replace(/```json|```/g, "").trim();
  if (!raw) throw new Error("Empty draft");
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
    hashtags: [...(parsed.hashtags ?? []), ...voice.tags].slice(0, 6),
    mediaNotes: parsed.mediaNotes,
    status: "draft",
    utm: parsed.utm || `x_post_${Date.now().toString(36)}`,
  };

  saveDraft(draft);
  learn({
    projectId: opts.brand,
    feature: "draft",
    outcome: "success",
    summary: `draft via ${res.provider}: ${draft.hook.slice(0, 80)}`,
    lessons: ["Drafts use Venice→OpenAI cascade + self-learn; max 2 hashtags on post"],
    meta: { attempted: res.attempted },
  });
  return draft;
}

export async function generateCalendar(brand: BrandKey, days: number): Promise<PostDraft[]> {
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
