import React, { useState } from "react";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { useDetailMode } from "../../hooks/useDetailMode";
import {
  Broadcast,
  PlusCircle,
  GearSix,
  SignOut,
  SignIn,
  DotsThreeVertical,
  CloudArrowUp,
  BookOpen,
  Trash,
  HourglassHigh,
  CheckCircle,
  PaperPlaneTilt,
  ChartPieSlice,
  ShieldCheck,
  GraduationCap,
  X,
} from "@phosphor-icons/react";
import { Claim } from "../../types";
import { formatCurrency, cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { DeleteCaseModal } from "../common/DeleteCaseModal";
import { BrandLogo, BrandIcon } from "../common/BrandLogo";
import { DetailModeToggle } from "../common/DetailModeToggle";

export type NavigationView =
  | "landing"
  | "radar"
  | "evidence"
  | "studio"
  | "p2p"
  | "calculator"
  | "communications"
  | "audit"
  | "analytics"
  | "settings"
  | "login"
  | "notFound";

interface SidebarProps {
  currentView: NavigationView;
  onSelectView: (view: NavigationView) => void;
  claims?: Claim[];
  selectedClaim?: Claim | null;
  onSelectClaim?: (claimId: string) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  onOpenIngestion?: () => void;
  onDeleteCase?: (claimId: string) => Promise<unknown>;
  onOpenSentinel?: () => void;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  onSelectView,
  claims = [],
  selectedClaim,
  onSelectClaim,
  isCollapsed = false,
  onOpenIngestion,
  onDeleteCase,
  onOpenSentinel,
  isMobileOpen = false,
  onCloseMobile,
}) => {
  const { viewer, isAuthenticated, userName, userEmail, userInitial, signOut } = useCurrentUser();
  const { isDetailed, toggleDetailMode } = useDetailMode();
  const [caseToDelete, setCaseToDelete] = useState<Claim | null>(null);

  const isCaseWorkspaceActive =
    currentView === "evidence" ||
    currentView === "studio" ||
    currentView === "communications" ||
    currentView === "p2p" ||
    currentView === "calculator" ||
    currentView === "audit";

  const handleSelectCaseItem = (claimId: string) => {
    onSelectClaim?.(claimId);
    if (!isCaseWorkspaceActive) {
      onSelectView("evidence");
    }
  };

  const handleNavSelect = (view: NavigationView) => {
    onSelectView(view);
    onCloseMobile?.();
  };

  const handleSelectCase = (claimId: string) => {
    handleSelectCaseItem(claimId);
    onCloseMobile?.();
  };

  const handleIngest = () => {
    onOpenIngestion?.();
    onCloseMobile?.();
  };

  const handleSentinel = () => {
    onOpenSentinel?.();
    onCloseMobile?.();
  };

  const renderSidebarContent = (collapsed: boolean, isMobile: boolean) => (
    <>
<div className="space-y-3.5 w-full">
        {/* Brand Header */}
        <div className={cn("flex items-center justify-between w-full", collapsed && "justify-center")}>
          <button
            onClick={() => handleNavSelect("landing")}
            className={cn(
              "flex items-center gap-2.5 px-2 py-1 rounded-md hover:bg-muted/60 transition-all text-left group cursor-pointer min-w-0",
              collapsed && "justify-center px-0"
            )}
            title="ClaimHero home"
          >
            {collapsed ? (
              <BrandIcon size="sm" glow interactive />
            ) : (
              <BrandLogo size="md" glow interactive />
            )}
          </button>
          {isMobile && (
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={onCloseMobile}
              className="text-muted-foreground hover:text-foreground cursor-pointer shrink-0"
              title="Close navigation drawer"
              aria-label="Close navigation drawer"
            >
              <X className="size-4" />
            </Button>
          )}
        </div>

        {/* Primary Action: Quick Ingest */}
        {!collapsed ? (
          <div className="px-1">
            <button
              onClick={() => handleIngest()}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground h-9 px-3 text-xs font-semibold hover:bg-primary/90 transition-all shadow-xs cursor-pointer active:scale-[0.98]"
            >
              <PlusCircle className="size-4" weight="bold" />
              <span>{isDetailed ? "Ingest Denial" : "Add denial letter"}</span>
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center">
            <Button
              size="icon"
              onClick={() => handleIngest()}
              className="size-9 rounded-lg shadow-xs"
              title={isDetailed ? "Ingest Denial Notice" : "Add a denial letter"}
            >
              <PlusCircle className="size-4" weight="bold" />
            </Button>
          </div>
        )}

        {/* Primary Navigation: My Cases (List / Portfolio View) */}
        <div className="space-y-1">
          <button
            onClick={() => handleNavSelect("radar")}
            title={collapsed ? (isDetailed ? "Case Radar — Claims Ingestion & Alarms" : "My Cases — bills the insurer refused to pay") : undefined}
            className={cn(
              "w-full flex items-center rounded-lg text-xs font-medium transition-colors text-left group cursor-pointer",
              collapsed ? "justify-center p-2" : "justify-between px-2.5 py-2",
              currentView === "radar"
                ? "bg-secondary text-foreground font-semibold shadow-xs"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            )}
          >
            <div className="flex items-center gap-2.5 truncate">
              <Broadcast
                className={cn(
                  "size-4 shrink-0",
                  currentView === "radar" ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"
                )}
              />
              {!collapsed && <span className="truncate">{isDetailed ? "Case Radar" : "My Cases"}</span>}
            </div>
            {!collapsed && claims.length > 0 && (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium">
                {claims.length}
              </span>
            )}
          </button>
        </div>

        {/* Cases Stream (Active Case Workspaces) */}
        <div className="space-y-1.5 pt-1">
          {!collapsed && (
            <div className="px-2 flex items-center justify-between text-[10px] font-semibold text-muted-foreground uppercase tracking-wider font-mono">
              <span>{isDetailed ? "Active Cases" : "Your cases"}</span>
              <span className="text-[9px] text-muted-foreground/80 font-mono">
                {isDetailed ? "ERISA Clock" : "Time left"}
              </span>
            </div>
          )}

          {/* Collapsed mode: icon list */}
          {collapsed ? (
            <div className="space-y-1.5 flex flex-col items-center">
              {claims.slice(0, 6).map((c) => {
                const isCurrent = selectedClaim?._id === c._id && isCaseWorkspaceActive;
                return (
                  <button
                    key={c._id}
                    onClick={() => handleSelectCase(c._id)}
                    title={`${c.patient?.name || "Patient"} — ${c.patient?.insurancePayer || "Payer"} (${c.daysRemaining}d left)`}
                    className={cn(
                      "size-9 rounded-lg flex items-center justify-center text-xs font-bold font-mono transition-all cursor-pointer",
                      isCurrent
                        ? "bg-primary text-primary-foreground shadow-xs ring-2 ring-primary/30"
                        : "bg-card/70 border border-border/70 text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    {c.status === "won" ? (
                      <CheckCircle className="size-4 text-emerald-400" />
                    ) : c.status === "dispatched" ? (
                      <PaperPlaneTilt className="size-3.5 text-sky-400" />
                    ) : (
                      <span>{c.patient?.name ? c.patient.name.slice(0, 2).toUpperCase() : "PT"}</span>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            /* Expanded mode: dense urgent case card list */
            <div className="space-y-1 overflow-y-auto max-h-[calc(100vh-360px)] pr-0.5">
              {claims.length === 0 ? (
                <div className="p-3 text-center rounded-lg border border-dashed border-border/60 bg-card/20 text-muted-foreground text-xs space-y-1">
                  <p className="font-medium">{isDetailed ? "No claims ingested" : "No cases yet"}</p>
                  <p className="text-[10px]">{isDetailed ? "Upload an EOB to launch the 3-step appeal Sentinel." : "Add a denial letter to see what you can do next."}</p>
                </div>
              ) : (
                claims.map((c) => {
                  const isCurrent = selectedClaim?._id === c._id && isCaseWorkspaceActive;
                  const isWon = c.status === "won";
                  const isDispatched = c.status === "dispatched";
                  const isUrgent = c.daysRemaining !== undefined && c.daysRemaining <= 14 && !isWon && !isDispatched;

                  return (
                    <div
                      key={c._id}
                      onClick={() => handleSelectCase(c._id)}
                      className={cn(
                        "group relative flex items-center justify-between p-2 rounded-lg border transition-all cursor-pointer text-left",
                        isCurrent
                          ? "bg-card border-primary/40 shadow-xs ring-1 ring-primary/25"
                          : "bg-card/40 border-border/60 hover:bg-card/80 hover:border-border text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <div className="min-w-0 flex-1 pr-2">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={cn(
                              "text-xs font-semibold truncate leading-tight",
                              isCurrent ? "text-foreground font-bold" : "text-foreground/90 group-hover:text-foreground"
                            )}
                          >
                            {c.patient?.name || "Patient Record"}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground truncate pt-0.5">
                          <span>{c.patient?.insurancePayer || "Payer"}</span>
                          <span>•</span>
                          <span className="font-semibold text-foreground/80">
                            {formatCurrency(c.deniedAmount, { hideCentsIfWhole: true })}
                          </span>
                        </div>
                      </div>

                      {/* Deadline Countdown & Status Badge */}
                      <div className="shrink-0 flex items-center gap-1">
                        {isWon ? (
                          <Badge
                            variant="outline"
                            className="text-[9px] font-mono h-4 px-1.5 border-emerald-500/40 bg-emerald-500/10 text-emerald-500 font-bold"
                          >
                            Won
                          </Badge>
                        ) : isDispatched ? (
                          <Badge
                            variant="outline"
                            className="text-[9px] font-mono h-4 px-1.5 border-sky-500/40 bg-sky-500/10 text-sky-400 font-medium"
                          >
                            Sent
                          </Badge>
                        ) : isUrgent ? (
                          <Badge
                            variant="destructive"
                            className="text-[9px] font-mono h-4 px-1.5 font-bold animate-pulse"
                            title={isDetailed ? `Statutory appeal deadline expires in ${c.daysRemaining} days` : `${c.daysRemaining} days left to act`}
                          >
                            <HourglassHigh className="size-2.5 mr-0.5" />
                            {c.daysRemaining}d
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="text-[9px] font-mono h-4 px-1.5 border-border/80 text-muted-foreground"
                            title={isDetailed ? `${c.daysRemaining} days remaining on statutory ERISA clock` : `${c.daysRemaining} days left`}
                          >
                            {c.daysRemaining}d
                          </Badge>
                        )}

                        {/* Options Dropdown */}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <button
                              className="size-5 flex items-center justify-center rounded text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground hover:bg-muted/80 transition-opacity"
                              title="Case Actions"
                            >
                              <DotsThreeVertical className="size-3" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSelectCase(c._id);
                              }}
                              className="text-xs cursor-pointer"
                            >
                              Open Case Workspace
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                setCaseToDelete(c);
                              }}
                              className="text-xs text-destructive focus:text-destructive cursor-pointer gap-2"
                            >
                              <Trash className="size-3" />
                              <span>Delete Case</span>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>

      {/* Footer Support Card & Platform Navigation */}
      <div
        className={cn(
          "space-y-2 pt-2 border-t border-border/60 w-full transition-all duration-150",
          (currentView === "evidence" || currentView === "studio") && "pb-16"
        )}
      >
        {/* Settings & Portfolio Intelligence */}
        <div className="space-y-0.5">
          <button
            onClick={() => handleNavSelect("settings")}
            title={collapsed ? "Settings & Analytics" : undefined}
            className={cn(
              "w-full flex items-center rounded-lg text-xs font-medium transition-colors text-left group cursor-pointer",
              collapsed ? "justify-center p-2" : "justify-between px-2.5 py-1.5",
              currentView === "settings" || currentView === "analytics"
                ? "bg-secondary text-foreground font-semibold shadow-xs"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            )}
          >
            <div className="flex items-center gap-2.5 truncate">
              <GearSix
                className={cn(
                  "size-4 shrink-0",
                  currentView === "settings" ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"
                )}
              />
              {!collapsed && <span className="truncate">{isDetailed ? "Settings & Platform" : "Settings"}</span>}
            </div>
            {!collapsed && isDetailed && (
              <span className="text-[9px] font-mono text-muted-foreground">
                Config
              </span>
            )}
          </button>
        </div>

        {!collapsed ? (
          <button
            type="button"
            onClick={handleSentinel}
            className="w-full text-left rounded-lg border border-border/60 bg-card/60 hover:bg-card/90 hover:border-primary/50 backdrop-blur-md px-2.5 py-2 space-y-1 text-xs shadow-2xs transition-all cursor-pointer group"
            title={isDetailed ? "Open ERISA Sentinel Copilot (⌘J / Ctrl+J)" : "Open appeal helper (⌘J / Ctrl+J)"}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="size-3.5 text-primary group-hover:scale-110 transition-transform" />
                <span className="font-semibold text-foreground text-[11px] group-hover:text-primary transition-colors">
                  {isDetailed ? "ERISA Sentinel" : "Appeal helper"}
                </span>
              </div>
              {isDetailed && (
                <Badge
                  variant="outline"
                  className="h-4 px-1.5 text-[10px] border-emerald-500/30 text-emerald-500 font-mono"
                >
                  29 CFR § 2560
                </Badge>
              )}
            </div>
            <div className="flex items-center justify-between text-[10px] text-muted-foreground leading-tight">
              <span>{isDetailed ? "Statutory deadline & evidence guard active." : "We track deadlines and gather proof for you."}</span>
              <kbd className="pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity font-mono text-[9px] text-primary bg-primary/10 border border-primary/20 px-1 rounded">
                ⌘J
              </kbd>
            </div>
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSentinel}
            className="w-full flex justify-center p-2 rounded-lg hover:bg-muted/60 transition-colors text-primary cursor-pointer"
            title={isDetailed ? "Open ERISA Sentinel Copilot (⌘J / Ctrl+J)" : "Open appeal helper (⌘J / Ctrl+J)"}
          >
            <ShieldCheck className="size-4" />
          </button>
        )}

        {/* Global Language / Detail Mode Switch */}
        <div className="w-full">
          {!collapsed ? (
            <DetailModeToggle className="w-full justify-between py-1.5 px-2.5 text-xs border-border/60" />
          ) : (
            <div className="flex justify-center">
              <DetailModeToggle compact className="p-1.5" />
            </div>
          )}
        </div>

        {/* User Profile Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                "w-full flex items-center justify-between p-1.5 rounded-lg hover:bg-muted/60 transition-colors text-left cursor-pointer",
                collapsed && "justify-center p-1"
              )}
            >
              <div className="flex items-center gap-2">
                <Avatar size="sm" className="size-7 shrink-0 bg-primary/10 text-primary border border-border/60 font-semibold">
                  {viewer?.image && <AvatarImage src={viewer.image} alt={userName} />}
                  <AvatarFallback className="text-primary font-bold text-xs">{userInitial}</AvatarFallback>
                </Avatar>
                {!collapsed && (
                  <div className="text-left">
                    <div className="font-semibold text-xs text-foreground leading-tight truncate max-w-[130px]">
                      {userName || "Advocate"}
                    </div>
                    <div className="text-[10px] text-muted-foreground leading-tight truncate max-w-[130px]">
                      {userEmail || "Signed In"}
                    </div>
                  </div>
                )}
              </div>
              {!collapsed && (
                <DotsThreeVertical className="size-3.5 text-muted-foreground" />
              )}
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuLabel className="flex flex-col gap-0.5">
              <span className="font-semibold text-xs text-foreground">{userName || "Advocate"}</span>
              <span className="text-[10px] text-muted-foreground font-normal truncate">{userEmail}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={toggleDetailMode} className="gap-2 cursor-pointer font-medium text-xs">
              <GraduationCap className="size-3.5 text-primary" />
              <span>{isDetailed ? "Switch to Simple Mode" : "Switch to Expert Details"}</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleNavSelect("settings")} className="gap-2 cursor-pointer font-medium text-xs">
              <GearSix className="size-3.5 text-primary" />
              <span>Settings</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleNavSelect("analytics")} className="gap-2 cursor-pointer font-medium text-xs">
              <ChartPieSlice className="size-3.5 text-cyan-400" />
              <span>{isDetailed ? "Portfolio Analytics" : "Savings overview"}</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {isAuthenticated ? (
              <DropdownMenuItem onClick={() => signOut()} className="gap-2 text-destructive focus:text-destructive cursor-pointer text-xs">
                <SignOut className="size-3.5" />
                <span>Sign Out</span>
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={() => handleNavSelect("login")} className="gap-2 font-medium text-primary cursor-pointer text-xs">
                <SignIn className="size-3.5" />
                <span>Sign In / Create Account</span>
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => handleIngest()} className="gap-2 cursor-pointer text-xs">
              <CloudArrowUp className="size-3.5" />
              <span>{isDetailed ? "Ingest Denial Notice" : "Add denial letter"}</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                window.open("https://www.ecfr.gov/current/title-29/subtitle-B/chapter-XXV/part-2560/section-2560.503-1", "_blank", "noopener,noreferrer");
              }}
              className="gap-2 cursor-pointer text-xs"
            >
              <BookOpen className="size-3.5" />
              <span>{isDetailed ? "ERISA 29 CFR § 2560.503-1" : "Your appeal rights (law)"}</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>


    </>
  );

  return (
    <>
      {/* Mobile Drawer (visible on < md when isMobileOpen is true) */}
      {isMobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden print:hidden" role="dialog" aria-modal="true" aria-label="Navigation drawer">
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <aside className="fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] bg-sidebar text-sidebar-foreground border-r border-border/50 flex flex-col justify-between p-3 font-sans select-none shadow-2xl overflow-y-auto transition-transform animate-in slide-in-from-left duration-200">
            {renderSidebarContent(false, true)}
          </aside>
        </div>
      )}

      {/* Desktop Sidebar (hidden on < md, visible on md and up) */}
      <aside
        className={cn(
          "hidden md:flex relative z-10 shrink-0 border-r border-border/50 bg-sidebar/95 backdrop-blur-xl text-sidebar-foreground flex-col justify-between p-3 font-sans select-none overflow-y-auto transition-all duration-200 print:hidden",
          isCollapsed ? "w-16 items-center px-2" : "w-64"
        )}
      >
        {renderSidebarContent(isCollapsed, false)}
      </aside>

      {/* Delete Case Confirmation Modal */}
      <DeleteCaseModal
        isOpen={Boolean(caseToDelete)}
        claim={caseToDelete}
        onClose={() => setCaseToDelete(null)}
        onConfirmDelete={onDeleteCase || (async () => {})}
      />
    </>
  );
};
