import { resolveVideoSource } from "./source.js";
import { analyzeVideoWithAI, stubAnalysis } from "./analyze.js";
import { hasOpenAI } from "../config.js";
import { hasTinyfish, tinyfishFetchText } from "../research/tinyfish.js";
import { listLearnings, newId, saveLearning, savePlaybook, type VideoLearning } from "../store.js";

export async function watchVideo(url: string, notes?: string): Promise<VideoLearning> {
  let source = await resolveVideoSource(url, notes);

  if (
    !notes &&
    source.transcript.length < 80 &&
    (source.platform === "tiktok" || source.platform === "x") &&
    hasTinyfish()
  ) {
    try {
      const fetched = await tinyfishFetchText(url);
      if (fetched.length > 80) {
        source = { ...source, transcript: fetched };
      }
    } catch {
      /* fall back to manual --notes */
    }
  }

  const analysis = hasOpenAI() ? await analyzeVideoWithAI(source) : stubAnalysis(source);

  const learning: VideoLearning = {
    id: source.id,
    url: source.url,
    platform: source.platform,
    title: source.title,
    channel: source.channel,
    analyzedAt: Date.now(),
    transcriptSnippet: source.transcript.slice(0, 500),
    analysis,
  };

  saveLearning(learning);
  return learning;
}

export function buildPlaybook(): string {
  const items = listLearnings();
  const lines = [
    "# X Bot — Master Playbook",
    "",
    `_Generated ${new Date().toISOString()}. ${items.length} videos analyzed._`,
    "",
    "## Rules (manual post only)",
    "- Bot drafts; you paste on X",
    "- Always UTM: `?src=x_postN`",
    "- Reply to 3 threads within 30 min of posting",
    "",
  ];

  const patterns = new Map<string, number>();
  for (const v of items) {
    for (const p of v.analysis.stealablePatterns) {
      patterns.set(p, (patterns.get(p) ?? 0) + 1);
    }
  }

  lines.push("## Top stealable patterns");
  for (const [p, n] of [...patterns.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
    lines.push(`- (${n}×) ${p}`);
  }
  lines.push("", "## Per-video notes", "");

  for (const v of items.slice(0, 30)) {
    lines.push(`### ${v.title}`);
    lines.push(`- URL: ${v.url}`);
    lines.push(`- Hook: ${v.analysis.hookPattern}`);
    lines.push(`- Pacing: ${v.analysis.pacing}`);
    lines.push(`- Music mood: ${v.analysis.musicMood}`);
    if (v.analysis.suggestedSunoPrompt) {
      lines.push(`- Suno: ${v.analysis.suggestedSunoPrompt}`);
    }
  }

  const md = lines.join("\n");
  savePlaybook(md);
  return md;
}

export async function watchMany(urls: string[]): Promise<VideoLearning[]> {
  const out: VideoLearning[] = [];
  for (const url of urls) {
    out.push(await watchVideo(url.trim()));
  }
  buildPlaybook();
  return out;
}
