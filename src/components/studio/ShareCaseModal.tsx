import React, { useState } from "react";
import {
  ArrowCounterClockwise,
  Check,
  CircleNotch,
  EnvelopeSimple,
  Link as LinkIcon,
  SignOut,
  Trash,
  UsersThree,
  XCircle,
} from "@phosphor-icons/react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Input } from "../ui/input";
import { Select } from "../ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { toast } from "sonner";
import { cn } from "../../lib/utils";
import { PresenceStatusDot, colorForUserId, initialsForName } from "./CollaboratorPresence";
import type { ClaimCollaborator } from "../../types";

interface ShareCaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  claimNumber: string;
  claimId: string;
  isOwner: boolean;
  collaborators: ClaimCollaborator[];
  onlineUserIds: string[];
  onInvite: (email: string, role: "editor" | "viewer") => Promise<unknown>;
  onUpdateRole: (email: string, role: "editor" | "viewer") => Promise<unknown>;
  onRemove: (email: string) => Promise<unknown>;
  onCancelInvite: (email: string) => Promise<unknown>;
  onLeave?: () => Promise<unknown>;
}

function roleBadgeClass(role: string): string {
  if (role === "owner") return "bg-violet-500/15 text-violet-300 border border-violet-500/30";
  if (role === "editor") return "bg-sky-500/15 text-sky-300 border border-sky-500/30";
  return "bg-muted text-muted-foreground border border-border/60";
}

