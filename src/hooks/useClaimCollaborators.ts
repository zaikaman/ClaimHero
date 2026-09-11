import { useCallback } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { CaseInvite, ClaimAccessRole, ClaimCollaborator, ClaimInviteStatus } from "../types";

/** User-level inbox of pending case invites (no claim context needed). */
export function useMyInvites() {
  const invites = useQuery(api.claimCollaborators.listMyInvites, {}) as CaseInvite[] | undefined;
  const acceptMutation = useMutation(api.claimCollaborators.accept);
  const declineMutation = useMutation(api.claimCollaborators.decline);

  const acceptInvite = useCallback(
    async (claimId: string) => {
      return await acceptMutation({ claimId: claimId as Id<"claims"> });
    },
    [acceptMutation]
  );

  const declineInvite = useCallback(
    async (claimId: string) => {
      return await declineMutation({ claimId: claimId as Id<"claims"> });
    },
    [declineMutation]
  );

  return {
    invites: invites || [],
    pendingCount: invites?.length || 0,
    isLoadingInvites: invites === undefined,
    acceptInvite,
    declineInvite,
  };
}

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
  const inviteStatus = useQuery(
    api.claimCollaborators.getInviteStatus,
    normalizedId ? { claimId: normalizedId } : "skip"
  ) as ClaimInviteStatus | null | undefined;

  const inviteMutation = useMutation(api.claimCollaborators.invite);
  const updateRoleMutation = useMutation(api.claimCollaborators.updateRole);
  const removeMutation = useMutation(api.claimCollaborators.remove);
  const leaveMutation = useMutation(api.claimCollaborators.leave);
  const acceptMutation = useMutation(api.claimCollaborators.accept);
  const declineMutation = useMutation(api.claimCollaborators.decline);
  const cancelInviteMutation = useMutation(api.claimCollaborators.cancelInvite);

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

  const acceptInvite = useCallback(async () => {
    if (!normalizedId) throw new Error("No claim selected");
    return await acceptMutation({ claimId: normalizedId });
  }, [acceptMutation, normalizedId]);

  const declineInvite = useCallback(async () => {
    if (!normalizedId) throw new Error("No claim selected");
    return await declineMutation({ claimId: normalizedId });
  }, [declineMutation, normalizedId]);

  const cancelInvite = useCallback(
    async (email: string) => {
      if (!normalizedId) throw new Error("No claim selected");
      return await cancelInviteMutation({ claimId: normalizedId, email });
    },
    [cancelInviteMutation, normalizedId]
  );

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
    inviteStatus: inviteStatus || null,
    invite,
    updateRole,
    removeCollaborator,
    leaveCase,
    acceptInvite,
    declineInvite,
    cancelInvite,
  };
}
