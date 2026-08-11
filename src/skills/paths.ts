/**
 * Resolve Goose / agent skill roots on any machine.
 * Skills are installed flat under .agents/skills/<slug>/ (gooseworks install layout).
 * Optional nested clones (Desktop/goose-skills/skills/...) still work when present.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname, basename, isAbsolute } from "node:path";
import { XBOT_ROOT, env } from "../config.js";

export function agentsSkillsDir(): string {
  return join(XBOT_ROOT, ".agents", "skills");
}

export function vendorGooseDir(): string {
  return join(XBOT_ROOT, "vendor", "goose-skills");
}

/** Candidate goose clone roots — env first, then vendor pointer, desktops, sibling. */
function candidateGooseRoots(): string[] {
  const out: string[] = [];
  const fromEnv = env("GOOSE_SKILLS_ROOT");
  if (fromEnv) out.push(fromEnv);

  const rootTxt = join(vendorGooseDir(), "ROOT.txt");
  if (existsSync(rootTxt)) {
    const line = readFileSync(rootTxt, "utf8").split(/\r?\n/)[0]?.trim();
    if (line) out.push(line);
  }

  const home = homedir();
  const user = process.env.USERNAME || process.env.USER || "";
  for (const p of [
    join(home, "Desktop", "goose-skills"),
    join(home, "goose-skills"),
    join(XBOT_ROOT, "..", "goose-skills"),
    user ? `C:\\Users\\${user}\\Desktop\\goose-skills` : "",
    join(XBOT_ROOT, "vendor", "goose-skills"),
  ]) {
    if (p) out.push(p);
  }
  return out;
}

function looksLikeGooseRoot(root: string): boolean {
  if (!root || !existsSync(root)) return false;
  if (existsSync(join(root, "formats.json"))) return true;
  if (existsSync(join(root, "skills-index.json"))) return true;
  if (existsSync(join(root, "skills")) && statSync(join(root, "skills")).isDirectory()) return true;
  // Flat agent install: directory of skill folders with SKILL.md
  try {
    const kids = readdirSync(root).slice(0, 40);
    let hits = 0;
    for (const k of kids) {
      if (existsSync(join(root, k, "SKILL.md"))) hits++;
      if (hits >= 3) return true;
    }
  } catch {
    /* */
  }
  return false;
}

/**
 * Primary skill body root. Prefers real goose clone; falls back to .agents/skills.
 */
export function resolveGooseRoot(): string | null {
  for (const c of candidateGooseRoots()) {
    if (looksLikeGooseRoot(c)) return c;
  }
  const agents = agentsSkillsDir();
  if (looksLikeGooseRoot(agents)) return agents;
  return null;
}

/** Flat default formats for kiln's installed agent skill layout. */
export const FLAT_FORMATS: Record<string, string> = {
  static: "remix-graphic-ad-from-reference",
  "brand-research": "brand-research",
  imessage: "create-imessage-mockup",
  chatgpt: "create-chatgpt-mockup",
  "apple-notes": "create-apple-notes-mockup",
};

/**
 * Ensure vendor/goose-skills has index + formats + ROOT pointing at live skills.
 * Idempotent — safe on every activate / pack.
 */
export function ensureGooseVendorBootstrap(): {
  vendor: string;
  root: string | null;
  formatsPath: string;
  indexPath: string;
} {
  const vendor = vendorGooseDir();
  if (!existsSync(vendor)) mkdirSync(vendor, { recursive: true });

  const agents = agentsSkillsDir();
  const liveRoot = resolveGooseRoot() ?? (existsSync(agents) ? agents : null);

  // Always pin ROOT at live skills so windows users don't depend on RICHEY_SON
  if (liveRoot) {
    writeFileSync(
      join(vendor, "ROOT.txt"),
      `${liveRoot}\n# Auto-written by ensureGooseVendorBootstrap — skill bodies live here.\n`,
      "utf8",
    );
  }

  const formatsPath = join(vendor, "formats.json");
  if (!existsSync(formatsPath)) {
    writeFileSync(formatsPath, JSON.stringify(FLAT_FORMATS, null, 2) + "\n", "utf8");
  } else {
    // Merge missing keys so video formats always resolve
    try {
      const cur = JSON.parse(readFileSync(formatsPath, "utf8")) as Record<string, string>;
      let dirty = false;
      for (const [k, v] of Object.entries(FLAT_FORMATS)) {
        if (!cur[k]) {
          cur[k] = v;
          dirty = true;
        }
      }
      if (dirty) writeFileSync(formatsPath, JSON.stringify(cur, null, 2) + "\n", "utf8");
    } catch {
      writeFileSync(formatsPath, JSON.stringify(FLAT_FORMATS, null, 2) + "\n", "utf8");
    }
  }

  // Also drop formats.json into agents root if that is the live root (gooseOk probes)
  if (liveRoot === agents && !existsSync(join(agents, "formats.json"))) {
    writeFileSync(join(agents, "formats.json"), JSON.stringify(FLAT_FORMATS, null, 2) + "\n", "utf8");
  }

  const indexPath = join(vendor, "skills-index.json");
  // If index missing but sibling/desktop has one, copy it
  if (!existsSync(indexPath)) {
    for (const c of candidateGooseRoots()) {
      const src = join(c, "skills-index.json");
      if (existsSync(src) && src !== indexPath) {
        writeFileSync(indexPath, readFileSync(src));
        break;
      }
    }
  }

  return { vendor, root: liveRoot, formatsPath, indexPath };
}