export const ShareCaseModal: React.FC<ShareCaseModalProps> = ({
  isOpen,
  onClose,
  claimNumber,
  claimId,
  isOwner,
  collaborators,
  onlineUserIds,
  onInvite,
  onUpdateRole,
  onRemove,
  onCancelInvite,
  onLeave,
}) => {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"editor" | "viewer">("editor");
  const [isInviting, setIsInviting] = useState(false);
  const [busyEmail, setBusyEmail] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  const sendInvite = async (targetEmail: string, targetRole: "editor" | "viewer") => {
    const trimmed = targetEmail.trim();
    if (!trimmed) {
      toast.error("Enter a teammate email address to invite");
      return;
    }
    setIsInviting(true);
    try {
      const result = (await onInvite(trimmed, targetRole)) as { updated?: boolean } | undefined;
      toast.success(
        result && typeof result === "object" && "updated" in result && result.updated
          ? `Updated the pending invite for ${trimmed}`
          : `Invite sent to ${trimmed} — pending acceptance`
      );
      setEmail("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send invite");
    } finally {
      setIsInviting(false);
    }
  };

  const handleInvite = async () => {
    await sendInvite(email, role);
  };

  const handleReinvite = async (targetEmail: string, targetRole: "editor" | "viewer") => {
    setBusyEmail(targetEmail);
    try {
      await onInvite(targetEmail, targetRole);
      toast.success(`Re-invited ${targetEmail} — pending acceptance`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send invite");
    } finally {
      setBusyEmail(null);
    }
  };

  const handleRoleChange = async (targetEmail: string, nextRole: "editor" | "viewer") => {
    setBusyEmail(targetEmail);
    try {
      await onUpdateRole(targetEmail, nextRole);
      toast.success(`Updated ${targetEmail} to ${nextRole}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update role");
    } finally {
      setBusyEmail(null);
    }
  };

  const handleRemove = async (targetEmail: string) => {
    setBusyEmail(targetEmail);
    try {
      await onRemove(targetEmail);
      toast.success(`Revoked access for ${targetEmail}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to revoke access");
    } finally {
      setBusyEmail(null);
    }
  };

  const handleCancelInvite = async (targetEmail: string) => {
    setBusyEmail(targetEmail);
    try {
      await onCancelInvite(targetEmail);
      toast.success(`Canceled the invite for ${targetEmail}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to cancel invite");
    } finally {
      setBusyEmail(null);
    }
  };

  const handleCopyLink = async () => {
    const url =
      typeof window !== "undefined"
        ? `${window.location.origin}${window.location.pathname}?claim=${claimId}`
        : `?claim=${claimId}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setLinkCopied(true);
    toast.success("Invite link copied. Your teammate accepts it to open this exact case.");
    setTimeout(() => setLinkCopied(false), 2500);
  };

  const handleLeave = async () => {
    if (!onLeave) return;
    setBusyEmail("__leave__");
    try {
      await onLeave();
      toast.success("You left the shared case");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to leave case");
    } finally {
      setBusyEmail(null);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md p-5 space-y-4">
        <DialogHeader className="pr-8">
          <div className="flex items-center gap-2.5">
            <div className="size-9 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <UsersThree className="size-5" />
            </div>
            <div>
              <DialogTitle>Share case #{claimNumber}</DialogTitle>
              <DialogDescription>
                Invite advocates, physicians, or billers to collaborate live in the Appeal Studio.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {isOwner ? (
          <div className="space-y-2">
            <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <EnvelopeSimple className="size-3.5 text-muted-foreground" />
              Invite by email
            </label>
            <div className="flex gap-2">
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleInvite();
                }}
                placeholder="teammate@clinic.org"
                className="flex-1 font-mono"
                disabled={isInviting}
              />
              <Select
                value={role}
                onChange={(e) => setRole(e.target.value as "editor" | "viewer")}
                className="w-28"
                disabled={isInviting}
              >
                <option value="editor">Editor</option>
                <option value="viewer">Viewer</option>
              </Select>
              <Button size="sm" onClick={handleInvite} disabled={isInviting} className="shrink-0">
                {isInviting ? <CircleNotch className="size-3.5 animate-spin" /> : "Invite"}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Editors can draft, synthesize, and escalate. Viewers have read-only access. Use the
              email they sign in with. Invites stay pending until accepted — nothing is shared
              before then.
            </p>
            <Button variant="outline" size="sm" onClick={handleCopyLink} className="w-full gap-1.5">
              {linkCopied ? (
                <>
                  <Check className="size-3.5 text-emerald-400" />
                  <span className="text-emerald-400 font-mono">Link copied</span>
                </>
              ) : (
                <>
                  <LinkIcon className="size-3.5" />
                  <span>Copy invite link</span>
                </>
              )}
            </Button>
          </div>
        ) : (
          <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground leading-relaxed">
            Only the case owner can invite or manage collaborators. Ask the owner to add teammates
            or change roles.
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground">
              Case team ({collaborators.length})
            </span>
            <span className="text-[10px] font-mono text-muted-foreground flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-emerald-400 shrink-0" />
              Green dot means online now
            </span>
          </div>
          {collaborators.length === 0 ? (
            <p className="text-xs text-muted-foreground italic py-2">
              Only you have access. Invite a teammate to start collaborating live.
            </p>
          ) : (
            <div className="space-y-1.5 max-h-64 overflow-y-auto pr-0.5">
              {collaborators.map((member) => {
                const online = Boolean(member.userId && onlineUserIds.includes(member.userId));
                const busy = busyEmail === member.email;
                return (
                  <div
                    key={`${member.role}-${member.email}`}
                    className="flex items-center gap-2.5 p-2 rounded-lg border border-border/60 bg-background/60"
                  >
                    <div className="relative shrink-0">
                      <Avatar size="sm">
                        {member.image && <AvatarImage src={member.image} alt={member.displayName} />}
                        <AvatarFallback
                          className="text-[10px] font-bold leading-none"
                          style={{
                            backgroundColor: `${colorForUserId(member.email)}1f`,
                            color: colorForUserId(member.email),
                          }}
                        >
                          {initialsForName(member.displayName)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="absolute bottom-0 right-0 flex size-2.5 items-center justify-center rounded-full bg-card">
                        <PresenceStatusDot online={online} />
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium text-foreground truncate">
                        {member.displayName}
                        {member.isSelf ? (
                          <span className="text-muted-foreground font-normal"> (you)</span>
                        ) : null}
                      </div>
                      <div className="text-[10px] font-mono text-muted-foreground truncate">
                        {member.email}
                      </div>
                    </div>
                    <Badge className={cn("text-[9px] font-mono px-1.5 py-0 h-5 shrink-0 capitalize", roleBadgeClass(member.role))}>
                      {member.role}
                    </Badge>
                    {member.status === "pending" && (
                      <Badge className="text-[9px] font-mono px-1.5 py-0 h-5 shrink-0 bg-amber-500/15 text-amber-300 border border-amber-500/30">
                        Invite pending
                      </Badge>
                    )}
                    {member.status === "declined" && (
                      <Badge className="text-[9px] font-mono px-1.5 py-0 h-5 shrink-0 bg-muted text-muted-foreground border border-border/60">
                        Declined
                      </Badge>
                    )}
                    {isOwner && !member.isOwner && !member.isSelf && member.status === "pending" && (
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => handleCancelInvite(member.email)}
                          disabled={busy}
                          title={`Cancel invite for ${member.email}`}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          {busy ? <CircleNotch className="size-3.5 animate-spin" /> : <XCircle className="size-3.5" />}
                        </Button>
                      </div>
                    )}
                    {isOwner && !member.isOwner && !member.isSelf && member.status === "declined" && (
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleReinvite(member.email, member.role === "owner" ? "editor" : member.role)}
                          disabled={busy || isInviting}
                          title={`Re-invite ${member.email}`}
                          className="h-7 text-[10px] gap-1 text-muted-foreground hover:text-foreground"
                        >
                          {busy ? <CircleNotch className="size-3 animate-spin" /> : <ArrowCounterClockwise className="size-3" />}
                          <span>Re-invite</span>
                        </Button>
                      </div>
                    )}
                    {isOwner && !member.isOwner && !member.isSelf && member.status !== "pending" && member.status !== "declined" && (
                      <div className="flex items-center gap-1 shrink-0">
                        <Select
                          value={member.role === "owner" ? "editor" : member.role}
                          onChange={(e) => handleRoleChange(member.email, e.target.value as "editor" | "viewer")}
                          disabled={busy}
                          className="h-7 text-[10px] w-20"
                        >
                          <option value="editor">Editor</option>
                          <option value="viewer">Viewer</option>
                        </Select>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => handleRemove(member.email)}
                          disabled={busy}
                          title={`Revoke ${member.email}`}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          {busy ? <CircleNotch className="size-3.5 animate-spin" /> : <Trash className="size-3.5" />}
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {!isOwner && onLeave && (
          <div className="pt-2 border-t border-border/60">
            <Button
              variant="outline"
              size="sm"
              onClick={handleLeave}
              disabled={busyEmail === "__leave__"}
              className="w-full gap-1.5 text-muted-foreground hover:text-destructive"
            >
              {busyEmail === "__leave__" ? (
                <CircleNotch className="size-3.5 animate-spin" />
              ) : (
                <SignOut className="size-3.5" />
              )}
              <span>Leave shared case</span>
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
