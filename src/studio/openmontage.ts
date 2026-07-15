/**
 * OpenMontage-inspired agentic production pipeline.
 * research → script → assets plan → edit-auto → export-ads
 */
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR, assertDataDir, env } from "../config.js";
import { newId } from "../store.js";
import { getProject } from "../projects/registry.js";
import { chatCompletion } from "../ai/router.js";
import { autonomousEdit } from "../edit/autonomous.js";
import { exportAdFormats } from "../edit/export-ads.js";
import { extractViralClips } from "../edit/viral-clips.js";
import { adStyleForBrand } from "../edit/styles.js";
import type { BrandKey } from "../brands.js";

export interface MontagePhase {
  id: string;
  title: string;
  output: string;
}

export interface OpenMontageRun {
  id: string;
  projectId: string;
  status: "done" | "failed" | "planned";
  phases: MontagePhase[];
  masterPath?: string;
  adPaths?: string[];
  clipPaths?: string[];
  outputPath: string;
  log: string[];
}

export async function planOpenMontage(
  projectId: string,
  brief?: string,
): Promise<{ script: string; shotList: string[]; hook: string; cta: string }> {
  const project = getProject(projectId);
  const topic =
    brief ||
    (projectId === "magmos"
      ? "Forge tx landed on Sui testnet — AURUM forge → smelt → refine proof"
      : project.tagline);

  try {
    const llm = await chatCompletion(
      "openmontage",
      `Project: ${project.name}
Tagline: ${project.tagline}
Brief: ${topic}

Return JSON only:
{"hook":"on-screen ≤8 words","cta":"…","script":"30-45s VO script","shotList":["shot 1","shot 2",…]}
OpenMontage rules: outcome-first, live proof, no logo open.`,
      { context: projectId },
    );
    const parsed = JSON.parse(llm.content.replace(/```json|```/g, "").trim()) as {
      hook?: string;
      cta?: string;
      script?: string;
      shotList?: string[];
    };
    return {
      hook: parsed.hook ?? "FORGE TX LANDED",
      cta: parsed.cta ?? "Try it — link in bio",
      script: parsed.script ?? topic,
      shotList: parsed.shotList ?? ["Terminal forge", "Tx hash", "CTA"],
    };
  } catch {
    return {
      hook: projectId === "magmos" ? "FORGE TX LANDED" : "LIVE ON TESTNET",
      cta: "Link in bio",
      script: topic,
      shotList: ["Hero screen", "Proof", "CTA"],
    };
  }
}

/**
 * Full OpenMontage-style run when footage exists; otherwise writes production plan.
 */
export async function runOpenMontage(opts: {
  projectId: string;
  footagePath?: string;
  brief?: string;
}): Promise<OpenMontageRun> {
  const id = newId("montage");
  const log: string[] = [];
  const phases: MontagePhase[] = [];
  const projectId = opts.projectId || "magmos";
  const brand = projectId as BrandKey;

  assertDataDir();
  const dir = join(DATA_DIR, "studio", "openmontage");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  log.push("[1/5] Research + script (OpenMontage plan phase)");
  const plan = await planOpenMontage(projectId, opts.brief);
  const planPath = join(dir, `${id}-plan.json`);
  writeFileSync(planPath, JSON.stringify(plan, null, 2));
  phases.push({ id: "plan", title: "Script + shot list", output: planPath });
  log.push(`Hook: ${plan.hook}`);

  if (!opts.footagePath || !existsSync(opts.footagePath)) {
    const md = join(dir, `${id}-BRIEF.md`);
    writeFileSync(
      md,
      [
        `# OpenMontage brief — ${getProject(projectId).name}`,
        "",
        `## Hook`,
        plan.hook,
        "",
        `## VO script`,
        plan.script,
        "",
        `## Shot list`,
        ...plan.shotList.map((s) => `- ${s}`),
        "",
        `## CTA`,
        plan.cta,
        "",
        `## Next`,
        `Record footage, then:`,
        `\`npm run openmontage ${projectId} path/to/recording.webm\``,
      ].join("\n"),
    );
    phases.push({ id: "await-footage", title: "Waiting for screen recording", output: md });
    const outputPath = join(dir, `${id}.json`);
    const run: OpenMontageRun = {
      id,
      projectId,
      status: "planned",
      phases,
      outputPath,
      log: [...log, "No footage — plan saved. Record then re-run."],
    };
    writeFileSync(outputPath, JSON.stringify(run, null, 2));
    return run;
  }

  const style = adStyleForBrand(brand);
  log.push(`[2/5] Autonomous edit (${style.id}) — freecut + beat-sync`);
  const job = await autonomousEdit(opts.footagePath, brand, style.id, {
    beatSync: true,
    autoMusic: true,
    voiceover: true,
    veniceBroll: true,
    projectId,
  });
  phases.push({
    id: "edit",
    title: "Autonomous CapCut-class edit",
    output: job.outputPath,
  });
  if (job.status !== "done") {
    const outputPath = join(dir, `${id}.json`);
    const run: OpenMontageRun = {
      id,
      projectId,
      status: "failed",
      phases,
      outputPath,
      log: [...log, job.log.slice(-500)],
    };
    writeFileSync(outputPath, JSON.stringify(run, null, 2));
    return run;
  }

  log.push("[3/5] OpenShorts viral clips");
  const clips = await extractViralClips(opts.footagePath, { maxClips: 3, brand: projectId });
  phases.push({
    id: "shorts",
    title: "Viral 9:16 clips",
    output: clips.clips[0]?.path ?? "(none)",
  });

  log.push("[4/5] Ad format export");
  const ads = await exportAdFormats(job.outputPath, brand);
  phases.push({
    id: "ads",
    title: "9:16 / 1:1 / 16:9",
    output: ads.exports.map((e) => e.path).join("\n"),
  });

  log.push("[5/5] Persist run");
  const outputPath = join(dir, `${id}.json`);
  const run: OpenMontageRun = {
    id,
    projectId,
    status: "done",
    phases,
    masterPath: job.outputPath,
    adPaths: ads.exports.map((e) => e.path),
    clipPaths: clips.clips.map((c) => c.path),
    outputPath,
    log,
  };
  writeFileSync(outputPath, JSON.stringify(run, null, 2));
  writeFileSync(join(dir, "latest.md"), formatOpenMontage(run));
  void env;
  return run;
}

export function formatOpenMontage(r: OpenMontageRun): string {
  return [
    `# OpenMontage run — ${r.status}`,
    `Project: ${r.projectId} · ${r.id}`,
    "",
    "## Phases",
    ...r.phases.map((p) => `- **${p.title}**: ${p.output}`),
    "",
    r.masterPath ? `Master: ${r.masterPath}` : "",
    ...(r.adPaths ?? []).map((p) => `Ad: ${p}`),
    ...(r.clipPaths ?? []).map((p) => `Clip: ${p}`),
    "",
    "## Log",
    ...r.log,
  ]
    .filter(Boolean)
    .join("\n");
}
