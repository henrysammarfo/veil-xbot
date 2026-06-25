/**
 * Operational rules distilled from xai-org/x-algorithm (open source, May 2026).
 * We don't run the 3GB Phoenix model locally — we optimize content for the signals it ranks.
 * @see https://github.com/xai-org/x-algorithm
 */

export const X_ALGORITHM_POSITIVE = [
  "P(reply) — controversial receipts, questions skeptics will answer",
  "P(quote) — one quotable line in first 140 chars",
  "P(repost) — shareable proof (loss %, tx, screen)",
  "P(video_view) — video post, hook in 0–1.5s silent",
  "P(dwell) — cut every 2–3s, no dead air",
  "P(photo_expand) — quote card image attached",
  "P(profile_click) — strong bio + pinned reply after post",
  "P(follow_author) — thread worth following for part 2",
  "P(click) — link in reply not main post",
] as const;

export const X_ALGORITHM_NEGATIVE = [
  "P(not_interested) — generic AI slop, feature lists",
  "P(block_author) — spam tags, begging for RT",
  "P(mute_author) — posting 10x/day low quality",
  "P(report) — misleading yield/guaranteed profit",
] as const;

export function xAlgorithmPromptBlock(): string {
  return `
X FOR YOU ALGORITHM (open source xai-org/x-algorithm — optimize for these predictions):
BOOST: ${X_ALGORITHM_POSITIVE.join("; ")}
PENALIZE (avoid triggers): ${X_ALGORITHM_NEGATIVE.join("; ")}
Media detection hydrator runs on posts — VIDEO > image > text.
Quote post expansion is indexed — make quote-tweet text standalone valuable.
Final score = weighted sum of engagement probabilities — optimize REPLY + QUOTE + VIDEO_VIEW + DWELL together.
`.trim();
}

export function firstPostAlgorithmChecklist(): string[] {
  return [
    "Video post (video_view hydrator)",
    "Hook causes P(reply) — loss, controversy, or verify-this",
    "One P(quote) line under 100 chars",
    "Cuts every 2–3s for P(dwell)",
    "Link in reply for P(click) without spam penalty",
    "No negative signals: no hashtag soup, no tag spam",
    "Quote-tweet 3 viral posts same day (out-of-network Phoenix retrieval path)",
  ];
}
