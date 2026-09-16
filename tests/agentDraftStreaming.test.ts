import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const agentMocks = vi.hoisted(() => ({
  streamText: vi.fn(),
  createThread: vi.fn(),
  deleteThreadAsync: vi.fn(),
}));

vi.mock("@convex-dev/agent", () => ({
  createThread: agentMocks.createThread,
  Agent: class MockAgent {
    streamText(...args: unknown[]) {
      return agentMocks.streamText(...args);
    }
    deleteThreadAsync(...args: unknown[]) {
      return agentMocks.deleteThreadAsync(...args);
    }
  },
}));

import { streamStructuredDraft } from "../convex/lib/agentDraft";
import { redactBeforeLLM } from "../convex/lib/redactionEngine";

const SCHEMA = {
  type: "object",
  properties: {
    executiveSummary: { type: "string" },
    medicalNecessityArguments: { type: "string" },
  },
  required: ["executiveSummary", "medicalNecessityArguments"],
  additionalProperties: false,
};

const VALID_OUTPUT = JSON.stringify({
  executiveSummary: "Level 1 internal appeal for decompressive laminectomy.",
  medicalNecessityArguments: "Twelve weeks of failed conservative care is documented.",
});

function streamReturning(text: string) {
  return { text: Promise.resolve(text) };
}

describe("convex/lib/agentDraft: streamed structured drafting", () => {
  const originalKey = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENAI_API_KEY = "sk-mock-test-key-for-draft-verification";
    agentMocks.createThread.mockResolvedValue("thread_created");
    agentMocks.deleteThreadAsync.mockResolvedValue(undefined);
    agentMocks.streamText.mockResolvedValue(streamReturning(VALID_OUTPUT));
  });

  afterEach(() => {
    if (originalKey) {
      process.env.OPENAI_API_KEY = originalKey;
    } else {
      delete process.env.OPENAI_API_KEY;
    }
  });

  it("streams into a watched thread with durable deltas and returns parsed output", async () => {
    const res = await streamStructuredDraft<Record<string, string>>({
      ctx: {} as never,
      userId: "user_1",
      threadId: "thread_from_studio",
      threadTitle: "Appeal brief drafting - CLM-1",
      systemPrompt: "Draft the email body.",
      userPrompt: "Case details for member 847291.",
      schemaName: "AppealBriefSynthesisResult",
      schema: SCHEMA,
    });

    expect(res.threadId).toBe("thread_from_studio");
    expect(res.attempts).toBe(1);
    expect(res.result.executiveSummary).toContain("Level 1 internal appeal");

    const [, threadOpts, args, options] = agentMocks.streamText.mock.calls[0];
    expect(threadOpts).toEqual({ threadId: "thread_from_studio", userId: "user_1" });
    // Deltas must be persisted so subscribers can render tokens live
    expect(options).toEqual({ saveStreamDeltas: { chunking: "word", throttleMs: 120 } });
    // Prompts are de-identified before they leave the deployment
    expect(args.prompt).toBe(redactBeforeLLM("Case details for member 847291."));
    // A watched thread belongs to the caller and must survive the run
    expect(agentMocks.deleteThreadAsync).not.toHaveBeenCalled();
  });

  it("keeps a background generation ephemeral: creates, does not stream, then deletes", async () => {
    const res = await streamStructuredDraft<Record<string, string>>({
      ctx: {} as never,
      userId: "user_1",
      threadTitle: "Appeal brief drafting - CLM-1",
      systemPrompt: "Draft the email body.",
      userPrompt: "Case details.",
      schemaName: "AppealBriefSynthesisResult",
      schema: SCHEMA,
    });

    expect(res.threadId).toBe("thread_created");
    expect(agentMocks.createThread).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ userId: "user_1" })
    );
    // Nobody is subscribed, so no deltas are written...
    expect(agentMocks.streamText.mock.calls[0][3]).toBeUndefined();
    // ...and the throwaway thread is cleaned up instead of accumulating
    expect(agentMocks.deleteThreadAsync).toHaveBeenCalledWith(expect.anything(), {
      threadId: "thread_created",
    });
  });

  it("cleans up the throwaway thread even when generation fails", async () => {
    agentMocks.streamText.mockRejectedValue(new Error("Invalid API key provided"));

    await expect(
      streamStructuredDraft({
        ctx: {} as never,
        threadTitle: "Appeal brief drafting",
        systemPrompt: "Draft the email body.",
        userPrompt: "Case details.",
        schemaName: "AppealBriefSynthesisResult",
        schema: SCHEMA,
      })
    ).rejects.toThrow("Invalid API key provided");

    expect(agentMocks.deleteThreadAsync).toHaveBeenCalledWith(expect.anything(), {
      threadId: "thread_created",
    });
  });

  it("retries prose output with a corrective instruction and reports the attempt count", async () => {
    agentMocks.streamText
      .mockResolvedValueOnce(streamReturning("Sure! Here is the appeal letter you asked for."))
      .mockResolvedValueOnce(streamReturning(VALID_OUTPUT));

    const res = await streamStructuredDraft<Record<string, string>>({
      ctx: {} as never,
      threadTitle: "Appeal brief drafting",
      systemPrompt: "Draft the email body.",
      userPrompt: "Case details.",
      schemaName: "AppealBriefSynthesisResult",
      schema: SCHEMA,
    });

    expect(res.attempts).toBe(2);
    expect(agentMocks.streamText).toHaveBeenCalledTimes(2);

    const firstPrompt = agentMocks.streamText.mock.calls[0][2].prompt as string;
    const retryPrompt = agentMocks.streamText.mock.calls[1][2].prompt as string;
    expect(retryPrompt.startsWith(firstPrompt)).toBe(true);
    expect(retryPrompt).toContain("structured-output contract");
  });

  it("stops after three attempts and never returns unparsed model content", async () => {
    agentMocks.streamText.mockResolvedValue(streamReturning("not json at all"));

    await expect(
      streamStructuredDraft({
        ctx: {} as never,
        threadTitle: "Appeal brief drafting",
        systemPrompt: "Draft the email body.",
        userPrompt: "Case details.",
        schemaName: "AppealBriefSynthesisResult",
        schema: SCHEMA,
      })
    ).rejects.toThrow(/Failed to parse structured JSON response/);

    expect(agentMocks.streamText).toHaveBeenCalledTimes(3);
  });

  it("rethrows non-protocol failures immediately without retrying", async () => {
    agentMocks.streamText.mockRejectedValue(new Error("Invalid API key provided"));

    await expect(
      streamStructuredDraft({
        ctx: {} as never,
        threadTitle: "Appeal brief drafting",
        systemPrompt: "Draft the email body.",
        userPrompt: "Case details.",
        schemaName: "AppealBriefSynthesisResult",
        schema: SCHEMA,
      })
    ).rejects.toThrow("Invalid API key provided");

    expect(agentMocks.streamText).toHaveBeenCalledTimes(1);
  });

  it("rejects when required schema fields are missing from otherwise valid JSON", async () => {
    agentMocks.streamText.mockResolvedValue(
      streamReturning(JSON.stringify({ executiveSummary: "Only one field" }))
    );

    await expect(
      streamStructuredDraft({
        ctx: {} as never,
        threadTitle: "Appeal brief drafting",
        systemPrompt: "Draft the email body.",
        userPrompt: "Case details.",
        schemaName: "AppealBriefSynthesisResult",
        schema: SCHEMA,
      })
    ).rejects.toThrow(/Failed to parse structured JSON response/);
  });
});
