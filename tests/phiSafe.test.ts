import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
  PHI_TOKENS,
  PhiLeakError,
  applyPhiVault,
  assertNoPhiLeak,
  buildPhiReplacements,
  collectPhiValues,
  deidentifyForLlm,
  deidentifyPromptPair,
  rehydrateForDisplay,
  sanitizeToolOutputForLlm,
  serviceDateVariants,
  type PhiValues,
} from "../convex/lib/phiSafe";

const mockChatCreate = vi.fn();
const mockEmbeddingsCreate = vi.fn();

vi.mock("openai", () => ({
  default: class MockOpenAI {
    chat = { completions: { create: mockChatCreate } };
    embeddings = { create: mockEmbeddingsCreate };
  },
}));

import {
  createChatCompletion,
  createEmbedding,
  createStructuredCompletion,
} from "../convex/lib/openai";

const PHI: PhiValues = {
  patientName: "Eleanor Vance",
  memberId: "MBN9823412-01",
  groupNumber: "GRP-99214",
  claimNumber: "CLM-6104-GEO",
  serviceDate: "2026-07-04",
  patientEmail: "eleanor.vance@example.com",
  senderEmail: "advocate@example.org",
  senderPhone: "(555) 019-2834",
};

describe("phiSafe vault boundary", () => {
  it("expands service dates into ISO, US, and long-form variants", () => {
    expect(serviceDateVariants("2026-07-04")).toContain("07/04/2026");
    expect(serviceDateVariants("2026-07-04")).toContain("July 4, 2026");
    expect(serviceDateVariants("07/04/2026")).toContain("2026-07-04");
  });

  it("tokenizes every known identifier longest-first, including surname-only mentions", () => {
    const replacements = buildPhiReplacements(PHI);
    const rawOrder = replacements.map((r) => r.raw);
    expect(rawOrder[0].length).toBeGreaterThanOrEqual(rawOrder[rawOrder.length - 1].length);

    const text =
      "Patient Eleanor Vance (Vance) Member ID MBN9823412-01 Group GRP-99214 " +
      "Claim CLM-6104-GEO DOS 2026-07-04 contact eleanor.vance@example.com";
    const vaulted = applyPhiVault(text, replacements);
    expect(vaulted).not.toContain("Eleanor Vance");
    expect(vaulted).not.toContain("Vance");
    expect(vaulted).not.toContain("MBN9823412-01");
    expect(vaulted).not.toContain("GRP-99214");
    expect(vaulted).not.toContain("CLM-6104-GEO");
    expect(vaulted).not.toContain("2026-07-04");
    expect(vaulted).toContain(PHI_TOKENS.patientName);
    expect(vaulted).toContain(PHI_TOKENS.memberId);
    expect(vaulted).toContain(PHI_TOKENS.serviceDate);
  });

  it("de-identifies prompts while preserving clinical codes and amounts", () => {
    const { systemPrompt, userPrompt } = deidentifyPromptPair(
      "Appeal for Eleanor Vance SSN 123-45-6789",
      "Claim CLM-6104-GEO CPT 27447 ICD M17.11 DOS 07/04/2026 Member MBN9823412-01",
      PHI
    );
    expect(systemPrompt).not.toContain("Eleanor Vance");
    expect(systemPrompt).toContain("***-**-****");
    expect(userPrompt).not.toContain("CLM-6104-GEO");
    expect(userPrompt).not.toContain("MBN9823412-01");
    expect(userPrompt).not.toContain("07/04/2026");
    expect(userPrompt).toContain("27447");
    expect(userPrompt).toContain("M17.11");
  });

  it("fails closed when a raw vault value survives sanitization", () => {
    expect(() => assertNoPhiLeak("Patient Eleanor Vance needs review", PHI)).toThrow(PhiLeakError);
    expect(() => assertNoPhiLeak("Member MBN9823412-01 on file", PHI)).toThrow(PhiLeakError);
    expect(() => assertNoPhiLeak("DOS 2026-07-04 confirmed", PHI)).toThrow(PhiLeakError);
    expect(() =>
      assertNoPhiLeak(`Patient ${PHI_TOKENS.patientName} needs review`, PHI)
    ).not.toThrow();
  });

  it("rehydrates tokens only for trusted-boundary display and storage", () => {
    const tokenized = `Appeal for ${PHI_TOKENS.patientName} (${PHI_TOKENS.memberId}) on ${PHI_TOKENS.serviceDate}`;
    const restored = rehydrateForDisplay(tokenized, PHI);
    expect(restored).toContain("Eleanor Vance");
    expect(restored).toContain("MBN9823412-01");
    expect(restored).toContain("2026-07-04");
  });

  it("collects identifiers from joined and legacy claim shapes", () => {
    const fromJoin = collectPhiValues({
      patient: { name: "Marcus Sterling", memberId: "GEO-11", groupNumber: "G1", email: "m@x.com" },
      claimNumber: "CLM-1",
      serviceDate: "2026-01-02",
      appealContext: { sender: { name: "Dr A", email: "a@b.com", phone: "555" } },
    });
    expect(fromJoin.patientName).toBe("Marcus Sterling");
    expect(fromJoin.senderEmail).toBe("a@b.com");

    const legacy = collectPhiValues({
      patientName: "Legacy Name",
      patientMemberId: "LEG-9",
      claimNumber: "CLM-9",
      serviceDate: "2026-03-03",
    });
    expect(legacy.patientName).toBe("Legacy Name");
    expect(legacy.memberId).toBe("LEG-9");
  });

  it("sanitizes agent tool output before it reaches the model", () => {
    const out = sanitizeToolOutputForLlm(
      { patientName: "Eleanor Vance", memberId: "MBN9823412-01", cpt: "27447" },
      PHI
    );
    expect(out).not.toContain("Eleanor Vance");
    expect(out).not.toContain("MBN9823412-01");
    expect(out).toContain("27447");
  });
});

