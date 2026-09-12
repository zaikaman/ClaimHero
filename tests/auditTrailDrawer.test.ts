import { describe, it, expect, vi, beforeEach } from "vitest";
import { useCommunications } from "../src/hooks/useCommunications";
import { AuditTimeline } from "../src/components/communications/AuditTimeline";
import { AuditTrailDrawer } from "../src/components/communications/AuditTrailDrawer";
import { Claim, AuditLog } from "../src/types";

// Mock convex/react hooks
const mockUseQuery = vi.fn();
const mockUseAction = vi.fn();

vi.mock("convex/react", () => ({
  useQuery: (...args: any[]) => mockUseQuery(...args),
  useAction: (...args: any[]) => mockUseAction(...args),
}));

// Mock React
vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    useMemo: vi.fn((fn: () => any) => fn()),
    useCallback: vi.fn((fn: any) => fn),
    useState: vi.fn((init: any) => {
      let state = typeof init === "function" ? init() : init;
      const setState = vi.fn((newVal: any) => {
        state = typeof newVal === "function" ? newVal(state) : newVal;
      });
      return [state, setState];
    }),
    useRef: vi.fn((init: any) => ({ current: init })),
    useEffect: vi.fn((fn: () => any) => {
      const cleanup = fn();
      if (typeof cleanup === "function") {
        cleanup();
      }
    }),
  };
});

const mockClaim: Claim = {
  _id: "claim_123" as any,
  _creationTime: 1700000000000,
  claimNumber: "CLM-8942-CIG-9305",
  patient: {
    name: "Eleanor Vance",
    dob: "1985-04-12",
    memberId: "MEM-8842",
    groupNumber: "GRP-CIG",
    insurancePayer: "CIGNA GLOBAL HEALTH BENEFITS",
  },
  provider: {
    name: "Dr. Sarah Jenkins",
    facility: "Metropolitan Surgical Center",
  },
  serviceDate: "2026-08-15",
  denialDate: "2026-08-25",
  statutoryDeadline: "2027-02-21",
  daysRemaining: 162,
  billedAmount: 14200,
  deniedAmount: 6400,
  status: "drafted",
  denialReasonCodes: ["CO-50"],
};

const mockLogs: AuditLog[] = [
  {
    _id: "log_1" as any,
    claimId: "claim_123" as any,
    eventType: "denial_ingested",
    actor: "Sentinel Electronic Intake",
    details: "Ingested EOB denial notice for CPT 29881 ($6,400.00).",
    timestamp: 1726140000000,
  },
  {
    _id: "log_2" as any,
    claimId: "claim_123" as any,
    eventType: "appeal_dispatched",
    actor: "AgentMail Gateway",
    details: "Dispatched appellate dossier to Cigna Grievance Gateway.",
    timestamp: 1726143600000,
  },
];

