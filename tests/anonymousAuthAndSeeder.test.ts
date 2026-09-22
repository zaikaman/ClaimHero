/// <reference path="./auth-mock.d.ts" />
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createAnonymousUser, createGoogleUser, createPasswordUser } from "../convex/users";
import { seedDemoCasesForUser, seedDemoCases } from "../convex/demoSeeder";
import { claimsAggregate } from "../convex/lib/aggregates";

describe("Anonymous Auth Provider & 3 Pre-Seeded Demo Cases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createMockCtx = () => {
    const insertedRecords: Record<string, any[]> = {
      users: [],
      patients: [],
      claims: [],
      clinicalEvidences: [],
      appeals: [],
      p2pScripts: [],
      pipelineActivities: [],
      appealAuditLogs: [],
      emailThreads: [],
      emailMessages: [],
    };

    let idCounter = 1;
    const db: any = {
      insert: vi.fn().mockImplementation(async (table: string, doc: any) => {
        const id = `${table}_id_${idCounter++}`;
        const record = { _id: id, ...doc };
        if (!insertedRecords[table]) {
          insertedRecords[table] = [];
        }
        insertedRecords[table].push(record);
        return id;
      }),
      get: vi.fn().mockImplementation(async (id: string) => {
        for (const table of Object.keys(insertedRecords)) {
          const match = insertedRecords[table].find((r) => r._id === id);
          if (match) return match;
        }
        return null;
      }),
      patch: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockReturnValue({
        withIndex: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(null),
          collect: vi.fn().mockResolvedValue([]),
          take: vi.fn().mockResolvedValue([]),
          order: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue(null),
          }),
        }),
      }),
    };

    return {
      ctx: { db } as any,
      insertedRecords,
    };
  };

  it("createAnonymousUser creates an anonymous user and triggers demo seeding", async () => {
    const { ctx, insertedRecords } = createMockCtx();

    // Spy on claimsAggregate to ensure insert is called
    vi.spyOn(claimsAggregate, "insert").mockResolvedValue(undefined as any);

    const userId = await (createAnonymousUser as any)._handler(ctx, {
      provider: "anonymous",
      providerAccountId: "anon_account_123",
      profile: {},
    });

    expect(userId).toBeDefined();
    expect(insertedRecords.users.length).toBe(1);

    const user = insertedRecords.users[0];
    expect(user.name).toBe("Anonymous Advocate");
    expect(user.role).toBe("advocate");
    expect(user.isAnonymous).toBe(true);

    // Verify 3 demo patients were seeded
    expect(insertedRecords.patients.length).toBe(3);
    const patientNames = insertedRecords.patients.map((p) => p.name);
    expect(patientNames).toContain("Eleanor Vance");
    expect(patientNames).toContain("Marcus Sterling");
    expect(patientNames).toContain("Michael Patel");

    // Verify 3 demo claims were seeded
    expect(insertedRecords.claims.length).toBe(3);
    for (const claim of insertedRecords.claims) {
      expect(claim.userId).toBe(userId);
      expect(claim.isDemo).toBe(true);
      expect(claim.origin).toBe("demo-fixture");
      expect(claim.dataOrigin).toBe("demo-fixture");
      expect(claim.appealReadinessScore).toBeGreaterThanOrEqual(70);
      expect(claim.evidenceCoverageScore).toBeGreaterThanOrEqual(70);
      expect(claim.overturnProbabilityScore).toBeGreaterThanOrEqual(70);
      expect(claim.scoringBreakdown?.length).toBe(4);
      expect(claim.appealContext?.clinicalFacts).toBeDefined();
      expect(claim.appealContext?.physicianNotes).toBeDefined();
    }

    // Verify statuses: 2 unsent cases with briefs ready for review, 1 won
    const statuses = insertedRecords.claims.map((c) => c.status);
    expect(statuses.filter((s) => s === "ready_for_review").length).toBe(2);
    expect(statuses).toContain("won");
    expect(statuses).not.toContain("drafting");

    // Verify clinical evidences were created with genuine policy citations
    expect(insertedRecords.clinicalEvidences.length).toBeGreaterThanOrEqual(20);
    const sourceTypes = insertedRecords.clinicalEvidences.map((e) => e.sourceType);
    expect(sourceTypes).toContain("payer_cpb");
    expect(sourceTypes).toContain("pubmed_study");
    expect(sourceTypes).toContain("nccn_guideline");
    expect(sourceTypes).toContain("legal_precedent");

    // Verify appeals briefs exist and are full 4-page synthesized briefs with Case Adjudication table
    expect(insertedRecords.appeals.length).toBe(3);
    for (const appeal of insertedRecords.appeals) {
      expect(appeal.appealLevel).toBe("level_1_internal");
      expect(appeal.targetAuthority).toBe("Payer Medical Director Review");
      expect(appeal.fullAppealMarkdown).toBeDefined();
      expect(appeal.fullAppealMarkdown.length).toBeGreaterThan(1000);
      expect(appeal.fullAppealMarkdown).toContain("Case Adjudication & Dispute Summary");
      expect(appeal.fullAppealMarkdown).toContain("Enclosures & Accompanying Clinical Documentation");
      expect(appeal.executiveSummary).toBeDefined();
      expect(appeal.medicalNecessityArguments).toBeDefined();
      expect(appeal.medicalNecessityArguments).toContain("Clinical Policy Criteria Crosswalk & Necessity Rationale");
      expect(appeal.legalCitations).toBeDefined();
    }

    // Verify won claim has approved appeal and compiled formal PDF packet
    const wonClaim = insertedRecords.claims.find((c) => c.status === "won");
    expect(wonClaim).toBeDefined();
    const wonAppeal = insertedRecords.appeals.find((a) => a.claimId === wonClaim._id);
    expect(wonAppeal?.isHumanApproved).toBe(true);
    expect(wonAppeal?.pdfExportStorageId).toBeDefined();

    // Verify each unsent ready_for_review claim has a brief but no approval (not sent)
    const readyClaims = insertedRecords.claims.filter((c) => c.status === "ready_for_review");
    expect(readyClaims.length).toBe(2);
    for (const readyClaim of readyClaims) {
      const brief = insertedRecords.appeals.find((a) => a.claimId === readyClaim._id);
      expect(brief?.fullAppealMarkdown.length).toBeGreaterThan(1000);
      expect(brief?.isHumanApproved).not.toBe(true);
    }

    // Verify P2P scripts with 4 phases and cheat sheets
    expect(insertedRecords.p2pScripts.length).toBe(3);
    for (const p2p of insertedRecords.p2pScripts) {
      expect(p2p.openingStatutoryStatement).toBeDefined();
      expect(p2p.clinicalPolicyCitations.length).toBeGreaterThanOrEqual(1);
      expect(p2p.disqualificationCounters.length).toBeGreaterThanOrEqual(1);
      expect(p2p.condensedCheatSheet).toBeDefined();
      expect(p2p.fullScriptMarkdown).toBeDefined();
    }

    // Verify pipeline activities exist across all stages
    expect(insertedRecords.pipelineActivities.length).toBe(30);
    const stages = insertedRecords.pipelineActivities.map((a) => a.stage);
    expect(stages).toContain("run");
    expect(stages).toContain("crawl");
    expect(stages).toContain("precedents");
    expect(stages).toContain("score");
    expect(stages).toContain("synthesis");

    // Verify audit logs with Merkle chain events
    expect(insertedRecords.appealAuditLogs.length).toBeGreaterThanOrEqual(20);
    const eventTypes = insertedRecords.appealAuditLogs.map((l) => l.eventType);
    expect(eventTypes).toContain("denial_ingested");
    expect(eventTypes).toContain("policy_crawled");
    expect(eventTypes).toContain("precedent_vectors_retrieved");
    expect(eventTypes).toContain("overturn_score_computed");
    expect(eventTypes).toContain("appeal_approved");
    expect(eventTypes).toContain("appeal_dispatched");
    expect(eventTypes).toContain("decision_recorded");

    // Verify professional AgentMail thread & correspondence for overturned Case 3 with attached formal PDF packet
    expect(insertedRecords.emailThreads.length).toBe(1);
    expect(insertedRecords.emailMessages.length).toBe(2);

    const outboundMsg = insertedRecords.emailMessages.find((m) => m.direction === "outbound");
    expect(outboundMsg).toBeDefined();
    expect(outboundMsg?.hasAttachments).toBe(true);
    expect(outboundMsg?.attachments?.length).toBe(1);
    expect(outboundMsg?.attachments?.[0]?.contentType).toBe("application/pdf");
    expect(outboundMsg?.attachments?.[0]?.filename).toContain("Formal-Appeal-Packet-");
    expect(outboundMsg?.bodyText.length).toBeGreaterThan(1000);
    expect(outboundMsg?.bodyText).toContain("FORMAL DEMAND FOR ADMINISTRATIVE RECONSIDERATION");
    expect(outboundMsg?.bodyText).toContain("Aetna CPB 0171");
    expect(outboundMsg?.bodyHtml).toContain("Appeal of Adverse Benefit Determination");

    const winningMsg = insertedRecords.emailMessages.find(
      (m) => m.detectedDetermination === "OVERTURNED_APPROVED"
    );
    expect(winningMsg).toBeDefined();
    expect(winningMsg?.settlementAmount).toBe(2850);
    expect(winningMsg?.bodyText.length).toBeGreaterThan(1000);
    expect(winningMsg?.bodyText).toContain("ADVERSE BENEFIT DETERMINATION OVERTURNED IN FULL");
    expect(winningMsg?.bodyText).toContain("Marcus Vance, MD, FAAOS");
  });

  it("seedDemoCasesForUser inserts all 3 claims into claimsAggregate", async () => {
    const { ctx } = createMockCtx();
    const aggregateInsertSpy = vi.spyOn(claimsAggregate, "insert").mockResolvedValue(undefined as any);

    await seedDemoCasesForUser(ctx, "user_test_999" as any);

    expect(aggregateInsertSpy).toHaveBeenCalledTimes(3);
  });

  it("createPasswordUser creates user and atomically seeds demo cases", async () => {
    const { ctx, insertedRecords } = createMockCtx();
    vi.spyOn(claimsAggregate, "insert").mockResolvedValue(undefined as any);

    const userId = await (createPasswordUser as any)._handler(ctx, {
      provider: "password",
      providerAccountId: "pwd_123",
      profile: { username: "advocate@test.org" },
    });

    expect(userId).toBeDefined();
    expect(insertedRecords.users.length).toBe(1);
    expect(insertedRecords.claims.length).toBe(3);
    expect(insertedRecords.patients.length).toBe(3);
  });

  it("createGoogleUser creates new user and atomically seeds demo cases", async () => {
    const { ctx, insertedRecords } = createMockCtx();
    vi.spyOn(claimsAggregate, "insert").mockResolvedValue(undefined as any);

    const userId = await (createGoogleUser as any)._handler(ctx, {
      provider: "google",
      providerAccountId: "g_123",
      profile: { email: "zaikaman123@gmail.com", name: "Zaikaman", emailVerified: true },
    });

    expect(userId).toBeDefined();
    expect(insertedRecords.users.length).toBe(1);
    expect(insertedRecords.claims.length).toBe(3);
    expect(insertedRecords.patients.length).toBe(3);
  });

  it("seedDemoCases mutation seeds demo cases idempotently for authenticated caller", async () => {
    const { ctx, insertedRecords } = createMockCtx();
    vi.spyOn(claimsAggregate, "insert").mockResolvedValue(undefined as any);

    // Mock authenticated user
    ctx.auth = {
      getUserIdentity: vi.fn().mockResolvedValue({ subject: "auth_user_456" }),
    };

    // First call: seeds cases
    const res1 = await (seedDemoCases as any)._handler(ctx, {});
    expect(res1.success).toBe(true);
    expect(res1.seeded).toBe(true);
    expect(insertedRecords.claims.length).toBe(3);

    // Mock query with index to return existing demo claims for idempotent second call
    ctx.db.query = vi.fn().mockReturnValue({
      withIndex: vi.fn().mockReturnValue({
        collect: vi.fn().mockResolvedValue(insertedRecords.claims),
      }),
    });

    const res2 = await (seedDemoCases as any)._handler(ctx, {});
    expect(res2.success).toBe(true);
    expect(res2.alreadySeeded).toBe(true);
    expect(insertedRecords.claims.length).toBe(3); // No duplicates
  });
});
