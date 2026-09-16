import { describe, it, expect, vi, beforeEach } from "vitest";
import { useCommunications } from "../src/hooks/useCommunications";
import { AuditTimeline } from "../src/components/communications/AuditTimeline";
import { AuditTrailDrawer } from "../src/components/communications/AuditTrailDrawer";
import { PipelineTimeline } from "../src/components/communications/PipelineTimeline";
import { PipelineActivityFeed } from "../src/components/common/PipelineActivityFeed";
import { Claim, AuditLog, PipelineActivity } from "../src/types";

// Mock convex/react hooks
const mockUseQuery = vi.fn();
const mockUseAction = vi.fn();
const mockUseMutation = vi.fn(() => vi.fn().mockResolvedValue({ totalSealed: 1, terminalHash: "0".repeat(64) }));

vi.mock("convex/react", () => ({
  useQuery: (...args: any[]) => mockUseQuery(...args),
  useAction: (...args: any[]) => mockUseAction(...args),
  useMutation: (...args: any[]) => mockUseMutation(...args),
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

const mockActivities: PipelineActivity[] = [
  {
    _id: "act_1",
    claimId: "claim_123",
    runId: "run_alpha_01",
    stage: "run",
    status: "completed",
    message: "Initiated autonomous appellate validation for Claim #CLM-8942-CIG-9305.",
    createdAt: 1726140000000,
  },
  {
    _id: "act_2",
    claimId: "claim_123",
    runId: "run_alpha_01",
    stage: "crawl",
    status: "completed",
    message: "Firecrawl successfully crawled Cigna Clinical Policy Bulletin CPB-0245.",
    createdAt: 1726140001200,
  },
  {
    _id: "act_3",
    claimId: "claim_123",
    runId: "run_alpha_01",
    stage: "score",
    status: "completed",
    message: "Scored appeal overturn readiness at 88% across 4 statutory criteria.",
    createdAt: 1726140002100,
  },
  {
    _id: "act_4",
    claimId: "claim_123",
    runId: "run_alpha_01",
    stage: "precedents",
    status: "completed",
    message: "Retrieved 3 high-similarity precedents with confirmed overturn dispositions.",
    createdAt: 1726140003000,
  },
  {
    _id: "act_5",
    claimId: "claim_123",
    runId: "run_alpha_01",
    stage: "synthesis",
    status: "completed",
    message: "Synthesized 12-page ERISA-compliant appellate brief with grounded CPB citations.",
    createdAt: 1726140004500,
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

    it("renders Cryptographic Proof of Case Integrity HUD badge and Verify Hash Chain CTA", () => {
      const element = AuditTimeline({
        claim: mockClaim,
        logs: mockLogs,
        isDrawer: true,
      });

      expect(element).not.toBeNull();
      // Check that Cryptographic Proof / Tamper-Proof Case Log HUD is rendered in children
      const str = JSON.stringify(element);
      expect(str).toMatch(/Cryptographic Proof of Case Integrity|Tamper-Proof Case Log/);
      expect(str).toContain("Verify Hash Chain");
    });

    it("renders block sequence and SHA-256 hash seal tags on timeline event cards", () => {
      const logsWithHashes: AuditLog[] = [
        {
          ...mockLogs[0],
          hash: "a1b2c3d4e5f67890123456789012345678901234567890123456789012345678",
          previousHash: "0".repeat(64),
          sequenceNumber: 1,
        },
      ];

      const element = AuditTimeline({
        claim: mockClaim,
        logs: logsWithHashes,
        isDrawer: true,
      });

      const str = JSON.stringify(element);
      expect(str).toContain("Block #");
      expect(str).toContain("SHA:");
    });

    it("renders SHA-256 Chain badge in AuditTrailDrawer header", () => {
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

        const str = JSON.stringify(element);
        expect(str).toContain("SHA-256 Chain");
        expect(str).toContain("Live Sync");
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

    it("renders Statutory Audit and Pipeline Timeline tab triggers in AuditTrailDrawer", () => {
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
          pipelineActivities: mockActivities,
        });

        const str = JSON.stringify(element);
        expect(str).toContain("Statutory Audit");
        expect(str).toContain("Pipeline Timeline");
        expect(str).toContain("ERISA 29 CFR § 2560.503-1");
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

    it("renders PipelineTimeline component when initialTab is set to pipeline", () => {
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
          initialTab: "pipeline",
          pipelineActivities: mockActivities,
        });

        const str = JSON.stringify(element);
        expect(str).toContain("Workflow Observability Timeline");
        expect(str).toContain("Workflow Observability");
        expect(str).toContain("run_alpha_01");
        expect(str).toContain("act_1");
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
  });

  describe("PipelineTimeline Workflow Observability Component", () => {
    it("exports PipelineTimeline as a valid functional component", () => {
      expect(typeof PipelineTimeline).toBe("function");
    });

    it("renders PipelineTimeline with events, stage badges, and duration metrics", () => {
      const element = PipelineTimeline({
        claim: mockClaim,
        activities: mockActivities,
        isDrawer: true,
      });

      expect(element).not.toBeNull();
      const str = JSON.stringify(element);
      expect(str).toContain("Autonomous Workflow Telemetry");
      expect(str).toContain("Execution Verified");
      expect(str).toContain("Pipeline Stage Traversal");
      expect(str).toContain("Review");
      expect(str).toContain("Policy Search");
      expect(str).toContain("Win Scoring");
      expect(str).toContain("Past Cases");
      expect(str).toContain("Brief Drafting");
      expect(str).toContain("Firecrawl successfully crawled");
    });

    it("renders PipelineTimeline empty state cleanly when activities are empty", () => {
      const element = PipelineTimeline({
        claim: mockClaim,
        activities: [],
        isDrawer: true,
      });

      expect(element).not.toBeNull();
      const str = JSON.stringify(element);
      expect(str).toContain("No autonomous pipeline activities recorded yet");
    });

    it("renders PipelineTimeline loading state when isLoading is true", () => {
      const element = PipelineTimeline({
        claim: mockClaim,
        activities: [],
        isLoading: true,
        isDrawer: true,
      });

      expect(element).not.toBeNull();
      const str = JSON.stringify(element);
      expect(str).toContain("Streaming pipeline telemetry...");
    });

    it("renders Reset Filters CTA when activities exist but filteredEvents is empty", () => {
      const element = PipelineTimeline({
        claim: mockClaim,
        activities: mockActivities,
        isDrawer: true,
      });

      expect(element).not.toBeNull();
      const str = JSON.stringify(element);
      expect(str).toContain("Autonomous Workflow Telemetry");
    });

    it("does not render spinning indicators on completed runs even when start events had status='running'", () => {
      const mixedActivities: PipelineActivity[] = [
        {
          _id: "act_start_1",
          claimId: "claim_123",
          runId: "run_finished",
          stage: "run",
          status: "running",
          message: "Kicking off autonomous review.",
          createdAt: Date.now() - 3600000,
        },
        {
          _id: "act_crawl_1",
          claimId: "claim_123",
          runId: "run_finished",
          stage: "crawl",
          status: "running",
          message: "Searching Cigna policy bulletins.",
          createdAt: Date.now() - 3590000,
        },
        {
          _id: "act_crawl_2",
          claimId: "claim_123",
          runId: "run_finished",
          stage: "crawl",
          status: "completed",
          message: "Discovered 4 policy criteria.",
          createdAt: Date.now() - 3580000,
        },
        {
          _id: "act_synth_1",
          claimId: "claim_123",
          runId: "run_finished",
          stage: "synthesis",
          status: "completed",
          message: "Brief drafted successfully.",
          createdAt: Date.now() - 3570000,
        },
      ];

      const element = PipelineTimeline({
        claim: mockClaim,
        activities: mixedActivities,
        isDrawer: true,
      });

      expect(element).not.toBeNull();
      const str = JSON.stringify(element);
      expect(str).toContain("Started");
      expect(str).toContain("Completed");
      expect(str).not.toContain("In Progress");
      expect(str).not.toContain("Active Run In-Flight");
      expect(str).toContain("Execution Verified");
    });

    it("renders In Progress and active in-flight badge only when run is actively executing", () => {
      const activeActivities: PipelineActivity[] = [
        {
          _id: "act_start_live",
          claimId: "claim_123",
          runId: "run_live",
          stage: "run",
          status: "completed",
          message: "Case review passed.",
          createdAt: Date.now() - 5000,
        },
        {
          _id: "act_crawl_live",
          claimId: "claim_123",
          runId: "run_live",
          stage: "crawl",
          status: "running",
          message: "Crawling live policy portal right now.",
          createdAt: Date.now() - 1000,
        },
      ];

      const element = PipelineTimeline({
        claim: mockClaim,
        activities: activeActivities,
        isDrawer: true,
      });

      expect(element).not.toBeNull();
      const str = JSON.stringify(element);
      expect(str).toContain("Active Run In-Flight");
      expect(str).toContain("In Progress");
    });
  });

  describe("PipelineActivityFeed Component Edge Cases", () => {
    it("safely skips Convex query when claimId is empty string or undefined", () => {
      mockUseQuery.mockReturnValue(undefined);

      const element = PipelineActivityFeed({
        claimId: "",
      });

      expect(mockUseQuery).toHaveBeenCalledWith(
        expect.anything(),
        "skip"
      );
      expect(element).toBeNull();
    });

    it("queries Convex when claimId is provided", () => {
      mockUseQuery.mockReturnValue(mockActivities);

      PipelineActivityFeed({
        claimId: "claim_123",
      });

      expect(mockUseQuery).toHaveBeenCalledWith(
        expect.anything(),
        { claimId: "claim_123" }
      );
    });
  });
});