export function loadFormatsMap(): Record<string, string> {
  ensureGooseVendorBootstrap();
  const root = resolveGooseRoot();
  const candidates = [
    root ? join(root, "formats.json") : "",
    join(vendorGooseDir(), "formats.json"),
  ].filter(Boolean);
  for (const p of candidates) {
    if (existsSync(p)) {
      try {
        return { ...FLAT_FORMATS, ...(JSON.parse(readFileSync(p, "utf8")) as Record<string, string>) };
      } catch {
        /* */
      }
    }
  }
  return { ...FLAT_FORMATS };
}

/**
 * Resolve a skill directory by slug or relative goose path.
 * Tries: absolute · join(root, rel) · flat agents/<slug> · last path segment slug.
 */
export function resolveSkillDir(relOrSlug: string): string | null {
  if (!relOrSlug) return null;
  if (isAbsolute(relOrSlug) && existsSync(relOrSlug)) return relOrSlug;

  const root = resolveGooseRoot();
  const agents = agentsSkillsDir();
  const slug = basename(relOrSlug.replace(/\\/g, "/"));

  const tries = [
    root ? join(root, relOrSlug) : "",
    join(agents, relOrSlug),
    join(agents, slug),
    root ? join(root, "skills", relOrSlug) : "",
    // Nested gooseworks layout leftovers
    root
      ? join(root, "skills", "ads", "packs", "video-ad-formats", slug)
      : "",
    root ? join(root, "skills", "ads", "composites", slug) : "",
    root ? join(root, "skills", "design", "composites", slug) : "",
    join(agents, "skills", "ads", "packs", "video-ad-formats", slug),
  ].filter(Boolean);

  for (const t of tries) {
    if (!t) continue;
    if (existsSync(join(t, "SKILL.md")) || existsSync(join(t, "render.js")) || existsSync(t)) {
      if (statSync(t).isDirectory()) return t;
    }
  }
  return null;
}

export function gooseGraphicsScreenshotPath(): string | null {
  const candidates = [
    resolveSkillDir("goose-graphics")
      ? join(resolveSkillDir("goose-graphics")!, "screenshot", "screenshot.js")
      : "",
    join(agentsSkillsDir(), "goose-graphics", "screenshot", "screenshot.js"),
    resolveGooseRoot()
      ? join(
          resolveGooseRoot()!,
          "skills",
          "design",
          "composites",
          "goose-graphics",
          "screenshot",
          "screenshot.js",
        )
      : "",
  ].filter(Boolean);
  for (const p of candidates) {
    if (p && existsSync(p)) return p;
  }
  return null;
}

export function videoFormatSkillDir(
  format: "imessage" | "chatgpt" | "apple-notes",
): string | null {
  const formats = loadFormatsMap();
  const slugMap: Record<string, string> = {
    imessage: formats.imessage || "create-imessage-mockup",
    chatgpt: formats.chatgpt || "create-chatgpt-mockup",
    "apple-notes": formats["apple-notes"] || "create-apple-notes-mockup",
  };
  const mapped = slugMap[format];
  const dir = resolveSkillDir(mapped);
  if (dir && existsSync(join(dir, "render.js"))) return dir;
  const flat = join(agentsSkillsDir(), basename(mapped));
  return existsSync(join(flat, "render.js")) ? flat : null;
}

/** True when formats map loads and at least one ad skill is executable. */
export function gooseStackReady(): boolean {
  ensureGooseVendorBootstrap();
  const root = resolveGooseRoot();
  if (!root) return false;
  const staticDir = resolveSkillDir(loadFormatsMap().static || "remix-graphic-ad-from-reference");
  return Boolean(staticDir && existsSync(join(staticDir, "SKILL.md")));
}
