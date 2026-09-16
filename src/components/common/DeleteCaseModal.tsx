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
import { useDetailMode } from "../../hooks/useDetailMode";

interface DeleteCaseModalProps {
  isOpen: boolean;
  claim: Claim | null;
  onClose: () => void;
  onConfirmDelete: (claimId: string) => Promise<unknown>;
  onSuccess?: () => void;
}

export const DeleteCaseModal: React.FC<DeleteCaseModalProps> = ({
  isOpen,
  claim,
  onClose,
  onConfirmDelete,
  onSuccess,
}) => {
  const { isDetailed } = useDetailMode();
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!claim) return null;

  const handleDelete = async () => {
    setIsDeleting(true);
    setError(null);
    try {
      await onConfirmDelete(claim._id);
      onClose();
      if (onSuccess) onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete case.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md p-6 space-y-4">
        <DialogHeader className="space-y-2">
          <div className="flex items-center gap-2 text-destructive">
            <WarningOctagon className="size-5" weight="fill" />
            <DialogTitle className="text-base font-bold text-destructive">
              Delete Case Record Permanently
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground leading-relaxed">
            This action cannot be undone. All clinical policy extractions, AI generated appeal briefs, and transmission logs associated with this claim will be permanently removed.
          </DialogDescription>
        </DialogHeader>

        {/* Claim Summary Badge */}
        <div className="p-3 rounded-lg border border-destructive/20 bg-destructive/5 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs font-semibold text-foreground">
              Claim #{claim.claimNumber}
            </span>
            <Badge variant="destructive" className="font-mono text-[10px]">
              {formatCurrency(claim.deniedAmount)} Disputed
            </Badge>
          </div>
          <div className="text-xs text-muted-foreground flex items-center justify-between">
            <span className="truncate">{claim.patient?.name || "Patient Record"}</span>
            <span className="font-mono flex items-center gap-1">
              <Buildings className="size-3 text-muted-foreground" />
              {claim.insurancePayer}
            </span>
          </div>
        </div>

        {/* What gets deleted list */}
        <div className="space-y-1.5">
          <div className="text-[11px] font-semibold text-foreground uppercase tracking-wider font-mono">
            Permanently Purged Artifacts
          </div>
          <div className="grid grid-cols-1 gap-1.5 text-xs text-muted-foreground">
            <div className="flex items-center gap-2 rounded-lg bg-background/50 border border-border/40 px-2.5 py-1.5">
              <HardDrives className="size-3.5 text-muted-foreground shrink-0" />
              <span>
                {isDetailed
                  ? "Case record & ERISA statutory countdown clock"
                  : "Case record & deadline countdown clock"}
              </span>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-background/50 border border-border/40 px-2.5 py-1.5">
              <FileText className="size-3.5 text-muted-foreground shrink-0" />
              <span>
                {isDetailed
                  ? "Synthesized legal appeal dossiers & drafted arguments"
                  : "Generated appeal letters & arguments"}
              </span>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-background/50 border border-border/40 px-2.5 py-1.5">
              <Pulse className="size-3.5 text-muted-foreground shrink-0" />
              <span>
                {isDetailed
                  ? "Indexed Clinical Policy Bulletins (CPBs) & Statutory Appeal Readiness scores"
                  : "Indexed insurer rules & case strength scores"}
              </span>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-background/50 border border-border/40 px-2.5 py-1.5">
              <Envelope className="size-3.5 text-muted-foreground shrink-0" />
              <span>Payer communication threads & outbound brief transmissions</span>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-background/50 border border-border/40 px-2.5 py-1.5">
              <Clock className="size-3.5 text-muted-foreground shrink-0" />
              <span>
                {isDetailed
                  ? "Attached denial letter files (Case audit trail sealed & retained for ERISA compliance)"
                  : "Attached denial letter files (activity log sealed & retained for compliance)"}
              </span>
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
