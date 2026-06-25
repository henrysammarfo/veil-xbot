import { YoutubeTranscript } from "youtube-transcript";

export type Platform = "youtube" | "tiktok" | "x" | "other";

export function detectPlatform(url: string): Platform {
  if (/youtube\.com|youtu\.be/i.test(url)) return "youtube";
  if (/tiktok\.com/i.test(url)) return "tiktok";
  if (/twitter\.com|x\.com/i.test(url)) return "x";
  return "other";
}

export function youtubeVideoId(url: string): string | null {
  const u = url.trim();
  const short = u.match(/youtu\.be\/([a-zA-Z0-9_-]{6,})/);
  if (short) return short[1];
  const watch = u.match(/[?&]v=([a-zA-Z0-9_-]{6,})/);
  if (watch) return watch[1];
  const embed = u.match(/embed\/([a-zA-Z0-9_-]{6,})/);
  if (embed) return embed[1];
  return null;
}

export interface VideoSource {
  id: string;
  url: string;
  platform: Platform;
  title: string;
  channel?: string;
  description?: string;
  transcript: string;
}

async function fetchOEmbed(url: string): Promise<{ title: string; author_name?: string }> {
  const res = await fetch(
    `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
  );
  if (!res.ok) return { title: "Unknown title" };
  return res.json() as Promise<{ title: string; author_name?: string }>;
}

export async function fetchYouTubeSource(url: string): Promise<VideoSource> {
  const id = youtubeVideoId(url);
  if (!id) throw new Error("Invalid YouTube URL");

  const [oembed, chunks] = await Promise.all([
    fetchOEmbed(url),
    YoutubeTranscript.fetchTranscript(id).catch(() => []),
  ]);

  const transcript = chunks.map((c) => c.text).join(" ").replace(/\s+/g, " ").trim();

  return {
    id,
    url,
    platform: "youtube",
    title: oembed.title,
    channel: oembed.author_name,
    transcript,
  };
}

/** TikTok / X — no free transcript API; user pastes notes or we use page title only. */
export async function fetchManualSource(
  url: string,
  notes?: string,
): Promise<VideoSource> {
  const platform = detectPlatform(url);
  const id =
    platform === "tiktok"
      ? url.match(/video\/(\d+)/)?.[1] ?? `tiktok_${Date.now()}`
      : platform === "x"
        ? url.match(/status\/(\d+)/)?.[1] ?? `x_${Date.now()}`
        : `other_${Date.now()}`;

  return {
    id,
    url,
    platform,
    title: notes?.split("\n")[0]?.slice(0, 120) || `${platform} link`,
    transcript: notes || "(No transcript — paste notes with: xbot watch <url> --notes \"hook was...\")",
  };
}

export async function resolveVideoSource(url: string, notes?: string): Promise<VideoSource> {
  const platform = detectPlatform(url);
  if (platform === "youtube") return fetchYouTubeSource(url);
  return fetchManualSource(url, notes);
}
