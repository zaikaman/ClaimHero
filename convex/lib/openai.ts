import OpenAI from "openai";
import {
  EMBEDDING_DIMENSIONS,
  fitDimensions,
} from "./embeddings";
import { redactBeforeLLM } from "./redactionEngine";

/**
 * Singleton OpenAI Client Instance
 * Configured via 3 standard environment variables:
 * - OPENAI_API_KEY: Authentication key
 * - OPENAI_MODEL: Active model (defaults to gpt-5.4-nano)
 * - OPENAI_BASE_URL: Custom endpoint/proxy (defaults to https://api.openai.com/v1)
 */

export function getOpenAIConfig() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is not configured. Please set the OPENAI_API_KEY environment variable."
    );
  }
  const model = process.env.OPENAI_MODEL || "gpt-5.4-nano";
  const baseURL = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";

  return { apiKey, model, baseURL };
}

export function getOpenAIClient(options: { timeout?: number; maxRetries?: number } = {}): OpenAI {
  const { apiKey, baseURL } = getOpenAIConfig();
  return new OpenAI({
    apiKey,
    baseURL,
    ...options,
  });
}

const DEFAULT_STRUCTURED_RETRIES = 2;
const STRUCTURED_RETRY_DELAY_MS = 250;

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function extractBalancedJsonCandidates(content: string): string[] {
  const candidates: string[] = [];

  for (let start = 0; start < content.length; start += 1) {
    if (content[start] !== "{" && content[start] !== "[") continue;

    const opening = content[start];
    const closing = opening === "{" ? "}" : "]";
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = start; index < content.length; index += 1) {
      const character = content[index];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (character === "\\") {
          escaped = true;
        } else if (character === '"') {
          inString = false;
        }
        continue;
      }

      if (character === '"') {
        inString = true;
      } else if (character === opening) {
        depth += 1;
      } else if (character === closing) {
        depth -= 1;
        if (depth === 0) {
          candidates.push(content.slice(start, index + 1));
          break;
        }
      }
    }
  }

  return candidates;
}

function hasRequiredStructuredFields(value: unknown, schema: Record<string, unknown>): boolean {
  if (schema.type !== "object" || !Array.isArray(schema.required)) return true;
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;

  return (schema.required as unknown[]).every(
    (field) => typeof field === "string" && Object.prototype.hasOwnProperty.call(value, field)
  );
}

function parseStructuredContent<T>(content: string, model: string, schemaName: string, schema: Record<string, unknown>): T {
  const trimmed = content.trim();
  const candidates = [trimmed, ...extractBalancedJsonCandidates(trimmed)];
  let lastError = "No valid JSON value was found";

  for (const candidate of candidates) {
    if (!candidate) continue;

    try {
      const parsed: unknown = JSON.parse(candidate);
      if (!hasRequiredStructuredFields(parsed, schema)) {
        lastError = "The JSON value is missing one or more required schema fields";
        continue;
      }
      return parsed as T;
    } catch (error) {
      lastError = String(error);
    }
  }

  throw new Error(
    `Failed to parse structured JSON response from model ${model} for schema ${schemaName}: ${lastError}`
  );
}

function isStructuredOutputProtocolError(error: unknown): boolean {
  return error instanceof Error && /Failed to parse structured JSON response|response empty for schema/i.test(error.message);
}

