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

    it("de-identifies live claim system prompts containing patient identities, member IDs, and contact points", () => {
      const systemPrompt =
        "You are drafting an immediate Clinical Rebuttal Addendum for Claim #CLM-98210 (Patient: Eleanor Vance, Member ID: MBN9823412-01, DOB: 1984-05-14). Contact: eleanor.vance@example.com, (555) 234-5678, living at 123 Main St, Springfield IL 62701.";
      const redacted = redactBeforeLLM(systemPrompt);

      expect(redacted).not.toContain("eleanor.vance@example.com");
      expect(redacted).not.toContain("(555) 234-5678");
      expect(redacted).not.toContain("123 Main St");
      expect(redacted).toContain("[REDACTED EMAIL]");
      expect(redacted).toContain("[REDACTED PHONE]");
      expect(redacted).toContain("[REDACTED ADDRESS]");
    });
  });


  describe("Optical Denial Parser: Unbounded Text Hardening & Auth", () => {
    it("rejects unauthenticated caller", async () => {
      vi.spyOn(auth, "requireAuthUser").mockRejectedValueOnce(new Error("Unauthorized: Authentication required"));
      const mockCtx: any = {
        auth: { getUserIdentity: vi.fn().mockResolvedValue(null) },
      };
      await expect(
        (parseDenialDocument as any)._handler(mockCtx, {
          rawDocumentText: "Valid text",
        })
      ).rejects.toThrow(/Unauthorized/i);
    });

    it("rejects rawDocumentText exceeding MAX_RAW_DOCUMENT_CHARS (100,000 characters)", async () => {
      vi.spyOn(auth, "requireAuthUser").mockResolvedValueOnce("user_test" as any);
      const oversizedText = "A".repeat(MAX_RAW_DOCUMENT_CHARS + 50);
      const mockCtx: any = {
        auth: { getUserIdentity: vi.fn().mockResolvedValue({ subject: "user_test" }) },
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

  describe("P0-6: Claim Creation IDOR Guard (convex/claims.ts:create)", () => {
    it("rejects claim creation when patientId does not exist", async () => {
      vi.spyOn(auth, "requireAuthUser").mockResolvedValue("user_attacker" as any);
      const mockCtx: any = {
        db: {
          get: vi.fn().mockResolvedValue(null),
        },
      };

      await expect(
        (claims.create as any)._handler(mockCtx, {
          patientId: "patient_nonexistent",
          claimNumber: "CLM-TEST-001",
          serviceDate: "2026-01-01",
          providerName: "Dr. Smith",
          deniedAmount: 5000,
          patientOwedAmount: 5000,
          cptCodes: ["27447"],
          icd10Codes: ["M17.11"],
          denialReasonCode: "CO-50",
          denialReasonDescription: "Not medically necessary",
        })
      ).rejects.toThrow(/Forbidden: Access denied to specified patient/i);
    });

    it("rejects claim creation when patientId belongs to a different user (IDOR attempt)", async () => {
      vi.spyOn(auth, "requireAuthUser").mockResolvedValue("user_attacker" as any);
      const victimPatient = {
        _id: "patient_victim_123",
        userId: "user_victim",
        name: "Victim Patient",
        insurancePayer: "Confidential Insurer",
      };
      const mockCtx: any = {
        db: {
          get: vi.fn().mockResolvedValue(victimPatient),
        },
      };

      await expect(
        (claims.create as any)._handler(mockCtx, {
          patientId: "patient_victim_123",
          claimNumber: "CLM-TEST-002",
          serviceDate: "2026-01-01",
          providerName: "Dr. Smith",
          deniedAmount: 5000,
          patientOwedAmount: 5000,
          cptCodes: ["27447"],
          icd10Codes: ["M17.11"],
          denialReasonCode: "CO-50",
          denialReasonDescription: "Not medically necessary",
        })
      ).rejects.toThrow(/Forbidden: Access denied to specified patient/i);
    });

    it("allows claim creation when patient belongs to authenticated user", async () => {
      vi.spyOn(auth, "requireAuthUser").mockResolvedValue("user_legit" as any);
      const legitPatient = {
        _id: "patient_legit_123",
        userId: "user_legit",
        name: "Legit Patient",
        insurancePayer: "Legit Insurer",
      };
      const mockDb: any = {
        get: vi.fn().mockResolvedValue(legitPatient),
        query: vi.fn().mockReturnValue({
          withIndex: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue(null),
          }),
        }),
        insert: vi.fn().mockImplementation((table) => {
          if (table === "claims") return Promise.resolve("claim_created_123");
          return Promise.resolve("audit_123");
        }),
      };
      const mockCtx: any = {
        db: mockDb,
        scheduler: { runAfter: vi.fn().mockResolvedValue(undefined) },
      };

      const claimId = await (claims.create as any)._handler(mockCtx, {
        patientId: "patient_legit_123",
        claimNumber: "CLM-TEST-003",
        serviceDate: "2026-01-01",
        providerName: "Dr. Smith",
        deniedAmount: 5000,
        patientOwedAmount: 5000,
        cptCodes: ["27447"],
        icd10Codes: ["M17.11"],
        denialReasonCode: "CO-50",
        denialReasonDescription: "Not medically necessary",
      });

      expect(claimId).toBe("claim_created_123");
      expect(mockDb.insert).toHaveBeenCalledWith("claims", expect.objectContaining({
        userId: "user_legit",
        patientId: "patient_legit_123",
        patientName: "Legit Patient",
        insurancePayer: "Legit Insurer",
      }));
    });
  });

  describe("P0-3: Honest Patient Name Resolution & Dispatch Sender Enforcement", () => {
    it("resolveClaimPatientName: returns 'Not specified in denial notice' and never invents mock names", () => {
      expect(claims.resolveClaimPatientName("", "CLM-6104-GEO-1234", "GEO-554210-99")).toBe("Not specified in denial notice");
      expect(claims.resolveClaimPatientName(undefined, "CLM-8942-GEO-5678", "GEO-982341-01")).toBe("Not specified in denial notice");
      expect(claims.resolveClaimPatientName("[PATIENT REDACTED]", "CLM-3912-BCG-9012", "BCG-773419-02")).toBe("Not specified in denial notice");
      expect(claims.resolveClaimPatientName("Patient", "CLM-6104-GEO", "GEO-554210-99")).toBe("Not specified in denial notice");
      expect(claims.resolveClaimPatientName("[PATIENT NAME REDACTED]")).toBe("Not specified in denial notice");

      // Genuine names are preserved
      expect(claims.resolveClaimPatientName("Sarah Connor")).toBe("Sarah Connor");
    });

    it("dispatchAppealPacket: blocks dispatch when patient name is unspecified and sender details are missing", async () => {
      vi.spyOn(auth, "requireClaimOwnerAction").mockResolvedValue({
        claim: {
          _id: "claim_unspecified" as any,
          claimNumber: "CLM-6104-GEO-9999",
          patientName: "",
          patient: { insurancePayer: "Aetna", name: "" },
          deniedAmount: 15000,
        } as any,
        userId: "user_123" as any,
      });

      const mockCtx: any = {
        runQuery: vi.fn().mockResolvedValue({
          _id: "appeal_1",
          fullAppealMarkdown: "# Brief",
        }),
      };

      await expect(
        (mailDispatcher.dispatchAppealPacket as any)._handler(mockCtx, {
          claimId: "claim_unspecified",
          dispatchMode: "ai_adjudicator",
        })
      ).rejects.toThrow(/sender details before dispatching/i);
    });

    it("dispatchAppealPacket: allows dispatch when sender details are supplied", async () => {
      vi.spyOn(auth, "requireClaimOwnerAction").mockResolvedValue({
        claim: {
          _id: "claim_unspecified" as any,
          claimNumber: "CLM-6104-GEO-9999",
          patientName: "",
          patient: { insurancePayer: "Aetna", name: "" },
          deniedAmount: 15000,
          appealContext: {
            sender: {
              name: "Dr. Gregory House, MD",
              email: "ghouse@princetonplainsboro.org",
            },
          },
        } as any,
        userId: "user_123" as any,
      });

      vi.spyOn(rateLimiterModule.rateLimiter, "limit").mockResolvedValue({ ok: true } as any);
      vi.spyOn(agentmail, "sendMessage").mockResolvedValue("msg_sent_1" as any);
      vi.spyOn(agentmail, "status").mockResolvedValue({ status: "pending" } as any);

      process.env.AGENTMAIL_API_KEY = "test_key";
      process.env.AGENTMAIL_SENDER_INBOX_ID = "inbox_sender";
      process.env.AGENTMAIL_SENDER_EMAIL = "claimhero-sender@agentmail.to";
      process.env.AGENTMAIL_ADJUDICATOR_INBOX_ID = "inbox_adj";
      process.env.AGENTMAIL_ADJUDICATOR_EMAIL = "claimhero-adjudicator@agentmail.to";

      const mockCtx: any = {
        runQuery: vi.fn().mockResolvedValue({
          _id: "appeal_1",
          fullAppealMarkdown: "# Brief",
        }),
        runMutation: vi.fn().mockResolvedValue("thread_1"),
      };

      const receipt = await (mailDispatcher.dispatchAppealPacket as any)._handler(mockCtx, {
        claimId: "claim_unspecified",
        dispatchMode: "official_payer",
        recipientEmail: "appeals@aetna.com",
      });

      expect(receipt.status).toBe("delivered");
    });

    it("dispatchAppealPacket: blocks official_payer dispatch when contact is an unverified registry fallback", async () => {
      vi.spyOn(auth, "requireClaimOwnerAction").mockResolvedValue({
        claim: {
          _id: "claim_unverified_payer" as any,
          claimNumber: "CLM-9999-UHC-1111",
          patientName: "Jane Doe",
          patient: { insurancePayer: "UnitedHealthcare", name: "Jane Doe" },
          deniedAmount: 8500,
          appealContext: {
            sender: { name: "Dr. Gregory House, MD", email: "ghouse@princetonplainsboro.org" },
          },
          payerContact: {
            intakePortalUrl: "https://www.uhcprovider.com/appeals",
            appealsFax: "1-855-899-7400",
            isVerified: false,
            source: "registry_fallback",
            registryDate: "2026-08-28",
          },
        } as any,
        userId: "user_123" as any,
      });

      vi.spyOn(rateLimiterModule.rateLimiter, "limit").mockResolvedValue({ ok: true } as any);

      const mockCtx: any = {
        runQuery: vi.fn().mockResolvedValue({
          _id: "appeal_1",
          fullAppealMarkdown: "# Brief",
        }),
        runAction: vi.fn().mockResolvedValue({
          isVerified: false,
          source: "registry_fallback",
          intakePortalUrl: "https://www.uhcprovider.com/appeals",
          appealsFax: "1-855-899-7400",
        }),
      };

      await expect(
        (mailDispatcher.dispatchAppealPacket as any)._handler(mockCtx, {
          claimId: "claim_unverified_payer",
          dispatchMode: "official_payer",
        })
      ).rejects.toThrow(/Automated dispatch to unverified registry fallbacks is prohibited under HIPAA safeguards/i);
    });

    it("dispatchAppealPacket: succeeds in official_payer mode when live re-verification returns verified appeals email", async () => {
      vi.spyOn(auth, "requireClaimOwnerAction").mockResolvedValue({
        claim: {
          _id: "claim_live_verified" as any,
          claimNumber: "CLM-8888-MOL-2222",
          patientName: "Jane Doe",
          patient: { insurancePayer: "Molina Healthcare", name: "Jane Doe" },
          deniedAmount: 4200,
          appealContext: {
            sender: { name: "Dr. Gregory House, MD", email: "ghouse@princetonplainsboro.org" },
          },
        } as any,
        userId: "user_123" as any,
      });

      vi.spyOn(rateLimiterModule.rateLimiter, "limit").mockResolvedValue({ ok: true } as any);
      vi.spyOn(agentmail, "sendMessage").mockResolvedValue("msg_live_sent_1" as any);
      vi.spyOn(agentmail, "status").mockResolvedValue({ status: "pending" } as any);

      const mockCtx: any = {
        runQuery: vi.fn().mockResolvedValue({
          _id: "appeal_1",
          fullAppealMarkdown: "# Brief",
        }),
        runAction: vi.fn().mockResolvedValue({
          isVerified: true,
          source: "firecrawl_live",
          officialAppealsEmail: "MFLGrievanceandAppealsDepartment@MolinaHealthcare.com",
          liveVerifiedAt: Date.now(),
        }),
        runMutation: vi.fn().mockResolvedValue("thread_live_1"),
      };

      const receipt = await (mailDispatcher.dispatchAppealPacket as any)._handler(mockCtx, {
        claimId: "claim_live_verified",
        dispatchMode: "official_payer",
      });

      expect(receipt.status).toBe("delivered");
      expect(agentmail.sendMessage).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({
          to: "MFLGrievanceandAppealsDepartment@MolinaHealthcare.com",
        })
      );
    });

    it("sendOutboundMessage: blocks transmission when payerContact is an unverified registry fallback", async () => {
      vi.spyOn(auth, "requireClaimOwnerAction").mockResolvedValue({
        claim: {
          _id: "claim_outbound_fallback" as any,
          claimNumber: "CLM-7777-AET-3333",
          patientName: "John Smith",
          patient: { insurancePayer: "Aetna", name: "John Smith" },
          deniedAmount: 12000,
          payerContact: {
            officialAppealsEmail: "stale_appeals@aetna.com",
            isVerified: false,
            source: "registry_fallback",
            registryDate: "2026-08-28",
          },
        } as any,
        userId: "user_123" as any,
      });

      const mockCtx: any = {
        runQuery: vi.fn().mockResolvedValue(null),
      };

      await expect(
        (mailDispatcher.sendOutboundMessage as any)._handler(mockCtx, {
          claimId: "claim_outbound_fallback",
          text: "Here is our clinical addendum.",
        })
      ).rejects.toThrow(/unverified registry fallback/i);
    });

    it("healRedactedPatientNamesInternal: rejects missing confirm flag before performing any database work", async () => {
      const mockCtx: any = { db: {} };

      await expect(
        (claims.healRedactedPatientNamesInternal as any)._handler(mockCtx, {
          targetUserId: "user_123",
          confirm: false,
        })
      ).rejects.toThrow(/without explicit confirm/i);
    });

    it("healRedactedPatientNamesInternal: reconciles patient name from authentic in-tenant sources within the scoped tenant", async () => {
      const targetUserId = "user_123";
      const mockDb = {
        query: vi.fn().mockReturnValue({
          withIndex: vi.fn().mockReturnValue({
            paginate: vi.fn().mockResolvedValue({
              page: [
                {
                  _id: "claim_1",
                  userId: targetUserId,
                  claimNumber: "CLM-6104-GEO-7830",
                  patientId: "patient_1",
                  patientName: "[PATIENT NAME REDACTED]",
                  appealContext: {
                    physicianNotes: "PATIENT: Marcus Sterling | DOB: 11/22/1974 | DOS: 07/04/2026",
                  },
                },
              ],
              isDone: true,
              continueCursor: null,
            }),
            take: vi.fn().mockResolvedValue([]),
          }),
        }),
        get: vi.fn().mockImplementation(async (id: string) => {
          if (id === "patient_1") {
            return { _id: "patient_1", userId: targetUserId, name: "[PATIENT NAME REDACTED]", memberId: "GEO-554210-99" };
          }
          return null;
        }),
        patch: vi.fn().mockResolvedValue(true),
        insert: vi.fn().mockResolvedValue("log_1"),
      };

      const mockCtx: any = {
        db: mockDb,
        scheduler: { runAfter: vi.fn().mockResolvedValue(undefined) },
      };

      const res = await (claims.healRedactedPatientNamesInternal as any)._handler(mockCtx, {
        targetUserId,
        confirm: true,
      });

      expect(res.isDone).toBe(true);
      expect(res.batchHealedClaims).toBe(1);
      expect(res.batchHealedPatients).toBe(1);
      expect(mockDb.patch).toHaveBeenCalledWith("claim_1", expect.objectContaining({ patientName: "Marcus Sterling" }));
      expect(mockDb.patch).toHaveBeenCalledWith("patient_1", expect.objectContaining({ name: "Marcus Sterling" }));
      expect(mockDb.insert).toHaveBeenCalledWith(
        "appealAuditLogs",
        expect.objectContaining({ eventType: "phi_placeholder_healed", userId: targetUserId, actor: "Internal Maintenance (PHI Heal)" })
      );
      // Redaction audit trail is preserved, never un-redacted by the heal job
      expect(mockDb.patch).not.toHaveBeenCalledWith(
        "claim_1",
        expect.objectContaining({ redactionMetadata: expect.anything() })
      );
    });

    it("healRedactedPatientNamesInternal: never invents PII when no authentic same-tenant name source exists", async () => {
      const targetUserId = "user_123";
      const mockDb = {
        query: vi.fn().mockReturnValue({
          withIndex: vi.fn().mockReturnValue({
            paginate: vi.fn().mockResolvedValue({
              page: [
                {
                  _id: "claim_no_source",
                  userId: targetUserId,
                  claimNumber: "CLM-9999",
                  patientId: "patient_no_source",
                  patientName: "[PATIENT REDACTED]",
                  appealContext: {
                    physicianNotes: "Attending note without patient identifiers.",
                  },
                },
              ],
              isDone: true,
              continueCursor: null,
            }),
          }),
        }),
        get: vi.fn().mockImplementation(async (id: string) => {
          if (id === "patient_no_source") {
            return { _id: "patient_no_source", userId: targetUserId, name: "Not specified in denial notice" };
          }
          return null;
        }),
        patch: vi.fn().mockResolvedValue(true),
        insert: vi.fn().mockResolvedValue("log_1"),
      };

      const mockCtx: any = {
        db: mockDb,
        scheduler: { runAfter: vi.fn().mockResolvedValue(undefined) },
      };

      const res = await (claims.healRedactedPatientNamesInternal as any)._handler(mockCtx, {
        targetUserId,
        confirm: true,
      });

      expect(res.batchHealedClaims).toBe(0);
      expect(res.batchHealedPatients).toBe(0);
      expect(mockDb.patch).not.toHaveBeenCalled();
    });

    it("healRedactedPatientNamesInternal: dryRun reports would-be heals without writing any changes", async () => {
      const targetUserId = "user_123";
      const mockDb = {
        query: vi.fn().mockReturnValue({
          withIndex: vi.fn().mockReturnValue({
            paginate: vi.fn().mockResolvedValue({
              page: [
                {
                  _id: "claim_dry_1",
                  userId: targetUserId,
                  claimNumber: "CLM-6104-GEO-7830",
                  patientId: "patient_1",
                  patientName: "[PATIENT REDACTED]",
                  appealContext: { physicianNotes: "PATIENT: Marcus Sterling | note" },
                },
              ],
              isDone: true,
              continueCursor: null,
            }),
            take: vi.fn().mockResolvedValue([]),
          }),
        }),
        get: vi.fn().mockImplementation(async (id: string) => {
          if (id === "patient_1") {
            return { _id: "patient_1", userId: targetUserId, name: "[PATIENT REDACTED]" };
          }
          return null;
        }),
        patch: vi.fn().mockResolvedValue(true),
        insert: vi.fn().mockResolvedValue("log_1"),
      };

      const mockCtx: any = {
        db: mockDb,
        scheduler: { runAfter: vi.fn().mockResolvedValue(undefined) },
      };

      const res = await (claims.healRedactedPatientNamesInternal as any)._handler(mockCtx, {
        targetUserId,
        confirm: true,
        dryRun: true,
      });

      expect(res.batchHealedClaims).toBe(1);
      expect(res.batchHealedPatients).toBe(1);
      expect(mockDb.patch).not.toHaveBeenCalled();
      expect(mockDb.insert).not.toHaveBeenCalled();
    });

    it("healRedactedPatientNamesInternal: paginates tenant-scoped batches via scheduler continuation", async () => {
      const targetUserId = "user_123";
      const mockDb = {
        query: vi.fn().mockReturnValue({
          withIndex: vi.fn().mockReturnValue({
            paginate: vi.fn().mockResolvedValue({
              page: [
                {
                  _id: "claim_more",
                  userId: targetUserId,
                  claimNumber: "CLM-6104",
                  patientId: "patient_1",
                  patientName: "[PATIENT REDACTED]",
                  appealContext: { physicianNotes: "PATIENT: Marcus Sterling" },
                },
              ],
              isDone: false,
              continueCursor: "cursor_next",
            }),
            take: vi.fn().mockResolvedValue([]),
          }),
        }),
        get: vi.fn().mockImplementation(async (id: string) => {
          if (id === "patient_1") return { _id: "patient_1", userId: targetUserId, name: "Marcus Sterling" };
          return null;
        }),
        patch: vi.fn().mockResolvedValue(true),
        insert: vi.fn().mockResolvedValue("log_1"),
      };

      const mockCtx: any = {
        db: mockDb,
        scheduler: { runAfter: vi.fn().mockResolvedValue(undefined) },
      };

      const res = await (claims.healRedactedPatientNamesInternal as any)._handler(mockCtx, {
        targetUserId,
        confirm: true,
        batchSize: 1,
      });

      expect(res.isDone).toBe(false);
      expect(res.continueCursor).toBe("cursor_next");
      expect(mockCtx.scheduler.runAfter).toHaveBeenCalledWith(
        0,
        expect.anything(),
        expect.objectContaining({ cursor: "cursor_next", totalScanned: 1 })
      );
    });


    it("updateAppealContext: auto-reconciles patient name from physicianNotes when unstated in denial notice", async () => {
      vi.spyOn(auth, "requireClaimEditor").mockResolvedValue(true as any);

      const mockDb = {
        get: vi.fn().mockImplementation(async (id) => {
          if (id === "claim_unspecified") {
            return {
              _id: "claim_unspecified",
              patientId: "patient_unspecified",
              patientName: "Not specified in denial notice",
            };
          }
          if (id === "patient_unspecified") {
            return {
              _id: "patient_unspecified",
              name: "Not specified in denial notice",
            };
          }
          return null;
        }),
        patch: vi.fn().mockResolvedValue(true),
        insert: vi.fn().mockResolvedValue("log_1"),
      };

      const mockCtx: any = { db: mockDb };
      await (claims.updateAppealContext as any)._handler(mockCtx, {
        claimId: "claim_unspecified",
        sender: {
          name: "Alex Morgan",
          email: "alex@example.com",
        },
        clinicalFacts: {
          recordsAreIncomplete: false,
        },
        physicianNotes: "PATIENT: Marcus Sterling | Attending neurosurgeon note...",
      });

      expect(mockDb.patch).toHaveBeenCalledWith("claim_unspecified", expect.objectContaining({
        patientName: "Marcus Sterling",
      }));
      expect(mockDb.patch).toHaveBeenCalledWith("patient_unspecified", {
        name: "Marcus Sterling",
      });
    });
  });
});
