/**
 * Pack quality gate — refuse to call garbage "done".
 * A pack is only shippable if core creatives + Magmos voice pass.
 */
import { existsSync, statSync, readFileSync } from "node:fs";
import { MAGMOS_BRAND } from "../studio/magmos-brand.js";

export interface QualityFinding {
  level: "fail" | "warn";
  code: string;
  message: string;
}

export interface QualityReport {
  shippable: boolean;
  score: number;
  findings: QualityFinding[];
}

const BANNED = [
  ...MAGMOS_BRAND.neverSay.map((s) => s.toLowerCase()),
  "apy",
  "real yield",
  "guaranteed",
  "own your world",
  "trust in tech",
  "open and rewarding",
  "capcut",
  "corona virus",
  "re-fungible",
];

function fileOk(path?: string, minBytes = 20_000): boolean {
  if (!path || !existsSync(path)) return false;
  try {
    return statSync(path).size >= minBytes;
  } catch {
    return false;
  }
}

function textHasBanned(text: string): string[] {
  const lower = text.toLowerCase();
  return BANNED.filter((b) => lower.includes(b));
}

/** Score a finished pack directory + key paths. */
export function scorePackQuality(opts: {
  packDir: string;
  paths: Record<string, string>;
  log: string[];
}): QualityReport {
  const findings: QualityFinding[] = [];
  let score = 100;

  const thriller = opts.paths.thrillerMp4 || opts.paths.thrillerVenice;
  if (!fileOk(thriller, 50_000)) {
    findings.push({ level: "fail", code: "thriller_missing", message: "No real thriller MP4" });
    score -= 30;
  } else if (opts.log.some((l) => /T2V failed|still\+VO/i.test(l)) && !opts.paths.thrillerVenice) {
    findings.push({
      level: "warn",
      code: "thriller_still_fallback",
      message: "Thriller is still+VO fallback — not a real video film",
    });
    score -= 15;
  }

  const hasSiteStills =
    Boolean(opts.paths.siteAds) &&
    (opts.log.some((l) => /Site ads: [1-9]/i.test(l)) ||
      fileOk(opts.paths.siteAds ? undefined : undefined)); // path is dir

  const siteStillCount = (opts.log.find((l) => /Site ads: (\d+)/i.exec(l)) || "").match(
    /Site ads: (\d+)/i,
  );
  const nStills = siteStillCount ? Number(siteStillCount[1]) : 0;
  if (nStills < 3) {
    findings.push({
      level: "fail",
      code: "site_ads_weak",
      message: `Site ads stills=${nStills} (need ≥3 fresh Magmos concepts)`,
    });
    score -= 25;
  }

  if (opts.log.some((l) => /Goose stack ads: 0\//i.test(l)) && nStills < 3) {
    findings.push({ level: "fail", code: "no_ads", message: "No ad creatives produced" });
    score -= 20;
  }

  if (opts.log.some((l) => /Post failed/i.test(l)) || !opts.paths.post) {
    findings.push({ level: "fail", code: "post_missing", message: "X post failed or missing" });
    score -= 10;
  }

  // Voice / banned jargon scan on markdown artifacts
  for (const key of ["post", "ugc", "thrillerBrief", "socialMax"]) {
    const p = opts.paths[key];
    if (!p || !existsSync(p)) continue;
    try {
      const text = readFileSync(p, "utf8");
      const hits = textHasBanned(text);
      if (hits.length) {
        findings.push({
          level: "fail",
          code: `banned_${key}`,
          message: `${key} contains banned voice: ${hits.slice(0, 5).join(", ")}`,
        });
        score -= 8;
      }
    } catch {
      /* */
    }
  }

  // Social-max junk hooks
  const socialPath = opts.paths.socialMax;
  if (socialPath && existsSync(socialPath)) {
    try {
      const j = JSON.parse(readFileSync(socialPath, "utf8")) as { winningHooks?: string[] };
      const junk = (j.winningHooks ?? []).filter((h) =>
        /capcut|corona|re-fungible|cursor killer|walk effect/i.test(h),
      );
      if (junk.length >= 3) {
        findings.push({
          level: "fail",
          code: "social_max_junk",
          message: `Social-max learned junk hooks (${junk.length}) — not Magmos craft`,
        });
        score -= 20;
      }
    } catch {
      /* md path maybe */
    }
  }

  if (opts.log.some((l) => /Connection error|fetch failed/i.test(l))) {
    findings.push({
      level: "warn",
      code: "network_flakes",
      message: "Network errors during pack — outputs may be incomplete",
    });
    score -= 10;
  }

  score = Math.max(0, Math.min(100, score));
  const shippable = score >= 70 && !findings.some((f) => f.level === "fail" && f.code !== "thriller_still_fallback");

  // Hard rule: any fail except optional warn-only codes → not shippable
  const hardFails = findings.filter((f) => f.level === "fail");
  const ok = hardFails.length === 0 && score >= 70;

  void hasSiteStills;
  return { shippable: ok, score, findings };
}

export function formatQuality(r: QualityReport): string {
  return [
    `# Quality gate — ${r.shippable ? "SHIPPABLE" : "REJECTED"} (score ${r.score})`,
    "",
    ...r.findings.map((f) => `- **${f.level.toUpperCase()}** \`${f.code}\`: ${f.message}`),
    r.findings.length ? "" : "- No findings",
  ].join("\n");
}

/** Reject off-brand ad concepts before Venice spend. */
export function filterMagmosConcepts<T extends { headline: string; subhead: string; angle?: string; cta?: string }>(
  concepts: T[],
): T[] {
  return concepts.filter((c) => {
    const blob = `${c.headline} ${c.subhead} ${c.angle ?? ""} ${c.cta ?? ""}`.toLowerCase();
    if (textHasBanned(blob).length) return false;
    // Must sound like Magmos dollar product
    const onBrand =
      /dollar|hold|\$1|1\.00|lockup|reserve|waitlist|earn while|idle|sui|magmos/i.test(blob);
    return onBrand;
  });
}
