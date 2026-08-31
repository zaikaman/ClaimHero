import { useCallback, useEffect, useState } from "react";
import { useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Claim, VectorPrecedentMatch } from "../types";
import { Id } from "../../convex/_generated/dataModel";

const inFlightRequests = new Map<string, Promise<VectorPrecedentMatch[]>>();
const completedRequests = new Map<string, VectorPrecedentMatch[]>();

async function retrieveOnce(
  cacheKey: string,
  claimId: Id<"claims">,
  retrieveAction: (args: { claimId: Id<"claims"> }) => Promise<VectorPrecedentMatch[]>,
  forceRefresh = false
): Promise<VectorPrecedentMatch[]> {
  const inFlight = inFlightRequests.get(cacheKey);
  if (inFlight) {
    return inFlight;
  }

  if (!forceRefresh) {
    const completed = completedRequests.get(cacheKey);
    if (completed) {
      return completed;
    }
  }

  const request = retrieveAction({ claimId }).then((result) => {
    const next = Array.isArray(result) ? result.slice(0, 3) : [];
    completedRequests.set(cacheKey, next);
    return next;
  });
  inFlightRequests.set(cacheKey, request);

  try {
    return await request;
  } finally {
    inFlightRequests.delete(cacheKey);
  }
}

export function usePrecedents(claim?: Claim | null) {
  const claimId = claim?._id as Id<"claims"> | undefined;
  const cacheKey = claimId
    ? [
        claimId,
        claim?.denialReasonCode || "",
        ...(claim?.cptCodes || []),
        ...(claim?.icd10Codes || []),
      ].join("|")
    : "";
  const retrieveAction = useAction(api.actions.precedentArchive.retrieveTopPrecedents);

  const [matches, setMatches] = useState<VectorPrecedentMatch[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const retrievePrecedents = useCallback(
    async (targetClaimId?: string): Promise<VectorPrecedentMatch[]> => {
      const activeClaimId = targetClaimId ? (targetClaimId as Id<"claims">) : claimId;
      if (!activeClaimId) {
        throw new Error("No claim selected for precedent retrieval");
      }
      if (!retrieveAction) {
        throw new Error("Precedent vector search action is unavailable");
      }

      setIsLoading(true);
      setError(null);
      try {
        const requestKey = activeClaimId === claimId ? cacheKey : activeClaimId;
        const next = await retrieveOnce(
          requestKey,
          activeClaimId,
          retrieveAction,
          true
        );
        setMatches(next);
        return next;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to retrieve precedent vectors.";
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [cacheKey, claimId, retrieveAction]
  );

  useEffect(() => {
    if (!claimId || !retrieveAction) {
      setMatches([]);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);
    retrieveOnce(
      cacheKey,
      claimId,
      retrieveAction
    )
      .then((result) => {
        if (!cancelled) {
          setMatches(result);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : "Failed to retrieve precedent vectors.";
          setError(message);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [cacheKey, claimId, retrieveAction]);

  return {
    matches,
    isLoading,
    error,
    retrievePrecedents,
  };
}
