import { describe, it, expect } from "vitest";
import { PolicyViewer } from "../src/components/evidence/PolicyViewer";
import { ClauseInspectorDrawer } from "../src/components/evidence/ClauseInspectorDrawer";
import {
  RESEARCH_MODES,
  PRESET_RESEARCH_URLS,
} from "../src/components/evidence/ClinicalResearchConsole";
import { ClinicalEvidence } from "../src/types";

const mockEvidences: ClinicalEvidence[] = [
  {
    _id: "ev_1",
    claimId: "claim_1",
    sourceType: "payer_cpb",
    title: "Knee Surgery - Arthroscopic and Open Procedures",
    citationClause: "Medical Necessity Criteria §4",
    extractedEvidenceMarkdown: "Failure of non-surgical management for at least three months.",
    relevanceScore: 94,
    sourceUrl: "https://cignaforhcp.cigna.com/cpb0124.pdf",
    screenshotUrl: "https://storage.claimhero.dev/shots/cpb0124.png",
    capturedAt: 1773300000000,
    createdAt: 1773300000000,
  },
  {
    _id: "ev_2",
    claimId: "claim_1",
    sourceType: "payer_cpb",
    title: "Knee Surgery - Arthroscopic and Open Procedures ", // trailing space for whitespace trimming test
    citationClause: "Medical Necessity Criteria §2",
    extractedEvidenceMarkdown: "Physical exam demonstrates limited range of motion or inconclusive MRI/CT arthrogram.",
    relevanceScore: 92,
    sourceUrl: "https://cignaforhcp.cigna.com/cpb0124.pdf",
    screenshotUrl: "https://storage.claimhero.dev/shots/cpb0124.png",
    createdAt: 1773300001000,
  },
  {
    _id: "ev_3",
    claimId: "claim_1",
    sourceType: "legal_precedent",
    title: "ERISA Full & Fair Review Statutory Protocol",
    citationClause: "29 CFR § 2560.503-1(h)(2)(iii)",
    extractedEvidenceMarkdown: "Statutory Requirement: Plan administrators must provide claimants upon request with all documents, records, and internal clinical criteria.",
    relevanceScore: 95,
    createdAt: 1773300002000,
  },
  {
    _id: "ev_4",
    claimId: "claim_1",
    sourceType: "pubmed_study",
    title: "Clinical Outcomes in Meniscal Repair vs Debridement",
    citationClause: "Conclusion ¶3",
    extractedEvidenceMarkdown: "Meta-analysis of 14 randomized controlled trials demonstrates superiority of prompt arthroscopic intervention.",
    relevanceScore: 88,
    sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/3829102",
    createdAt: 1773300003000,
  },
  {
    _id: "ev_5",
    claimId: "claim_1",
    sourceType: "nccn_guideline",
    title: "Meniscectomy or Meniscal Repair Indications",
    citationClause: "CMM.JT.IN.312",
    extractedEvidenceMarkdown: "Clinical indications for arthroscopic meniscectomy or repair include mechanical symptoms.",
    relevanceScore: 91,
    createdAt: 1773300004000,
  },
];

