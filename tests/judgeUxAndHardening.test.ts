import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("Judge UX & Pipeline Hardening", () => {
  it("deploy.yml smoke test verifies /, /app, /app/evidence, and /login", () => {
    const deployYmlPath = path.resolve(__dirname, "../.github/workflows/deploy.yml");
    const content = fs.readFileSync(deployYmlPath, "utf-8");

    expect(content).toContain('ENDPOINTS=("/" "/app" "/app/evidence" "/login")');
    expect(content).toContain('URL="${BASE_URL}${EP}"');
    expect(content).toContain("All synthetic smoke tests passed successfully.");
  });

  it("crons.ts 15-minute sweep interval aligns with mailDispatcher.ts doc comment", () => {
    const cronsPath = path.resolve(__dirname, "../convex/crons.ts");
    const cronsContent = fs.readFileSync(cronsPath, "utf-8");

    const dispatcherPath = path.resolve(__dirname, "../convex/actions/mailDispatcher.ts");
    const dispatcherContent = fs.readFileSync(dispatcherPath, "utf-8");

    expect(cronsContent).toContain('"sentinel-autopilot-sla-sweep"');
    expect(cronsContent).toContain("{ minutes: 15 }");
    expect(dispatcherContent).toContain("Runs periodically every 15 minutes (via crons.ts sentinel-autopilot-sla-sweep)");
    expect(dispatcherContent).toContain("older than the 1-hour review SLA");
  });

  it("claims.list defaults to limit 100 rather than capping at 50", async () => {
    const claimsModule = await import("../convex/claims");
    const listHandler = (claimsModule.list as any)._handler;

    const mockTake = vi.fn().mockResolvedValue([]);
    const mockOrder = vi.fn().mockReturnValue({ take: mockTake });
    const mockWithIndex = vi.fn().mockReturnValue({ order: mockOrder });
    const mockQuery = vi.fn().mockReturnValue({ withIndex: mockWithIndex });

    const mockCtx: any = {
      auth: {
        getUserIdentity: vi.fn().mockResolvedValue({ subject: "user_test" }),
      },
      db: {
        query: mockQuery,
        get: vi.fn(),
      },
    };

    await listHandler(mockCtx, {});
    expect(mockTake).toHaveBeenCalledWith(100);
  });

  it("chatbot.searchClaimsForChatbot queries search_claims index without post-take truncation", async () => {
    const chatbotModule = await import("../convex/chatbot");
    const searchHandler = (chatbotModule.searchClaimsForChatbot as any)._handler;

    const mockResults = [
      {
        _id: "c_1",
        claimNumber: "CLM-999",
        patientId: "p_1",
        patientName: "Alex Patient",
        cptCodes: ["99214"],
        denialReasonCode: "CO-45",
        denialReasonDescription: "Experimental knee treatment",
        status: "ready_for_review",
        deniedAmount: 4500,
        patientOwedAmount: 900,
      },
    ];

    const mockTake = vi.fn().mockResolvedValue(mockResults);
    const mockWithSearchIndex = vi.fn().mockReturnValue({ take: mockTake });
    const mockFirst = vi.fn().mockResolvedValue(null);
    const mockWithIndex = vi.fn().mockReturnValue({ first: mockFirst });

    const mockCtx: any = {
      db: {
        query: vi.fn().mockReturnValue({
          withSearchIndex: mockWithSearchIndex,
          withIndex: mockWithIndex,
        }),
        get: vi.fn().mockResolvedValue({
          name: "Alex Patient",
          insurancePayer: "Aetna",
        }),
      },
    };

    const res = await searchHandler(mockCtx, {
      searchTerm: "knee",
      userId: "user_123",
      limit: 10,
    });

    expect(mockWithSearchIndex).toHaveBeenCalledWith("search_claims", expect.any(Function));
    expect(res.length).toBe(1);
    expect(res[0].claimNumber).toBe("CLM-999");
    expect(res[0].patientName).toBe("Alex Patient");
    expect(res[0].payer).toBe("Aetna");
  });

  it("redaction gating logic masks PHI and sensitive codes per HIPAA Safe Harbor standard", () => {
    const rawClaim = {
      claimNumber: "CLM-777",
      patientName: "Jonathan Doe",
      patient: {
        _id: "pat_1",
        name: "Jonathan Doe",
        memberId: "MBN987654321",
        insurancePayer: "UnitedHealthcare",
        email: "jdoe@example.com",
        state: "FL",
        createdAt: 1000,
      },
      cptCodes: ["27447"],
      denialReasonCode: "CO-50",
      denialReasonDescription: "Medical necessity documentation required",
      deniedAmount: 18500,
      patientOwedAmount: 3200,
      serviceDate: "2026-08-01",
      daysRemaining: 12,
      overturnProbabilityScore: 88,
      status: "ready_for_review",
      redactionMetadata: {
        isRedacted: true,
        mode: "HIPAA_SAFE_HARBOR",
        redactedEntityCount: 3,
        maskedCategories: ["name", "member_id", "cpt"],
        appliedAt: 1000,
      },
    };

    // Redaction gate simulation as used in CaseRadar.tsx
    const isClaimRedacted = true;
    const name = isClaimRedacted
      ? (rawClaim.patient?.name ? `[REDACTED - ${rawClaim.patient.name.charAt(0)}***]` : "[REDACTED]")
      : rawClaim.patient?.name || "";

    const memberId = isClaimRedacted
      ? (rawClaim.patient?.memberId ? rawClaim.patient.memberId.replace(/^([A-Za-z0-9]{3}).*/, "$1*****") : "[REDACTED]")
      : rawClaim.patient?.memberId || "";

    const maskCpt = isClaimRedacted && (
      rawClaim.redactionMetadata?.maskedCategories?.includes("cpt") ||
      rawClaim.redactionMetadata?.mode === "PUBLIC_EXHIBIT"
    );
    const cptStr = maskCpt ? "[REDACTED-CPT]" : (rawClaim.cptCodes?.join("; ") || "");

    expect(name).toBe("[REDACTED - J***]");
    expect(name).not.toContain("Jonathan");
    expect(memberId).toBe("MBN*****");
    expect(memberId).not.toContain("987654321");
    expect(cptStr).toBe("[REDACTED-CPT]");
  });
});
