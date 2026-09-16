import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  isTextractConfigured,
  parseTextractBlocks,
  extractPatientIdentifiers,
  extractDocumentWithTextract,
  getTextractClient,
} from "../convex/lib/textract";
import type { Block } from "@aws-sdk/client-textract";
import { getAuthUserId } from "@convex-dev/auth/server";

vi.mock("@convex-dev/auth/server", () => ({
  getAuthUserId: vi.fn(),
}));

describe("AWS Textract Integration & HIPAA Optical Parser", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("isTextractConfigured", () => {
    it("returns true when AWS credentials are fully configured", () => {
      process.env.AWS_ACCESS_KEY_ID = "AKIA_MOCK_KEY";
      process.env.AWS_SECRET_ACCESS_KEY = "SECRET_MOCK_KEY";
      expect(isTextractConfigured()).toBe(true);
    });

    it("returns false when credentials are missing", () => {
      delete process.env.AWS_ACCESS_KEY_ID;
      delete process.env.AWS_SECRET_ACCESS_KEY;
      expect(isTextractConfigured()).toBe(false);
    });

    it("returns false when only access key is set", () => {
      process.env.AWS_ACCESS_KEY_ID = "AKIA_MOCK_KEY";
      delete process.env.AWS_SECRET_ACCESS_KEY;
      expect(isTextractConfigured()).toBe(false);
    });
  });

  describe("getTextractClient", () => {
    it("throws a descriptive error when credentials are not configured", () => {
      delete process.env.AWS_ACCESS_KEY_ID;
      delete process.env.AWS_SECRET_ACCESS_KEY;
      expect(() => getTextractClient()).toThrow(/AWS Textract credentials not configured/);
    });

    it("creates client successfully with custom options", () => {
      const client = getTextractClient({
        region: "us-west-2",
        accessKeyId: "KEY123",
        secretAccessKey: "SECRET123",
      });
      expect(client).toBeDefined();
    });
  });

  describe("parseTextractBlocks", () => {
    it("correctly extracts linearized text, key-value pairs, and tables", () => {
      const mockBlocks: Block[] = [
        // Lines
        { Id: "l1", BlockType: "LINE", Text: "EXPLANATION OF BENEFITS" },
        { Id: "l2", BlockType: "LINE", Text: "Aetna Health Insurance" },
        // Words for key-value
        { Id: "w_k1", BlockType: "WORD", Text: "Patient Name:" },
        { Id: "w_v1", BlockType: "WORD", Text: "Marcus Sterling" },
        { Id: "w_k2", BlockType: "WORD", Text: "Member ID:" },
        { Id: "w_v2", BlockType: "WORD", Text: "GEO-554210" },
        // Key-Value Sets
        {
          Id: "kv_k1",
          BlockType: "KEY_VALUE_SET",
          EntityTypes: ["KEY"],
          Relationships: [
            { Type: "CHILD", Ids: ["w_k1"] },
            { Type: "VALUE", Ids: ["kv_v1"] },
          ],
        },
        {
          Id: "kv_v1",
          BlockType: "KEY_VALUE_SET",
          EntityTypes: ["VALUE"],
          Relationships: [{ Type: "CHILD", Ids: ["w_v1"] }],
        },
        {
          Id: "kv_k2",
          BlockType: "KEY_VALUE_SET",
          EntityTypes: ["KEY"],
          Relationships: [
            { Type: "CHILD", Ids: ["w_k2"] },
            { Type: "VALUE", Ids: ["kv_v2"] },
          ],
        },
        {
          Id: "kv_v2",
          BlockType: "KEY_VALUE_SET",
          EntityTypes: ["VALUE"],
          Relationships: [{ Type: "CHILD", Ids: ["w_v2"] }],
        },
        // Table with 2 rows, 2 cols
        {
          Id: "tbl_1",
          BlockType: "TABLE",
          Relationships: [{ Type: "CHILD", Ids: ["cell_00", "cell_01", "cell_10", "cell_11"] }],
        },
        {
          Id: "cell_00",
          BlockType: "CELL",
          RowIndex: 1,
          ColumnIndex: 1,
          Relationships: [{ Type: "CHILD", Ids: ["w_c00"] }],
        },
        { Id: "w_c00", BlockType: "WORD", Text: "Code" },
        {
          Id: "cell_01",
          BlockType: "CELL",
          RowIndex: 1,
          ColumnIndex: 2,
          Relationships: [{ Type: "CHILD", Ids: ["w_c01"] }],
        },
        { Id: "w_c01", BlockType: "WORD", Text: "Billed" },
        {
          Id: "cell_10",
          BlockType: "CELL",
          RowIndex: 2,
          ColumnIndex: 1,
          Relationships: [{ Type: "CHILD", Ids: ["w_c10"] }],
        },
        { Id: "w_c10", BlockType: "WORD", Text: "27447" },
        {
          Id: "cell_11",
          BlockType: "CELL",
          RowIndex: 2,
          ColumnIndex: 2,
          Relationships: [{ Type: "CHILD", Ids: ["w_c11"] }],
        },
        { Id: "w_c11", BlockType: "WORD", Text: "$24,500.00" },
      ];

      const parsed = parseTextractBlocks(mockBlocks);

      expect(parsed.fullText).toContain("EXPLANATION OF BENEFITS\nAetna Health Insurance");
      expect(parsed.keyValues["Patient Name:"]).toBe("Marcus Sterling");
      expect(parsed.keyValues["Member ID:"]).toBe("GEO-554210");
      expect(parsed.tables).toHaveLength(1);
      expect(parsed.tables[0]).toEqual([
        ["Code", "Billed"],
        ["27447", "$24,500.00"],
      ]);
    });
  });

  describe("extractPatientIdentifiers", () => {
    it("extracts all core identifiers from structured keyValues", () => {
      const keyValues = {
        "Patient Name": "Eleanor Vance",
        "Member ID": "MEM-889922-01",
        "Claim Number": "CLM-2026-990",
        "Date of Service": "02/15/2026",
        "Servicing Provider": "Dr. Ronald Sterling, MD",
        "Denied Amount": "$14,250.00",
        "Patient Responsibility": "$2,500.00",
        "Health Plan": "Aetna Choice POS II",
        "Appeals Department": "appeals@aetna.com",
      };
      const fullText = "Some arbitrary text";

      const identifiers = extractPatientIdentifiers(keyValues, fullText);

      expect(identifiers.patientName).toBe("Eleanor Vance");
      expect(identifiers.memberId).toBe("MEM-889922-01");
      expect(identifiers.claimNumber).toBe("CLM-2026-990");
      expect(identifiers.serviceDate).toBe("02/15/2026");
      expect(identifiers.providerName).toBe("Dr. Ronald Sterling, MD");
      expect(identifiers.deniedAmount).toBe(14250);
      expect(identifiers.patientOwedAmount).toBe(2500);
      expect(identifiers.insurancePayer).toBe("Aetna Choice POS II");
      expect(identifiers.payerAppealsEmail).toBe("appeals@aetna.com");
    });

    it("falls back to fullText regex when key-value pairs are absent", () => {
      const keyValues = {};
      const fullText = `
        EXPLANATION OF BENEFITS
        Patient Name: Robert Langdon
        Member ID: BLU-7721-00
        Claim #: CLM-99120
        Date of Service: 01/20/2026
        Direct inquiries to: grievances@bcbs.com
      `;

      const identifiers = extractPatientIdentifiers(keyValues, fullText);

      expect(identifiers.patientName).toBe("Robert Langdon");
      expect(identifiers.memberId).toBe("BLU-7721-00");
      expect(identifiers.claimNumber).toBe("CLM-99120");
      expect(identifiers.serviceDate).toBe("01/20/2026");
      expect(identifiers.payerAppealsEmail).toBe("grievances@bcbs.com");
    });
  });

  describe("extractDocumentWithTextract", () => {
    it("successfully sends document bytes and parses response", async () => {
      process.env.AWS_ACCESS_KEY_ID = "MOCK_KEY";
      process.env.AWS_SECRET_ACCESS_KEY = "MOCK_SECRET";

      const mockBlocks: Block[] = [
        { Id: "l1", BlockType: "LINE", Text: "Adverse Determination Notice" },
        { Id: "w1", BlockType: "WORD", Text: "Patient:" },
        { Id: "w2", BlockType: "WORD", Text: "Jane Doe" },
        {
          Id: "k1",
          BlockType: "KEY_VALUE_SET",
          EntityTypes: ["KEY"],
          Relationships: [
            { Type: "CHILD", Ids: ["w1"] },
            { Type: "VALUE", Ids: ["v1"] },
          ],
        },
        {
          Id: "v1",
          BlockType: "KEY_VALUE_SET",
          EntityTypes: ["VALUE"],
          Relationships: [{ Type: "CHILD", Ids: ["w2"] }],
        },
      ];

      // Spy on client send method
      const fakeBuffer = Buffer.from("fake-pdf-content");
      const textractModule = await import("@aws-sdk/client-textract");
      vi.spyOn(textractModule.TextractClient.prototype, "send").mockResolvedValue({
        Blocks: mockBlocks,
      } as any);

      const result = await extractDocumentWithTextract(fakeBuffer);

      expect(result.fullText).toBe("Adverse Determination Notice");
      expect(result.patientName).toBe("Jane Doe");
    });
  });

  describe("opticalParser end-to-end with Textract", () => {
    it("de-identifies text before OpenAI and re-hydrates authentic patient identifiers from Textract", async () => {
      process.env.AWS_ACCESS_KEY_ID = "MOCK_KEY";
      process.env.AWS_SECRET_ACCESS_KEY = "MOCK_SECRET";

      const actionOpticalParser = await import("../convex/actions/opticalParser");
      const libOpenAI = await import("../convex/lib/openai");
      const libTextract = await import("../convex/lib/textract");
      const { rateLimiter } = await import("../convex/lib/rateLimiter");

      vi.spyOn(rateLimiter, "limit").mockResolvedValue({ ok: true } as any);

      // Mock Textract extraction
      vi.spyOn(libTextract, "extractDocumentWithTextract").mockResolvedValue({
        fullText: "Aetna Adverse Determination Notice. Patient: Marcus Sterling. Member ID: GEO-554210. CPT: 27447. Denied: $24,500.",
        keyValues: {
          "Patient Name": "Marcus Sterling",
          "Member ID": "GEO-554210",
          "Claim Number": "CLM-88219",
          "Denied Amount": "$24,500.00",
        },
        tables: [[["Code", "Amount"], ["27447", "$24,500.00"]]],
        patientName: "Marcus Sterling",
        memberId: "GEO-554210",
        claimNumber: "CLM-88219",
        deniedAmount: 24500,
      });

      let capturedCompletionOptions: any = null;
      vi.spyOn(libOpenAI, "createStructuredCompletion").mockImplementation(async (opts: any) => {
        capturedCompletionOptions = opts;
        return {
          isMedicalClaimDenial: true,
          documentClassificationReason: "Valid claim denial letter.",
          claimNumber: "",
          patientName: "[PATIENT_NAME_REDACTED]",
          memberId: "[MEMBER_ID_REDACTED]",
          insurancePayer: "Aetna",
          serviceDate: "2026-02-15",
          providerName: "Dr. Ronald Sterling",
          deniedAmount: 24500,
          patientOwedAmount: 24500,
          cptCodes: ["27447"],
          icd10Codes: ["M17.11"],
          denialReasonCode: "CO-50",
          denialReasonDescription: "Not medically necessary per CPB 0288",
          appealFilingDeadlineDays: 180,
          payerAppealsEmail: "appeals@aetna.com",
          payerAppealsAddress: "PO Box 100",
        } as any;
      });

      // Mock storage and context
      const fakeImageBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00]); // PNG magic bytes
      const mockFetchResponse = {
        ok: true,
        headers: { get: () => "image/png" },
        arrayBuffer: async () => fakeImageBytes.buffer,
      };
      global.fetch = vi.fn().mockResolvedValue(mockFetchResponse as any);

      const mockCtx: any = {
        auth: { getUserId: vi.fn().mockResolvedValue("user_123") },
        storage: { getUrl: vi.fn().mockResolvedValue("https://storage.convex.cloud/file123") },
        runMutation: vi.fn().mockResolvedValue("claim_id_textract_123"),
        runAction: vi.fn().mockResolvedValue({ officialAppealsEmail: "appeals@aetna.com", isVerified: true }),
      };

      const result = await (actionOpticalParser.parseDenialDocument as any)._handler(mockCtx, {
        storageId: "storage_file_123" as any,
        patientState: "CA",
      });

      // Verify that OpenAI did NOT receive raw image URLs or file inputs (Zero PHI image egress!)
      expect(capturedCompletionOptions.imageUrls).toBeUndefined();
      expect(capturedCompletionOptions.fileInputs).toBeUndefined();
      expect(capturedCompletionOptions.userPrompt).toContain("AWS Textract (HIPAA BAA Optical Gate)");

      // Verify that authentic patient identifiers were re-hydrated into the result and mutation
      expect(result.patientName).toBe("Marcus Sterling");
      expect(result.memberId).toBe("GEO-554210");
      expect(result.claimNumber).toBe("CLM-88219");

      // Verify Convex DB received the authentic patient data
      expect(mockCtx.runMutation).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          patientName: "Marcus Sterling",
          memberId: "GEO-554210",
          claimNumber: "CLM-88219",
          deniedAmount: 24500,
        })
      );
    });

    it("fails hard without multimodal fallback when Textract extraction throws an error", async () => {
      process.env.AWS_ACCESS_KEY_ID = "MOCK_KEY";
      process.env.AWS_SECRET_ACCESS_KEY = "MOCK_SECRET";

      const actionOpticalParser = await import("../convex/actions/opticalParser");
      const libOpenAI = await import("../convex/lib/openai");
      const libTextract = await import("../convex/lib/textract");
      const { rateLimiter } = await import("../convex/lib/rateLimiter");

      vi.spyOn(rateLimiter, "limit").mockResolvedValue({ ok: true } as any);
      vi.spyOn(libTextract, "extractDocumentWithTextract").mockRejectedValue(new Error("Textract ThrottlingException"));

      const completionSpy = vi.spyOn(libOpenAI, "createStructuredCompletion").mockImplementation(async () => {
        throw new Error("createStructuredCompletion must not be called when Textract fails");
      });

      const fakeImageBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00]);
      const mockFetchResponse = {
        ok: true,
        headers: { get: () => "image/png" },
        arrayBuffer: async () => fakeImageBytes.buffer,
      };
      global.fetch = vi.fn().mockResolvedValue(mockFetchResponse as any);

      const mockCtx: any = {
        auth: { getUserId: vi.fn().mockResolvedValue("user_123") },
        storage: { getUrl: vi.fn().mockResolvedValue("https://storage.convex.cloud/file123") },
        runMutation: vi.fn().mockResolvedValue("claim_fallback_123"),
        runAction: vi.fn().mockResolvedValue({ officialAppealsEmail: "appeals@uhc.com", isVerified: true }),
      };

      // Fail closed: Textract errors surface descriptively with no raw-PHI vision fallback.
      await expect(
        (actionOpticalParser.parseDenialDocument as any)._handler(mockCtx, {
          storageId: "storage_file_123" as any,
          patientState: "CA",
        })
      ).rejects.toThrow(/AWS Textract document extraction failed.*ThrottlingException/);

      // OpenAI must never receive raw image bytes when the HIPAA gate fails.
      expect(completionSpy).not.toHaveBeenCalled();
    });

    it("fails hard with actionable error when PDF/image intake is attempted without Textract credentials", async () => {
      delete process.env.AWS_ACCESS_KEY_ID;
      delete process.env.AWS_SECRET_ACCESS_KEY;

      const actionOpticalParser = await import("../convex/actions/opticalParser");
      const libOpenAI = await import("../convex/lib/openai");
      const { rateLimiter } = await import("../convex/lib/rateLimiter");

      vi.spyOn(rateLimiter, "limit").mockResolvedValue({ ok: true } as any);
      const completionSpy = vi.spyOn(libOpenAI, "createStructuredCompletion");

      const fakePdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x00]);
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => "application/pdf" },
        arrayBuffer: async () => fakePdfBytes.buffer,
      } as any);

      const mockCtx: any = {
        auth: { getUserId: vi.fn().mockResolvedValue("user_123") },
        storage: { getUrl: vi.fn().mockResolvedValue("https://storage.convex.cloud/file123") },
        runMutation: vi.fn().mockResolvedValue("claim_no_keys"),
        runAction: vi.fn(),
      };

      await expect(
        (actionOpticalParser.parseDenialDocument as any)._handler(mockCtx, {
          storageId: "storage_file_123" as any,
          patientState: "CA",
        })
      ).rejects.toThrow(/AWS Textract credentials not configured/);

      expect(completionSpy).not.toHaveBeenCalled();
    });

    it("re-hydrates memberId even when model returned asterisk masked placeholder", async () => {
      process.env.AWS_ACCESS_KEY_ID = "MOCK_KEY";
      process.env.AWS_SECRET_ACCESS_KEY = "MOCK_SECRET";

      const actionOpticalParser = await import("../convex/actions/opticalParser");
      const libOpenAI = await import("../convex/lib/openai");
      const libTextract = await import("../convex/lib/textract");
      const { rateLimiter } = await import("../convex/lib/rateLimiter");

      vi.spyOn(rateLimiter, "limit").mockResolvedValue({ ok: true } as any);

      vi.spyOn(libTextract, "extractDocumentWithTextract").mockResolvedValue({
        fullText: "Aetna EOB. Member ID: GEO-994411. Patient: John Smith.",
        keyValues: { "Member ID": "GEO-994411", "Patient Name": "John Smith" },
        tables: [],
        patientName: "John Smith",
        memberId: "GEO-994411",
      });

      vi.spyOn(libOpenAI, "createStructuredCompletion").mockResolvedValue({
        isMedicalClaimDenial: true,
        documentClassificationReason: "Valid EOB.",
        claimNumber: "CLM-991",
        patientName: "John Smith",
        memberId: "GEO***-**", // Model returned asterisk-masked member ID
        insurancePayer: "Aetna",
        serviceDate: "2026-02-15",
        providerName: "Dr. Ronald Sterling",
        deniedAmount: 5000,
        patientOwedAmount: 5000,
        cptCodes: ["27447"],
        icd10Codes: ["M17.11"],
        denialReasonCode: "CO-50",
        denialReasonDescription: "Not medically necessary",
        appealFilingDeadlineDays: 180,
      } as any);

      const fakeImageBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00]);
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => "image/png" },
        arrayBuffer: async () => fakeImageBytes.buffer,
      } as any);

      const mockCtx: any = {
        auth: { getUserId: vi.fn().mockResolvedValue("user_123") },
        storage: { getUrl: vi.fn().mockResolvedValue("https://storage.convex.cloud/file123") },
        runMutation: vi.fn().mockResolvedValue("claim_asterisk_123"),
        runAction: vi.fn().mockResolvedValue({ officialAppealsEmail: "appeals@aetna.com", isVerified: true }),
      };

      const result = await (actionOpticalParser.parseDenialDocument as any)._handler(mockCtx, {
        storageId: "storage_file_123" as any,
        patientState: "CA",
      });

      // Authentic memberId from Textract replaces the asterisk-masked placeholder
      expect(result.memberId).toBe("GEO-994411");
    });

    it("accepts in-browser extractedText with sourceProvenance client_text and skips Textract when AWS credentials are not configured", async () => {
      delete process.env.AWS_ACCESS_KEY_ID;
      delete process.env.AWS_SECRET_ACCESS_KEY;

      const actionOpticalParser = await import("../convex/actions/opticalParser");
      const libOpenAI = await import("../convex/lib/openai");
      const { rateLimiter } = await import("../convex/lib/rateLimiter");

      vi.spyOn(rateLimiter, "limit").mockResolvedValue({ ok: true } as any);
      const completionSpy = vi.spyOn(libOpenAI, "createStructuredCompletion").mockResolvedValue({
        isMedicalClaimDenial: true,
        documentClassificationReason: "Valid EOB.",
        claimNumber: "CLM-CLIENT-001",
        patientName: "Jane Doe",
        memberId: "MEM-774411",
        insurancePayer: "UnitedHealthcare",
        serviceDate: "2026-03-01",
        providerName: "General Hospital",
        deniedAmount: 14500,
        patientOwedAmount: 14500,
        cptCodes: ["27447"],
        icd10Codes: ["M17.11"],
        denialReasonCode: "CO-50",
        denialReasonDescription: "Not medically necessary",
        appealFilingDeadlineDays: 180,
      } as any);

      const fakePdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x00]);
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => "application/pdf" },
        arrayBuffer: async () => fakePdfBytes.buffer,
      } as any);

      const mockCtx: any = {
        auth: { getUserId: vi.fn().mockResolvedValue("user_123") },
        storage: { getUrl: vi.fn().mockResolvedValue("https://storage.convex.cloud/file_client_text") },
        runMutation: vi.fn().mockResolvedValue("claim_client_text_123"),
        runAction: vi.fn().mockResolvedValue({ officialAppealsEmail: "appeals@uhc.com", isVerified: true }),
      };

      const result = await (actionOpticalParser.parseDenialDocument as any)._handler(mockCtx, {
        storageId: "storage_file_123" as any,
        extractedText: "UnitedHealthcare Denial Notice. Member: Jane Doe. CPT: 27447. Amount: $14,500. CO-50.",
        sourceProvenance: "client_text",
        patientState: "NY",
      });

      // Textract was skipped cleanly without throwing missing-credential error
      expect(result.claimId).toBe("claim_client_text_123");
      expect(result.claimNumber).toBe("CLM-CLIENT-001");
      expect(completionSpy).toHaveBeenCalled();
    });

    it("accepts in-browser client_ocr with clientIdentifiers and vaults authentic identifiers into Convex DB without Textract", async () => {
      delete process.env.AWS_ACCESS_KEY_ID;
      delete process.env.AWS_SECRET_ACCESS_KEY;

      const actionOpticalParser = await import("../convex/actions/opticalParser");
      const libOpenAI = await import("../convex/lib/openai");
      const { rateLimiter } = await import("../convex/lib/rateLimiter");

      vi.spyOn(rateLimiter, "limit").mockResolvedValue({ ok: true } as any);
      vi.spyOn(libOpenAI, "createStructuredCompletion").mockResolvedValue({
        isMedicalClaimDenial: true,
        documentClassificationReason: "Valid adverse determination notice.",
        claimNumber: "CLM-9999",
        patientName: "[REDACTED_PATIENT]",
        memberId: "[REDACTED_MEMBER]",
        insurancePayer: "Cigna",
        serviceDate: "2026-02-20",
        providerName: "Metro Orthopedics",
        deniedAmount: 8500,
        patientOwedAmount: 8500,
        cptCodes: ["29881"],
        icd10Codes: ["M23.22"],
        denialReasonCode: "CO-197",
        denialReasonDescription: "Precertification absent",
        appealFilingDeadlineDays: 180,
      } as any);

      const fakeImageBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00]);
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => "image/png" },
        arrayBuffer: async () => fakeImageBytes.buffer,
      } as any);

      const mockCtx: any = {
        auth: { getUserId: vi.fn().mockResolvedValue("user_123") },
        storage: { getUrl: vi.fn().mockResolvedValue("https://storage.convex.cloud/file_client_ocr") },
        runMutation: vi.fn().mockResolvedValue("claim_client_ocr_123"),
        runAction: vi.fn().mockResolvedValue({ officialAppealsEmail: "appeals@cigna.com", isVerified: true }),
      };

      const result = await (actionOpticalParser.parseDenialDocument as any)._handler(mockCtx, {
        storageId: "storage_file_123" as any,
        extractedText: "Cigna adverse benefit determination notice. Disputed procedure CPT 29881.",
        sourceProvenance: "client_ocr",
        clientIdentifiers: {
          patientName: "Robert Vance",
          memberId: "CIG-998811",
          claimNumber: "CLM-9999",
        },
        patientState: "TX",
      });

      // Authentic identifiers vaulted into Convex DB from client identifiers
      expect(result.patientName).toBe("Robert Vance");
      expect(result.memberId).toBe("CIG-998811");
      expect(result.claimId).toBe("claim_client_ocr_123");
    });
  });
});