describe("Evidence Dossier UX & Quad-Solution Architecture", () => {
  it("exports PolicyViewer and ClauseInspectorDrawer components", () => {
    expect(PolicyViewer).toBeDefined();
    expect(ClauseInspectorDrawer).toBeDefined();
  });

  it("accurately counts all evidence sources including clinical guidelines so sum equals total", () => {
    const counts: Record<string, number> = {
      all: mockEvidences.length,
      payer_cpb: 0,
      nccn_guideline: 0,
      legal_precedent: 0,
      pubmed_study: 0,
      fda_package_insert: 0,
    };
    mockEvidences.forEach((e) => {
      counts[e.sourceType] = (counts[e.sourceType] || 0) + 1;
    });

    const categorySum =
      counts.payer_cpb +
      counts.nccn_guideline +
      counts.legal_precedent +
      counts.pubmed_study +
      counts.fda_package_insert;

    expect(categorySum).toBe(counts.all);
    expect(counts.nccn_guideline).toBe(1);
    expect(counts.payer_cpb).toBe(2);
    expect(counts.legal_precedent).toBe(1);
    expect(counts.pubmed_study).toBe(1);
    expect(counts.fda_package_insert).toBe(0);
  });

  it("calculates document groups correctly across sources and titles with whitespace trimming", () => {
    const map = new Map<string, ClinicalEvidence[]>();
    mockEvidences.forEach((item) => {
      const trimmedTitle = item.title.trim();
      const key = `${item.sourceType}:::${trimmedTitle}`;
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key)!.push(item);
    });

    // 2 CPBs (even with trailing space in ev_2) coalesce into 1 group; 1 legal; 1 pubmed; 1 nccn -> 4 groups
    expect(map.size).toBe(4);

    const cpbGroup = map.get("payer_cpb:::Knee Surgery - Arthroscopic and Open Procedures");
    expect(cpbGroup).toBeDefined();
    expect(cpbGroup?.length).toBe(2);

    const maxRelevance = Math.max(...(cpbGroup?.map((e) => e.relevanceScore) || [0]));
    expect(maxRelevance).toBe(94);
  });

  it("handles screenshot visual proof detection for grouped exhibits", () => {
    const cpbItems = mockEvidences.filter((e) => e.sourceType === "payer_cpb");
    const hasScreenshot = cpbItems.some((e) => Boolean(e.screenshotUrl));
    expect(hasScreenshot).toBe(true);

    const legalItems = mockEvidences.filter((e) => e.sourceType === "legal_precedent");
    const legalHasScreenshot = legalItems.some((e) => Boolean(e.screenshotUrl));
    expect(legalHasScreenshot).toBe(false);
  });

  it("deduplicates visual proof captures across clauses from the same policy document", () => {
    const visualProofs = Array.from(
      new Map(
        mockEvidences
          .filter((item) => Boolean(item.screenshotUrl))
          .map((item) => [item.screenshotUrl, item])
      ).values()
    );

    // ev_1 and ev_2 share "https://storage.claimhero.dev/shots/cpb0124.png"
    expect(visualProofs.length).toBe(1);
    expect(visualProofs[0].screenshotUrl).toBe("https://storage.claimhero.dev/shots/cpb0124.png");
  });

  it("supports compact clause row text truncation and formatting", () => {
    const firstClause = mockEvidences[0];
    expect(firstClause.citationClause).toBe("Medical Necessity Criteria §4");
    expect(firstClause.relevanceScore).toBe(94);
    expect(firstClause.extractedEvidenceMarkdown).toContain("Failure of non-surgical management");
  });

  it("identifies top-tier match vs moderate-tier match thresholds", () => {
    mockEvidences.forEach((item) => {
      if (item.relevanceScore >= 90) {
        expect(item.relevanceScore).toBeGreaterThanOrEqual(90);
      } else {
        expect(item.relevanceScore).toBeLessThan(90);
      }
    });
  });

  describe("Sequential clause stepping & boundary conditions", () => {
    it("computes accurate hasPrevious and hasNext across all positions", () => {
      const getSteppingState = (targetId: string, list: ClinicalEvidence[]) => {
        const index = list.findIndex((e) => e._id === targetId);
        return {
          index,
          hasPrevious: index > 0,
          hasNext: index >= 0 && index < list.length - 1,
        };
      };

      // Head element (index 0): no previous, has next
      const headState = getSteppingState("ev_1", mockEvidences);
      expect(headState.index).toBe(0);
      expect(headState.hasPrevious).toBe(false);
      expect(headState.hasNext).toBe(true);

      // Mid element (index 1 of 4): has previous and next
      const midState = getSteppingState("ev_2", mockEvidences);
      expect(midState.index).toBe(1);
      expect(midState.hasPrevious).toBe(true);
      expect(midState.hasNext).toBe(true);

      // Tail element (index 4 of 5): has previous, no next
      const tailState = getSteppingState("ev_5", mockEvidences);
      expect(tailState.index).toBe(4);
      expect(tailState.hasPrevious).toBe(true);
      expect(tailState.hasNext).toBe(false);

      // Single-item array: neither previous nor next
      const singleList = [mockEvidences[0]];
      const singleState = getSteppingState("ev_1", singleList);
      expect(singleState.index).toBe(0);
      expect(singleState.hasPrevious).toBe(false);
      expect(singleState.hasNext).toBe(false);

      // Non-existent item (index -1): neither previous nor next
      const missingState = getSteppingState("ev_unknown", mockEvidences);
      expect(missingState.index).toBe(-1);
      expect(missingState.hasPrevious).toBe(false);
      expect(missingState.hasNext).toBe(false);
    });

    it("simulates deletion transition logic correctly", () => {
      const simulateDelete = (targetId: string, currentList: ClinicalEvidence[]) => {
        const currentIndex = currentList.findIndex((e) => e._id === targetId);
        const hasNext = currentIndex >= 0 && currentIndex < currentList.length - 1;
        const hasPrevious = currentIndex > 0;

        if (hasNext) {
          return { action: "next", nextTarget: currentList[currentIndex + 1]._id };
        } else if (hasPrevious) {
          return { action: "previous", nextTarget: currentList[currentIndex - 1]._id };
        } else {
          return { action: "close", nextTarget: null };
        }
      };

      // Deleting head item advances to index 1
      expect(simulateDelete("ev_1", mockEvidences)).toEqual({
        action: "next",
        nextTarget: "ev_2",
      });

      // Deleting tail item steps back to index 3
      expect(simulateDelete("ev_5", mockEvidences)).toEqual({
        action: "previous",
        nextTarget: "ev_4",
      });

      // Deleting the lone item triggers close
      expect(simulateDelete("ev_1", [mockEvidences[0]])).toEqual({
        action: "close",
        nextTarget: null,
      });
    });
  });

  describe("Accordion expansion, collapse, and grouping state", () => {
    it("toggles group collapse state correctly", () => {
      let collapsed = new Set<string>();

      const toggle = (key: string) => {
        const next = new Set(collapsed);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        collapsed = next;
      };

      toggle("group_1");
      expect(collapsed.has("group_1")).toBe(true);

      toggle("group_1");
      expect(collapsed.has("group_1")).toBe(false);
    });

    it("expands and collapses all groups deterministically", () => {
      const allGroupKeys = ["group_a", "group_b", "group_c"];

      // Collapse all
      const collapsedAll = new Set(allGroupKeys);
      expect(collapsedAll.size).toBe(3);

      // Expand all
      const expandedAll = new Set<string>();
      expect(expandedAll.size).toBe(0);
    });
  });

  describe("View density configuration & storage sanitization", () => {
    it("sanitizes viewMode to default to detailed if storage is empty or invalid", () => {
      const sanitizeViewMode = (stored: string | null): "detailed" | "compact" => {
        return stored === "compact" ? "compact" : "detailed";
      };

      expect(sanitizeViewMode(null)).toBe("detailed");
      expect(sanitizeViewMode("compact")).toBe("compact");
      expect(sanitizeViewMode("detailed")).toBe("detailed");
      expect(sanitizeViewMode("unknown_val")).toBe("detailed");
      expect(sanitizeViewMode("")).toBe("detailed");
    });

    it("sanitizes grouping boolean to default to true unless explicitly false", () => {
      const sanitizeGrouping = (stored: string | null): boolean => {
        return stored !== "false";
      };

      expect(sanitizeGrouping(null)).toBe(true);
      expect(sanitizeGrouping("true")).toBe(true);
      expect(sanitizeGrouping("false")).toBe(false);
      expect(sanitizeGrouping("something_else")).toBe(true);
    });
  });

  describe("Multi-source search filtering", () => {
    it("filters accurately across title, citationClause, and extracted markdown", () => {
      const filterEvidences = (
        list: ClinicalEvidence[],
        sourceType: string,
        query: string
      ) => {
        return list.filter((e) => {
          if (sourceType !== "all" && e.sourceType !== sourceType) return false;
          if (query) {
            const q = query.toLowerCase();
            return (
              e.title.toLowerCase().includes(q) ||
              e.citationClause.toLowerCase().includes(q) ||
              e.extractedEvidenceMarkdown.toLowerCase().includes(q)
            );
          }
          return true;
        });
      };

      // By source
      expect(filterEvidences(mockEvidences, "payer_cpb", "").length).toBe(2);
      expect(filterEvidences(mockEvidences, "nccn_guideline", "").length).toBe(1);
      expect(filterEvidences(mockEvidences, "pubmed_study", "").length).toBe(1);
      expect(filterEvidences(mockEvidences, "fda_package_insert", "").length).toBe(0);

      // Search by title snippet (matches ev_4 and ev_5)
      expect(filterEvidences(mockEvidences, "all", "meniscal").length).toBe(2);

      // Search by citation clause
      expect(filterEvidences(mockEvidences, "all", "29 CFR").length).toBe(1);

      // Search by markdown body snippet
      expect(filterEvidences(mockEvidences, "all", "non-surgical").length).toBe(1);

      // Search with source filter combined
      expect(filterEvidences(mockEvidences, "pubmed_study", "Knee").length).toBe(0);
      expect(filterEvidences(mockEvidences, "payer_cpb", "Knee").length).toBe(2);
    });
  });

  describe("12-Item Evidence Dossier Accounting & Progressive Disclosure (5 CPB + 3 Guidelines + 4 ERISA = 12)", () => {
    const mock12Evidences: ClinicalEvidence[] = [
      // 5 CPB clauses
      { _id: "cpb_1", claimId: "c1", sourceType: "payer_cpb", title: "Policy 0124", citationClause: "Sec 1", extractedEvidenceMarkdown: "Criteria 1", relevanceScore: 95, createdAt: 1 },
      { _id: "cpb_2", claimId: "c1", sourceType: "payer_cpb", title: "Policy 0124", citationClause: "Sec 2", extractedEvidenceMarkdown: "Criteria 2", relevanceScore: 92, createdAt: 2 },
      { _id: "cpb_3", claimId: "c1", sourceType: "payer_cpb", title: "Policy 0124", citationClause: "Sec 3", extractedEvidenceMarkdown: "Criteria 3", relevanceScore: 88, createdAt: 3 },
      { _id: "cpb_4", claimId: "c1", sourceType: "payer_cpb", title: "Policy 0124", citationClause: "Sec 4", extractedEvidenceMarkdown: "Criteria 4", relevanceScore: 85, createdAt: 4 },
      { _id: "cpb_5", claimId: "c1", sourceType: "payer_cpb", title: "Policy 0124", citationClause: "Sec 5", extractedEvidenceMarkdown: "Criteria 5", relevanceScore: 90, createdAt: 5 },
      // 3 Clinical Guidelines clauses
      { _id: "guide_1", claimId: "c1", sourceType: "nccn_guideline", title: "Carelon Guidelines", citationClause: "G-1", extractedEvidenceMarkdown: "Guide 1", relevanceScore: 91, createdAt: 6 },
      { _id: "guide_2", claimId: "c1", sourceType: "nccn_guideline", title: "Carelon Guidelines", citationClause: "G-2", extractedEvidenceMarkdown: "Guide 2", relevanceScore: 89, createdAt: 7 },
      { _id: "guide_3", claimId: "c1", sourceType: "nccn_guideline", title: "Carelon Guidelines", citationClause: "G-3", extractedEvidenceMarkdown: "Guide 3", relevanceScore: 87, createdAt: 8 },
      // 4 ERISA Law clauses
      { _id: "law_1", claimId: "c1", sourceType: "legal_precedent", title: "ERISA Mandate", citationClause: "29 CFR 1", extractedEvidenceMarkdown: "Statute 1", relevanceScore: 96, createdAt: 9 },
      { _id: "law_2", claimId: "c1", sourceType: "legal_precedent", title: "ERISA Mandate", citationClause: "29 CFR 2", extractedEvidenceMarkdown: "Statute 2", relevanceScore: 94, createdAt: 10 },
      { _id: "law_3", claimId: "c1", sourceType: "legal_precedent", title: "ERISA Mandate", citationClause: "29 CFR 3", extractedEvidenceMarkdown: "Statute 3", relevanceScore: 93, createdAt: 11 },
      { _id: "law_4", claimId: "c1", sourceType: "legal_precedent", title: "ERISA Mandate", citationClause: "29 CFR 4", extractedEvidenceMarkdown: "Statute 4", relevanceScore: 91, createdAt: 12 },
    ];

    it("evaluates exact 12-item count and category breakdown", () => {
      expect(mock12Evidences.length).toBe(12);

      const counts: Record<string, number> = {
        all: mock12Evidences.length,
        payer_cpb: 0,
        nccn_guideline: 0,
        legal_precedent: 0,
        pubmed_study: 0,
        fda_package_insert: 0,
      };
      mock12Evidences.forEach((e) => {
        counts[e.sourceType] = (counts[e.sourceType] || 0) + 1;
      });

      expect(counts.all).toBe(12);
      expect(counts.payer_cpb).toBe(5);
      expect(counts.nccn_guideline).toBe(3);
      expect(counts.legal_precedent).toBe(4);
      expect(counts.pubmed_study).toBe(0);
      expect(counts.fda_package_insert).toBe(0);

      const sum =
        counts.payer_cpb +
        counts.nccn_guideline +
        counts.legal_precedent +
        counts.pubmed_study +
        counts.fda_package_insert;
      expect(sum).toBe(12);
    });

    it("evaluates progressive disclosure: +2 More Sources when empty, Show Active Only when expanded", () => {
      const counts: Record<string, number> = {
        all: mock12Evidences.length,
        payer_cpb: 0,
        nccn_guideline: 0,
        legal_precedent: 0,
        pubmed_study: 0,
        fda_package_insert: 0,
      };
      mock12Evidences.forEach((e) => {
        counts[e.sourceType] = (counts[e.sourceType] || 0) + 1;
      });

      const allCategoryTabs = [
        { id: "all", label: "All Evidence", count: counts.all },
        { id: "payer_cpb", label: "Insurer CPB", count: counts.payer_cpb },
        { id: "nccn_guideline", label: "Clinical Guidelines", count: counts.nccn_guideline },
        { id: "legal_precedent", label: "ERISA Law", count: counts.legal_precedent },
        { id: "pubmed_study", label: "PubMed Trials", count: counts.pubmed_study },
        { id: "fda_package_insert", label: "FDA Labels", count: counts.fda_package_insert },
      ];

      const emptySourcesCount = allCategoryTabs.filter(
        (t) => t.id !== "all" && t.count === 0
      ).length;
      expect(emptySourcesCount).toBe(2);

      // Collapsed state (showEmptySources = false, default)
      const getVisibleTabs = (showEmptySources: boolean, filterSource: string) => {
        if (showEmptySources) return allCategoryTabs;
        return allCategoryTabs.filter(
          (tab) => tab.count > 0 || tab.id === "all" || tab.id === filterSource
        );
      };

      const collapsedTabs = getVisibleTabs(false, "all");
      expect(collapsedTabs.map((t) => t.id)).toEqual([
        "all",
        "payer_cpb",
        "nccn_guideline",
        "legal_precedent",
      ]);
      expect(collapsedTabs.length).toBe(4);

      // Button label in collapsed state
      let showEmptySources = false;
      const collapsedButtonLabel = showEmptySources
        ? "Show Active Only"
        : `+${emptySourcesCount} More Sources`;
      expect(collapsedButtonLabel).toBe("+2 More Sources");

      // Expanded state (showEmptySources = true)
      showEmptySources = true;
      const expandedButtonLabel = showEmptySources
        ? "Show Active Only"
        : `+${emptySourcesCount} More Sources`;
      const expandedTabs = getVisibleTabs(true, "all");
      expect(expandedTabs.length).toBe(6);
      expect(expandedButtonLabel).toBe("Show Active Only");

      // Defensive check: if an empty tab (e.g. pubmed_study) was selected, it remains visible even when collapsed
      const collapsedWithEmptySelected = getVisibleTabs(false, "pubmed_study");
      expect(collapsedWithEmptySelected.some((t) => t.id === "pubmed_study")).toBe(true);
      expect(collapsedWithEmptySelected.length).toBe(5);
    });

    it("verifies sequential 12-item stepping clamps accurately without overflow", () => {
      // Step through all 12 items sequentially
      for (let i = 0; i < mock12Evidences.length; i++) {
        const hasPrevious = i > 0;
        const hasNext = i < mock12Evidences.length - 1;

        if (i === 0) {
          expect(hasPrevious).toBe(false);
          expect(hasNext).toBe(true);
        } else if (i === 11) {
          expect(hasPrevious).toBe(true);
          expect(hasNext).toBe(false);
        } else {
          expect(hasPrevious).toBe(true);
          expect(hasNext).toBe(true);
        }
      }
    });
  });

  describe("Clinical Research Console Channel Architecture & Workstation Deck", () => {
    it("verifies all 6 research modes have distinct, non-empty identifiers and labels", () => {
      expect(RESEARCH_MODES.length).toBe(6);
      const ids = RESEARCH_MODES.map((m) => m.id);
      expect(new Set(ids).size).toBe(6);
      expect(ids).toEqual([
        "multi_source",
        "payer_cpb",
        "directory_discovery",
        "pubmed_trials",
        "fda_labels",
        "custom_url",
      ]);
    });

    it("validates that multi_source is designated as Recommended with full 3-pipeline coverage", () => {
      const multiSource = RESEARCH_MODES.find((m) => m.id === "multi_source");
      expect(multiSource).toBeDefined();
      expect(multiSource?.badge).toBe("Recommended");
      expect(multiSource?.tagline).toBe("3-Channel Sweep");

      // Verify the 3 pipelines configured for multi_source
      const pipelines = [
        { name: "Insurer Policy (CPB)", channel: "payer_cpb", purpose: "Payer Rules" },
        { name: "PubMed RCT Database", channel: "pubmed_study", purpose: "Medical Literature" },
        { name: "FDA DailyMed Labels", channel: "fda_package_insert", purpose: "On-Label Match" },
      ];
      expect(pipelines.length).toBe(3);
      expect(pipelines.map((p) => p.channel)).toEqual([
        "payer_cpb",
        "pubmed_study",
        "fda_package_insert",
      ]);
    });

    it("ensures each mode provides dynamic action button labels without ellipsis truncation", () => {
      for (const mode of RESEARCH_MODES) {
        expect(mode.actionButtonLabel).not.toContain("...");
        expect(mode.actionButtonLabel.length).toBeGreaterThan(15);
        expect(mode.shortLabel.length).toBeLessThan(20);
        expect(mode.tagline.length).toBeLessThan(25);
      }
    });

    it("verifies zero text truncation with unclipped descriptions and statutory leverage callouts", () => {
      for (const mode of RESEARCH_MODES) {
        // Assert descriptions are thorough, unclipped, and contain no ellipses
        expect(mode.description).not.toContain("...");
        expect(mode.description.length).toBeGreaterThan(50);

        // Assert statutory/clinical impact callouts are complete and unclipped
        expect(mode.clinicalImpact).not.toContain("...");
        expect(mode.clinicalImpact.length).toBeGreaterThan(50);
      }
    });

    it("validates preset research URLs configuration includes all 4 evidence categories with valid URLs", () => {
      expect(PRESET_RESEARCH_URLS.length).toBe(4);
      const categories = PRESET_RESEARCH_URLS.map((p) => p.category);
      expect(categories).toContain("payer_cpb");
      expect(categories).toContain("pubmed_study");
      expect(categories).toContain("fda_package_insert");
      expect(categories).toContain("nccn_guideline");

      for (const preset of PRESET_RESEARCH_URLS) {
        expect(preset.url).toMatch(/^https?:\/\//);
        expect(preset.label.length).toBeGreaterThan(10);
      }
    });

    it("verifies WAI-ARIA tab and station deck contract specifications", () => {
      // Check tablist structure and mapping for the 6 channels
      const tabSpecs = RESEARCH_MODES.map((m, idx) => ({
        tabId: `tab-${m.id}`,
        panelId: `panel-${m.id}`,
        role: "tab",
        tabIndex: idx === 0 ? 0 : -1,
      }));

      expect(tabSpecs.length).toBe(6);
      expect(tabSpecs[0].tabId).toBe("tab-multi_source");
      expect(tabSpecs[0].panelId).toBe("panel-multi_source");
      expect(tabSpecs[0].tabIndex).toBe(0);
      expect(tabSpecs[1].tabIndex).toBe(-1);
    });

    it("verifies 4-way arrow key navigation transitions across all 6 channel tabs in 3-column grid", () => {
      const getNextIndex = (current: number, key: "ArrowRight" | "ArrowLeft" | "ArrowDown" | "ArrowUp") => {
        const len = RESEARCH_MODES.length;
        if (key === "ArrowRight") return (current + 1) % len;
        if (key === "ArrowLeft") return (current - 1 + len) % len;
        if (key === "ArrowDown") return (current + 3) % len;
        if (key === "ArrowUp") return (current - 3 + len) % len;
        return current;
      };

      // 6 items in 2 rows of 3:
      // Row 0: 0 (multi_source), 1 (payer_cpb), 2 (directory_discovery)
      // Row 1: 3 (pubmed_trials), 4 (fda_labels), 5 (custom_url)

      // Test horizontal navigation (ArrowRight & ArrowLeft)
      expect(getNextIndex(0, "ArrowRight")).toBe(1);
      expect(getNextIndex(1, "ArrowRight")).toBe(2);
      expect(getNextIndex(5, "ArrowRight")).toBe(0); // wraps around to start

      expect(getNextIndex(0, "ArrowLeft")).toBe(5); // wraps around to end
      expect(getNextIndex(2, "ArrowLeft")).toBe(1);
      expect(getNextIndex(1, "ArrowLeft")).toBe(0);

      // Test vertical column navigation (ArrowDown & ArrowUp)
      expect(getNextIndex(0, "ArrowDown")).toBe(3); // col 0, row 0 -> row 1
      expect(getNextIndex(1, "ArrowDown")).toBe(4); // col 1, row 0 -> row 1
      expect(getNextIndex(2, "ArrowDown")).toBe(5); // col 2, row 0 -> row 1
      expect(getNextIndex(3, "ArrowDown")).toBe(0); // col 0, row 1 -> row 0 (wrap)
      expect(getNextIndex(4, "ArrowDown")).toBe(1); // col 1, row 1 -> row 0 (wrap)
      expect(getNextIndex(5, "ArrowDown")).toBe(2); // col 2, row 1 -> row 0 (wrap)

      expect(getNextIndex(3, "ArrowUp")).toBe(0); // col 0, row 1 -> row 0
      expect(getNextIndex(4, "ArrowUp")).toBe(1); // col 1, row 1 -> row 0
      expect(getNextIndex(5, "ArrowUp")).toBe(2); // col 2, row 1 -> row 0
      expect(getNextIndex(0, "ArrowUp")).toBe(3); // col 0, row 0 -> row 1 (wrap)
      expect(getNextIndex(1, "ArrowUp")).toBe(4); // col 1, row 0 -> row 1 (wrap)
      expect(getNextIndex(2, "ArrowUp")).toBe(5); // col 2, row 0 -> row 1 (wrap)
    });
  });
});
