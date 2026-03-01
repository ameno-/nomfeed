/**
 * Extract — run patterns against content via LLM.
 *
 * Takes transcript/content + pattern names → structured markdown sections.
 * Runs patterns in parallel where possible.
 */

import { complete, isConfigured, type LLMResponse } from "./llm";
import { getPattern, DEFAULT_EXTRACT_PATTERNS, type Pattern } from "./patterns";

export interface ExtractionResult {
  pattern: string;
  markdown: string;
  model: string;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  error?: string;
}

export interface ExtractOutput {
  results: ExtractionResult[];
  composed: string;        // all results combined into one markdown document
  totalTokens: number;
}

export async function extract(
  content: string,
  patternNames?: string[],
  opts?: { model?: string; onProgress?: (name: string, status: "start" | "done" | "error") => void }
): Promise<ExtractOutput> {
  if (!isConfigured()) {
    throw new Error(
      "LLM not configured. Set OPENROUTER_API_KEY in your shell environment.\n" +
      "Get a key at: https://openrouter.ai/keys"
    );
  }

  const names = patternNames?.length ? patternNames : DEFAULT_EXTRACT_PATTERNS;

  // Resolve patterns
  const patterns: Pattern[] = [];
  for (const name of names) {
    const pattern = getPattern(name);
    if (!pattern) {
      throw new Error(`Unknown pattern: "${name}". Run: markstash patterns`);
    }
    patterns.push(pattern);
  }

  // Truncate content if it's extremely long (protect against huge transcripts)
  const maxChars = 300_000; // ~75k tokens — well within 200k context
  const truncated = content.length > maxChars
    ? content.slice(0, maxChars) + "\n\n[...transcript truncated for extraction...]"
    : content;

  // Run all patterns in parallel
  const promises = patterns.map(async (pattern): Promise<ExtractionResult> => {
    opts?.onProgress?.(pattern.name, "start");
    try {
      const response = await complete(pattern.system, truncated, { model: opts?.model });
      opts?.onProgress?.(pattern.name, "done");
      return {
        pattern: pattern.name,
        markdown: response.text,
        model: response.model,
        usage: response.usage,
      };
    } catch (err: any) {
      opts?.onProgress?.(pattern.name, "error");
      return {
        pattern: pattern.name,
        markdown: "",
        model: "error",
        error: err.message,
      };
    }
  });

  const results = await Promise.all(promises);

  // Compose into single document
  const sections: string[] = [];
  let totalTokens = 0;

  for (const result of results) {
    if (result.error) {
      sections.push(`## ⚠ ${result.pattern} (failed)\n\nError: ${result.error}`);
    } else {
      sections.push(result.markdown);
    }
    totalTokens += result.usage?.total_tokens ?? 0;
  }

  return {
    results,
    composed: sections.join("\n\n---\n\n"),
    totalTokens,
  };
}
