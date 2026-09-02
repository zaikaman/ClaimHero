import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockChatCreate = vi.fn();
const mockEmbeddingsCreate = vi.fn();
const mockResponsesCreate = vi.fn();

vi.mock("openai", () => {
  return {
    default: class MockOpenAI {
      chat = {
        completions: {
          create: mockChatCreate,
        },
      };
      embeddings = {
        create: mockEmbeddingsCreate,
      };
      responses = {
        create: mockResponsesCreate,
      };
    },
  };
});

import {
  getOpenAIConfig,
  getOpenAIClient,
  createStructuredCompletion,
  createChatCompletion,
  createEmbedding,
} from "../convex/lib/openai";
import {
  buildClaimQueryText,
  buildPrecedentEmbedText,
  formatPrecedentInsertion,
  rankPrecedentHits,
  weightedTokensForCodes,
  fitDimensions,
  l2Normalize,
  EMBEDDING_DIMENSIONS,
} from "../convex/lib/embeddings";

describe("convex/lib/openai Unit Tests", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, OPENAI_API_KEY: "test-openai-key" };
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("reads configuration with defaults when API key is present", () => {
    process.env.OPENAI_API_KEY = "custom-key";
    delete process.env.OPENAI_MODEL;
    delete process.env.OPENAI_BASE_URL;

    const config = getOpenAIConfig();
    expect(config.apiKey).toBe("custom-key");
    expect(config.model).toBe("gpt-5.4-nano");
    expect(config.baseURL).toBe("https://api.openai.com/v1");

    const client = getOpenAIClient({ timeout: 5000 });
    expect(client).toBeDefined();
  });

  it("throws error when OPENAI_API_KEY is missing or empty", () => {
    delete process.env.OPENAI_API_KEY;
    expect(() => getOpenAIConfig()).toThrow("OPENAI_API_KEY is not configured");

    process.env.OPENAI_API_KEY = "   ";
    expect(() => getOpenAIConfig()).toThrow("OPENAI_API_KEY is not configured");
  });

  it("creates structured completions with JSON schema parsing", async () => {
    const mockOutput = {
      clinicalAnalysis: "Meets CPB criteria",
      overturnLikelihoodScore: 92,
    };

    mockChatCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify(mockOutput),
          },
        },
      ],
    });

    const result = await createStructuredCompletion<{ clinicalAnalysis: string; overturnLikelihoodScore: number }>({
      systemPrompt: "You are a clinical appeal auditor.",
      userPrompt: "Analyze claim for CPT 27447",
      schemaName: "ClinicalAnalysisResult",
      schema: { type: "object" },
      imageUrls: ["https://example.com/knee_xray.png"],
    });

    expect(result.clinicalAnalysis).toBe("Meets CPB criteria");
    expect(result.overturnLikelihoodScore).toBe(92);
    expect(mockChatCreate).toHaveBeenCalled();
  });

  it("creates structured completions with file inputs", async () => {
    const mockOutput = {
      parsedSummary: "Document parsed",
    };

    mockResponsesCreate.mockResolvedValueOnce({
      output_text: JSON.stringify(mockOutput),
    });

    const result = await createStructuredCompletion<{ parsedSummary: string }>({
      systemPrompt: "You are a document parser.",
      userPrompt: "Parse the attached PDF",
      schemaName: "ParsedSummary",
      schema: { type: "object" },
      fileInputs: [{ fileData: "base64data", filename: "denial.pdf" }],
    });

    expect(result.parsedSummary).toBe("Document parsed");
    expect(mockResponsesCreate).toHaveBeenCalled();
  });

  it("creates chat completions for open text or falls back to empty string", async () => {
    mockChatCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: "Drafted formal appeal text.",
          },
        },
      ],
    });

    const text = await createChatCompletion({
      systemPrompt: "You are an attorney.",
      userPrompt: "Write brief",
    });

    expect(text).toBe("Drafted formal appeal text.");

    mockChatCreate.mockResolvedValueOnce({
      choices: [],
    });

    const emptyText = await createChatCompletion({
      systemPrompt: "You are an attorney.",
      userPrompt: "Write brief",
    });
    expect(emptyText).toBe("");
  });

  it("creates embeddings via configured OpenAI embedding model", async () => {
    process.env.OPENAI_EMBEDDING_MODEL = "text-embedding-3-small";

    const mockVector = new Array(1536).fill(0.05);
    mockEmbeddingsCreate.mockResolvedValueOnce({
      data: [{ embedding: mockVector }],
    });

    const embedding = await createEmbedding("Patient clinical records and MRI findings");
    expect(embedding).toHaveLength(EMBEDDING_DIMENSIONS);
    expect(embedding[0]).toBeCloseTo(1 / Math.sqrt(1536));
  });

  it("throws error when structured completion response is empty or unparseable", async () => {
    mockChatCreate.mockResolvedValueOnce({
      choices: [{ message: { content: null } }],
    });

    await expect(
      createStructuredCompletion({
        systemPrompt: "test",
        userPrompt: "test",
        schemaName: "TestSchema",
        schema: {},
      })
    ).rejects.toThrow("OpenAI response empty for schema TestSchema");

    mockChatCreate.mockResolvedValueOnce({
      choices: [{ message: { content: "INVALID_NOT_JSON" } }],
    });

    await expect(
      createStructuredCompletion({
        systemPrompt: "test",
        userPrompt: "test",
        schemaName: "TestSchema",
        schema: {},
      })
    ).rejects.toThrow("Failed to parse structured JSON response");
  });

  it("throws error when file responses are empty or unparseable", async () => {
    mockResponsesCreate.mockResolvedValueOnce({
      output_text: null,
    });

    await expect(
      createStructuredCompletion({
        systemPrompt: "test",
        userPrompt: "test",
        schemaName: "FileSchema",
        schema: {},
        fileInputs: [{ fileData: "base64", filename: "doc.pdf" }],
      })
    ).rejects.toThrow("OpenAI response empty for schema FileSchema");

    mockResponsesCreate.mockResolvedValueOnce({
      output_text: "NOT_VALID_JSON",
    });

    await expect(
      createStructuredCompletion({
        systemPrompt: "test",
        userPrompt: "test",
        schemaName: "FileSchema",
        schema: {},
        fileInputs: [{ fileData: "base64", filename: "doc.pdf" }],
      })
    ).rejects.toThrow("Failed to parse structured JSON response");
  });

  it("throws error when embedding response is invalid or empty", async () => {
    process.env.OPENAI_EMBEDDING_MODEL = "text-embedding-3-small";
    mockEmbeddingsCreate.mockResolvedValueOnce({
      data: [{ embedding: [] }],
    });

    await expect(createEmbedding("test")).rejects.toThrow("invalid embedding vector");
  });

  it("throws error when OPENAI_EMBEDDING_MODEL is missing", async () => {
    delete process.env.OPENAI_EMBEDDING_MODEL;

    await expect(createEmbedding("test")).rejects.toThrow("OPENAI_EMBEDDING_MODEL is not configured");
  });
});

