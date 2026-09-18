import { describe, it, expect, vi } from "vitest";
import {
  parseDateToUtcMidnight,
  calculateDaysRemaining,
  resolveStatutoryDeadline,
  ONE_DAY_MS,
} from "../convex/lib/dateUtils";
import { formatDate } from "../src/lib/utils";
import {
  calculateLiveCountdown,
  calculatePortfolioDeadlineStats,
} from "../src/hooks/useDeadlineAlarm";
import { buildCertificateData } from "../convex/serviceCertificate";
import type { Doc, Id } from "../convex/_generated/dataModel";
import type { QueryCtx } from "../convex/_generated/server";

describe("Statutory Deadline Anchoring, Non-Fabrication & Precision Alarm Timing", () => {
  describe("1. Statutory Deadline Anchoring (convex/lib/dateUtils.ts)", () => {
    it("anchors deadline to denialDate: 60-day-old denial ingested today receives 120 days remaining, not a fresh 180 days", () => {
      const now = Date.UTC(2026, 8, 18, 12, 0, 0); // 2026-09-18
      const sixtyDaysAgoStr = "2026-07-20"; // 60 days before Sept 18

      const result = resolveStatutoryDeadline({
        denialDate: sixtyDaysAgoStr,
        appealFilingDeadlineDays: 180,
        now,
      });

      expect(result.anchorType).toBe("denial");
      expect(result.anchorDate).toBe(sixtyDaysAgoStr);

      // The statutory deadline is July 20 + 180 days = January 16, 2027
      const expectedDeadline = Date.UTC(2026, 6, 20) + 180 * ONE_DAY_MS;
      expect(result.statutoryDeadline).toBe(expectedDeadline);

      // Days remaining from Sept 18 to Jan 16 is exactly 120 days, NOT 180!
      expect(result.daysRemaining).toBe(120);
      expect(result.effectiveDeadlineDays).toBe(180);
    });

    it("falls back to serviceDate when denialDate is not provided", () => {
      const now = Date.UTC(2026, 8, 18, 12, 0, 0);
      const serviceDateStr = "2026-08-01"; // 48 days ago

      const result = resolveStatutoryDeadline({
        serviceDate: serviceDateStr,
        appealFilingDeadlineDays: 180,
        now,
      });

      expect(result.anchorType).toBe("service");
      expect(result.anchorDate).toBe(serviceDateStr);
      expect(result.daysRemaining).toBe(132); // 180 - 48
    });

    it("falls back to ingestion time only when neither denialDate nor serviceDate is valid", () => {
      const now = Date.UTC(2026, 8, 18, 12, 0, 0);

      const result = resolveStatutoryDeadline({
        denialDate: "INVALID_DATE",
        serviceDate: "N/A",
        appealFilingDeadlineDays: 180,
        now,
      });

      expect(result.anchorType).toBe("ingestion");
      expect(result.daysRemaining).toBe(180);
    });

    it("preserves negative values for overdue claims without clamping to 0", () => {
      const now = Date.UTC(2026, 8, 18, 12, 0, 0);
      const twoHundredDaysAgo = "2026-03-01"; // 201 days ago

      const result = resolveStatutoryDeadline({
        denialDate: twoHundredDaysAgo,
        appealFilingDeadlineDays: 180,
        now,
      });

      // 180 - 201.5 = -21.5 -> floor(-21.5) = -22 days overdue
      expect(result.daysRemaining).toBeLessThan(0);
      expect(result.daysRemaining).toBe(-22);
    });
  });

  describe("2. Non-Clamping of Overdue Deadlines (calculateDaysRemaining)", () => {
    it("returns negative numbers for past deadlines rather than clamping to 0", () => {
      const now = 1750000000000;
      const fiveDaysOverdue = now - 5 * ONE_DAY_MS;

      const remaining = calculateDaysRemaining(fiveDaysOverdue, now);
      expect(remaining).toBe(-5);

      const twelveHoursOverdue = now - 12 * 3600 * 1000;
      expect(calculateDaysRemaining(twelveHoursOverdue, now)).toBe(-1);
    });

    it("returns 0 for deadlines expiring today", () => {
      const now = 1750000000000;
      expect(calculateDaysRemaining(now, now)).toBe(0);
    });

    it("rounds up positive fractions of a day", () => {
      const now = 1750000000000;
      const twelveHoursRemaining = now + 12 * 3600 * 1000;
      expect(calculateDaysRemaining(twelveHoursRemaining, now)).toBe(1);
    });
  });

  describe("3. Date Parsing & UTC Parity (formatDate vs appealSynthesizer UTC)", () => {
    it("parses ISO YYYY-MM-DD to exact UTC midnight", () => {
      const ts = parseDateToUtcMidnight("2026-08-01");
      expect(ts).toBe(Date.UTC(2026, 7, 1));
      const date = new Date(ts!);
      expect(date.getUTCFullYear()).toBe(2026);
      expect(date.getUTCMonth()).toBe(7); // 0-indexed August
      expect(date.getUTCDate()).toBe(1);
    });

    it("parses US MM/DD/YYYY to exact UTC midnight", () => {
      const ts = parseDateToUtcMidnight("08/01/2026");
      expect(ts).toBe(Date.UTC(2026, 7, 1));
    });

    it("formats dates in UTC eliminating off-by-one errors across timezones", () => {
      // Regardless of local timezone, "2026-08-01" must format as Aug 1, 2026
      expect(formatDate("2026-08-01")).toBe("Aug 1, 2026");
      expect(formatDate("08/01/2026")).toBe("Aug 1, 2026");

      const epochUtc = Date.UTC(2026, 7, 1);
      expect(formatDate(epochUtc)).toBe("Aug 1, 2026");
    });
  });

  describe("4. Service Certificate Timing & Non-Fabrication (convex/serviceCertificate.ts)", () => {
    const mockClaimId = "claim_test_999" as Id<"claims">;
    const mockPatientId = "patient_test_999" as Id<"patients">;

    const baseClaim: Doc<"claims"> = {
      _id: mockClaimId,
      _creationTime: 1726000000000,
      userId: "user_test_999" as Id<"users">,
      patientId: mockPatientId,
      patientName: "John Doe",
      claimNumber: "CLM-99901",
      insurancePayer: "Aetna",
      providerName: "Memorial Clinic",
      serviceDate: "INVALID_DATE",
      deniedAmount: 15000,
      patientOwedAmount: 15000,
      cptCodes: ["99214"],
      icd10Codes: ["R07.9"],
      denialReasonCode: "CO-50",
      denialReasonDescription: "Not Medically Necessary",
      status: "dispatched",
      statutoryDeadline: Date.now() + 90 * ONE_DAY_MS,
      daysRemaining: 90,
      appealFilingDeadlineDays: 180,
      assignedAgentEmail: "claims-clm-99901@claimhero.agentmail.to",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const mockCtx = {
      db: {
        get: vi.fn().mockResolvedValue(null),
        query: vi.fn().mockReturnValue({
          withIndex: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              take: vi.fn().mockResolvedValue([]),
              first: vi.fn().mockResolvedValue(null),
            }),
          }),
        }),
      },
    } as unknown as QueryCtx;

    it("does NOT fabricate createdAt - 14d when serviceDate is NaN", async () => {
      const cert = await buildCertificateData(mockCtx, baseClaim);

      expect(cert.isTimelyFiled).toBe(true);
      // It must NOT state "Day 14 of the 180-Day Statutory Window"
      expect(cert.timelinessStatement).not.toContain("Day 14 of the 180-Day Statutory Window");
      expect(cert.timelinessStatement).toContain("unrecorded in source notice");
      expect(cert.daysElapsedSinceService).toBe(0);
    });

    it("reports untimely submission and negative days remaining when dispatched after deadline", async () => {
      const pastDeadlineClaim: Doc<"claims"> = {
        ...baseClaim,
        serviceDate: "2026-01-01",
        statutoryDeadline: Date.now() - 10 * ONE_DAY_MS, // expired 10 days ago
        daysRemaining: -10,
      };

      const cert = await buildCertificateData(mockCtx, pastDeadlineClaim);

      expect(cert.isTimelyFiled).toBe(false);
      expect(cert.daysRemainingAtDispatch).toBeLessThan(0);
      expect(cert.timelinessStatement).toContain("Emergency Submission");
      expect(cert.timelinessStatement).toContain("past statutory deadline bar");
    });
  });

  describe("5. Real-Time useDeadlineAlarm Hook & Calculations", () => {
    it("calculates live countdown down to seconds for an active claim", () => {
      const now = Date.UTC(2026, 8, 18, 12, 0, 0);
      // Deadline in 10 days, 4 hours, 30 minutes, 15 seconds
      const deadline = now + (10 * 24 * 3600 + 4 * 3600 + 30 * 60 + 15) * 1000;

      const countdown = calculateLiveCountdown(deadline, now, {
        status: "ingested",
        appealFilingDeadlineDays: 180,
      });

      expect(countdown.isOverdue).toBe(false);
      expect(countdown.isCritical).toBe(true); // <= 14 days
      expect(countdown.urgencyTier).toBe("critical");
      expect(countdown.days).toBe(11); // ceil calendar days remaining
      expect(countdown.hours).toBe(4);
      expect(countdown.minutes).toBe(30);
      expect(countdown.seconds).toBe(15);
      expect(countdown.shouldAlarm).toBe(true);
      expect(countdown.formattedCountdown).toBe("10d 4h 30m (Critical)");
    });

    it("marks won claims as resolved with 100% progress and no alarms", () => {
      const now = Date.now();
      const deadline = now + 10 * ONE_DAY_MS;

      const countdown = calculateLiveCountdown(deadline, now, {
        status: "won",
        appealFilingDeadlineDays: 180,
      });

      expect(countdown.urgencyTier).toBe("resolved");
      expect(countdown.progressPercent).toBe(100);
      expect(countdown.shouldAlarm).toBe(false);
      expect(countdown.formattedCountdown).toBe("Case Resolved & Overturned");
    });

    it("aggregates portfolio deadline alarms accurately", () => {
      const now = Date.now();
      const claims = [
        {
          _id: "c1",
          claimNumber: "CLM-1",
          status: "ingested",
          statutoryDeadline: now - 3 * ONE_DAY_MS, // overdue
          appealFilingDeadlineDays: 180,
        },
        {
          _id: "c2",
          claimNumber: "CLM-2",
          status: "drafting",
          statutoryDeadline: now + 5 * ONE_DAY_MS, // critical
          appealFilingDeadlineDays: 180,
        },
        {
          _id: "c3",
          claimNumber: "CLM-3",
          status: "won",
          statutoryDeadline: now + 2 * ONE_DAY_MS, // closed won
          appealFilingDeadlineDays: 180,
        },
        {
          _id: "c4",
          claimNumber: "CLM-4",
          status: "ready_for_review",
          statutoryDeadline: now + 60 * ONE_DAY_MS, // normal
          appealFilingDeadlineDays: 180,
        },
      ];

      const stats = calculatePortfolioDeadlineStats(claims, now);

      expect(stats.totalClaims).toBe(4);
      expect(stats.activeClaimsCount).toBe(3); // excludes won
      expect(stats.overdueCount).toBe(1);
      expect(stats.criticalCount).toBe(1);
      expect(stats.hasActiveAlarm).toBe(true);
      expect(stats.nearestDeadlineClaim?._id).toBe("c1");
      expect(stats.summaryText).toContain("1 case(s) overdue; 1 in critical statutory window");
    });
  });
});
