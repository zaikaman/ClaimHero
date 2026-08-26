import React, { useState, useEffect } from "react";
import {
  MagnifyingGlass,
  Broadcast,
  FileMagnifyingGlass,
  FileText,
  Envelope,
  ChartPieSlice,
  Clock,
  Shield,
  CloudArrowUp,
  Moon,
  Sun,
  Copy,
  Check,
  User,
} from "@phosphor-icons/react";
import { Claim } from "../../types";
import { formatCurrency } from "../../lib/utils";
import { Dialog, DialogContent } from "../ui/dialog";
import { Badge } from "../ui/badge";
import { NavigationView } from "../layout/Sidebar";

interface CommandDialogProps {
  isOpen: boolean;
  onClose: () => void;
  claims: Claim[];
  onSelectClaim: (claimId: string) => void;
  onNavigateView: (view: NavigationView) => void;
  onOpenIngestion: () => void;
  onToggleTheme: () => void;
  isDark: boolean;
  onOpenOnboarding?: () => void;
}

export const CommandDialog: React.FC<CommandDialogProps> = ({
  isOpen,
  onClose,
  claims,
  onSelectClaim,
  onNavigateView,
  onOpenIngestion,
  onToggleTheme,
  isDark,
  onOpenOnboarding,
}) => {
  const [query, setQuery] = useState("");
  const [copiedEmail, setCopiedEmail] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setQuery("");
    }
  }, [isOpen]);

  const filteredClaims = claims.filter((c) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      c.claimNumber.toLowerCase().includes(q) ||
      c.patient?.name.toLowerCase().includes(q) ||
      c.cptCodes.some((code) => code.includes(q)) ||
      c.denialReasonCode.toLowerCase().includes(q) ||
      c.patient?.insurancePayer.toLowerCase().includes(q)
    );
  });

  const handleSelectClaim = (claimId: string, view: NavigationView = "radar") => {
    onSelectClaim(claimId);
    onNavigateView(view);
    onClose();
  };

  const handleNavigate = (view: NavigationView) => {
    onNavigateView(view);
    onClose();
  };

  const handleCopyEmail = () => {
    navigator.clipboard.writeText("intake@claimhero.agentmail.com");
    setCopiedEmail(true);
    setTimeout(() => {
      setCopiedEmail(false);
      onClose();
    }, 1500);
  };

  const platformViews = [
    { id: "radar" as NavigationView, label: "Case Radar Feed", icon: Broadcast, desc: "Intake & Alarms" },
    { id: "analytics" as NavigationView, label: "Portfolio Analytics", icon: ChartPieSlice, desc: "Recovery Yield" },
    { id: "audit" as NavigationView, label: "Audit Timeline", icon: Clock, desc: "ERISA 29 CFR Ledger" },
  ];

  const caseTools = [
    { id: "evidence" as NavigationView, label: "Evidence Matrix", icon: FileMagnifyingGlass, desc: "CPBs & Win Score" },
    { id: "studio" as NavigationView, label: "Appeal Studio", icon: FileText, desc: "AI Brief Synthesis" },
    { id: "communications" as NavigationView, label: "AgentMail Inbox", icon: Envelope, desc: "Payer Transmissions" },
  ];

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="p-0 max-w-xl overflow-hidden gap-0 border-border shadow-xl"
      >
        {/* Search Input Bar */}
        <div className="flex items-center border-b border-border px-3 py-2.5">
          <MagnifyingGlass className="size-4 text-muted-foreground mr-2 shrink-0" />
          <input
            autoFocus
            type="text"
            placeholder="Type a claim #, patient, CPT code, or action..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none font-sans"
          />
          <button
            onClick={onClose}
            className="hidden sm:inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground hover:bg-muted/80 hover:text-foreground transition-colors cursor-pointer"
            title="Press ESC to close"
          >
            ESC
          </button>
        </div>

        <div className="max-h-[420px] overflow-y-auto p-2 space-y-3">
          {/* Claims Matching Section */}
          <div className="space-y-1">
            <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider font-mono">
              Medical Denial Claims ({filteredClaims.length})
            </div>

            {filteredClaims.length === 0 ? (
              <div className="px-3 py-2 text-xs text-muted-foreground">
                No matching claims found.
              </div>
            ) : (
              filteredClaims.slice(0, 4).map((claim) => (
                <div
                  key={claim._id}
                  onClick={() => handleSelectClaim(claim._id, "radar")}
                  className="flex items-center justify-between px-2.5 py-2 rounded-lg hover:bg-muted/70 cursor-pointer transition-colors group"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="flex size-7 items-center justify-center rounded-lg bg-muted text-muted-foreground group-hover:text-foreground">
                      <User className="size-3.5" />
                    </div>
                    <div className="text-left">
                      <div className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                        <span>{claim.patient?.name}</span>
                        <span className="font-mono text-[11px] text-muted-foreground">
                          ({claim.claimNumber})
                        </span>
                      </div>
                      <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 font-mono">
                        <span>{claim.patient?.insurancePayer}</span>
                        <span>•</span>
                        <span>CPT {claim.cptCodes.join(", ")}</span>
                        <span>•</span>
                        <span className="text-destructive font-semibold">
                          {formatCurrency(claim.deniedAmount)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectClaim(claim._id, "evidence");
                      }}
                      className="px-2 py-1 text-[10px] rounded bg-muted hover:bg-secondary text-foreground font-mono"
                    >
                      Evidence
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectClaim(claim._id, "studio");
                      }}
                      className="px-2 py-1 text-[10px] rounded bg-primary text-primary-foreground font-mono"
                    >
                      Studio &rarr;
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Platform Dashboards */}
          <div className="space-y-1 border-t border-border/60 pt-2">
            <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider font-mono">
              Platform Command
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-1">
              {platformViews.map((view) => {
                const Icon = view.icon;
                return (
                  <button
                    key={view.id}
                    onClick={() => handleNavigate(view.id)}
                    className="flex flex-col px-2.5 py-1.5 rounded-lg text-xs hover:bg-muted/70 text-muted-foreground hover:text-foreground text-left transition-colors border border-transparent hover:border-border"
                  >
                    <div className="flex items-center gap-1.5 font-medium text-foreground">
                      <Icon className="size-3.5 text-primary" />
                      <span>{view.label}</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground truncate">{view.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active Case Workspace Tools */}
          <div className="space-y-1 border-t border-border/60 pt-2">
            <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider font-mono">
              Active Case Workspace
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-1">
              {caseTools.map((view) => {
                const Icon = view.icon;
                return (
                  <button
                    key={view.id}
                    onClick={() => handleNavigate(view.id)}
                    className="flex flex-col px-2.5 py-1.5 rounded-lg text-xs hover:bg-muted/70 text-muted-foreground hover:text-foreground text-left transition-colors border border-transparent hover:border-border"
                  >
                    <div className="flex items-center gap-1.5 font-medium text-foreground">
                      <Icon className="size-3.5 text-emerald-500" />
                      <span>{view.label}</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground truncate">{view.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Quick Sentinel Actions */}
          <div className="space-y-1 border-t border-border/60 pt-2">
            <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider font-mono">
              Quick Sentinel Actions
            </div>
            <div className="space-y-0.5">
              <button
                onClick={() => {
                  onClose();
                  onOpenIngestion();
                }}
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs hover:bg-muted/70 text-foreground text-left transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <CloudArrowUp className="size-3.5 text-primary" />
                  <span className="font-medium">+ Ingest Denial Document (File, Text, Presets)</span>
                </div>
                <Badge variant="outline" size="sm" className="font-mono text-[9px]">
                  1-Click
                </Badge>
              </button>

              <button
                onClick={handleCopyEmail}
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs hover:bg-muted/70 text-foreground text-left transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Envelope className="size-3.5 text-emerald-500" />
                  <span>Copy AgentMail Gateway (intake@claimhero.agentmail.com)</span>
                </div>
                {copiedEmail ? (
                  <Check className="size-3 text-emerald-500" />
                ) : (
                  <Copy className="size-3 text-muted-foreground" />
                )}
              </button>

              <button
                onClick={() => {
                  onToggleTheme();
                }}
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs hover:bg-muted/70 text-foreground text-left transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  {isDark ? (
                    <Sun className="size-3.5 text-amber-500" />
                  ) : (
                    <Moon className="size-3.5 text-primary" />
                  )}
                  <span>Toggle {isDark ? "Light" : "Dark"} Mode</span>
                </div>
              </button>

              {onOpenOnboarding && (
                <button
                  onClick={() => {
                    onClose();
                    onOpenOnboarding();
                  }}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs hover:bg-muted/70 text-foreground text-left transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <Shield className="size-3.5 text-primary" />
                    <span>Restart Sentinel Setup Guide (Onboarding)</span>
                  </div>
                  <Badge variant="outline" size="sm" className="font-mono text-[9px]">
                    Setup
                  </Badge>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Footer info */}
        <div className="border-t border-border px-3 py-2 bg-muted/20 flex items-center justify-between text-[11px] text-muted-foreground font-mono">
          <span>29 CFR § 2560.503-1 Statutory Sentinel</span>
          <span>OpenAI gpt-5-nano</span>
        </div>
      </DialogContent>
    </Dialog>
  );
};
