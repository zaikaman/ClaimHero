import React, { useState } from "react";
import { ArrowLeft, Check, CircleNotch, EnvelopeSimple, ShieldWarning, X } from "@phosphor-icons/react";
import { Card } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { toast } from "sonner";
import { useClaimCollaborators, useMyInvites } from "../../hooks/useClaimCollaborators";

interface PendingInviteGateProps {
  claimId: string;
  onDismiss: () => void;
}

/**
 * Deep-link gate for shared-case URLs opened without access. Pending invitees
 * get an explicit accept screen (the invite grants nothing until accepted);
 * everyone else gets a dead-end explanation instead of an infinite spinner.
 */
export const PendingInviteGate: React.FC<PendingInviteGateProps> = ({ claimId, onDismiss }) => {
  const { inviteStatus, acceptInvite, declineInvite } = useClaimCollaborators(claimId);
  const { invites } = useMyInvites();
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);

  const invite = invites.find((entry) => entry.claimId === claimId);

  if (inviteStatus === undefined) {
    return (
      <div className="flex h-full min-h-[360px] items-center justify-center flex-col gap-3 animate-pulse">
        <CircleNotch className="size-6 text-foreground animate-spin" />
        <span className="text-xs font-mono text-muted-foreground">Checking case access...</span>
      </div>
    );
  }

  if (inviteStatus === "pending") {
    const handleAccept = async () => {
      setBusy("accept");
      try {
        await acceptInvite();
        toast.success("Joined the shared case");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to accept invite");
      } finally {
        setBusy(null);
      }
    };
    const handleDecline = async () => {
      setBusy("decline");
      try {
        await declineInvite();
        toast.success("Invite declined");
        onDismiss();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to decline invite");
      } finally {
        setBusy(null);
      }
    };
    return (
      <div className="flex h-full min-h-[360px] items-center justify-center p-4">
        <Card className="w-full max-w-md p-6 space-y-4 text-center">
          <div className="size-12 rounded-2xl bg-violet-500/15 text-violet-300 flex items-center justify-center mx-auto">
            <EnvelopeSimple className="size-6" />
          </div>
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-foreground">You have been invited</h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {invite ? (
                <>
                  <span className="text-foreground font-medium">{invite.invitedBy}</span> invited
                  you to collaborate on case{" "}
                  <span className="font-mono text-foreground">#{invite.claimNumber}</span> as{" "}
                  <Badge variant="outline" className="font-mono text-[10px] capitalize">
                    {invite.role}
                  </Badge>
                  . Nothing is shared until you accept.
                </>
              ) : (
                "A teammate invited you to collaborate on this case. Nothing is shared until you accept."
              )}
            </p>
          </div>
          <div className="flex items-center justify-center gap-2">
            <Button size="sm" onClick={handleAccept} disabled={busy !== null} className="gap-1.5">
              {busy === "accept" ? (
                <CircleNotch className="size-3.5 animate-spin" />
              ) : (
                <Check className="size-3.5" />
              )}
              <span>Accept invite</span>
            </Button>
            <Button size="sm" variant="outline" onClick={handleDecline} disabled={busy !== null} className="gap-1.5">
              {busy === "decline" ? (
                <CircleNotch className="size-3.5 animate-spin" />
              ) : (
                <X className="size-3.5" />
              )}
              <span>Decline</span>
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  if (inviteStatus === "declined") {
    return (
      <div className="flex h-full min-h-[360px] items-center justify-center p-4">
        <Card className="w-full max-w-md p-6 space-y-4 text-center">
          <div className="size-12 rounded-2xl bg-muted text-muted-foreground flex items-center justify-center mx-auto">
            <X className="size-6" />
          </div>
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-foreground">Invite declined</h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              You declined this case invite. Ask the case owner to invite you again if this was a
              mistake.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={onDismiss} className="gap-1.5 mx-auto">
            <ArrowLeft className="size-3.5" />
            <span>Back to cases</span>
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-[360px] items-center justify-center p-4">
      <Card className="w-full max-w-md p-6 space-y-4 text-center">
        <div className="size-12 rounded-2xl bg-amber-500/10 text-amber-400 flex items-center justify-center mx-auto">
          <ShieldWarning className="size-6" />
        </div>
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-foreground">Case unavailable</h2>
          <p className="text-xs text-muted-foreground leading-relaxed">
            This case does not exist, was deleted, or your access was revoked. If you followed an
            invite link, make sure you are signed in with the invited email address.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={onDismiss} className="gap-1.5 mx-auto">
          <ArrowLeft className="size-3.5" />
          <span>Back to cases</span>
        </Button>
      </Card>
    </div>
  );
};
