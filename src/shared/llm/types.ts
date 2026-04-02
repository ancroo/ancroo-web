/** Common types for direct LLM API calls. */

export interface LLMRequest {
  model: string;
  user_prompt: string;
  system_prompt?: string;
  max_tokens?: number;
  temperature?: number;
  /** AbortSignal for timeout/cancellation. */
  signal?: AbortSignal;
}

export interface LLMResponse {
  text: string;
  model: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
  };
}
