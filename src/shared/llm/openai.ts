/** Adapter for OpenAI Chat Completions API (also used by OpenAI-compatible providers). */

import type { LLMProviderConfig } from "../settings";
import type { LLMRequest, LLMResponse } from "./types";

const DEFAULT_BASE_URL = "https://api.openai.com";

export async function callOpenAI(
  provider: LLMProviderConfig,
  request: LLMRequest,
): Promise<LLMResponse> {
  const baseUrl = (provider.base_url || DEFAULT_BASE_URL).replace(/\/+$/, "");
  const url = `${baseUrl}/v1/chat/completions`;

  const messages: { role: string; content: string }[] = [];
  if (request.system_prompt) {
    messages.push({ role: "system", content: request.system_prompt });
  }
  messages.push({ role: "user", content: request.user_prompt });

  const body: Record<string, unknown> = {
    model: request.model,
    messages,
  };
  if (request.max_tokens != null) body.max_tokens = request.max_tokens;
  if (request.temperature != null) body.temperature = request.temperature;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (provider.api_key && provider.api_key !== "ollama") {
    headers.Authorization = `Bearer ${provider.api_key}`;
  }

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: request.signal,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI API error ${res.status}: ${text}`);
  }

  const data = await res.json();
  return {
    text: data.choices?.[0]?.message?.content ?? "",
    model: data.model ?? request.model,
    usage: data.usage
      ? {
          prompt_tokens: data.usage.prompt_tokens ?? 0,
          completion_tokens: data.usage.completion_tokens ?? 0,
        }
      : undefined,
  };
}
