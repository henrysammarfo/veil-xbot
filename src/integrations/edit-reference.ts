/**
 * Edit-on-reference cascade — FAL alternate for Goose Phase 2B.
 *
 * Prefer order (no GooseWorks):
 *   1. Venice POST /image/edit  (user already has VENICE_API_KEY)
 *   2. OpenAI images/edits      (if OPENAI_API_KEY)
 *   3. FAL gpt-image-1/edit-image (if FAL_API_KEY)
 *
 * HTML finish on the reference is NOT an edit engine — callers handle that fallback.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR, assertDataDir, env, hasOpenAI, requireEnv } from "../config.js";
import { hasVenice, veniceEditImage } from "./venice.js";
import { hasFal, editFalImage } from "./fal.js";
import { newId } from "../store.js";

export type EditEngine = "venice" | "openai" | "fal";

export interface EditReferenceResult {
  path: string;
  engine: EditEngine;
  model?: string;
  usd?: number;
}

export function editEnginesAvailable(): EditEngine[] {
  const out: EditEngine[] = [];
  if (hasVenice()) out.push("venice");
  if (hasOpenAI()) out.push("openai");
  if (hasFal()) out.push("fal");
  return out;
}

async function editOpenAIImage(opts: {
  referencePath: string;
  prompt: string;
  outPath: string;
}): Promise<string> {
  const key = requireEnv("OPENAI_API_KEY");
  const buf = readFileSync(opts.referencePath);
  const form = new FormData();
  // Use File when available (Node 20+); avoid Blob type clash with DOM libs
  const file = new File([new Uint8Array(buf)], "reference.png", { type: "image/png" });
  form.append("image", file);
  form.append("prompt", opts.prompt);
  form.append("model", env("OPENAI_EDIT_MODEL", "gpt-image-1"));
  form.append("n", "1");
  form.append("size", "1024x1536");

  const res = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  if (!res.ok) {
    throw new Error(`OpenAI edit ${res.status}: ${(await res.text()).slice(0, 400)}`);
  }
  const data = (await res.json()) as {
    data?: Array<{ b64_json?: string; url?: string }>;
  };
  const item = data.data?.[0];
  if (item?.b64_json) {
    writeFileSync(opts.outPath, Buffer.from(item.b64_json, "base64"));
    return opts.outPath;
  }
  if (item?.url) {
    const img = await fetch(item.url);
    writeFileSync(opts.outPath, Buffer.from(await img.arrayBuffer()));
    return opts.outPath;
  }
  throw new Error("OpenAI edit returned no image");
}

/**
 * Run edit-on-reference with cascade. Throws if no edit engine succeeds.
 */
export async function editReferenceImage(opts: {
  referencePath: string;
  prompt: string;
  outPath?: string;
  aspect?: "1:1" | "4:5" | "2:3" | "9:16";
  projectId?: string;
  prefer?: EditEngine[];
}): Promise<EditReferenceResult> {
  if (!existsSync(opts.referencePath)) {
    throw new Error(`editReferenceImage: missing ${opts.referencePath}`);
  }
  assertDataDir();
  const dir = join(DATA_DIR, "exports", "edits");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const outPath = opts.outPath ?? join(dir, `${newId("edit")}.png`);

  const order =
    opts.prefer?.length
      ? opts.prefer
      : (env("EDIT_ENGINE", "venice,openai,fal")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean) as EditEngine[]);

  const errors: string[] = [];
  const aspect =
    opts.aspect === "1:1"
      ? "1:1"
      : opts.aspect === "9:16"
        ? "9:16"
        : opts.aspect === "4:5"
          ? "4:5"
          : "2:3";

  for (const engine of order) {
    try {
      if (engine === "venice" && hasVenice()) {
        const r = await veniceEditImage({
          referencePath: opts.referencePath,
          prompt: opts.prompt,
          aspectRatio: aspect === "2:3" ? "2:3" : aspect,
          outName: `edit-${newId("v")}.png`,
          force: true,
          projectId: opts.projectId,
        });
        writeFileSync(outPath, readFileSync(r.path));
        return { path: outPath, engine: "venice", model: r.model, usd: r.usd };
      }
      if (engine === "openai" && hasOpenAI()) {
        await editOpenAIImage({
          referencePath: opts.referencePath,
          prompt: opts.prompt,
          outPath,
        });
        return { path: outPath, engine: "openai", model: env("OPENAI_EDIT_MODEL", "gpt-image-1") };
      }
      if (engine === "fal" && hasFal()) {
        await editFalImage({
          prompt: opts.prompt,
          referencePath: opts.referencePath,
          outPath,
          aspect: aspect === "1:1" ? "1:1" : aspect === "9:16" ? "9:16" : "2:3",
        });
        return { path: outPath, engine: "fal" };
      }
    } catch (e) {
      errors.push(`${engine}: ${e instanceof Error ? e.message : e}`);
    }
  }

  throw new Error(
    `No edit engine succeeded (tried ${order.join("→")}). ${errors.join(" | ") || "none available — set VENICE_API_KEY"}`,
  );
}
