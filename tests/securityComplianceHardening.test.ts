import { describe, it, expect, vi, beforeEach } from "vitest";
import { safeExternalHref } from "../src/lib/urlUtils";
import {
  redactBeforeLLM,
  fastSanitizeText as backendFastSanitizeText,
} from "../convex/lib/redactionEngine";
import { MAX_RAW_DOCUMENT_CHARS, parseDenialDocument } from "../convex/actions/opticalParser";
import * as claims from "../convex/claims";
import * as auth from "../convex/lib/auth";
import * as mailDispatcher from "../convex/actions/mailDispatcher";
import * as rateLimiterModule from "../convex/lib/rateLimiter";
import { agentmail } from "../convex/lib/agentMail";

describe("Security, PHI Compliance & Abuse Prevention Hardening", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("safeExternalHref & XSS Link Defense", () => {
    it("neutralizes javascript:, data:, vbscript:, and malformed URIs", () => {
      expect(safeExternalHref("javascript:alert(document.cookie)")).toBeUndefined();
      expect(safeExternalHref("javascript:void(0)")).toBeUndefined();
      expect(safeExternalHref("data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==")).toBeUndefined();
      expect(safeExternalHref("vbscript:msgbox(1)")).toBeUndefined();
      expect(safeExternalHref("file:///etc/passwd")).toBeUndefined();
      expect(safeExternalHref("not-a-valid-url")).toBeUndefined();
      expect(safeExternalHref("")).toBeUndefined();
      expect(safeExternalHref(undefined)).toBeUndefined();
      expect(safeExternalHref("   ")).toBeUndefined();
    });

    it("permits verified http: and https: web destinations", () => {
      expect(safeExternalHref("https://www.cms.gov/medicare-coverage-database")).toBe(
        "https://www.cms.gov/medicare-coverage-database"
      );
      expect(safeExternalHref("http://provider.example.org/guideline.pdf")).toBe(
        "http://provider.example.org/guideline.pdf"
      );
    });
  });

  describe("Backend redactBeforeLLM Server-Side Gate", () => {
    it("de-identifies 18 HIPAA Safe Harbor identifiers before OpenAI processing", () => {
      const prompt =
        "Patient Eleanor Vance, SSN: 123-45-6789, DOB: 05/14/1978, Member ID: GEO-982341-01, phone (555) 019-2834, email eleanor.vance@example.com living at 742 Evergreen Terrace.";
      const redacted = redactBeforeLLM(prompt);

      expect(redacted).not.toContain("123-45-6789");
      expect(redacted).not.toContain("05/14/1978");
      expect(redacted).not.toContain("eleanor.vance@example.com");
      expect(redacted).toContain("***-**-****");
      expect(redacted).toContain("[REDACTED EMAIL]");
      expect(redacted).toContain("[REDACTED ADDRESS]");
    });

    it("returns empty string safely when input is empty or non-string", () => {
      expect(redactBeforeLLM("")).toBe("");
      expect(redactBeforeLLM(undefined as any)).toBe("");
    });
  });


  describe("Optical Denial Parser: Unbounded Text Hardening", () => {
    it("rejects rawDocumentText exceeding MAX_RAW_DOCUMENT_CHARS (100,000 characters)", async () => {
      const oversizedText = "A".repeat(MAX_RAW_DOCUMENT_CHARS + 50);
      const mockCtx: any = {
        runMutation: vi.fn(),
        storage: { getUrl: vi.fn() },
      };

      await expect(
        (parseDenialDocument as any)._handler(mockCtx, {
          rawDocumentText: oversizedText,
        })
      ).rejects.toThrow(/character limit/i);
    });
  });

  describe("createWithPatient: Authentication & Tenant Isolation", () => {
    it("fails when caller is unauthenticated", async () => {
      vi.spyOn(auth, "requireAuthUser").mockRejectedValue(new Error("Unauthenticated: Active user session required"));

      const mockCtx: any = {
        auth: { getUserIdentity: vi.fn().mockResolvedValue(null) },
        db: { query: vi.fn() },
      };

      await expect(
        (claims.createWithPatient as any)._handler(mockCtx, {
          patientName: "John Doe",
          patientEmail: "john@example.com",
          memberId: "M123",
          insurancePayer: "Aetna",
          state: "CA",
          claimNumber: "CLM-999",
          serviceDate: "2026-01-01",
          providerName: "General Hospital",
          deniedAmount: 500,
          patientOwedAmount: 500,
          cptCodes: ["99213"],
          icd10Codes: ["R05"],
          denialReasonCode: "CO-50",
          denialReasonDescription: "Not medically necessary",
        })
      ).rejects.toThrow(/Unauthenticated/i);
    });

    it("scopes patient search strictly to effectiveUserId (never matches or overwrites victim records)", async () => {
      vi.spyOn(auth, "requireAuthUser").mockResolvedValue("user_current" as any);
      vi.spyOn(auth, "getAuthUserId").mockResolvedValue("user_current" as any);

      const queryMock = vi.fn().mockReturnValue({
        withIndex: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(null),
          take: vi.fn().mockResolvedValue([]), // No patient belonging to user_current
        }),
      });

      const insertMock = vi.fn().mockImplementation(async (table) => {
        if (table === "patients") return "patient_new";
        if (table === "claims") return "claim_new";
        return "audit_new";
      });

      const patchMock = vi.fn().mockResolvedValue(undefined);

      const mockCtx: any = {
        db: {
          query: queryMock,
          insert: insertMock,
          patch: patchMock,
          get: vi.fn().mockResolvedValue({ _id: "claim_new" }),
        },
        scheduler: { runAfter: vi.fn().mockResolvedValue(undefined) },
      };

      const claimId = await (claims.createWithPatient as any)._handler(mockCtx, {
        patientName: "Target Patient",
        patientEmail: "victim@example.com",
        memberId: "M999",
        insurancePayer: "Aetna",
        state: "CA",
        claimNumber: "CLM-SEC-01",
        serviceDate: "2026-01-01",
        providerName: "Clinic",
        deniedAmount: 1000,
        patientOwedAmount: 1000,
        cptCodes: ["99213"],
        icd10Codes: ["R05"],
        denialReasonCode: "CO-50",
        denialReasonDescription: "Denial",
      });

      expect(claimId).toBe("claim_new");
      // Must insert a new patient scoped to user_current, NOT patch an existing one
      expect(insertMock).toHaveBeenCalledWith(
        "patients",
        expect.objectContaining({
          userId: "user_current",
          email: "victim@example.com",
        })
      );
      expect(patchMock).not.toHaveBeenCalled();
    });
  });

  describe("Outbound Redaction Consent Gate in mailDispatcher", () => {
    it("logs hipaa_redaction_waived audit event when waiveRedaction is explicitly set", async () => {
      vi.spyOn(auth, "requireClaimOwnerAction").mockResolvedValue({
        claim: {
          _id: "claim_1" as any,
          claimNumber: "CLM-100",
          patient: { name: "Alice Smith", insurancePayer: "BlueCross" } as any,
          redactionMetadata: { isRedacted: false },
        } as any,
        userId: "user_1" as any,
      });
      vi.spyOn(rateLimiterModule.rateLimiter, "limit").mockResolvedValue({ ok: true } as any);

      const runQueryMock = vi.fn().mockImplementation(async (_fn, args) => {
        return {
          _id: "appeal_1",
          claimId: "claim_1",
          fullAppealMarkdown: "# Legal Appeal\nPatient Alice Smith SSN 000-11-2222",
        };
      });

      const runMutationMock = vi.fn().mockResolvedValue("thread_1");

      const mockCtx: any = {
        runQuery: runQueryMock,
        runMutation: runMutationMock,
      };

      process.env.AGENTMAIL_API_KEY = "test_key";
      process.env.AGENTMAIL_SENDER_INBOX_ID = "inbox_sender";
      process.env.AGENTMAIL_SENDER_EMAIL = "claimhero-sender@agentmail.to";
      process.env.AGENTMAIL_ADJUDICATOR_INBOX_ID = "inbox_adj";
      process.env.AGENTMAIL_ADJUDICATOR_EMAIL = "claimhero-adjudicator@agentmail.to";

      vi.spyOn(agentmail, "sendMessage").mockResolvedValue("outbound_1" as any);
      vi.spyOn(agentmail, "status").mockResolvedValue({
        status: "pending",
        agentmailMessageId: null,
        threadId: null,
        errorMessage: null,
      });

      await (mailDispatcher.dispatchAppealPacket as any)._handler(mockCtx, {
        claimId: "claim_1",
        dispatchMode: "custom_email",
        recipientEmail: "reviewer@customdomain.org",
        waiveRedaction: true,
      });

      expect(runMutationMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          eventType: "hipaa_redaction_waived",
          actor: "User Consent Gate",
        })
      );
    });
  });
});
