import type { CaptionBeat } from "./manifest.js";

function assTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const cs = Math.floor((sec % 1) * 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

function escAss(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\{/g, "\\{").replace(/\}/g, "\\}").replace(/\n/g, "\\N");
}

/** Styled ASS subtitles — hook (big yellow), body, cta. */
export function captionsToAss(captions: CaptionBeat[], playRes = "1080x1920"): string {
  const [resX, resY] = playRes.split("x").map((n) => Number(n) || 0);
  const playResX = resX > 0 ? resX : 1080;
  const playResY = resY > 0 ? resY : 1920;
  const header = `[Script Info]
Title: Editor V2
ScriptType: v4.00+
PlayResX: ${playResX}
PlayResY: ${playResY}
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Hook,Arial Black,78,&H0000FFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,4,2,2,40,40,420,1
Style: Body,Arial,52,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,3,1,2,48,48,280,1
Style: CTA,Arial Black,58,&H0000FF00,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,3,2,2,40,40,180,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const events = captions
    .map((c) => {
      const style = c.style === "hook" ? "Hook" : c.style === "cta" ? "CTA" : "Body";
      return `Dialogue: 0,${assTime(c.start)},${assTime(c.end)},${style},,0,0,0,,${escAss(c.text)}`;
    })
    .join("\n");

  return header + events + "\n";
}

/** Word-pop kinetic lines — one dialogue per word in hook window. */
export function hookKineticAss(
  words: Array<{ start: number; end: number; text: string }>,
  hookEndSec: number,
): string {
  const hookWords = words.filter((w) => w.start < hookEndSec + 0.5);
  const captions: CaptionBeat[] = hookWords.map((w, i) => ({
    start: w.start,
    end: Math.min(w.end + 0.15, hookEndSec),
    text: w.text,
    style: i === 0 ? "hook" : "body",
  }));
  return captionsToAss(captions);
}

export function captionsToSrt(captions: CaptionBeat[]): string {
  const fmt = (sec: number) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    const ms = Math.floor((sec % 1) * 1000);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
  };
  const lines: string[] = [];
  captions.forEach((c, i) => {
    lines.push(String(i + 1));
    lines.push(`${fmt(c.start)} --> ${fmt(c.end)}`);
    lines.push(c.text);
    lines.push("");
  });
  return lines.join("\n");
}
