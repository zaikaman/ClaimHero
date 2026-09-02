import React, { useState } from "react";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import {
  Broadcast,
  FileMagnifyingGlass,
  FileText,
  Envelope,
  Clock,
  ChartPieSlice,
  PlusCircle,
  DotsThreeVertical,
  CloudArrowUp,
  BookOpen,
  SignOut,
  SignIn,
  User,
  CaretUpDown,
  Trash,
  PhoneCall,
  Shield,
  Scales,
  GearSix,
} from "@phosphor-icons/react";
import { Claim } from "../../types";
import { formatCurrency } from "../../lib/utils";
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
import { cn } from "../../lib/utils";

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
  | "login";

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
}

interface CaseWorkspaceSubItem {
  id: NavigationView;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface CaseWorkspaceItem {
  id: NavigationView;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  isDefenseSuite?: boolean;
  subItems?: CaseWorkspaceSubItem[];
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
}) => {
  const { viewer, isAuthenticated, userName, userEmail, userInitial, signOut } = useCurrentUser();

  const [caseToDelete, setCaseToDelete] = useState<Claim | null>(null);

  // Group 1: Platform Command & Macro Intelligence
  const platformNavItems = [
    {
      id: "radar" as NavigationView,
      label: "Case Radar",
      badge: claims.length > 0 ? `${claims.length}` : undefined,
      description: "Claims Ingestion & Statutory Alarms",
      icon: Broadcast,
    },
    {
      id: "analytics" as NavigationView,
      label: "Portfolio Analytics",
      description: "Recovery Yield & Payer Win Rates",
      icon: ChartPieSlice,
    },
    {
      id: "audit" as NavigationView,
      label: "Audit Timeline",
      description: "ERISA 29 CFR Immutable Ledger",
      icon: Clock,
    },
  ];

  // Group 2: Contextual Case Workspace Tools
  const isDefenseSuiteView =
    currentView === "studio" || currentView === "p2p" || currentView === "calculator";

  const caseWorkspaceItems: CaseWorkspaceItem[] = [
    {
      id: "evidence",
      label: "Evidence Matrix",
      description: "CPB Guidelines & Overturn Probability",
      icon: FileMagnifyingGlass,
    },
    {
      id: "studio",
      label: "Defense Suite",
      badge: "3 Vectors",
      description: "Legal Brief, Doctor P2P & ERISA Penalties",
      icon: Shield,
      isDefenseSuite: true,
      subItems: [
        {
          id: "studio",
          label: "Legal Appeal Brief",
          icon: FileText,
        },
        {
          id: "p2p",
          label: "Doctor P2P Copilot",
          icon: PhoneCall,
        },
        {
          id: "calculator",
          label: "ERISA Penalties",
          icon: Scales,
        },
      ],
    },
    {
      id: "communications",
      label: "Payer Communications",
      description: "Two-way Payer Transmissions",
      icon: Envelope,
    },
  ];

  // Group 3: Sentinel Agent & System
  const agentNavItems = [
    {
      id: "settings" as NavigationView,
      label: "Settings",
      description: "Dispatch Autonomy & Gateway",
      icon: GearSix,
    },
  ];

  return (
    <aside
      className={cn(
        "shrink-0 border-r border-border/50 bg-sidebar/65 backdrop-blur-xl text-sidebar-foreground flex flex-col justify-between p-3 font-sans select-none overflow-y-auto transition-all duration-200",
        isCollapsed ? "w-16 items-center px-2" : "w-64"
      )}
    >
      <div className="space-y-4 w-full">
        {/* Brand Header */}
        <button
          onClick={() => onSelectView("landing")}
          className={cn(
            "w-full flex items-center gap-2.5 px-2 py-1 rounded-md hover:bg-muted/60 transition-all text-left group cursor-pointer",
            isCollapsed && "justify-center px-0"
          )}
          title="Open Cinematic Landing Hero"
        >
          {isCollapsed ? (
            <BrandIcon size="sm" glow interactive />
          ) : (
            <BrandLogo size="md" glow interactive />
          )}
        </button>

        {/* Quick Ingest Row */}
        {!isCollapsed ? (
          <div className="flex items-center gap-1.5 px-1">
            <button
              onClick={() => onOpenIngestion?.()}
              className="flex-1 flex items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground h-9 px-3 text-xs font-medium hover:bg-primary/90 transition-colors shadow-xs cursor-pointer"
            >
              <PlusCircle className="size-4" />
              <span>Quick Ingest</span>
            </button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => onSelectView("communications")}
              className="size-9 shrink-0 border-border rounded-md"
              title="Payer Communications Gateway"
            >
              <Envelope className="size-4" />
              <span className="sr-only">Inbox</span>
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Button
              size="icon"
              onClick={() => onOpenIngestion?.()}
              className="size-9 rounded-md shadow-xs"
              title="Quick Ingest Denial"
            >
              <PlusCircle className="size-4" />
            </Button>
          </div>
        )}

        {/* Group 1: Sentinel Platform (Global Views) */}
        <div className="space-y-1">
          {!isCollapsed && (
            <div className="px-2 pb-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider font-mono">
              Sentinel Platform
            </div>
          )}
          <nav className="space-y-0.5">
            {platformNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onSelectView(item.id)}
                  title={isCollapsed ? `${item.label} — ${item.description}` : undefined}
                  className={cn(
                    "w-full flex items-center rounded-md text-xs font-medium transition-colors text-left group cursor-pointer",
                    isCollapsed ? "justify-center p-2" : "justify-between px-2.5 py-1.5",
                    isActive
                      ? "bg-secondary text-foreground font-semibold shadow-xs"
                      : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                  )}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <Icon
                      className={cn(
                        "size-4 shrink-0",
                        isActive ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"
                      )}
                    />
                    {!isCollapsed && <span className="truncate">{item.label}</span>}
                  </div>
                  {!isCollapsed && item.badge && (
                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-muted text-muted-foreground font-medium">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Group 2: Active Case Workspace (Contextual Investigation & Generation) */}
        <div className="space-y-1.5 pt-1">
          {!isCollapsed && (
            <div className="px-2 flex items-center justify-between text-[10px] font-semibold text-muted-foreground uppercase tracking-wider font-mono">
              <span>Case Workspace</span>
              {selectedClaim && (
                <Badge variant="outline" className="text-[9px] font-mono h-4 px-1 border-primary/30 text-primary">
                  Active
                </Badge>
              )}
            </div>
          )}

          {/* Active Claim Context Selector Card (Expanded only) */}
          {!isCollapsed && (
            <div className="px-1">
              {selectedClaim ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="w-full flex items-center justify-between p-2 rounded-lg border border-border/70 bg-card/60 backdrop-blur-md hover:bg-card/90 transition-colors text-left group cursor-pointer shadow-2xs"
                      title="Click to switch active claim"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Avatar size="sm" className="size-6 bg-primary/10 text-primary text-[10px] font-bold shrink-0">
                          <AvatarFallback>
                            {selectedClaim.patient?.name ? selectedClaim.patient.name.slice(0, 2).toUpperCase() : "PT"}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className="font-semibold text-xs text-foreground truncate max-w-[125px]">
                            {selectedClaim.patient?.name || "Patient Record"}
                          </div>
                          <div className="text-[10px] font-mono text-muted-foreground truncate max-w-[125px]">
                            #{selectedClaim.claimNumber} • {formatCurrency(selectedClaim.deniedAmount)}
                          </div>
                        </div>
                      </div>
                      <CaretUpDown className="size-3.5 text-muted-foreground group-hover:text-foreground shrink-0" />
                    </button>
                  </DropdownMenuTrigger>

                  <DropdownMenuContent align="start" className="w-64 max-h-64 overflow-y-auto">
                    <DropdownMenuLabel className="text-[10px] font-mono uppercase text-muted-foreground">
                      Switch Active Claim ({claims.length})
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {claims.map((c) => {
                      const isCurrent = c._id === selectedClaim._id;
                      return (
                        <DropdownMenuItem
                          key={c._id}
                          onClick={() => onSelectClaim?.(c._id)}
                          className={cn(
                            "flex items-center justify-between gap-2 text-xs py-1.5 cursor-pointer",
                            isCurrent && "bg-secondary font-semibold"
                          )}
                        >
                          <div className="truncate">
                            <div className="truncate text-xs text-foreground">
                              {c.patient?.name || "Patient Record"}
                            </div>
                            <div className="text-[10px] font-mono text-muted-foreground">
                              #{c.claimNumber} • {c.patient?.insurancePayer}
                            </div>
                          </div>
                          {isCurrent && (
                            <Badge variant="outline" className="text-[9px] font-mono h-3.5 px-1 bg-primary/10 text-primary">
                              Active
                            </Badge>
                          )}
                        </DropdownMenuItem>
                      );
                    })}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => onOpenIngestion?.()}
                      className="gap-2 text-primary font-medium cursor-pointer"
                    >
                      <PlusCircle className="size-3.5" />
                      <span>+ Ingest New Case</span>
                    </DropdownMenuItem>
                    {selectedClaim && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => setCaseToDelete(selectedClaim)}
                          className="gap-2 text-destructive focus:text-destructive cursor-pointer text-xs font-medium"
                        >
                          <Trash className="size-3.5" />
                          <span>Delete Current Case</span>
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <button
                  onClick={() => onSelectView("radar")}
                  className="w-full flex items-center justify-between p-2 rounded-lg border border-dashed border-border/70 bg-card/30 backdrop-blur-sm hover:bg-card/50 transition-colors text-left text-xs text-muted-foreground cursor-pointer"
                >
                  <div className="flex items-center gap-1.5">
                    <User className="size-3.5" />
                    <span>Select Active Case</span>
                  </div>
                  <span className="text-[10px] font-mono text-primary">&rarr;</span>
                </button>
              )}
            </div>
          )}

          {/* Contextual Action Tools */}
          <nav className="space-y-1">
            {caseWorkspaceItems.map((item) => {
              const Icon = item.icon;
              const isSuite = Boolean(item.isDefenseSuite);
              const isActive = isSuite ? isDefenseSuiteView : currentView === item.id;

              return (
                <div key={item.id} className="space-y-0.5">
                  <button
                    onClick={() => onSelectView(item.id)}
                    title={isCollapsed ? `${item.label} — ${item.description}` : undefined}
                    className={cn(
                      "w-full flex items-center rounded-md text-xs font-medium transition-colors text-left group cursor-pointer",
                      isCollapsed ? "justify-center p-2" : "gap-2.5 px-2.5 py-1.5",
                      isActive
                        ? "bg-secondary/90 text-foreground font-semibold shadow-xs backdrop-blur-sm"
                        : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                    )}
                  >
                    <Icon
                      className={cn(
                        "size-4 shrink-0",
                        isActive ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"
                      )}
                    />
                    {!isCollapsed && (
                      <div className="flex items-center justify-between flex-1 truncate">
                        <span className="truncate">{item.label}</span>
                        {item.badge && (
                          <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-primary/10 text-primary border border-primary/20 font-medium">
                            {item.badge}
                          </span>
                        )}
                      </div>
                    )}
                  </button>

                  {/* Sub-items for Defense Suite (Expanded & Active) */}
                  {!isCollapsed && isSuite && isDefenseSuiteView && item.subItems && (
                    <div className="ml-4 pl-2 border-l border-border/60 space-y-0.5 pt-0.5">
                      {item.subItems.map((sub) => {
                        const SubIcon = sub.icon;
                        const isSubActive = currentView === sub.id;
                        return (
                          <button
                            key={sub.id}
                            onClick={() => onSelectView(sub.id)}
                            className={cn(
                              "w-full flex items-center gap-2 px-2 py-1 rounded-md text-[11px] font-medium transition-colors text-left cursor-pointer",
                              isSubActive
                                ? "bg-primary/15 text-primary font-semibold border border-primary/30 shadow-2xs"
                                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                            )}
                          >
                            <SubIcon
                              className={cn(
                                "size-3 shrink-0",
                                isSubActive ? "text-primary" : "text-muted-foreground"
                              )}
                            />
                            <span className="truncate">{sub.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
        </div>

        {/* Group 3: Sentinel Agent & System Config */}
        <div className="space-y-1 pt-1">
          {!isCollapsed && (
            <div className="px-2 pb-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider font-mono">
              Sentinel Agent
            </div>
          )}
          <nav className="space-y-0.5">
            {agentNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onSelectView(item.id)}
                  title={isCollapsed ? `${item.label} — ${item.description}` : undefined}
                  className={cn(
                    "w-full flex items-center rounded-md text-xs font-medium transition-colors text-left group cursor-pointer",
                    isCollapsed ? "justify-center p-2" : "gap-2.5 px-2.5 py-1.5",
                    isActive
                      ? "bg-secondary text-foreground font-semibold shadow-xs"
                      : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                  )}
                >
                  <Icon
                    className={cn(
                      "size-4 shrink-0",
                      isActive ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"
                    )}
                  />
                  {!isCollapsed && (
                    <div className="flex items-center justify-between flex-1 truncate">
                      <span className="truncate">{item.label}</span>
                      <span className="text-[9px] font-mono text-muted-foreground group-hover:text-foreground/70">
                        Config
                      </span>
                    </div>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Footer Support Card & User Profile Dropdown */}
      <div className="space-y-3 pt-3 border-t border-border/60 w-full">
        {!isCollapsed && (
          <div className="rounded-xl border border-border/60 bg-card/60 backdrop-blur-md p-3 space-y-1.5 text-xs shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-foreground text-xs">
                ERISA Sentinel
              </span>
              <Badge
                variant="outline"
                size="sm"
                className="h-4 px-1.5 text-[9px] border-emerald-500/30 text-emerald-600 dark:text-emerald-400 font-mono"
              >
                Active
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Autonomous 29 CFR § 2560.503-1 statutory deadline monitor.
            </p>
          </div>
        )}

        {/* User Info Row with Dropdown Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                "w-full flex items-center justify-between p-1.5 rounded-lg hover:bg-muted/60 transition-colors text-left cursor-pointer",
                isCollapsed && "justify-center p-1"
              )}
            >
              <div className="flex items-center gap-2">
                <Avatar size="sm" className="size-7 shrink-0 bg-primary/10 text-primary border border-border/60 font-semibold">
                  {viewer?.image && <AvatarImage src={viewer.image} alt={userName} />}
                  <AvatarFallback className="text-primary font-bold text-xs">{userInitial}</AvatarFallback>
                </Avatar>
                {!isCollapsed && (
                  <div className="text-left">
                    <div className="font-semibold text-xs text-foreground leading-tight truncate max-w-[130px]">
                      {userName}
                    </div>
                    <div className="text-[10px] text-muted-foreground leading-tight truncate max-w-[130px]">
                      {userEmail}
                    </div>
                  </div>
                )}
              </div>
              {!isCollapsed && (
                <DotsThreeVertical className="size-3.5 text-muted-foreground" />
              )}
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuLabel className="flex flex-col gap-0.5">
              <span className="font-semibold text-xs text-foreground">{userName}</span>
              <span className="text-[10px] text-muted-foreground font-normal truncate">{userEmail}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onSelectView("settings")} className="gap-2 cursor-pointer font-medium">
              <GearSix className="size-3.5 text-primary" />
              <span>Sentinel Settings</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {isAuthenticated ? (
              <DropdownMenuItem onClick={() => signOut()} className="gap-2 text-destructive focus:text-destructive cursor-pointer">
                <SignOut className="size-3.5" />
                <span>Sign Out of Sentinel</span>
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={() => onSelectView("login")} className="gap-2 font-medium text-primary cursor-pointer">
                <SignIn className="size-3.5" />
                <span>Sign In / Create Account</span>
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onOpenIngestion?.()} className="gap-2 cursor-pointer">
              <CloudArrowUp className="size-3.5" />
              <span>Ingest Denial Notice</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                window.open("https://www.dol.gov/agencies/ebsa/about-ebsa/our-activities/resource-center/fact-sheets/claims-procedure-rule", "_blank");
              }}
              className="gap-2 cursor-pointer"
            >
              <BookOpen className="size-3.5" />
              <span>ERISA 29 CFR § 2560.503-1</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Delete Case Confirmation Modal */}
      <DeleteCaseModal
        isOpen={Boolean(caseToDelete)}
        claim={caseToDelete}
        onClose={() => setCaseToDelete(null)}
        onConfirmDelete={onDeleteCase || (async () => {})}
      />
    </aside>
  );
};
