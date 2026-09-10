import { useCallback } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { ClaimAccessRole, ClaimCollaborator } from "../types";

export function useClaimCollaborators(claimId?: string) {
  const normalizedId = claimId as Id<"claims"> | undefined;
  const collaborators = useQuery(
    api.claimCollaborators.listByClaim,
    normalizedId ? { claimId: normalizedId } : "skip"
  ) as ClaimCollaborator[] | undefined;
  const myAccess = useQuery(
    api.claimCollaborators.getMyAccess,
    normalizedId ? { claimId: normalizedId } : "skip"
  ) as { accessRole: ClaimAccessRole; isOwner: boolean } | null | undefined;

  const inviteMutation = useMutation(api.claimCollaborators.invite);
  const updateRoleMutation = useMutation(api.claimCollaborators.updateRole);
  const removeMutation = useMutation(api.claimCollaborators.remove);
  const leaveMutation = useMutation(api.claimCollaborators.leave);

  const invite = useCallback(
    async (email: string, role: "editor" | "viewer") => {
      if (!normalizedId) throw new Error("No claim selected");
      return await inviteMutation({ claimId: normalizedId, email, role });
    },
    [inviteMutation, normalizedId]
  );

  const updateRole = useCallback(
    async (email: string, role: "editor" | "viewer") => {
      if (!normalizedId) throw new Error("No claim selected");
      return await updateRoleMutation({ claimId: normalizedId, email, role });
    },
    [updateRoleMutation, normalizedId]
  );

  const removeCollaborator = useCallback(
    async (email: string) => {
      if (!normalizedId) throw new Error("No claim selected");
      return await removeMutation({ claimId: normalizedId, email });
    },
    [removeMutation, normalizedId]
  );

  const leaveCase = useCallback(async () => {
    if (!normalizedId) throw new Error("No claim selected");
    return await leaveMutation({ claimId: normalizedId });
  }, [leaveMutation, normalizedId]);

  const accessRole = myAccess?.accessRole;
  const isOwner = myAccess?.isOwner === true;
  const canEdit = accessRole === "owner" || accessRole === "editor";
  const isViewer = accessRole === "viewer";

  return {
    collaborators: collaborators || [],
    isLoadingCollaborators: normalizedId ? collaborators === undefined : false,
    myAccess: myAccess || null,
    accessRole,
    isOwner,
    canEdit,
    isViewer,
    invite,
    updateRole,
    removeCollaborator,
    leaveCase,
  };
}