describe("openai boundary enforces the vault", () => {
  const originalEnv = process.env;
  beforeEach(() => {
    process.env = { ...originalEnv, OPENAI_API_KEY: "test-key" };
    vi.clearAllMocks();
  });
  afterEach(() => {
    process.env = originalEnv;
  });

  it("vault-tokenizes structured prompts and never egresses raw PII", async () => {
    mockChatCreate.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify({ ok: true }) } }],
    });
    await createStructuredCompletion<{ ok: boolean }>({
      systemPrompt: "Draft appeal for Eleanor Vance",
      userPrompt: "Claim CLM-6104-GEO member MBN9823412-01 DOS 2026-07-04 CPT 27447",
      schemaName: "VaultProof",
      schema: { type: "object", properties: { ok: { type: "boolean" } } },
      phiValues: PHI,
    });
    const sent = mockChatCreate.mock.calls[0][0].messages
      .map((m: { content: string }) => m.content)
      .join("\n");
    expect(sent).not.toContain("Eleanor Vance");
    expect(sent).not.toContain("Vance");
    expect(sent).not.toContain("MBN9823412-01");
    expect(sent).not.toContain("CLM-6104-GEO");
    expect(sent).not.toContain("2026-07-04");
    expect(sent).toContain(PHI_TOKENS.patientName);
    expect(sent).toContain("27447");
  });

  it("blocks the request when vault sanitization cannot remove a value", async () => {
    // Word-boundary vaulting intentionally skips identifiers fused into a
    // longer token (X...Y). The fail-closed assertion uses substring matching
    // and must still block egress before any network call.
    mockChatCreate.mockResolvedValueOnce({
      choices: [{ message: { content: "should never be reached" } }],
    });
    await expect(
      createChatCompletion({
        systemPrompt: "hello",
        userPrompt: "Fused identifier XMBN9823412-01Y must not egress",
        phiValues: { memberId: "MBN9823412-01" },
      })
    ).rejects.toThrow(/PHI safety gate/);
    expect(mockChatCreate).not.toHaveBeenCalled();
  });

  it("de-identifies embedding inputs with the vault", async () => {
    process.env.OPENAI_EMBEDDING_MODEL = "text-embedding-3-small";
    mockEmbeddingsCreate.mockResolvedValueOnce({
      data: [{ embedding: new Array(1536).fill(0.05) }],
    });
    await createEmbedding("Appeal for Eleanor Vance CLM-6104-GEO CPT 27447", [], PHI);
    const sent = mockEmbeddingsCreate.mock.calls[0][0].input as string;
    expect(sent).not.toContain("Eleanor Vance");
    expect(sent).not.toContain("CLM-6104-GEO");
    expect(sent).toContain("27447");
  });

  it("keeps deidentifyForLlm behavior for unknown PII without a vault", () => {
    const phoneOut = deidentifyForLlm("Contact patient at (555) 019-2834 today.");
    expect(phoneOut).toContain("[REDACTED PHONE]");
    expect(phoneOut).not.toContain("(555) 019-2834");
    const addressOut = deidentifyForLlm("Street Address: 742 Evergreen Blvd, Springfield");
    expect(addressOut).toContain("[REDACTED ADDRESS]");
    expect(addressOut).not.toContain("742 Evergreen Blvd");
  });

  it("redacts both phone and address in one sentence through the LLM boundary", () => {
    // End-to-end proof for the address-anchor regression: a phone fragment
    // must not swallow the address that follows it before LLM egress.
    const out = deidentifyForLlm(
      "Contact patient at (555) 019-2834 or 1234 Medical Center Blvd Suite 500."
    );
    expect(out).toContain("[REDACTED PHONE]");
    expect(out).toContain("[REDACTED ADDRESS]");
    expect(out).not.toContain("(555) 019-2834");
    expect(out).not.toContain("1234 Medical Center Blvd Suite");
  });
});
