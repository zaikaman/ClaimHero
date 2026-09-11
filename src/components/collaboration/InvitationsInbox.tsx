import React, { useState } from "react";
import { Check, CircleNotch, EnvelopeSimple, X } from "@phosphor-icons/react";
import { Card } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { toast } from "sonner";
import { cn } from "../../lib/utils";
import { useMyInvites } from "../../hooks/useClaimCollaborators";

interface InvitationsInboxProps {
  onOpenCase: (claimId: string) => void;
}

function roleBadgeClass(role: string): string {
  if (role === "editor") return "bg-sky-500/15 text-sky-300 border border-sky-500/30";
  return "bg-muted text-muted-foreground border border-border/60";
}

/**
 * Self-contained inbox of pending case invites. Renders nothing when empty
 * so the radar stays clean for users without invitations.
 */
export const InvitationsInbox: React.FC<InvitationsInboxProps> = ({ onOpenCase }) => {
  const { invites, isLoadingInvites, acceptInvite, declineInvite } = useMyInvites();
  const [busyClaimId, setBusyClaimId] = useState<string | null>(null);

  if (isLoadingInvites || invites.length === 0) {
    return null;
  }

  const handleAccept = async (claimId: string, claimNumber: string) => {
    setBusyClaimId(claimId);
    try {
      await acceptInvite(claimId);
      toast.success(`Joined case #${claimNumber}`);
      onOpenCase(claimId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to accept invite");
    } finally {
      setBusyClaimId(null);
    }
  };

  const handleDecline = async (claimId: string) => {
    setBusyClaimId(claimId);
    try {
      await declineInvite(claimId);
      toast.success("Invite declined");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to decline invite");
    } finally {
      setBusyClaimId(null);
    }
  };

  return (
    <Card className="p-4 space-y-3 border-violet-500/30 bg-violet-500/5">
      <div className="flex items-center gap-2.5">
        <div className="size-8 rounded-md bg-violet-500/15 text-violet-300 flex items-center justify-center shrink-0">
          <EnvelopeSimple className="size-4" />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">
            Case invitations
            <Badge variant="secondary" className="ml-2 font-mono text-[10px] px-1.5 py-0">
              {invites.length}
            </Badge>
          </h3>
          <p className="text-xs text-muted-foreground">
            Teammates invited you to collaborate. Nothing is shared until you accept.
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {invites.map((invite) => {
          const busy = busyClaimId === invite.claimId;
          return (
            <div
              key={invite.claimId}
              className="flex items-center gap-2.5 p-2.5 rounded-lg border border-border/60 bg-background/60"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-foreground font-mono">
                    #{invite.claimNumber}
                  </span>
                  <Badge className={cn("text-[9px] font-mono px-1.5 py-0 h-5 capitalize", roleBadgeClass(invite.role))}>
                    {invite.role}
                  </Badge>
                </div>
                <div className="text-[11px] text-muted-foreground truncate">
                  Invited by {invite.invitedBy}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Button
                  size="xs"
                  onClick={() => handleAccept(invite.claimId, invite.claimNumber)}
                  disabled={busy}
                  className="h-7 text-[11px] gap-1"
                >
                  {busy ? <CircleNotch className="size-3 animate-spin" /> : <Check className="size-3" />}
                  <span>Accept</span>
                </Button>
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => handleDecline(invite.claimId)}
                  disabled={busy}
                  className="h-7 text-[11px] gap-1"
                >
                  <X className="size-3" />
                  <span>Decline</span>
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
};
