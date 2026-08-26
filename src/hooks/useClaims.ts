import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Claim, ClaimStatus, DashboardStats, DenialExtractionResult } from "../types";

const convexApi = api as any;

export function useClaims(options?: {
  statusFilter?: string;
  payerFilter?: string;
  searchQuery?: string;
}) {
  const [selectedClaimId, setSelectedClaimId] = useState<string>("");

  const statusArg = options?.statusFilter && options.statusFilter !== "all" && options.statusFilter !== "critical_deadline"
    ? options.statusFilter
    : undefined;

  const payerArg = options?.payerFilter && options.payerFilter !== "all"
    ? options.payerFilter
    : undefined;

  // Real Convex query to fetch claims
  const rawClaims = useQuery(convexApi.claims.list, {
    status: statusArg,
    payer: payerArg,
  }) as Claim[] | undefined;

  const rawPortfolioStats = useQuery(convexApi.claims.getPortfolioStats, {});

  const searchQuery = options?.searchQuery?.toLowerCase().trim() || "";

  // Filter claims (search and critical deadline logic)
  const claims = useMemo(() => {
    if (!rawClaims) return [];

    return rawClaims.filter((claim) => {
      // Critical deadline filter
      if (options?.statusFilter === "critical_deadline") {
        if (claim.daysRemaining > 14 || claim.status === "won") return false;
      }

      // Text search
      if (searchQuery) {
        const matchesClaimNum = claim.claimNumber.toLowerCase().includes(searchQuery);
        const matchesPatient = claim.patient?.name.toLowerCase().includes(searchQuery);
        const matchesCpt = claim.cptCodes?.some((code) => code.includes(searchQuery));
        const matchesProvider = claim.providerName.toLowerCase().includes(searchQuery);
        const matchesReason = claim.denialReasonCode.toLowerCase().includes(searchQuery);

        if (!matchesClaimNum && !matchesPatient && !matchesCpt && !matchesProvider && !matchesReason) {
          return false;
        }
      }

      return true;
    });
  }, [rawClaims, options?.statusFilter, searchQuery]);

  // Aggregate Dashboard Statistics from real claims
  const stats: DashboardStats = useMemo(() => {
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

      if (c.overturnProbabilityScore !== undefined) {
        scoreSum += c.overturnProbabilityScore;
        scoreCount++;
      }

      if (c.daysRemaining <= 14 && c.status !== "won") {
        criticalDeadlinesCount++;
      }
    }

    return {
      totalClaims,
      activeDisputedAmount,
      overturnedWonAmount,
      averageWinScore: scoreCount > 0 ? Math.round(scoreSum / scoreCount) : 0,
      criticalDeadlinesCount,
    };
  }, [rawClaims]);

  // Status breakdown counts
  const claimCountsByStatus = useMemo(() => {
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
      if (c.daysRemaining <= 14 && c.status !== "won") {
        counts.critical_deadline++;
      }
    }

    return counts;
  }, [rawClaims]);

  // Active selected claim
  const selectedClaim = useMemo(() => {
    if (!rawClaims || rawClaims.length === 0) return null;
    return rawClaims.find((c) => c._id === selectedClaimId) || rawClaims[0] || null;
  }, [rawClaims, selectedClaimId]);

  // Real Convex mutation & action hooks
  const generateUploadUrlMutation = useMutation(convexApi.claims.generateUploadUrl);
  const createWithPatientMutation = useMutation(convexApi.claims.createWithPatient);
  const updateStatusMutation = useMutation(convexApi.claims.updateStatus);
  const deleteCaseMutation = useMutation(convexApi.claims.deleteCase);
  const parseDenialAction = useAction(
    convexApi["actions/opticalParser"]?.parseDenialDocument ||
    convexApi.actions?.opticalParser?.parseDenialDocument
  );

  // Upload a real file and run optical parsing
  const uploadAndParseDocument = useCallback(
    async (file: File, patientState?: string) => {
      // 1. Get upload URL from Convex
      const postUrl = await generateUploadUrlMutation();

      // 2. Upload real binary to Convex Storage
      const response = await fetch(postUrl, {
        method: "POST",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });

      if (!response.ok) {
        throw new Error(`Failed to upload file: ${response.statusText}`);
      }

      const { storageId } = await response.json();

      // 3. Trigger optical extraction action
      const extractionResult: DenialExtractionResult & { claimId: string } = await parseDenialAction({
        storageId,
        patientState,
      });

      if (extractionResult?.claimId) {
        setSelectedClaimId(extractionResult.claimId);
      }

      return extractionResult;
    },
    [generateUploadUrlMutation, parseDenialAction]
  );

  // Parse raw text pasted by user
  const parseDocumentText = useCallback(
    async (text: string, patientState?: string) => {
      const extractionResult: DenialExtractionResult & { claimId: string } = await parseDenialAction({
        rawDocumentText: text,
        patientState,
      });

      if (extractionResult?.claimId) {
        setSelectedClaimId(extractionResult.claimId);
      }

      return extractionResult;
    },
    [parseDenialAction]
  );

  // Update claim status
  const updateClaimStatus = useCallback(
    async (claimId: string, status: ClaimStatus, details?: string) => {
      await updateStatusMutation({
        claimId: claimId as any,
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
        claimId: claimId as any,
      });

      // If currently selected claim was deleted, switch to next available claim
      if (selectedClaimId === claimId) {
        const remaining = (rawClaims || []).filter((c) => c._id !== claimId);
        setSelectedClaimId(remaining[0]?._id || "");
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
    selectedClaimId: selectedClaimId || (rawClaims?.[0]?._id ?? ""),
    setSelectedClaimId,
    stats,
    claimCountsByStatus,
    uploadAndParseDocument,
    parseDocumentText,
    createWithPatient: createWithPatientMutation,
    updateClaimStatus,
    deleteCase,
  };
}
