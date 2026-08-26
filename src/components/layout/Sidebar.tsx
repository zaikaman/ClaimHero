import React from "react";
import { useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "../../../convex/_generated/api";
import {
  Radar,
  FileSearch,
  FileText,
  Mail,
  Clock,
  PieChart,
  CheckCircle,
  AlertCircle,
  FolderGit2,
  Building2,
  Shield,
  PlusCircle,
  MailIcon,
  MoreVertical,
  UploadCloud,
  Moon,
  Sun,
  Copy,
  Check,
  BookOpen,
  RotateCcw,
  LogOut,
  LogIn,
} from "lucide-react";
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
import { INSURERS } from "../../lib/constants";
import { cn } from "../../lib/utils";

export type NavigationView =
  | "landing"
  | "radar"
  | "evidence"
  | "studio"
  | "communications"
  | "audit"
  | "analytics"
  | "login";

interface SidebarProps {
  currentView: NavigationView;
  onSelectView: (view: NavigationView) => void;
  selectedStatusFilter?: string;
  onSelectStatusFilter?: (status: string) => void;
  selectedPayerFilter?: string;
  onSelectPayerFilter?: (payer: string) => void;
  claimCountsByStatus?: Record<string, number>;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  onOpenIngestion?: () => void;
  isDark?: boolean;
  onToggleTheme?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  onSelectView,
  selectedStatusFilter = "all",
  onSelectStatusFilter,
  selectedPayerFilter = "all",
  onSelectPayerFilter,
  claimCountsByStatus = {},
  isCollapsed = false,
  onOpenIngestion,
  isDark = true,
  onToggleTheme,
}) => {
  const viewer = useQuery((api as any).users?.viewer);
  const { signOut } = useAuthActions();

  const isAuthenticated = Boolean(viewer);
  const userName = viewer?.name || viewer?.email?.split("@")[0] || (viewer === null ? "Guest Officer" : "Sentinel Officer");
  const userEmail = viewer?.email || (viewer === null ? "Sign In to sync cases" : "sentinel@claimhero.ai");
  const userInitial = (viewer?.name?.[0] || viewer?.email?.[0] || "S").toUpperCase();

  const [copiedEmail, setCopiedEmail] = React.useState(false);

  const handleCopyEmail = () => {
    navigator.clipboard.writeText("intake@claimhero.agentmail.com");
    setCopiedEmail(true);
    setTimeout(() => setCopiedEmail(false), 2000);
  };

  const navItems = [
    {
      id: "radar" as NavigationView,
      label: "Case Radar",
      icon: Radar,
    },
    {
      id: "evidence" as NavigationView,
      label: "Evidence Matrix",
      icon: FileSearch,
    },
    {
      id: "studio" as NavigationView,
      label: "Appeal Studio",
      icon: FileText,
    },
    {
      id: "communications" as NavigationView,
      label: "AgentMail Inbox",
      icon: Mail,
    },
    {
      id: "analytics" as NavigationView,
      label: "Portfolio Analytics",
      icon: PieChart,
    },
    {
      id: "audit" as NavigationView,
      label: "Audit Timeline",
      icon: Clock,
    },
  ];

  const statusFilters = [
    { id: "all", label: "All Cases", icon: FolderGit2 },
    { id: "ingested", label: "Intake / OCR", icon: Radar },
    { id: "analyzing", label: "CPB Evidence Crawl", icon: FileSearch },
    { id: "ready_for_review", label: "Ready for Dispatch", icon: FileText },
    { id: "dispatched", label: "Transmitted to Payer", icon: Mail },
    { id: "won", label: "Overturned & Won", icon: CheckCircle },
    { id: "critical_deadline", label: "Urgent Alarms (<14d)", icon: AlertCircle },
  ];

  return (
    <aside
      className={cn(
        "shrink-0 border-r border-border bg-sidebar text-sidebar-foreground flex flex-col justify-between p-3 font-sans select-none overflow-y-auto transition-all duration-200",
        isCollapsed ? "w-16 items-center px-2" : "w-64"
      )}
    >
      <div className="space-y-4 w-full">
        {/* Brand Header */}
        <button
          onClick={() => onSelectView("landing")}
          className={cn(
            "w-full flex items-center gap-2.5 px-2 py-1 rounded-lg hover:bg-muted/60 transition-colors text-left group cursor-pointer",
            isCollapsed && "justify-center px-0"
          )}
          title="Open Cinematic Landing Hero"
        >
          <div className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground shrink-0 group-hover:scale-105 transition-transform">
            <Shield className="size-4" />
          </div>
          {!isCollapsed && (
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-base tracking-tight text-foreground">
                ClaimHero
              </span>
              <span className="text-[10px] font-mono px-1 py-0.2 rounded bg-muted text-muted-foreground border border-border">
                Hero
              </span>
            </div>
          )}
        </button>

        {/* Quick Ingest Row */}
        {!isCollapsed ? (
          <div className="flex items-center gap-1.5 px-1">
            <button
              onClick={() => onOpenIngestion?.()}
              className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground h-9 px-3 text-xs font-medium hover:bg-primary/90 transition-colors shadow-xs"
            >
              <PlusCircle className="size-4" />
              <span>Quick Ingest</span>
            </button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => onSelectView("communications")}
              className="size-9 shrink-0 border-border"
              title="AgentMail Inbox"
            >
              <MailIcon className="size-4" />
              <span className="sr-only">Inbox</span>
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Button
              size="icon"
              onClick={() => onOpenIngestion?.()}
              className="size-9 rounded-lg"
              title="Quick Ingest Denial"
            >
              <PlusCircle className="size-4" />
            </Button>
          </div>
        )}

        {/* Navigation Group: Dashboards */}
        <div className="space-y-1">
          {!isCollapsed && (
            <div className="px-2 pb-1 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              Dashboards
            </div>
          )}
          <nav className="space-y-0.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onSelectView(item.id)}
                  title={isCollapsed ? item.label : undefined}
                  className={cn(
                    "w-full flex items-center rounded-lg text-xs font-medium transition-colors text-left",
                    isCollapsed ? "justify-center p-2" : "gap-2.5 px-2.5 py-1.5",
                    isActive
                      ? "bg-secondary text-foreground font-semibold shadow-xs"
                      : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                  )}
                >
                  <Icon
                    className={cn(
                      "size-4 shrink-0",
                      isActive ? "text-foreground" : "text-muted-foreground"
                    )}
                  />
                  {!isCollapsed && <span>{item.label}</span>}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Claim Lifecycle Filters (Expanded only) */}
        {!isCollapsed && (
          <>
            <div className="space-y-1">
              <div className="px-2 pb-1 text-[11px] font-medium text-muted-foreground uppercase tracking-wider flex items-center justify-between">
                <span>Lifecycle Status</span>
              </div>
              <div className="space-y-0.5">
                {statusFilters.map((filter) => {
                  const Icon = filter.icon;
                  const isSelected = selectedStatusFilter === filter.id;
                  const count =
                    claimCountsByStatus[filter.id] ??
                    (filter.id === "all" ? 5 : filter.id === "won" ? 2 : 1);

                  return (
                    <button
                      key={filter.id}
                      onClick={() => onSelectStatusFilter?.(filter.id)}
                      className={cn(
                        "w-full flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs transition-colors text-left",
                        isSelected
                          ? "bg-secondary text-foreground font-medium"
                          : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                      )}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <Icon className="size-3.5 shrink-0" />
                        <span className="truncate text-xs">{filter.label}</span>
                      </div>
                      {count > 0 && (
                        <span
                          className={cn(
                            "text-[10px] font-mono px-1.5 py-0.2 rounded font-medium",
                            filter.id === "critical_deadline"
                              ? "bg-destructive/10 text-destructive"
                              : filter.id === "won"
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                              : "bg-muted text-muted-foreground"
                          )}
                        >
                          {count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Target Insurer Payers */}
            <div className="space-y-1">
              <div className="px-2 pb-1 text-[11px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Building2 className="size-3.5" />
                <span>Target Payers</span>
              </div>
              <div className="flex flex-wrap gap-1 px-1">
                <button
                  onClick={() => onSelectPayerFilter?.("all")}
                  className={cn(
                    "rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors border",
                    selectedPayerFilter === "all"
                      ? "bg-primary text-primary-foreground border-transparent font-semibold"
                      : "bg-background text-muted-foreground border-border hover:text-foreground"
                  )}
                >
                  All
                </button>
                {INSURERS.slice(0, 4).map((ins: (typeof INSURERS)[number]) => (
                  <button
                    key={ins.id}
                    onClick={() => onSelectPayerFilter?.(ins.name)}
                    className={cn(
                      "rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors border",
                      selectedPayerFilter === ins.name
                        ? "bg-primary text-primary-foreground border-transparent font-semibold"
                        : "bg-background text-muted-foreground border-border hover:text-foreground"
                    )}
                  >
                    {ins.name.split(" ")[0]}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Footer Support Card & User Profile Dropdown */}
      <div className="space-y-3 pt-3 border-t border-border w-full">
        {!isCollapsed && (
          <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-foreground text-xs">
                ERISA Sentinel
              </span>
              <Badge variant="outline" size="sm" className="h-4 px-1.5 text-[9px] border-emerald-500/30 text-emerald-600 dark:text-emerald-400">
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
                <Avatar size="sm" className="bg-primary text-primary-foreground font-semibold">
                  {viewer?.image ? (
                    <AvatarImage src={viewer.image} alt={userName} />
                  ) : null}
                  <AvatarFallback>{userInitial}</AvatarFallback>
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
                <MoreVertical className="size-3.5 text-muted-foreground" />
              )}
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuLabel className="flex flex-col gap-0.5">
              <span className="font-semibold text-xs text-foreground">{userName}</span>
              <span className="text-[10px] text-muted-foreground font-normal truncate">{userEmail}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {isAuthenticated ? (
              <DropdownMenuItem onClick={() => signOut()} className="gap-2 text-destructive focus:text-destructive">
                <LogOut className="size-3.5" />
                <span>Sign Out of Sentinel</span>
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={() => onSelectView("login")} className="gap-2 font-medium text-primary">
                <LogIn className="size-3.5" />
                <span>Sign In / Create Account</span>
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onOpenIngestion?.()} className="gap-2">
              <UploadCloud className="size-3.5" />
              <span>Ingest Denial Notice</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleCopyEmail} className="gap-2">
              {copiedEmail ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
              <span>{copiedEmail ? "Address Copied!" : "Copy Inbound Mail Webhook"}</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onToggleTheme?.()} className="gap-2">
              {isDark ? <Sun className="size-3.5 text-amber-500" /> : <Moon className="size-3.5" />}
              <span>Toggle {isDark ? "Light" : "Dark"} Mode</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                onSelectStatusFilter?.("all");
                onSelectPayerFilter?.("all");
              }}
              className="gap-2"
            >
              <RotateCcw className="size-3.5" />
              <span>Reset Case Filters</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                window.open("https://www.dol.gov/agencies/ebsa/about-ebsa/our-activities/resource-center/fact-sheets/claims-procedure-rule", "_blank");
              }}
              className="gap-2"
            >
              <BookOpen className="size-3.5" />
              <span>ERISA 29 CFR § 2560.503-1</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  );
};
