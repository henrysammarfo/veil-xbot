/**
 * Moh4696/open-source-ai-goldmine — embedded 22-lab catalog + loader.
 */
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR, assertDataDir } from "../config.js";

export interface GoldmineRepo {
  n: number;
  name: string;
  url: string;
  org: string;
  use: string;
}

/** Official list from open-source-ai-goldmine README (2026). */
export const GOLDMINE_REPOS: GoldmineRepo[] = [
  { n: 1, name: "skills", url: "https://github.com/anthropics/skills", org: "anthropic", use: "Reusable agent skills" },
  { n: 2, name: "openai-agents-python", url: "https://github.com/openai/openai-agents-python", org: "openai", use: "Multi-agent framework" },
  { n: 3, name: "adk-python", url: "https://github.com/google/adk-python", org: "google", use: "Agent development kit" },
  { n: 4, name: "courses", url: "https://github.com/anthropics/courses", org: "anthropic", use: "Prompting / agent courses" },
  { n: 5, name: "openai-cookbook", url: "https://github.com/openai/openai-cookbook", org: "openai", use: "Recipes: RAG, evals, agents" },
  { n: 6, name: "generative-ai-python", url: "https://github.com/google/generative-ai-python", org: "google", use: "Gemini SDK" },
  { n: 7, name: "claude-code", url: "https://github.com/anthropics/claude-code", org: "anthropic", use: "Coding agent reference" },
  { n: 8, name: "evals", url: "https://github.com/openai/evals", org: "openai", use: "Model quality grading" },
  { n: 9, name: "google-research", url: "https://github.com/google-research/google-research", org: "google", use: "Research code dump" },
  { n: 10, name: "anthropic-cookbook", url: "https://github.com/anthropics/anthropic-cookbook", org: "anthropic", use: "Claude notebooks" },
  { n: 11, name: "llama-models", url: "https://github.com/meta-llama/llama-models", org: "meta", use: "Llama weights + license" },
  { n: 12, name: "llama-cookbook", url: "https://github.com/meta-llama/llama-cookbook", org: "meta", use: "Tune / serve / RAG" },
  { n: 13, name: "DeepSeek-V3", url: "https://github.com/deepseek-ai/DeepSeek-V3", org: "deepseek", use: "Open MoE reasoning" },
  { n: 14, name: "Qwen3", url: "https://github.com/QwenLM/Qwen3", org: "alibaba", use: "Multilingual open weights" },
  { n: 15, name: "mistral-inference", url: "https://github.com/mistralai/mistral-inference", org: "mistral", use: "Reference inference" },
  { n: 16, name: "gemma", url: "https://github.com/google-deepmind/gemma", org: "deepmind", use: "Open Gemini cousins" },
  { n: 17, name: "transformers", url: "https://github.com/huggingface/transformers", org: "huggingface", use: "Default model runtime" },
  { n: 18, name: "NeMo", url: "https://github.com/NVIDIA/NeMo", org: "nvidia", use: "Speech + LLM training" },
  { n: 19, name: "autogen", url: "https://github.com/microsoft/autogen", org: "microsoft", use: "Multi-agent handoffs" },
  { n: 20, name: "semantic-kernel", url: "https://github.com/microsoft/semantic-kernel", org: "microsoft", use: "Enterprise LLM plugins" },
  { n: 21, name: "grok-1", url: "https://github.com/xai-org/grok-1", org: "xai", use: "314B MoE base" },
  { n: 22, name: "deer-flow", url: "https://github.com/bytedance/deer-flow", org: "bytedance", use: "Deep-research agent" },
];

export function saveGoldmineCatalog(): string {
  assertDataDir();
  const dir = join(DATA_DIR, "research");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const path = join(dir, "goldmine.json");
  writeFileSync(
    path,
    JSON.stringify(
      {
        source: "https://github.com/Moh4696/open-source-ai-goldmine",
        updatedAt: Date.now(),
        repos: GOLDMINE_REPOS,
      },
      null,
      2,
    ),
  );
  writeFileSync(
    join(dir, "goldmine.md"),
    [
      "# open-source AI goldmine (embedded)",
      "",
      ...GOLDMINE_REPOS.map((r) => `${r.n}. **${r.name}** (${r.org}) — ${r.use}\n   ${r.url}`),
    ].join("\n"),
  );
  return path;
}

export function loadGoldmineCatalog(): typeof GOLDMINE_REPOS {
  const path = join(DATA_DIR, "research", "goldmine.json");
  if (existsSync(path)) {
    const j = JSON.parse(readFileSync(path, "utf8")) as { repos: GoldmineRepo[] };
    return j.repos;
  }
  return GOLDMINE_REPOS;
}

export function formatGoldmine(): string {
  saveGoldmineCatalog();
  return [
    `# Goldmine — ${GOLDMINE_REPOS.length} lab repos`,
    `Source: https://github.com/Moh4696/open-source-ai-goldmine`,
    "",
    ...GOLDMINE_REPOS.map((r) => `${String(r.n).padStart(2)}. [${r.name}](${r.url}) — ${r.use}`),
    "",
    `Saved: data/research/goldmine.json`,
  ].join("\n");
}