async function createStructuredCompletionAttempt<T>(options: {
  client: OpenAI;
  model: string;
  userPrompt: string;
  systemPrompt: string;
  schemaName: string;
  schema: Record<string, unknown>;
  imageUrls?: string[];
  fileInputs?: Array<{ fileData: string; filename: string }>;
  temperature?: number;
}): Promise<T> {
  if (options.fileInputs && options.fileInputs.length > 0) {
    const content = [
      { type: "input_text" as const, text: options.userPrompt },
      ...options.fileInputs.map((file) => ({
        type: "input_file" as const,
        file_data: file.fileData,
        filename: file.filename,
      })),
    ];
    const response = await options.client.responses.create({
      model: options.model as OpenAI.Responses.ResponseCreateParams["model"],
      instructions: options.systemPrompt,
      input: [{ role: "user", content }],
      text: {
        format: {
          type: "json_schema",
          name: options.schemaName,
          strict: true,
          schema: options.schema,
        },
      },
    });
    const messageContent = response.output_text;
    if (!messageContent) throw new Error(`OpenAI response empty for schema ${options.schemaName}`);
    return parseStructuredContent<T>(messageContent, options.model, options.schemaName, options.schema);
  }

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: options.systemPrompt },
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

    messages.push({ role: "user", content: contentParts });
  } else {
    messages.push({ role: "user", content: options.userPrompt });
  }

  const response = await options.client.chat.completions.create({
    model: options.model,
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
  if (!messageContent) throw new Error(`OpenAI response empty for schema ${options.schemaName}`);
  return parseStructuredContent<T>(messageContent, options.model, options.schemaName, options.schema);
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
  fileInputs?: Array<{ fileData: string; filename: string }>;
  temperature?: number;
  /** Number of additional attempts for malformed or empty structured output. */
  structuredRetries?: number;
}): Promise<T> {
  const { model } = getOpenAIConfig();
  const client = getOpenAIClient({ timeout: 30_000, maxRetries: 2 });
  const safeUserPrompt = redactBeforeLLM(options.userPrompt);

  const retries = Math.max(0, Math.min(options.structuredRetries ?? DEFAULT_STRUCTURED_RETRIES, 4));
  const attempts = retries + 1;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const retryInstruction = attempt === 0
      ? ""
      : "\n\nThe previous response did not satisfy the structured-output contract. Return only one valid JSON object matching the supplied schema. Do not return YAML, `key: value` lines, Markdown, a subject line, a preamble, or a second document. Do not omit required fields.";

    try {
      return await createStructuredCompletionAttempt<T>({
        client,
        model,
        userPrompt: `${safeUserPrompt}${retryInstruction}`,
        systemPrompt: options.systemPrompt,
        schemaName: options.schemaName,
        schema: options.schema,
        imageUrls: options.imageUrls,
        fileInputs: options.fileInputs,
        temperature: options.temperature,
      });
    } catch (error) {
      if (!isStructuredOutputProtocolError(error) || attempt === attempts - 1) throw error;

      console.warn(
        `Structured output attempt ${attempt + 1}/${attempts} failed for ${options.schemaName}; retrying without logging model content.`
      );
      await sleep(STRUCTURED_RETRY_DELAY_MS * 2 ** attempt);
    }
  }

  throw new Error(`Structured output failed for schema ${options.schemaName}`);
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
  const client = getOpenAIClient({ timeout: 30_000, maxRetries: 2 });
  const safeUserPrompt = redactBeforeLLM(options.userPrompt);

  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: options.systemPrompt },
      { role: "user", content: safeUserPrompt },
    ],
    temperature: options.temperature ?? 0.3,
  });

  return response.choices[0]?.message?.content || "";
}

/**
 * Produce a 1536-d embedding via OpenAI embeddings API.
 * Requires OPENAI_EMBEDDING_MODEL environment variable to be explicitly configured.
 * Fails hard without fallback if unset or if the API call fails.
 */
export async function createEmbedding(
  text: string,
  _extraWeightedTokens: string[] = []
): Promise<number[]> {
  const input = text.slice(0, 8000);
  const embeddingModel = process.env.OPENAI_EMBEDDING_MODEL?.trim();

  if (!embeddingModel) {
    throw new Error(
      "OPENAI_EMBEDDING_MODEL is not configured. Vector embedding operations require OPENAI_EMBEDDING_MODEL (e.g. text-embedding-3-small) to be set in environment variables."
    );
  }

  const client = getOpenAIClient({ timeout: 10_000, maxRetries: 2 });
  const response = await client.embeddings.create({
    model: embeddingModel,
    input,
  });

  const embedding = response.data[0]?.embedding;
  if (!Array.isArray(embedding) || embedding.length === 0) {
    throw new Error(
      `OpenAI embeddings API returned an empty or invalid embedding vector for model ${embeddingModel}.`
    );
  }

  return fitDimensions(embedding, EMBEDDING_DIMENSIONS);
}
