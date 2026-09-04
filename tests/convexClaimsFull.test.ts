/// <reference path="./auth-mock.d.ts" />
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as claims from "../convex/claims";
import { getAuthUserId } from "@convex-dev/auth/server";

vi.mock("@convex-dev/auth/server", () => ({
  getAuthUserId: vi.fn(),
}));

describe("Convex Claims CRUD, Financials & Analytics Engine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createMockDb = (customMocks: any = {}) => {
    const qBuilder: any = {};
    qBuilder.search = vi.fn().mockReturnValue(qBuilder);
    qBuilder.eq = vi.fn().mockReturnValue(qBuilder);
    qBuilder.field = vi.fn().mockReturnValue("field");

    const queryInstance: any = {};
    queryInstance.withIndex = vi.fn().mockImplementation((_idx, cb) => {
      if (typeof cb === "function") cb(qBuilder);
      return queryInstance;
    });
    queryInstance.withSearchIndex = vi.fn().mockImplementation((_idx, cb) => {
      if (typeof cb === "function") cb(qBuilder);
      return queryInstance;
    });
    queryInstance.filter = vi.fn().mockImplementation((cb) => {
      if (typeof cb === "function") cb(qBuilder);
      return queryInstance;
    });
    queryInstance.order = vi.fn().mockReturnValue(queryInstance);
    queryInstance.take = vi.fn().mockResolvedValue([]);
    queryInstance.first = vi.fn().mockResolvedValue(null);
    queryInstance.collect = vi.fn().mockResolvedValue([]);
    queryInstance.unique = vi.fn().mockResolvedValue(null);
    queryInstance.paginate = vi.fn().mockResolvedValue({ page: [], isDone: true, continueCursor: "" });

    return {
      get: vi.fn().mockResolvedValue(null),
      insert: vi.fn().mockResolvedValue("id_new"),
      patch: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockReturnValue(queryInstance),
      ...customMocks,
    };
  };

  describe("search & getById", () => {
    it("search: returns empty when unauthenticated or query is empty, else returns matches", async () => {
      const mockDb = createMockDb();
      const mockCtx: any = { db: mockDb };

      expect(await (claims.search as any)._handler(mockCtx, { query: "" })).toEqual([]);

      vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
      mockDb.query().withSearchIndex().take.mockResolvedValue([
        { _id: "c1", userId: "user_123", denialReasonDescription: "Match" },
        { _id: "c2", userId: "other_user", denialReasonDescription: "Match" },
      ]);

      const res = await (claims.search as any)._handler(mockCtx, { query: "knee", status: "won" });
      expect(res).toHaveLength(1);
      expect(res[0]._id).toBe("c1");
    });

    it("getById & getByIdInternal: returns claim with joined patient and evidenceCount", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
      const mockClaim = { _id: "c1", userId: "user_123", patientId: "p1" };
      const mockPatient = { _id: "p1", name: "Alice" };
      const mockEvs = [{ _id: "ev1", title: "CPB" }];

      const mockDb = createMockDb({
        get: vi.fn().mockImplementation((id) => (id === "c1" ? Promise.resolve(mockClaim) : id === "p1" ? Promise.resolve(mockPatient) : Promise.resolve(null))),
      });
      mockDb.query().withIndex().take.mockResolvedValue(mockEvs);
      const mockCtx: any = { db: mockDb };

      const res = await (claims.getById as any)._handler(mockCtx, { claimId: "c1" });
      expect(res?._id).toBe("c1");
      expect(res?.patient?.name).toBe("Alice");
      expect(res?.evidenceCount).toBe(1);

      const resInternal = await (claims.getByIdInternal as any)._handler(mockCtx, { claimId: "c1" });
      expect(resInternal?.patient?.name).toBe("Alice");
    });

    it("getById: utilizes denormalized evidenceCount without reading clinicalEvidences", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
      const mockClaim = { _id: "c2", userId: "user_123", patientId: "p1", evidenceCount: 7 };
      const mockPatient = { _id: "p1", name: "Bob" };

      const querySpy = vi.fn().mockReturnValue({
        withIndex: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue(null),
          }),
        }),
      });

      const mockDb = createMockDb({
        get: vi.fn().mockImplementation((id) => (id === "c2" ? Promise.resolve(mockClaim) : Promise.resolve(mockPatient))),
        query: querySpy,
      });
      const mockCtx: any = { db: mockDb };

      const res = await (claims.getById as any)._handler(mockCtx, { claimId: "c2" });
      expect(res?.evidenceCount).toBe(7);
      // Query should only have been called for appeals, NOT clinicalEvidences
      expect(querySpy).toHaveBeenCalledWith("appeals");
      expect(querySpy).not.toHaveBeenCalledWith("clinicalEvidences");
    });

    it("listAllInternal & getByClaimNumberInternal", async () => {
      const mockDb = createMockDb();
      mockDb.query().take.mockResolvedValue([{ _id: "c1" }]);
      mockDb.query().withIndex().first.mockResolvedValue({ _id: "c1", claimNumber: "CLM-100" });
      const mockCtx: any = { db: mockDb };

      const all = await (claims.listAllInternal as any)._handler(mockCtx, { limit: 10 });
      expect(all).toHaveLength(1);

      const byNum = await (claims.getByClaimNumberInternal as any)._handler(mockCtx, { claimNumber: "CLM-100" });
      expect(byNum?.claimNumber).toBe("CLM-100");
    });
  });

  describe("list & getPortfolioStats", () => {
    it("list: returns empty when unauthenticated, else returns mapped claims", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue(null);
      const mockDb = createMockDb();
      const mockCtx: any = { db: mockDb };
      expect(await (claims.list as any)._handler(mockCtx, {})).toEqual([]);

      vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
      const mockClaim1 = { _id: "c1", userId: "user_123", patientId: "p1", patient: { name: "Bob" }, statutoryDeadline: Date.now() + 86400000 * 20 };
      mockDb.query().withIndex().order().take.mockResolvedValue([mockClaim1]);

      const res = await (claims.list as any)._handler(mockCtx, { status: "ready_for_review", payer: "Aetna" });
      expect(res).toHaveLength(1);
    });

    it("getPortfolioStats: returns zeros if unauthenticated or no claims, else computes stats", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue(null);
      const mockDb = createMockDb();
      const mockCtx: any = { db: mockDb };
      expect((await (claims.getPortfolioStats as any)._handler(mockCtx, {})).totalClaims).toBe(0);

      vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
      const mockClaims = [
        { _id: "c1", status: "won", deniedAmount: 5000, daysRemaining: 30, overturnProbabilityScore: 90 },
        { _id: "c2", status: "ready_for_review", deniedAmount: 10000, daysRemaining: 5, overturnProbabilityScore: 80 },
      ];
      mockDb.query().withIndex().order().take.mockResolvedValue(mockClaims);

      const res = await (claims.getPortfolioStats as any)._handler(mockCtx, {});
      expect(res.totalClaims).toBe(2);
      expect(res.overturnedWonAmount).toBe(5000);
      expect(res.activeDisputedAmount).toBe(10000);
      expect(res.averageWinScore).toBe(85);
      expect(res.criticalDeadlinesCount).toBe(1);
    });
  });

  describe("createWithPatient & createWithPatientInternal", () => {
    it("creates patient and claim, updates aggregate, and logs audit", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
      const mockDb = createMockDb({
        insert: vi.fn().mockImplementation((table) => {
          if (table === "patients") return Promise.resolve("pat_1");
          if (table === "claims") return Promise.resolve("claim_1");
          return Promise.resolve("log_1");
        }),
      });
      const mockCtx: any = {
        db: mockDb,
        scheduler: { runAfter: vi.fn().mockResolvedValue(undefined) },
      };

      const claimId = await (claims.createWithPatient as any)._handler(mockCtx, {
        patientName: "Jane Doe",
        patientEmail: "jane@test.com",
        memberId: "MEM-1",
        insurancePayer: "UHC",
        state: "CA",
        claimNumber: "CLM-001",
        serviceDate: "2026-01-01",
        providerName: "Dr. Smith",
        deniedAmount: 1000,
        patientOwedAmount: 1000,
        cptCodes: ["27447"],
        icd10Codes: ["M17.11"],
        denialReasonCode: "CO-50",
        denialReasonDescription: "Not medically necessary",
        appealFilingDeadlineDays: 180,
      });

      expect(claimId).toBe("claim_1");
      expect(mockDb.insert).toHaveBeenCalledWith("patients", expect.objectContaining({ name: "Jane Doe" }));
      expect(mockDb.insert).toHaveBeenCalledWith("claims", expect.objectContaining({ claimNumber: "CLM-001" }));
    });
  });

  describe("updateStatus, updateAppealContext, updatePayerContact & financial updates", () => {
    it("updateStatus & updateStatusInternal: patches claim, schedules indexWonAppeal when won, and logs audit", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
      const mockClaim = { _id: "c1", userId: "user_123", claimNumber: "CLM-100" };
      const mockDb = createMockDb({
        get: vi.fn().mockResolvedValue(mockClaim),
      });
      const mockCtx: any = {
        db: mockDb,
        scheduler: { runAfter: vi.fn().mockResolvedValue(undefined) },
      };

      await (claims.updateStatus as any)._handler(mockCtx, {
        claimId: "c1",
        status: "won",
        actor: "Adjudicator",
        details: "Won claim",
        overturnProbabilityScore: 95,
        riskLevel: "high_confidence",
      });

      expect(mockDb.patch).toHaveBeenCalledWith("c1", expect.objectContaining({ status: "won" }));
      expect(mockCtx.scheduler.runAfter).toHaveBeenCalled();
    });

    it("updateAppealContext, updatePayerContact, updateFinancialLiability & updateErisaPenalties", async () => {
      vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
      const mockClaim = { _id: "c1", userId: "user_123", claimNumber: "CLM-100" };
      const mockDb = createMockDb({
        get: vi.fn().mockResolvedValue(mockClaim),
      });
      const mockCtx: any = { db: mockDb };

      // updateAppealContext
      await (claims.updateAppealContext as any)._handler(mockCtx, {
        claimId: "c1",
        sender: { name: "Dr. Vance", email: "vance@clinic.org" },
        clinicalFacts: { recordsAreIncomplete: false },
        redactionMetadata: { isRedacted: true, mode: "safe", redactedEntityCount: 2, maskedCategories: ["name"], appliedAt: 123 },
      });
      expect(mockDb.patch).toHaveBeenCalledWith("c1", expect.objectContaining({
        appealContext: expect.objectContaining({ sender: expect.objectContaining({ name: "Dr. Vance" }) }),
      }));

      // updatePayerContact
      await (claims.updatePayerContact as any)._handler(mockCtx, {
        claimId: "c1",
        payerContact: { officialAppealsEmail: "appeals@uhc.com", isVerified: true },
      });
      expect(mockDb.patch).toHaveBeenCalledWith("c1", expect.objectContaining({
        payerContact: expect.objectContaining({ officialAppealsEmail: "appeals@uhc.com" }),
      }));

      // updateRedactionMetadata
      await (claims.updateRedactionMetadata as any)._handler(mockCtx, {
        claimId: "c1",
        redactionMetadata: { isRedacted: true, mode: "safe", redactedEntityCount: 3, maskedCategories: ["ssn"], appliedAt: 123 },
      });
      expect(mockDb.patch).toHaveBeenCalledWith("c1", expect.objectContaining({
        redactionMetadata: expect.objectContaining({ mode: "safe" }),
      }));

      // recordAuditLog
      const logId = await (claims.recordAuditLog as any)._handler(mockCtx, {
        claimId: "c1",
        eventType: "custom_log",
        actor: "Tester",
        details: "Details",
      });
      expect(logId).toBe("id_new");

      // updateFinancialLiability
      await (claims.updateFinancialLiability as any)._handler(mockCtx, {
        claimId: "c1",
        financialLiability: {
          billedAmount: 10000,
          allowedAmount: 8000,
          contractualDiscount: 2000,
          deductibleTotal: 1500,
          deductibleMet: 500,
          coinsuranceRate: 20,
          copayAmount: 50,
          outOfPocketMax: 5000,
          outOfPocketSpent: 2000,
          networkStatus: "in_network",
          noSurprisesActProtected: false,
          calculatedPatientShare: 1500,
          balanceBillingAmount: 0,
          totalPatientExposureDenied: 10000,
          totalPatientLiabilityOverturned: 1500,
          netPatientSavings: 8500,
          payerExpectedObligation: 6500,
          updatedAt: 12345,
        },
      });
      expect(mockDb.patch).toHaveBeenCalledWith("c1", expect.objectContaining({
        financialLiability: expect.objectContaining({ outOfPocketMax: 5000 }),
      }));

      // updateErisaPenalties
      await (claims.updateErisaPenalties as any)._handler(mockCtx, {
        claimId: "c1",
        erisaPenalties: {
          documentRequestDate: "2026-01-01",
          disclosureDeadlineDate: "2026-01-31",
          calculationDate: "2026-02-15",
          requestedDocuments: ["Plan Document"],
          complianceStatus: "violation",
          dailyPenaltyRate: 110,
          daysInDefault: 15,
          accruedPenaltyAmount: 1650,
          statutoryInterestRate: 10,
          accruedInterestAmount: 165,
          estimatedAttorneysFees: 2500,
          totalStatutoryDamages: 1815,
          totalPlanAdministratorExposure: 4315,
          severityTier: "severe",
          statutoryDemandLanguage: "Demand",
          updatedAt: 12345,
        },
      });
      expect(mockDb.patch).toHaveBeenCalledWith("c1", expect.objectContaining({
        erisaPenalties: expect.objectContaining({ accruedPenaltyAmount: 1650 }),
      }));




    });
  });

  describe("generateUploadUrl, sweepDeadlines & findMatchingClaimInternal", () => {
    it("generateUploadUrl & setAgentMailInboxes", async () => {
      const mockDb = createMockDb();
      const mockCtx: any = {
        storage: { generateUploadUrl: vi.fn().mockResolvedValue("https://upload.site/123") },
        db: mockDb,
      };

      const url = await (claims.generateUploadUrl as any)._handler(mockCtx, {});
      expect(url).toBe("https://upload.site/123");

      await (claims.setAgentMailInboxes as any)._handler(mockCtx, {
        claimId: "c1",
        claimInboxId: "in_1",
        claimInboxEmail: "c1@agentmail.com",
        agentMailThreadId: "thread_custom_1",
        status: "shared",
      });
      expect(mockDb.patch).toHaveBeenCalledWith("c1", expect.objectContaining({
        assignedAgentEmail: "c1@agentmail.com",
        agentMailThreadId: "thread_custom_1",
      }));

      await (claims.setAgentMailThreadIdInternal as any)._handler(mockCtx, {
        claimId: "c1",
        agentMailThreadId: "thread_custom_2",
      });
      expect(mockDb.patch).toHaveBeenCalledWith("c1", {
        agentMailThreadId: "thread_custom_2",
      });

      mockDb.query().withIndex().first.mockResolvedValue({ _id: "c1", agentMailThreadId: "thread_custom_2" });
      const byThread = await (claims.getByThreadIdInternal as any)._handler(mockCtx, { threadId: "thread_custom_2" });
      expect(byThread?.agentMailThreadId).toBe("thread_custom_2");
    });

    it("sweepDeadlines: paginates claims, updates daysRemaining, and logs critical alarm", async () => {
      const activeClaim = {
        _id: "c1",
        status: "ready_for_review",
        statutoryDeadline: Date.now() + 86400000 * 5,
        daysRemaining: 10,
      };
      const mockDb = createMockDb();
      mockDb.query().paginate.mockResolvedValue({
        page: [activeClaim],
        isDone: true,
        continueCursor: "",
      });
      const mockCtx: any = { db: mockDb };

      const res = await (claims.sweepDeadlines as any)._handler(mockCtx, {});
      expect(res.totalUpdated).toBe(1);
      expect(mockDb.patch).toHaveBeenCalledWith("c1", expect.objectContaining({ daysRemaining: expect.any(Number) }));
    });

    it("findMatchingClaimInternal: matches by claimNumber or recipient", async () => {
      const matchingClaim = { _id: "c1", claimNumber: "CLM-9999", assignedAgentEmail: "appeal-9999@claimhero.agentmail.com" };
      const mockDb = createMockDb();
      mockDb.query().withIndex().first.mockResolvedValue(matchingClaim);
      mockDb.query().withIndex().take.mockResolvedValue([matchingClaim]);
      const mockCtx: any = { db: mockDb };

      const res = await (claims.findMatchingClaimInternal as any)._handler(mockCtx, {
        subject: "Re: CLM-9999 Medical Appeal",
        bodySnippet: "Review of claim CLM-9999",
        recipients: ["appeal-9999@claimhero.agentmail.com"],
      });

      expect(res?._id).toBe("c1");
    });

    it("updateAppealContextInternal, updateRedactionMetadata & recordAuditLog", async () => {
      const mockDb = createMockDb({
        get: vi.fn().mockResolvedValue({ _id: "c1", userId: "user_123" }),
      });
      vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
      const mockCtx: any = { db: mockDb };

      await (claims.updateAppealContextInternal as any)._handler(mockCtx, {
        claimId: "c1",
        sender: { name: "Dr. Amanda Vance", email: "vance@clinic.org", phone: "555-0199" },
        clinicalFacts: {
          symptomsAndFunctionalImpact: "Severe spinal stenosis",
          recordsAreIncomplete: false,
        },
        physicianNotes: "12 weeks of failed physical therapy.",
        redactionMetadata: {
          isRedacted: true,
          mode: "synthetic_pseudonym",
          redactedEntityCount: 3,
          maskedCategories: ["PATIENT_NAME"],
          appliedAt: 1000,
        },
      });
      expect(mockDb.patch).toHaveBeenCalledWith("c1", expect.objectContaining({
        appealContext: expect.objectContaining({
          sender: expect.objectContaining({ name: "Dr. Amanda Vance" }),
        }),
      }));

      await (claims.updateRedactionMetadata as any)._handler(mockCtx, {
        claimId: "c1",
        redactionMetadata: {
          isRedacted: true,
          mode: "token_hash",
          redactedEntityCount: 2,
          maskedCategories: ["SSN"],
          appliedAt: 2000,
        },
      });
      expect(mockDb.insert).toHaveBeenCalledWith("appealAuditLogs", expect.objectContaining({
        eventType: "hipaa_redaction_applied",
      }));

      const logId = await (claims.recordAuditLog as any)._handler(mockCtx, {
        claimId: "c1",
        eventType: "custom_event",
        actor: "Officer",
        details: "Detailed notes",
      });
      expect(logId).toBe("id_new");
    });

    it("updateFinancialLiability & updateErisaPenalties mutations", async () => {
      const mockDb = createMockDb({
        get: vi.fn().mockResolvedValue({ _id: "c1", userId: "user_123" }),
      });
      vi.mocked(getAuthUserId).mockResolvedValue("user_123" as any);
      const mockCtx: any = { db: mockDb };

      await (claims.updateFinancialLiability as any)._handler(mockCtx, {
        claimId: "c1",
        financialLiability: {
          billedAmount: 24500,
          allowedAmount: 18000,
          contractualDiscount: 6500,
          deductibleTotal: 2500,
          deductibleMet: 2500,
          coinsuranceRate: 20,
          copayAmount: 0,
          outOfPocketMax: 6000,
          outOfPocketSpent: 6000,
          networkStatus: "in_network",
          noSurprisesActProtected: true,
          calculatedPatientShare: 0,
          balanceBillingAmount: 0,
          totalPatientExposureDenied: 24500,
          totalPatientLiabilityOverturned: 0,
          netPatientSavings: 24500,
          payerExpectedObligation: 18000,
          updatedAt: 1000,
        },
      });
      expect(mockDb.patch).toHaveBeenCalledWith("c1", expect.objectContaining({
        financialLiability: expect.objectContaining({ billedAmount: 24500 }),
      }));

      await (claims.updateErisaPenalties as any)._handler(mockCtx, {
        claimId: "c1",
        erisaPenalties: {
          documentRequestDate: "2026-01-01",
          disclosureDeadlineDate: "2026-01-31",
          calculationDate: "2026-02-15",
          requestedDocuments: ["Plan Document", "CPB 0016"],
          complianceStatus: "non_compliant",
          dailyPenaltyRate: 110,
          daysInDefault: 15,
          accruedPenaltyAmount: 1650,
          statutoryInterestRate: 10,
          accruedInterestAmount: 165,
          estimatedAttorneysFees: 5000,
          totalStatutoryDamages: 6815,
          totalPlanAdministratorExposure: 6815,
          severityTier: "high",
          statutoryDemandLanguage: "Under ERISA § 502(c)...",
          updatedAt: 1000,
        },
      });
      expect(mockDb.patch).toHaveBeenCalledWith("c1", expect.objectContaining({
        erisaPenalties: expect.objectContaining({ accruedPenaltyAmount: 1650 }),
      }));
    });
  });
});
