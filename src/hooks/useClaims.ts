import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Claim, ClaimStatus, DashboardStats, DenialExtractionResult } from "../types";
// Type-only: the OCR pipeline (pdfjs-dist + tesseract.js) is loaded on demand
// via dynamic import at the call site so these heavy native-adjacent libs are
// never part of the boot-critical chunk and never evaluate on landing.
import type { ClientExtractionResult } from "../lib/clientOcr";

import { Id } from "../../convex/_generated/dataModel";

export function useClaims(options?: {
  statusFilter?: string;
  payerFilter?: string;
  searchQuery?: string;
  includeDemo?: boolean;
  enabled?: boolean;
  defaultClaimId?: string;
}) {
  const isEnabled = options?.enabled !== false;
  const [selectedClaimId, setSelectedClaimId] = useState<string>(options?.defaultClaimId || "");

  const [includeDemo, setIncludeDemoState] = useState<boolean>(() => {
    if (typeof options?.includeDemo !== "undefined") return options.includeDemo;
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("claimhero_include_demo");
      if (saved !== null) return saved === "true";
    }
    return false; // Default to false so real cases are prioritized without demo fixtures
  });

  const setIncludeDemo = useCallback((val: boolean | ((prev: boolean) => boolean)) => {
    setIncludeDemoState((prev) => {
      const next = typeof val === "function" ? val(prev) : val;
      if (typeof window !== "undefined") {
        localStorage.setItem("claimhero_include_demo", String(next));
      }
      return next;
    });
  }, []);

  const statusArg = options?.statusFilter && options.statusFilter !== "all"
    ? options.statusFilter
    : undefined;

  const payerArg = options?.payerFilter && options.payerFilter !== "all"
    ? options.payerFilter
    : undefined;

  const searchQuery = options?.searchQuery?.trim() || "";
  const searchArg = searchQuery.length > 0 ? searchQuery : undefined;
  const isFiltered = Boolean(statusArg || payerArg || searchArg);

  // Real Convex query to fetch claims with server-side status, payer, and text search filtering
  const rawClaims = useQuery(
    api.claims.list,
    isEnabled
      ? {
          status: statusArg,
          payer: payerArg,
          search: searchArg,
          limit: 100,
          includeDemo,
        }
      : "skip"
  ) as Claim[] | undefined;

  // Authoritative global portfolio stats backed by O(log N) TableAggregate
  const rawPortfolioStats = useQuery(
    api.claims.getPortfolioStats,
    isEnabled ? { includeDemo } : "skip"
  );

  // Filtered portfolio stats computed strictly on the server across all matching records
  const filteredPortfolioStats = useQuery(
    api.claims.getPortfolioStats,
    isEnabled && isFiltered
      ? {
          status: statusArg,
          payer: payerArg,
          search: searchArg,
          includeDemo,
        }
      : "skip"
  );

  // Return claims with defensive client-side safeguards
  const claims = useMemo(() => {
    if (!rawClaims) return [];
    return rawClaims;
  }, [rawClaims]);

  // Aggregate Dashboard Statistics backed by server-side TableAggregate / getPortfolioStats
  const stats: DashboardStats = useMemo(() => {
    const source = isFiltered ? (filteredPortfolioStats ?? rawPortfolioStats) : rawPortfolioStats;

    if (source) {
      const avgScore = source.averageReadinessScore ?? source.averageWinScore;
      return {
        totalClaims: source.totalClaims,
        activeDisputedAmount: source.activeDisputedAmount,
        overturnedWonAmount: source.overturnedWonAmount,
        averageWinScore: avgScore,
        averageReadinessScore: avgScore,
        criticalDeadlinesCount: source.criticalDeadlinesCount,
      };
    }

    const list = rawClaims || [];
    const totalClaims = list.length;
    let activeDisputedAmount = 0;
    let overturnedWonAmount = 0;
    let scoreSum = 0;
    let scoreCount = 0;
    let criticalDeadlinesCount = 0;

    for (const c of list) {
      if (c.status === "won") {
        overturnedWonAmount += c.deniedAmount;
      } else {
        activeDisputedAmount += c.deniedAmount;
      }

      const scoreVal = c.appealReadinessScore ?? c.evidenceCoverageScore ?? c.overturnProbabilityScore;
      if (scoreVal !== undefined) {
        scoreSum += scoreVal;
        scoreCount++;
      }

      if (c.daysRemaining !== undefined && c.daysRemaining <= 14 && c.status !== "won") {
        criticalDeadlinesCount++;
      }
    }

    const calculatedAvg = scoreCount > 0 ? Math.round(scoreSum / scoreCount) : 0;
    return {
      totalClaims,
      activeDisputedAmount,
      overturnedWonAmount,
      averageWinScore: calculatedAvg,
      averageReadinessScore: calculatedAvg,
      criticalDeadlinesCount,
    };
  }, [isFiltered, filteredPortfolioStats, rawPortfolioStats, rawClaims]);

  // Status breakdown counts backed by server-side aggregations
  const claimCountsByStatus = useMemo(() => {
    const source = (payerArg || searchArg)
      ? (filteredPortfolioStats?.claimsByStatus ? filteredPortfolioStats : rawPortfolioStats)
      : rawPortfolioStats;

    if (source?.claimsByStatus) {
      return {
        all: source.totalClaims,
        ingested: source.claimsByStatus?.ingested ?? 0,
        parsing: source.claimsByStatus?.parsing ?? 0,
        analyzing: source.claimsByStatus?.analyzing ?? 0,
        precedent_matched: source.claimsByStatus?.precedent_matched ?? 0,
        drafting: source.claimsByStatus?.drafting ?? 0,
        ready_for_review: source.claimsByStatus?.ready_for_review ?? 0,
        dispatched: source.claimsByStatus?.dispatched ?? 0,
        won: source.claimsByStatus?.won ?? 0,
        critical_deadline: source.criticalDeadlinesCount,
      };
    }

    const list = rawClaims || [];
    const counts: Record<string, number> = {
      all: list.length,
      ingested: 0,
      parsing: 0,
      analyzing: 0,
      precedent_matched: 0,
      drafting: 0,
      ready_for_review: 0,
      dispatched: 0,
      won: 0,
      critical_deadline: 0,
    };

    for (const c of list) {
      if (counts[c.status] !== undefined) {
        counts[c.status]++;
      }
      if (c.daysRemaining !== undefined && c.daysRemaining <= 14 && c.status !== "won") {
        counts.critical_deadline++;
      }
    }

    return counts;
  }, [payerArg, searchArg, filteredPortfolioStats, rawPortfolioStats, rawClaims]);

  // Active selected claim with deep resolution of latestAppeal and evidenceCount
  const effectiveClaimId = (selectedClaimId ? selectedClaimId : options?.defaultClaimId) as Id<"claims"> | undefined;

  const selectedClaimDetail = useQuery(
    api.claims.getById,
    isEnabled && effectiveClaimId ? { claimId: effectiveClaimId } : "skip"
  ) as Claim | null | undefined;

  const rawSelectedClaim = useMemo(() => {
    if (!rawClaims || rawClaims.length === 0 || !effectiveClaimId) return null;
    return rawClaims.find((c) => c._id === effectiveClaimId) || null;
  }, [rawClaims, effectiveClaimId]);

  const selectedClaim: Claim | null = useMemo(() => {
    if (selectedClaimDetail) {
      return {
        ...(rawSelectedClaim || {}),
        ...selectedClaimDetail,
        patient: selectedClaimDetail.patient || rawSelectedClaim?.patient,
        latestAppeal: selectedClaimDetail.latestAppeal || rawSelectedClaim?.latestAppeal,
        evidenceCount: selectedClaimDetail.evidenceCount ?? rawSelectedClaim?.evidenceCount,
      } as Claim;
    }
    return rawSelectedClaim;
  }, [rawSelectedClaim, selectedClaimDetail]);

  // Real Convex mutation & action hooks
  const generateUploadUrlMutation = useMutation(api.claims.generateUploadUrl);
  const registerPendingUploadMutation = useMutation(api.claims.registerPendingUpload);
  const createWithPatientMutation = useMutation(api.claims.createWithPatient);
  const updateStatusMutation = useMutation(api.claims.updateStatus);
  const deleteCaseMutation = useMutation(api.claims.deleteCase);
  const parseDenialAction = useAction(api.actions.opticalParser.parseDenialDocument);

  // Upload a real file and run in-browser optical extraction (pdf.js / tesseract.js) + optional Textract
  const uploadAndParseDocument = useCallback(
    async (file: File, patientState?: string, onProgress?: (msg: string) => void) => {
      const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB limit
      if (file.size > MAX_FILE_SIZE_BYTES) {
        throw new Error("File exceeds the maximum 10MB size limit. Please upload a smaller PDF or image.");
      }

      // 1. In-browser extraction & client-side PHI de-identification
      // Digital PDFs: pdf.js getTextContent() — zero OCR needed, 100% accuracy, zero keys.
      // Scans/photos: tesseract.js recognition compute runs on-device. The original
      // file is still uploaded to Convex Storage for audit below; only redacted
      // text is sent to AI models.
      onProgress?.("Extracting document text locally in browser...");
      let clientResult: ClientExtractionResult | null = null;
      try {
        // Loaded on demand (separate chunk): keeps pdfjs-dist + tesseract.js
        // out of the boot graph and off the landing page entirely.
        const { extractDocumentInBrowser } = await import("../lib/clientOcr");
        clientResult = await extractDocumentInBrowser(file, file.name, onProgress);
      } catch (ocrErr) {
        console.warn("Client in-browser extraction note:", ocrErr);
      }

      if (clientResult == null) {
        return;
      }

      // 2. Get upload URL from Convex
      onProgress?.("Uploading document to secure storage...");
      const postUrl = await generateUploadUrlMutation();

      // 3. Upload original binary to Convex Storage for human audit / download
      // record. Retained until the case is deleted; AI models receive only the
      // redacted client text, never this binary.
      const response = await fetch(postUrl, {
        method: "POST",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });

      if (!response.ok) {
        throw new Error(`Failed to upload file: ${response.statusText}`);
      }

      const { storageId } = (await response.json()) as { storageId: Id<"_storage"> };

      // 4. Register pending upload under authenticated user before parsing
      await registerPendingUploadMutation({ storageId });

      // 5. Trigger optical extraction action with client-deidentified text and provenance
      onProgress?.("Structuring clinical denial data...");
      try {
        const extractionResult: DenialExtractionResult & { claimId: string } = await parseDenialAction({
          storageId,
          extractedText: clientResult?.sanitizedText,
          sourceProvenance: clientResult?.sourceProvenance,
          clientIdentifiers: clientResult?.clientIdentifiers,
          patientState,
        });

        if (extractionResult?.claimId) {
          setSelectedClaimId(extractionResult.claimId);
        }

        return extractionResult;
      } catch (err: unknown) {
        const msg =
          err && typeof err === "object" && "data" in err && typeof (err as { data: unknown }).data === "string"
            ? (err as { data: string }).data
            : err instanceof Error
              ? err.message.replace(/^Uncaught (?:Error|ConvexError):\s*/i, "").replace(/^Server Error\s*/i, "")
              : String(err);
        throw new Error(msg);
      }
    },
    [generateUploadUrlMutation, registerPendingUploadMutation, parseDenialAction]
  );

  // Parse raw text pasted by user
  const parseDocumentText = useCallback(
    async (text: string, patientState?: string, origin?: string) => {
      try {
        const extractionResult: DenialExtractionResult & { claimId: string } = await parseDenialAction({
          rawDocumentText: text,
          patientState,
          origin,
        });

        if (extractionResult?.claimId) {
          setSelectedClaimId(extractionResult.claimId);
        }

        return extractionResult;
      } catch (err: unknown) {
        const msg =
          err && typeof err === "object" && "data" in err && typeof (err as { data: unknown }).data === "string"
            ? (err as { data: string }).data
            : err instanceof Error
              ? err.message.replace(/^Uncaught (?:Error|ConvexError):\s*/i, "").replace(/^Server Error\s*/i, "")
              : String(err);
        throw new Error(msg);
      }
    },
    [parseDenialAction]
  );

  // Update claim status
  const updateClaimStatus = useCallback(
    async (claimId: string, status: ClaimStatus, details?: string) => {
      await updateStatusMutation({
        claimId: claimId as Id<"claims">,
        status,
        details,
      });
    },
    [updateStatusMutation]
  );

  // Delete a case and automatically handle active selection fallback
  const deleteCase = useCallback(
    async (claimId: string) => {
      const result = await deleteCaseMutation({
        claimId: claimId as Id<"claims">,
      });

      // If currently selected claim was deleted, switch to next available claim or clear
      if (selectedClaimId === claimId) {
        const remaining = (rawClaims || []).filter((c) => c._id !== claimId);
        setSelectedClaimId(remaining.length > 0 ? remaining[0]._id : "");
      }

      return result;
    },
    [deleteCaseMutation, selectedClaimId, rawClaims]
  );

  return {
    claims,
    rawClaims: rawClaims || [],
    isLoading: rawClaims === undefined,
    portfolioStats: rawPortfolioStats || {
      totalClaims: 0,
      totalDisputedAmount: 0,
      activeDisputedAmount: 0,
      overturnedWonAmount: 0,
      averageWinScore: 0,
      recoveryRatePercent: 0,
      criticalDeadlinesCount: 0,
      urgentDeadlinesCount: 0,
      claimsByStatus: {},
      claimsByRisk: {},
      payerBreakdown: [],
    },
    isLoadingPortfolioStats: rawPortfolioStats === undefined,
    selectedClaim,
    selectedClaimId,
    isLoadingSelectedClaim: Boolean(selectedClaimId && !selectedClaim),
    setSelectedClaimId,
    includeDemo,
    setIncludeDemo,
    stats,
    claimCountsByStatus,
    uploadAndParseDocument,
    parseDocumentText,
    createWithPatient: createWithPatientMutation,
    updateClaimStatus,
    deleteCase,
  };
}
