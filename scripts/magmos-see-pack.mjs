/**
 * One-shot Magmos pack: thriller slide film + UGC vertical from existing Venice stills/VO.
 */
import { existsSync, mkdirSync, writeFileSync, copyFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR, assertDataDir } from "../config.js";
import { hasFfmpeg, runFfmpeg, probeDuration } from "../edit/ffmpeg-util.js";
import { veniceGenerateImage, veniceTextToSpeech, hasVenice } from "../integrations/venice.js";
import { scaffoldFromTrailer, renderHyperframes } from "../integrations/hyperframes.js";
import { produceTrailer } from "../studio/trailer.js";
import { generateDraft, formatDraftForCopy } from "../generate/draft.js";
import { generateCreative, formatCreative } from "../teams/creative.js";

assertDataDir();
const packDir = join(DATA_DIR, "studio", "magmos-pack");
mkdirSync(packDir, { recursive: true });

const veniceDir = join(DATA_DIR, "exports", "venice");
const ads = [
  "ad-0-product_hero.png",
  "ad-1-isometric.png",
  "ad-2-typographic.png",
  "ad-3-gradient_field.png",
  "magmos-hook.png",
].map((n) => join(veniceDir, n)).filter((p) => existsSync(p));

console.log("[1] Thriller trailer brief + HyperFrames scaffold");
const thriller = await produceTrailer({
  project: "magmos",
  phase: "trailer",
  feature: "thriller dark forge AURUM vault countdown",
});
writeFileSync(join(packDir, "THRILLER.md"), JSON.stringify(thriller, null, 2));
const hf = scaffoldFromTrailer(thriller);
console.log("HF:", hf.projectDir);

console.log("[2] Ensure thriller poster + UGC influencer still + VOs");
if (!hasVenice()) throw new Error("VENICE_API_KEY required");

const thrillerStill = await veniceGenerateImage(
  "Thriller cinematic poster: dark forge vault, crimson countdown digits, molten gold AURUM coin rising from industrial crucible, film grain, no people, 16:9",
  { outName: "thriller-poster.png", projectId: "magmos", force: true },
);
const ugcStill = await veniceGenerateImage(
  "UGC vertical still 9:16: creator hands holding phone showing Magmos forge dashboard, dark desk, teal amber light, no face, social influencer aesthetic, product UI on screen",
  { outName: "ugc-influencer-pov.png", projectId: "magmos", force: true },
);
const thrillerVo = await veniceTextToSpeech(
  "Vault countdown. Ten seconds. Magmos forges AURUM. The dollar that compounds on-chain. Join the waitlist.",
  { outName: "thriller-vo.mp3", voice: "am_michael", projectId: "magmos", force: true },
);
const ugcVo = await veniceTextToSpeech(
  "Forging AURUM live. Real screen. Real waitlist. Magmos — not another APY story.",
  { outName: "ugc-influencer-vo.mp3", voice: "am_michael", projectId: "magmos", force: true },
);

copyFileSync(thrillerStill.path, join(packDir, "thriller-poster.png"));
copyFileSync(ugcStill.path, join(packDir, "ugc-influencer-pov.png"));
copyFileSync(thrillerVo.path, join(packDir, "thriller-vo.mp3"));
copyFileSync(ugcVo.path, join(packDir, "ugc-influencer-vo.mp3"));
for (const a of ads.slice(0, 4)) {
  copyFileSync(a, join(packDir, a.split(/[/\\]/).pop()!));
}

console.log("[3] X post + UGC creative");
const draft = await generateDraft({
  brand: "magmos",
  topic: "thriller launch — forge lands, waitlist open, AURUM vault",
});
writeFileSync(join(packDir, "POST.md"), formatDraftForCopy(draft));
const ugc = await generateCreative({
  project: "magmos",
  kind: "ugc",
  topic: "influencer desk phone POV forges AURUM — no fake face, product only",
});
writeFileSync(join(packDir, "UGC.md"), formatCreative(ugc));

