import { useCallback, useEffect, useState } from "react";
import { useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Claim, VectorPrecedentMatch } from "../types";

const convexApi = api as any;

export function usePrecedents(claim?: Claim | null) {
  const claimId = claim?._id;
  const retrieveAction = useAction(
    convexApi["actions/precedentArchive"]?.retrieveTopPrecedents ||
      convexApi.actions?.precedentArchive?.retrieveTopPrecedents
  );

  const [matches, setMatches] = useState<VectorPrecedentMatch[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const retrievePrecedents = useCallback(
    async (targetClaimId?: string): Promise<VectorPrecedentMatch[]> => {
      const activeClaimId = targetClaimId || claimId;
      if (!activeClaimId) {
        throw new Error("No claim selected for precedent retrieval");
      }
      if (!retrieveAction) {
        throw new Error("Precedent vector search action is unavailable");
      }

      setIsLoading(true);
      setError(null);
      try {
        const result = (await retrieveAction({
          claimId: activeClaimId as any,
        })) as VectorPrecedentMatch[];
        const next = Array.isArray(result) ? result.slice(0, 3) : [];
        setMatches(next);
        return next;
      } catch (err: any) {
        const message = err?.message || "Failed to retrieve precedent vectors.";
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [claimId, retrieveAction]
  );

  useEffect(() => {
    if (!claimId || !retrieveAction) {
      setMatches([]);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);
    retrieveAction({ claimId: claimId as any })
      .then((result: VectorPrecedentMatch[]) => {
        if (!cancelled) {
          setMatches(Array.isArray(result) ? result.slice(0, 3) : []);
        }
      })
      .catch((err: any) => {
        if (!cancelled) {
          setError(err?.message || "Failed to retrieve precedent vectors.");
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
  }, [claimId, claim?.denialReasonCode, claim?.cptCodes, retrieveAction]);

  return {
    matches,
    isLoading,
    error,
    retrievePrecedents,
  };
}
