import { createOpenAI } from "@ai-sdk/openai";
import { getOpenAIConfig } from "./openai";

/**
 * Build the AI SDK language model used by every `@convex-dev/agent` call.
 *
 * The agent component executes the model itself (streaming, tool calls, durable
 * message storage), so the provider config is resolved once here instead of the
 * app calling the OpenAI SDK directly.
 */
export function getAgentLanguageModel() {
  const { apiKey, model, baseURL } = getOpenAIConfig();
  const openai = createOpenAI({
    apiKey,
    baseURL: baseURL || undefined,
  });
  return openai(model);
}
