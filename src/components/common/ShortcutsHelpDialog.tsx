import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../ui/dialog";
import { Badge } from "../ui/badge";
import { SHORTCUTS_REGISTRY } from "../../lib/shortcuts";
import { Keyboard } from "@phosphor-icons/react";

interface ShortcutsHelpDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ShortcutsHelpDialog: React.FC<ShortcutsHelpDialogProps> = ({
  isOpen,
  onClose,
}) => {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md p-0 overflow-hidden border-border/70 bg-card/95 backdrop-blur-xl shadow-2xl">
        <DialogHeader className="p-4 pb-3 border-b border-border/60 bg-muted/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="size-7 rounded-md border border-primary/30 bg-primary/10 flex items-center justify-center text-primary">
                <Keyboard className="size-4" />
              </div>
              <DialogTitle className="text-sm font-semibold text-foreground">
                Keyboard Shortcuts
              </DialogTitle>
            </div>
            <Badge variant="outline" className="text-[10px] font-mono border-border/70 text-muted-foreground">
              Console Docs
            </Badge>
          </div>
          <DialogDescription className="text-xs text-muted-foreground mt-1">
            Global navigation commands and workspace hotkeys for high-velocity advocacy.
          </DialogDescription>
        </DialogHeader>

        <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto">
          {SHORTCUTS_REGISTRY.map((shortcut) => (
            <div
              key={shortcut.id}
              className="flex items-center justify-between p-2.5 rounded-lg border border-border/40 bg-background/50 hover:bg-background/80 transition-colors"
            >
              <div className="space-y-0.5 max-w-[260px]">
                <div className="text-xs font-medium text-foreground flex items-center gap-2">
                  <span>{shortcut.label}</span>
                  {shortcut.scope === "p2p" && (
                    <Badge variant="outline" className="text-[9px] px-1 py-0 border-purple-500/30 text-purple-400 font-mono">
                      P2P Studio
                    </Badge>
                  )}
                </div>
                <div className="text-[11px] text-muted-foreground leading-snug">
                  {shortcut.description}
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {shortcut.keys.map((key, i) => (
                  <kbd
                    key={i}
                    className="min-w-[22px] h-6 px-1.5 rounded border border-border/80 bg-muted/50 text-[11px] font-mono font-medium text-foreground flex items-center justify-center shadow-2xs"
                  >
                    {key}
                  </kbd>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="p-3 border-t border-border/60 bg-muted/10 text-center">
          <span className="text-[11px] text-muted-foreground font-mono">
            Press <kbd className="px-1 py-0.5 rounded bg-muted/60 text-[10px] border border-border/60">Esc</kbd> anytime to dismiss active overlays
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
};