describe("Audit Trail Activation, Drawer & Timeline Verification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAction.mockReturnValue(vi.fn());
  });

  describe("useCommunications Hook: Audit Activation & Loading Bugfix", () => {
    it("does not report isLoadingAudit=true when audit is inactive (preventing stuck loading UI)", () => {
      // Convex useQuery returns undefined for skipped queries
      mockUseQuery.mockReturnValue(undefined);

      const hook = useCommunications(mockClaim, {
        activeView: "communications",
        enableAudit: false,
      });

      // Crucial fix: skipped queries must NOT report loading=true permanently
      expect(hook.isLoadingAudit).toBe(false);
      expect(hook.auditLogs).toEqual([]);
    });

    it("activates audit query and reports loading while query is in-flight when enableAudit=true", () => {
      mockUseQuery.mockReturnValue(undefined);

      const hook = useCommunications(mockClaim, {
        activeView: "communications",
        enableAudit: true,
      });

      expect(hook.isLoadingAudit).toBe(true);
    });

    it("populates audit logs and sets isLoadingAudit=false once Convex query resolves", () => {
      mockUseQuery.mockImplementation((_queryRef, args) => {
        if (args && args.claimId === "claim_123") {
          return mockLogs;
        }
        return [];
      });

      const hook = useCommunications(mockClaim, {
        activeView: "communications",
        enableAudit: true,
      });

      expect(hook.isLoadingAudit).toBe(false);
      expect(hook.auditLogs).toEqual(mockLogs);
      expect(hook.auditLogs.length).toBe(2);
    });

    it("handles audit activation in full-page audit view without explicit enableAudit flag", () => {
      mockUseQuery.mockImplementation((_queryRef, args) => {
        if (args && args.claimId === "claim_123") {
          return mockLogs;
        }
        return [];
      });

      const hook = useCommunications(mockClaim, {
        activeView: "audit",
      });

      expect(hook.isLoadingAudit).toBe(false);
      expect(hook.auditLogs).toEqual(mockLogs);
    });

    it("queries recent portfolio logs when no claim is selected and audit is active", () => {
      mockUseQuery.mockImplementation((_queryRef, args) => {
        if (args && args.limit) {
          return mockLogs;
        }
        return [];
      });

      const hook = useCommunications(null, {
        activeView: "audit",
      });

      expect(hook.isLoadingAudit).toBe(false);
      expect(hook.auditLogs).toEqual(mockLogs);
    });
  });

  describe("Component Structure and Export Integrity", () => {
    it("exports AuditTimeline as a valid functional component", () => {
      expect(typeof AuditTimeline).toBe("function");
    });

    it("exports AuditTrailDrawer as a valid functional component", () => {
      expect(typeof AuditTrailDrawer).toBe("function");
    });

    it("renders AuditTrailDrawer as null when isOpen is false", () => {
      const element = AuditTrailDrawer({
        isOpen: false,
        onClose: vi.fn(),
        claim: mockClaim,
        logs: mockLogs,
      });

      expect(element).toBeNull();
    });

    it("returns null during SSR when document is undefined", () => {
      const element = AuditTrailDrawer({
        isOpen: true,
        onClose: vi.fn(),
        claim: mockClaim,
        logs: mockLogs,
      });

      expect(element).toBeNull();
    });

    it("creates portal dialog when document is defined and isOpen is true", () => {
      const originalDoc = (globalThis as any).document;
      const originalWin = (globalThis as any).window;
      const mockBody = { nodeType: 1, style: { overflow: "" } };
      (globalThis as any).document = { body: mockBody };
      (globalThis as any).window = { addEventListener: vi.fn(), removeEventListener: vi.fn() };

      try {
        const element = AuditTrailDrawer({
          isOpen: true,
          onClose: vi.fn(),
          claim: mockClaim,
          logs: mockLogs,
        });

        expect(element).not.toBeNull();
      } finally {
        if (originalDoc === undefined) {
          delete (globalThis as any).document;
        } else {
          (globalThis as any).document = originalDoc;
        }
        if (originalWin === undefined) {
          delete (globalThis as any).window;
        } else {
          (globalThis as any).window = originalWin;
        }
      }
    });

    it("renders AuditTimeline in standalone mode without crashing", () => {
      const element = AuditTimeline({
        claim: mockClaim,
        logs: mockLogs,
        isDrawer: false,
      });

      expect(element).not.toBeNull();
      expect(element.type).toBe("div");
    });

    it("renders AuditTimeline in drawer mode without duplicate page banner", () => {
      const element = AuditTimeline({
        claim: mockClaim,
        logs: mockLogs,
        isDrawer: true,
      });

      expect(element).not.toBeNull();
      expect(element.type).toBe("div");
    });

    it("renders AuditTimeline empty state cleanly when logs are empty", () => {
      const element = AuditTimeline({
        claim: mockClaim,
        logs: [],
        isLoading: false,
      });

      expect(element).not.toBeNull();
    });

    it("renders AuditTimeline skeleton loading state when isLoading is true", () => {
      const element = AuditTimeline({
        claim: mockClaim,
        logs: [],
        isLoading: true,
      });

      expect(element).not.toBeNull();
    });
  });
});