describe("convex/lib/embeddings Unit Tests", () => {
  it("builds precedent text and claim query text", () => {
    const precedentDoc = {
      sourceKind: "winning_brief" as const,
      title: "Vance v. Molina Healthcare",
      citation: "FL-DOI-2026-9812",
      icd10Codes: ["M17.11"],
      cptCodes: ["27447"],
      carcCodes: ["CO-50"],
      outcome: "overturned_in_full" as const,
      winningArgument: "Conservative therapy criteria was satisfied by 16-week physical therapy course.",
      statutoryLanguage: "ERISA 29 CFR § 2560.503-1(h)",
    };

    const embedText = buildPrecedentEmbedText(precedentDoc);
    expect(embedText).toContain("Source: winning_brief");
    expect(embedText).toContain("Vance v. Molina Healthcare");
    expect(embedText).toContain("CPT: 27447");

    const claimQuery = {
      icd10Codes: ["M17.11"],
      cptCodes: ["27447"],
      denialReasonCode: "CO-50",
      denialReasonDescription: "Not deemed medically necessary",
    };

    const queryText = buildClaimQueryText(claimQuery);
    expect(queryText).toContain("CARC: CO-50");
    expect(queryText).toContain("ERISA 29 CFR 2560.503-1");
  });

  it("extracts weighted tokens for codes and handles empty entries", () => {
    const tokens = weightedTokensForCodes(
      ["", "M17.11", "M51.26"],
      ["27447", "63047"],
      ["", "CO-50", "CO-197"]
    );

    expect(tokens).toContain("icd:m17.11");
    expect(tokens).toContain("icd:m17");
    expect(tokens).toContain("cpt:27447");
    expect(tokens).toContain("carc:co-50");

    // Empty query test for line 182
    const emptyCarcQuery = {
      icd10Codes: ["M17.11"],
      cptCodes: ["27447"],
      denialReasonCode: "",
      denialReasonDescription: "Test",
    };
    const emptyCarcRanked = rankPrecedentHits([], emptyCarcQuery);
    expect(emptyCarcRanked).toHaveLength(0);
  });


  it("ranks and deduplicates precedent hits with combined scoring", () => {
    const claimQuery = {
      icd10Codes: ["M17.11"],
      cptCodes: ["27447"],
      denialReasonCode: "CO-50",
      denialReasonDescription: "Not medically necessary",
    };

    const hits = [
      {
        _id: "hit_1" as any,
        title: "Knee Replacement Precedent",
        citation: "DOI-2026-01",
        icd10Codes: ["M17.11"],
        cptCodes: ["27447"],
        carcCodes: ["CO-50"],
        vectorScore: 0.95,
      },
      {
        _id: "hit_2" as any,
        title: "Spine Surgery Precedent",
        citation: "DOI-2026-02",
        icd10Codes: ["M51.26"],
        cptCodes: ["63047"],
        carcCodes: ["CO-197"],
        vectorScore: 0.80,
      },
      {
        _id: "hit_3" as any,
        title: "Knee Replacement Duplicate Citation",
        citation: "DOI-2026-01", // Duplicate citation to test deduplication
        icd10Codes: ["M17.11"],
        cptCodes: ["27447"],
        carcCodes: ["CO-50"],
        vectorScore: 0.90,
      },
    ];

    const ranked = rankPrecedentHits(hits, claimQuery, 2);
    expect(ranked).toHaveLength(2);
    expect(ranked[0].title).toBe("Knee Replacement Precedent");
    expect(ranked[0].combinedScore).toBeGreaterThan(ranked[1].combinedScore);
  });

  it("formats precedent insertion markdown accurately", () => {
    const formatted = formatPrecedentInsertion({
      title: "Vance v. Molina Healthcare",
      citation: "FL-DOI-2026-098",
      statutoryLanguage: "ERISA 29 CFR § 2560.503-1(h)",
      winningArgument: "Treating surgeon records substantiate functional failure of conservative modalities.",
      vectorScore: 0.92,
    });

    expect(formatted).toContain("### Controlling Precedent: Vance v. Molina Healthcare");
    expect(formatted).toContain("> ERISA 29 CFR § 2560.503-1(h)");
    expect(formatted).toContain("Citation: FL-DOI-2026-098");
  });

  it("fits dimensions and normalizes vectors properly", () => {
    const zeroVector = [0, 0, 0];
    const normalizedZero = l2Normalize(zeroVector);
    expect(normalizedZero[0]).toBe(1);

    const normalVector = [3, 4];
    const normalized = l2Normalize(normalVector);
    expect(normalized[0]).toBeCloseTo(0.6);
    expect(normalized[1]).toBeCloseTo(0.8);

    const fitted = fitDimensions([1, 2, 3], 5);
    expect(fitted).toHaveLength(5);

    const oversized = new Array(2000).fill(1);
    const sliced = fitDimensions(oversized, 1536);
    expect(sliced).toHaveLength(1536);
  });
});
