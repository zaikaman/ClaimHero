import OpenAI from "openai";

/**
 * Singleton OpenAI Client Instance
 * Configured via 3 standard environment variables:
 * - OPENAI_API_KEY: Authentication key
 * - OPENAI_MODEL: Active model (defaults to gpt-5-nano)
 * - OPENAI_BASE_URL: Custom endpoint/proxy (defaults to https://api.openai.com/v1)
 */

export function getOpenAIConfig() {
  const apiKey = process.env.OPENAI_API_KEY || "sk-placeholder-key";
  const model = process.env.OPENAI_MODEL || "gpt-5-nano";
  const baseURL = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";

  return { apiKey, model, baseURL };
}

export function getOpenAIClient(): OpenAI {
  const { apiKey, baseURL } = getOpenAIConfig();
  return new OpenAI({
    apiKey,
    baseURL,
  });
}

/**
 * Execute a structured output completion with JSON schema validation
 */
export async function createStructuredCompletion<T>(options: {
  systemPrompt: string;
  userPrompt: string;
  schemaName: string;
  schema: Record<string, unknown>;
  imageUrls?: string[];
  temperature?: number;
}): Promise<T> {
  const { model } = getOpenAIConfig();
  const client = getOpenAIClient();

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: options.systemPrompt,
    },
  ];

  if (options.imageUrls && options.imageUrls.length > 0) {
    const contentParts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
      { type: "text", text: options.userPrompt },
    ];

    for (const url of options.imageUrls) {
      contentParts.push({
        type: "image_url",
        image_url: { url, detail: "high" },
      });
    }

    messages.push({
      role: "user",
      content: contentParts,
    });
  } else {
    messages.push({
      role: "user",
      content: options.userPrompt,
    });
  }

  const response = await client.chat.completions.create({
    model,
    messages,
    temperature: options.temperature ?? 0.2,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: options.schemaName,
        strict: true,
        schema: options.schema,
      },
    },
  });

  const messageContent = response.choices[0]?.message?.content;
  if (!messageContent) {
    throw new Error(`OpenAI response empty for schema ${options.schemaName}`);
  }

  try {
    return JSON.parse(messageContent) as T;
  } catch (error) {
    throw new Error(
      `Failed to parse structured JSON response from model ${model}: ${String(error)}\nRaw Content: ${messageContent}`
    );
  }
}

/**
 * Standard text completion for open-ended clinical brief drafting
 */
export async function createChatCompletion(options: {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
}): Promise<string> {
  const { model } = getOpenAIConfig();
  const client = getOpenAIClient();

  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: options.systemPrompt },
      { role: "user", content: options.userPrompt },
    ],
    temperature: options.temperature ?? 0.3,
  });

  return response.choices[0]?.message?.content || "";
}
