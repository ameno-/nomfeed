/**
 * LLM — thin provider layer over OpenRouter.
 *
 * Single API endpoint, one env var: OPENROUTER_API_KEY
 * Model fallback chain: user override → MARKSTASH_MODEL → sonnet 4.5 → sonnet 4 → haiku
 *
 * All keys come from shell env. No config files.
 */

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

// Model fallback chain — tried in order if the preferred model fails
const MODEL_CHAIN = [
  "anthropic/claude-sonnet-4.5",
  "anthropic/claude-sonnet-4",
  "anthropic/claude-haiku-4.5",
];

export interface LLMResponse {
  text: string;
  model: string;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

function getApiKey(): string {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    throw new Error(
      "No LLM API key found. Set OPENROUTER_API_KEY in your shell environment.\n" +
      "Get a key at: https://openrouter.ai/keys"
    );
  }
  return key;
}

function getModel(override?: string): string {
  return override || process.env.MARKSTASH_MODEL || MODEL_CHAIN[0];
}

export async function complete(
  system: string,
  user: string,
  opts?: { model?: string; maxTokens?: number }
): Promise<LLMResponse> {
  const apiKey = getApiKey();
  const preferredModel = getModel(opts?.model);
  const maxTokens = opts?.maxTokens ?? 8192;

  // Build model list: preferred model first, then fallbacks
  const models = [preferredModel, ...MODEL_CHAIN.filter(m => m !== preferredModel)];

  let lastError: Error | null = null;

  for (const model of models) {
    try {
      const resp = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://github.com/markstash",
          "X-Title": "MarkStash",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          max_tokens: maxTokens,
        }),
        signal: AbortSignal.timeout(120_000),
      });

      if (!resp.ok) {
        const body = await resp.text();
        // If model not available, try next in chain
        if (resp.status === 404 || resp.status === 422) {
          lastError = new Error(`Model ${model} unavailable: ${body}`);
          continue;
        }
        throw new Error(`OpenRouter API error (${resp.status}): ${body}`);
      }

      const data = await resp.json() as any;

      if (data.error) {
        lastError = new Error(`OpenRouter error: ${data.error.message || JSON.stringify(data.error)}`);
        continue;
      }

      const text = data.choices?.[0]?.message?.content;
      if (!text) {
        lastError = new Error(`Empty response from ${model}`);
        continue;
      }

      return {
        text,
        model: data.model || model,
        usage: data.usage,
      };
    } catch (e: any) {
      lastError = e;
      // Network/timeout errors — try next model
      if (e.name === "TimeoutError" || e.name === "AbortError") continue;
      // Rethrow auth errors immediately — no point trying other models
      if (e.message?.includes("401") || e.message?.includes("403")) throw e;
      continue;
    }
  }

  throw lastError || new Error("All models in fallback chain failed");
}

/** Check if LLM is configured (has API key) */
export function isConfigured(): boolean {
  return !!process.env.OPENROUTER_API_KEY;
}

/** Get current model config for display */
export function getConfig(): { configured: boolean; model: string; fallbacks: string[] } {
  const model = getModel();
  return {
    configured: isConfigured(),
    model,
    fallbacks: MODEL_CHAIN.filter(m => m !== model),
  };
}