let thrillerMp4 = "";
let ugcMp4 = "";
if (hasFfmpeg()) {
  console.log("[4] ffmpeg thriller slideshow + UGC Ken Burns");
  const listPath = join(packDir, "thriller-list.txt");
  const slides = [join(packDir, "thriller-poster.png"), ...ads.slice(0, 3).map((p) => join(packDir, p.split(/[/\\]/).pop()!))];
  const lines = slides.filter(existsSync).flatMap((p) => [
    `file '${p.replace(/\\/g, "/")}'`,
    "duration 2.5",
  ]);
  if (slides[slides.length - 1]) {
    lines.push(`file '${slides[slides.length - 1].replace(/\\/g, "/")}'`);
  }
  writeFileSync(listPath, lines.join("\n"));
  thrillerMp4 = join(packDir, "thriller.mp4");
  try {
    runFfmpeg(
      [
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        listPath,
        "-i",
        join(packDir, "thriller-vo.mp3"),
        "-vf",
        "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,format=yuv420p",
        "-c:v",
        "libx264",
        "-preset",
        "fast",
        "-crf",
        "20",
        "-c:a",
        "aac",
        "-shortest",
        thrillerMp4,
      ],
      "thriller-slideshow",
    );
  } catch (e) {
    console.warn("thriller ffmpeg:", e);
  }

  ugcMp4 = join(packDir, "ugc-influencer.mp4");
  try {
    runFfmpeg(
      [
        "-y",
        "-loop",
        "1",
        "-i",
        join(packDir, "ugc-influencer-pov.png"),
        "-i",
        join(packDir, "ugc-influencer-vo.mp3"),
        "-vf",
        "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,zoompan=z='min(zoom+0.0015,1.12)':d=125:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps=25,format=yuv420p",
        "-c:v",
        "libx264",
        "-t",
        "8",
        "-c:a",
        "aac",
        "-shortest",
        ugcMp4,
      ],
      "ugc-vertical",
    );
  } catch (e) {
    console.warn("ugc ffmpeg:", e);
  }
}

console.log("[5] HyperFrames render attempt");
let hfMp4 = "";
try {
  const rendered = await renderHyperframes(hf.projectDir);
  hfMp4 = rendered.outputPath ?? "";
  if (hfMp4 && existsSync(hfMp4)) {
    copyFileSync(hfMp4, join(packDir, "thriller-hyperframes.mp4"));
  }
} catch (e) {
  console.warn("HF render:", e instanceof Error ? e.message : e);
}

const md = [
  "# Magmos pack — thriller · ads · post · UGC",
  `_Generated ${new Date().toISOString()}_`,
  "",
  "## Open these",
  thrillerMp4 && existsSync(thrillerMp4) ? `- Thriller video: \`${thrillerMp4}\`` : "- Thriller video: (ffmpeg failed — open stills)",
  ugcMp4 && existsSync(ugcMp4) ? `- UGC influencer video: \`${ugcMp4}\`` : "- UGC influencer video: open `ugc-influencer-pov.png` + `ugc-influencer-vo.mp3`",
  hfMp4 ? `- HyperFrames thriller: \`${hfMp4}\`` : "",
  `- Thriller poster: \`${join(packDir, "thriller-poster.png")}\``,
  `- UGC still: \`${join(packDir, "ugc-influencer-pov.png")}\``,
  `- Ad stills: ad-0…ad-3 in this folder`,
  `- Post: \`${join(packDir, "POST.md")}\``,
  `- UGC brief: \`${join(packDir, "UGC.md")}\``,
  `- Trailer brief: \`${join(packDir, "THRILLER.md")}\``,
  "",
  "## Note",
  "Venice T2V queue timed out earlier — these clips use stills + VO so you can review now.",
  "Ads also at: data/exports/venice/ad-*.png",
].filter(Boolean).join("\n");

writeFileSync(join(packDir, "PACK.md"), md);
console.log("\n" + md);
console.log("\nPACK DIR:", packDir);
