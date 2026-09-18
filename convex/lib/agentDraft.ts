import { Agent, createThread } from "@convex-dev/agent";
import type { ActionCtx } from "../_generated/server";
import { components } from "../_generated/api";
import { getAgentLanguageModel } from "./agentModel";
import {
  STRUCTURED_RETRY_INSTRUCTION,
  buildStructuredOutputSystemPrompt,
  getOpenAIConfig,
  isStructuredOutputProtocolError,
  parseStructuredOutput,
} from "./openai";
import { deidentifyPromptPair, type PhiValues } from "./phiSafe";

/**
 * Hard ceiling on semantic retries for long-form structured drafting. Mirrors
 * the direct-SDK helper in `lib/openai.ts`: malformed output is retried with an
 * explicit corrective instruction and never persisted or displayed.
 */
const MAX_DRAFT_ATTEMPTS = 3;

/** Word-level deltas keep the Studio preview readable while the model writes. */
const DRAFT_STREAM_OPTIONS = { chunking: "word" as const, throttleMs: 120 };

export interface StreamedStructuredDraftOptions {
  ctx: ActionCtx;
  /** Thread owner for component-level authorization and message attribution. */
  userId?: string;
  /**
   * Reuse an existing thread when the client pre-created one so the Studio can
   * subscribe to live deltas before generation starts. A thread is created
   * automatically when omitted (background workflows, durable pipeline).
   */
  threadId?: string;
  threadTitle: string;
  systemPrompt: string;
  userPrompt: string;
  schemaName: string;
  schema: Record<string, unknown>;
  /**
   * Known direct identifiers for the centralized PHI-safe boundary. The helper
   * vault-tokenizes these before the regex gate and fails closed on leak.
   */
  phiValues?: PhiValues;
}

export interface StreamedStructuredDraft<T> {
  result: T;
  /**
   * The thread the generation ran in. When the caller supplied a thread id this
   * thread is still live for its subscribers; when the helper created one for a
   * background caller it is deleted before returning.
   */
  threadId: string;
  attempts: number;
}

/**
 * Generate long-form structured content through the `@convex-dev/agent`
 * component instead of calling the provider SDK directly.
 *
 * When the caller supplies a thread, every attempt streams into it with
 * `saveStreamDeltas` so subscribers receive token deltas while the model is
 * still writing. When it does not, the thread is a throwaway: no deltas are
 * written and the thread is deleted before returning, so background drafting
 * never accumulates component data. Either way the message history belongs to
 * the agent component rather than to an application-side message table.
 */
export async function streamStructuredDraft<T>(
  options: StreamedStructuredDraftOptions
): Promise<StreamedStructuredDraft<T>> {
  const { model } = getOpenAIConfig();
  const { systemPrompt: safeSystem, userPrompt: safeUser } = deidentifyPromptPair(
    options.systemPrompt,
    options.userPrompt,
    options.phiValues
  );
  const instructions = buildStructuredOutputSystemPrompt(
    safeSystem,
    options.schemaName,
    options.schema
  );
  const basePrompt = safeUser;

  const agent = new Agent(components.agent, {
    name: options.schemaName,
    languageModel: getAgentLanguageModel(),
    instructions,
  });

  // A caller-supplied thread means a Studio is watching, so deltas are worth
  // persisting. A background caller has no subscriber: the thread is created
  // only because the component needs one, and it is discarded afterwards.
  const isWatched = options.threadId !== undefined;
  const threadId =
    options.threadId ??
    (await createThread(options.ctx, components.agent, {
      userId: options.userId,
      title: options.threadTitle,
    }));

  let lastError: unknown;

  try {
    for (let attempt = 0; attempt < MAX_DRAFT_ATTEMPTS; attempt += 1) {
      try {
        const stream = await agent.streamText(
          options.ctx,
          { threadId, userId: options.userId },
          {
            prompt:
              attempt === 0 ? basePrompt : `${basePrompt}${STRUCTURED_RETRY_INSTRUCTION}`,
          },
          isWatched ? { saveStreamDeltas: DRAFT_STREAM_OPTIONS } : undefined
        );

        const text = await stream.text;
        return {
          result: parseStructuredOutput<T>(text, model, options.schemaName, options.schema),
          threadId,
          attempts: attempt + 1,
        };
      } catch (error) {
        lastError = error;
        if (
          !isStructuredOutputProtocolError(error) ||
          attempt === MAX_DRAFT_ATTEMPTS - 1
        ) {
          throw error;
        }
        console.warn(
          `Structured draft attempt ${attempt + 1}/${MAX_DRAFT_ATTEMPTS} failed for ${options.schemaName}; retrying without logging model content.`
        );
      }
    }

    throw lastError;
  } finally {
    if (!isWatched) {
      await agent.deleteThreadAsync(options.ctx, { threadId });
    }
  }
}
