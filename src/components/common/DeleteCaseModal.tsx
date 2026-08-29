import React, { useState } from "react";
import {
  Trash,
  WarningOctagon,
  CircleNotch,
  FileText,
  Pulse,
  Envelope,
  Clock,
  HardDrives,
  Buildings,
} from "@phosphor-icons/react";
import { Claim } from "../../types";
import { formatCurrency } from "../../lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Alert, AlertDescription } from "../ui/alert";

interface DeleteCaseModalProps {
  isOpen: boolean;
  claim: Claim | null;
  onClose: () => void;
  onConfirmDelete: (claimId: string) => Promise<any>;
  onSuccess?: () => void;
}

export const DeleteCaseModal: React.FC<DeleteCaseModalProps> = ({
  isOpen,
  claim,
  onClose,
  onConfirmDelete,
  onSuccess,
}) => {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!claim) return null;

  const handleDelete = async () => {
    setIsDeleting(true);
    setError(null);
    try {
      await onConfirmDelete(claim._id);
      setIsDeleting(false);
      onClose();
      onSuccess?.();
    } catch (err: any) {
      setIsDeleting(false);
      setError(err?.message || "Failed to delete case. Please try again.");
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isDeleting && onClose()}>
      <DialogContent className="max-w-md border-border bg-card/95 backdrop-blur-xl shadow-2xl p-6 sm:rounded-2xl gap-5">
        <DialogHeader className="gap-2 text-left">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-xl bg-destructive/15 border border-destructive/30 text-destructive shadow-xs shrink-0">
              <WarningOctagon className="size-6" weight="duotone" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold text-foreground">
                Delete Case Permanently
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                This action is irreversible and will purge all related clinical evidence and appeal history.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Claim Summary Overview Card */}
        <div className="rounded-xl border border-border/80 bg-muted/30 p-3.5 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex flex-col min-w-0">
              <span className="font-semibold text-xs text-foreground truncate">
                {claim.patient?.name || "Patient Record"}
              </span>
              <span className="font-mono text-[10px] text-muted-foreground">
                #{claim.claimNumber}
              </span>
            </div>
            <div className="text-right">
              <span className="font-mono text-xs font-bold text-destructive">
                {formatCurrency(claim.deniedAmount)}
              </span>
              <div className="text-[10px] font-mono text-muted-foreground">
                Disputed
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-border/50">
            <Badge variant="outline" className="text-[10px] gap-1 px-2 py-0.5">
              <Buildings className="size-3 text-muted-foreground" />
              <span>{claim.patient?.insurancePayer || "Insurer"}</span>
            </Badge>
            <Badge variant="destructive" className="font-mono text-[10px] px-2 py-0.5">
              Code {claim.denialReasonCode}
            </Badge>
            {claim.cptCodes?.[0] && (
              <Badge variant="secondary" className="font-mono text-[10px] px-2 py-0.5">
                CPT {claim.cptCodes[0]}
              </Badge>
            )}
          </div>
        </div>

        {/* Cascading Purge Items Notice */}
        <div className="space-y-2">
          <div className="text-[11px] font-semibold text-foreground tracking-wide font-mono uppercase">
            Permanently Purged Artifacts
          </div>
          <div className="grid grid-cols-1 gap-1.5 text-xs text-muted-foreground">
            <div className="flex items-center gap-2 rounded-lg bg-background/50 border border-border/40 px-2.5 py-1.5">
              <HardDrives className="size-3.5 text-muted-foreground shrink-0" />
              <span>Case record & ERISA statutory countdown clock</span>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-background/50 border border-border/40 px-2.5 py-1.5">
              <FileText className="size-3.5 text-muted-foreground shrink-0" />
              <span>Synthesized legal appeal dossiers & drafted arguments</span>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-background/50 border border-border/40 px-2.5 py-1.5">
              <Pulse className="size-3.5 text-muted-foreground shrink-0" />
              <span>Indexed Clinical Policy Bulletins (CPBs) & overturn scores</span>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-background/50 border border-border/40 px-2.5 py-1.5">
              <Envelope className="size-3.5 text-muted-foreground shrink-0" />
              <span>Payer communication threads & outbound brief transmissions</span>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-background/50 border border-border/40 px-2.5 py-1.5">
              <Clock className="size-3.5 text-muted-foreground shrink-0" />
              <span>Immutable audit logs & attached denial letter files</span>
            </div>
          </div>
        </div>

        {error && (
          <Alert variant="destructive" className="py-2 text-xs">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <DialogFooter className="gap-2 sm:gap-0 pt-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={isDeleting}
            className="text-xs"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={handleDelete}
            disabled={isDeleting}
            className="text-xs gap-1.5 shadow-sm font-semibold"
          >
            {isDeleting ? (
              <>
                <CircleNotch className="size-3.5 animate-spin" />
                <span>Deleting Case...</span>
              </>
            ) : (
              <>
                <Trash className="size-3.5" />
                <span>Delete Case Permanently</span>
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
