import OpenAI from "openai";
import { requireEnv } from "../config.js";
import { brandVoice, brandLink, type BrandKey } from "../brands.js";
import { tasteSystemSuffix } from "../taste.js";
import { listLearnings, newId, readPlaybook, saveEngage, type EngageDraft } from "../store.js";
import type { TrendCategory } from "../discover/categories.js";
import type { RankedTrend } from "../discover/trending.js";

export type EngageType = "quote" | "reply" | "comment-thread";

export async function generateEngage(opts: {
  brand: BrandKey;
  type: EngageType;
  /** Trend or post you're replying under */
  context: {
    title: string;
    url?: string;
    snippet?: string;
    category?: TrendCategory;
    author?: string;
  };
  angle?: string;
}): Promise<EngageDraft> {
  const voice = brandVoice(opts.brand);
  const openai = new OpenAI({ apiKey: requireEnv("OPENAI_API_KEY") });
  const playbook = readPlaybook().slice(0, 2000);
  const learnings = listLearnings().slice(0, 4);

  const link = brandLink(opts.brand);

  const typeGuide =
    opts.type === "quote"
      ? "Quote-tweet: add a sharp take + subtle product tie-in. Max 240 chars for quote text."
      : opts.type === "reply"
        ? "Single reply under a viral post: witty, helpful, not spammy. Max 200 chars."
        : "3-reply thread under a trending post: value first, CTA last.";

  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.75,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You write high-engagement X quote-tweets and replies. Ride trends — no spam. JSON only." +
          tasteSystemSuffix(),
      },
      {
        role: "user",
        content: `${typeGuide}

Brand: ${voice.name}
Angle: ${opts.angle || "ride what's winning, tie to our product only if it fits"}
Target post title: ${opts.context.title}
URL: ${opts.context.url || "n/a"}
Snippet: ${opts.context.snippet || ""}
Category: ${opts.context.category || "general"}
Author: ${opts.context.author || "unknown"}

Our link (use sparingly): ${link}
Pillars: ${voice.pillars.join("; ")}
Avoid: ${voice.avoid.join(", ")}

Learnings hooks: ${learnings.map((l) => l.analysis.hookPattern).join(" | ")}
Playbook: ${playbook.slice(0, 800)}

Return JSON:
{
  "primary": "main quote text or reply",
  "alternates": ["variant 2", "variant 3"],
  "thread": ["only if comment-thread type"],
  "graphicHeadline": "short text for optional quote card image",
  "whyItWorks": "one line"
}`,
      },
    ],
  });

  const raw = res.choices[0]?.message?.content;
  if (!raw) throw new Error("Empty engage draft");
  const parsed = JSON.parse(raw) as {
    primary: string;
    alternates?: string[];
    thread?: string[];
    graphicHeadline?: string;
    whyItWorks?: string;
  };

  const draft: EngageDraft = {
    id: newId("engage"),
    brand: opts.brand,
    type: opts.type,
    createdAt: Date.now(),
    contextTitle: opts.context.title,
    contextUrl: opts.context.url,
    category: opts.context.category,
    primary: parsed.primary,
    alternates: parsed.alternates ?? [],
    thread: parsed.thread,
    graphicHeadline: parsed.graphicHeadline,
    whyItWorks: parsed.whyItWorks,
    status: "draft",
  };
  saveEngage(draft);
  return draft;
}

/** Batch: top trends → quote + reply drafts each. */
export async function generateEngageFromTrends(
  trends: RankedTrend[],
  brand: BrandKey,
  perTrend = 2,
): Promise<EngageDraft[]> {
  const out: EngageDraft[] = [];
  for (const t of trends.slice(0, perTrend)) {
    out.push(
      await generateEngage({
        brand,
        type: "quote",
        context: {
          title: t.title,
          url: t.url,
          snippet: t.snippet,
          category: t.category,
        },
      }),
    );
    out.push(
      await generateEngage({
        brand,
        type: "reply",
        context: {
          title: t.title,
          url: t.url,
          snippet: t.snippet,
          category: t.category,
        },
      }),
    );
  }
  return out;
}

export function formatEngageForCopy(d: EngageDraft): string {
  let text = `[${d.type.toUpperCase()}] under: ${d.contextTitle}\n`;
  if (d.contextUrl) text += `${d.contextUrl}\n\n`;
  text += d.primary;
  if (d.alternates.length) {
    text += "\n\n--- ALT ---\n" + d.alternates.map((a, i) => `${i + 1}. ${a}`).join("\n");
  }
  if (d.thread?.length) {
    text += "\n\n--- THREAD ---\n" + d.thread.map((t, i) => `${i + 1}. ${t}`).join("\n");
  }
  if (d.graphicHeadline) text += `\n\n--- QUOTE CARD ---\n${d.graphicHeadline}`;
  if (d.whyItWorks) text += `\n\n(${d.whyItWorks})`;
  return text;
}
