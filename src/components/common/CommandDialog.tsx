import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  MagnifyingGlass,
  Broadcast,
  FileMagnifyingGlass,
  FileText,
  Envelope,
  ChartPieSlice,
  Clock,
  CloudArrowUp,
  User,
  Trash,
  PhoneCall,
  Calculator,
  GearSix,
  Shield,
  ArrowRight,
  Keyboard,
} from "@phosphor-icons/react";
import { Claim } from "../../types";
import { formatCurrency, cn } from "../../lib/utils";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Dialog, DialogContent, DialogTitle } from "../ui/dialog";
import { Badge } from "../ui/badge";
import { NavigationView } from "../layout/Sidebar";
import { BrandIcon } from "./BrandLogo";
import { DeleteCaseModal } from "./DeleteCaseModal";
import { soundEffects } from "../../lib/soundEffects";

interface CommandDialogProps {
  isOpen: boolean;
  onClose: () => void;
  claims: Claim[];
  onSelectClaim: (claimId: string) => void;
  onNavigateView: (view: NavigationView) => void;
  onOpenIngestion: () => void;
  onOpenOnboarding?: () => void;
  onOpenShortcuts?: () => void;
  onDeleteCase?: (claimId: string) => Promise<unknown>;
}

interface CommandAction {
  id: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  category: "platform" | "workspace" | "sentinel";
  categoryLabel: string;
  keywords: string[];
  badge?: string;
  onExecute: () => void;
}

export type ServerClaimSearchResult = Omit<Partial<Claim>, "status"> & {
  _id: string;
  status?: string;
  patientName?: string;
  insurancePayer?: string;
  [key: string]: unknown;
};

/**
 * Merges server-authoritative BM25 full-text search results with in-memory claims,
 * applying safe fallbacks for patient/payer names, clinical codes, and financial amounts,
 * and deduplicating by claim ID.
 */
export function mergeSearchResults(
  serverSearchResults: ServerClaimSearchResult[] | undefined,
  localMatches: Claim[],
  allLocalClaims: Claim[]
): Claim[] {
  if (!serverSearchResults || !Array.isArray(serverSearchResults)) {
    return localMatches;
  }

  const mergedMap = new Map<string, Claim>();

  // Put server results first as they represent the authoritative BM25 search index
  for (const raw of serverSearchResults) {
    const id = String(raw._id);
    const existingLocal = allLocalClaims.find((c) => String(c._id) === id);
    const patientName =
      raw.patientName || existingLocal?.patient?.name || existingLocal?.patientName || "Patient";
    const insurancePayer =
      raw.insurancePayer ||
      existingLocal?.patient?.insurancePayer ||
      existingLocal?.insurancePayer ||
      "Health Insurer";

    mergedMap.set(id, {
      ...(existingLocal || {}),
      ...raw,
      patientName,
      insurancePayer,
      cptCodes: raw.cptCodes || existingLocal?.cptCodes || [],
      icd10Codes: raw.icd10Codes || existingLocal?.icd10Codes || [],
      deniedAmount: typeof raw.deniedAmount === "number" ? raw.deniedAmount : existingLocal?.deniedAmount || 0,
      patient: existingLocal?.patient || {
        _id: raw.patientId || raw._id,
        name: patientName,
        email: "",
        memberId: "PENDING",
        insurancePayer,
        createdAt: raw.createdAt || Date.now(),
      },
    } as Claim);
  }

  // Append any local matches that also match
  for (const local of localMatches) {
    const id = String(local._id);
    if (!mergedMap.has(id)) {
      mergedMap.set(id, local);
    }
  }

  return Array.from(mergedMap.values());
}

export const CommandDialog: React.FC<CommandDialogProps> = ({
  isOpen,
  onClose,
  claims,
  onSelectClaim,
  onNavigateView,
  onOpenIngestion,
  onOpenOnboarding,
  onOpenShortcuts,
  onDeleteCase,
}) => {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [caseToDelete, setCaseToDelete] = useState<Claim | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) {
      setQuery("");
      setDebouncedQuery("");
      setActiveIndex(0);
    } else {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  const trimmedDebounced = debouncedQuery.trim();
  const shouldSearchServer = isOpen && trimmedDebounced.length > 0;
  const serverSearchResults = useQuery(
    api.claims.search,
    shouldSearchServer ? { query: trimmedDebounced, limit: 25 } : "skip"
  );

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const handleSelectClaim = (claimId: string, view: NavigationView = "radar") => {
    soundEffects.play("tactile_click");
    onSelectClaim(claimId);
    onNavigateView(view);
    onClose();
  };

  const handleNavigate = (view: NavigationView) => {
    soundEffects.play("tactile_click");
    onNavigateView(view);
    onClose();
  };

  // Comprehensive catalog of all actionable items and workflows
  const allActions: CommandAction[] = useMemo(
    () => [
      // Platform Command Actions
      {
        id: "action-radar",
        label: "Case Radar Feed",
        description: "Intake queue, statutory deadline alarms & denial monitoring",
        icon: Broadcast,
        category: "platform",
        categoryLabel: "Platform Command",
        keywords: [
          "radar",
          "feed",
          "intake",
          "alarms",
          "queue",
          "cases",
          "claims",
          "claims list",
          "dashboard",
          "home",
          "inbox",
          "statutory",
        ],
        badge: "Platform",
        onExecute: () => handleNavigate("radar"),
      },
      {
        id: "action-analytics",
        label: "Portfolio Analytics",
        description: "Recovery yield, overturn rates & payer settlement metrics",
        icon: ChartPieSlice,
        category: "platform",
        categoryLabel: "Platform Command",
        keywords: [
          "analytics",
          "yield",
          "recovery",
          "win rate",
          "overturn",
          "stats",
          "metrics",
          "roi",
          "charts",
          "portfolio",
          "financials",
          "reporting",
        ],
        badge: "Platform",
        onExecute: () => handleNavigate("analytics"),
      },
      {
        id: "action-audit",
        label: "Audit Timeline",
        description: "ERISA 29 CFR § 2560.503-1 statutory compliance & case audit trail",
        icon: Clock,
        category: "platform",
        categoryLabel: "Platform Command",
        keywords: [
          "audit",
          "timeline",
          "ledger",
          "erisa",
          "statutory",
          "29 cfr",
          "history",
          "compliance",
          "clock",
          "events",
          "logs",
          "records",
        ],
        badge: "Platform",
        onExecute: () => handleNavigate("audit"),
      },
      {
        id: "action-settings",
        label: "Sentinel Settings",
        description: "Autonomous dispatch rules, API credentials & gateway configuration",
        icon: GearSix,
        category: "platform",
        categoryLabel: "Platform Command",
        keywords: [
          "settings",
          "configuration",
          "autonomy",
          "gateway",
          "dispatch",
          "rules",
          "api",
          "keys",
          "preferences",
          "config",
          "agent",
        ],
        badge: "Platform",
        onExecute: () => handleNavigate("settings"),
      },
      {
        id: "action-landing",
        label: "Cinematic Landing Hero",
        description: "Product overview, architecture and live sentinel demonstration",
        icon: Shield,
        category: "platform",
        categoryLabel: "Platform Command",
        keywords: [
          "landing",
          "hero",
          "overview",
          "product",
          "home",
          "showcase",
          "intro",
          "architecture",
          "cinematic",
          "demo",
        ],
        badge: "Platform",
        onExecute: () => handleNavigate("landing"),
      },

      // Active Case Workspace Tools
      {
        id: "action-evidence",
        label: "Evidence Matrix",
        description: "Clinical Policy Bulletins (CPBs), PubMed research & win score calculations",
        icon: FileMagnifyingGlass,
        category: "workspace",
        categoryLabel: "Active Case Workspace",
        keywords: [
          "evidence",
          "matrix",
          "cpb",
          "clinical policy",
          "bulletins",
          "guidelines",
          "pubmed",
          "fda",
          "win score",
          "probability",
          "clinical intelligence",
          "research",
          "proof",
        ],
        badge: "Workspace",
        onExecute: () => handleNavigate("evidence"),
      },
      {
        id: "action-studio",
        label: "Appeal Brief (Step 2)",
        description: "Synthesize AI clinical rebuttal briefs with formal statutory citations",
        icon: FileText,
        category: "workspace",
        categoryLabel: "Active Case Workspace",
        keywords: [
          "appeal",
          "studio",
          "brief",
          "legal",
          "synthesis",
          "ai brief",
          "draft",
          "defense",
          "letter",
          "citation",
          "rebuttal",
        ],
        badge: "Step 2",
        onExecute: () => handleNavigate("studio"),
      },
      {
        id: "action-p2p",
        label: "Doctor P2P Copilot",
        description: "3-minute peer-to-peer physician rebuttal script & live call speech simulator",
        icon: PhoneCall,
        category: "workspace",
        categoryLabel: "Companion Tooling",
        keywords: [
          "p2p",
          "tele-script",
          "script",
          "peer to peer",
          "doctor",
          "physician",
          "phone call",
          "rebuttal",
          "cheat sheet",
          "talking points",
          "copilot",
          "call",
          "tele",
        ],
        badge: "Companion",
        onExecute: () => handleNavigate("p2p"),
      },
      {
        id: "action-calculator",
        label: "ERISA & Liability Audit",
        description: "Patient out-of-pocket exposure & $110/day statutory non-disclosure penalty audit",
        icon: Calculator,
        category: "workspace",
        categoryLabel: "Companion Tooling",
        keywords: [
          "calculator",
          "erisa",
          "financial",
          "penalty",
          "penalties",
          "110",
          "$110",
          "oop",
          "out of pocket",
          "exposure",
          "fines",
          "statutory penalties",
          "liability",
          "math",
          "calc",
        ],
        badge: "Companion",
        onExecute: () => handleNavigate("calculator"),
      },
      {
        id: "action-communications",
        label: "Payer Communications",
        description: "Autonomous AgentMail dispatch, payer thread tracking & incoming transmissions",
        icon: Envelope,
        category: "workspace",
        categoryLabel: "Active Case Workspace",
        keywords: [
          "communications",
          "payer",
          "agentmail",
          "email",
          "fax",
          "transmission",
          "transmissions",
          "inbox",
          "dispatch",
          "thread",
          "messages",
          "mail",
          "reply",
        ],
        badge: "Workspace",
        onExecute: () => handleNavigate("communications"),
      },

      // Quick Sentinel Actions
      {
        id: "action-ingest",
        label: "Ingest Denial Document",
        description: "Upload PDF, paste EOB text, select presets, or inspect AgentMail inbox",
        icon: CloudArrowUp,
        category: "sentinel",
        categoryLabel: "Quick Sentinel Actions",
        keywords: [
          "ingest",
          "upload",
          "parse",
          "eob",
          "denial",
          "document",
          "new claim",
          "add claim",
          "import",
          "file",
          "text",
          "pdf",
          "preset",
          "action",
          "create",
          "scan",
        ],
        badge: "1-Click",
        onExecute: () => {
          onClose();
          onOpenIngestion();
        },
      },
      ...(onOpenOnboarding
        ? [
            {
              id: "action-onboarding",
              label: "Restart Sentinel Setup Guide",
              description: "Launch interactive 3-step onboarding wizard and live gateway setup",
              icon: BrandIcon,
              category: "sentinel" as const,
              categoryLabel: "Quick Sentinel Actions",
              keywords: [
                "onboarding",
                "setup",
                "guide",
                "wizard",
                "walkthrough",
                "tutorial",
                "restart onboarding",
                "tour",
                "getting started",
                "welcome",
              ],
              badge: "Setup",
              onExecute: () => {
                onClose();
                onOpenOnboarding();
              },
            },
          ]
        : []),
      ...(onOpenShortcuts
        ? [
            {
              id: "action-shortcuts",
              label: "Keyboard Shortcuts Reference",
              description: "View cheatsheet of all keyboard hotkeys and console commands",
              icon: Keyboard,
              category: "sentinel" as const,
              categoryLabel: "Quick Sentinel Actions",
              keywords: [
                "shortcuts",
                "hotkeys",
                "keyboard",
                "keys",
                "commands",
                "cheatsheet",
                "help",
                "docs",
              ],
              badge: "Cheatsheet",
              onExecute: () => {
                onClose();
                onOpenShortcuts();
              },
            },
          ]
        : []),
    ],
    [onClose, onOpenIngestion, onOpenOnboarding, onOpenShortcuts]
  );

  const normalizedQuery = query.trim().toLowerCase();
  const isSearching = normalizedQuery.length > 0;
  const isServerLoading = isSearching && serverSearchResults === undefined;

  // Search logic for claims: combine native Convex BM25 full-text search with in-memory claims
  const filteredClaims: Claim[] = useMemo(() => {
    if (!normalizedQuery) return claims.slice(0, 4);

    // 1. In-memory filtered matches
    const localMatches = claims.filter((c) => {
      const claimNum = c.claimNumber?.toLowerCase() || "";
      const patName = (c.patient?.name || c.patientName || "").toLowerCase();
      const payer = (c.patient?.insurancePayer || c.insurancePayer || "").toLowerCase();
      const denialCode = c.denialReasonCode?.toLowerCase() || "";
      const icd = (c.icd10Codes || []).join(" ").toLowerCase();
      const cpt = (c.cptCodes || []).join(" ").toLowerCase();
      const desc = (c.denialReasonDescription || "").toLowerCase();
      const provider = (c.providerName || "").toLowerCase();

      if (
        claimNum.includes(normalizedQuery) ||
        patName.includes(normalizedQuery) ||
        payer.includes(normalizedQuery) ||
        denialCode.includes(normalizedQuery) ||
        icd.includes(normalizedQuery) ||
        cpt.includes(normalizedQuery) ||
        desc.includes(normalizedQuery) ||
        provider.includes(normalizedQuery)
      ) {
        return true;
      }

      const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
      if (tokens.length > 1) {
        const combined = `${claimNum} ${patName} ${payer} ${denialCode} ${icd} ${cpt} ${desc} ${provider}`;
        return tokens.every((token) => combined.includes(token));
      }

      return false;
    });

    // 2. Prioritize and merge authoritative BM25 server results
    return mergeSearchResults(serverSearchResults, localMatches, claims);
  }, [claims, normalizedQuery, serverSearchResults]);

  // Search logic for actions
  const isActionMatch = (action: CommandAction, q: string) => {
    if (!q) return true;

    // Allow typing "action" or "actions" to show available commands
    if (q === "action" || q === "actions") {
      return true;
    }

    if (action.label.toLowerCase().includes(q)) return true;
    if (action.description.toLowerCase().includes(q)) return true;
    if (action.categoryLabel.toLowerCase().includes(q)) return true;
    if (action.badge?.toLowerCase().includes(q)) return true;

    if (
      action.keywords.some(
        (k) => k.toLowerCase().includes(q) || q.includes(k.toLowerCase())
      )
    ) {
      return true;
    }

    const tokens = q.split(/\s+/).filter(Boolean);
    if (tokens.length > 1) {
      const combined = `${action.label} ${action.description} ${action.categoryLabel} ${action.keywords.join(" ")}`.toLowerCase();
      return tokens.every((token) => combined.includes(token));
    }

    return false;
  };

  const matchedPlatformActions = useMemo(() => {
    return allActions.filter(
      (a) => a.category === "platform" && isActionMatch(a, normalizedQuery)
    );
  }, [allActions, normalizedQuery]);

  const matchedWorkspaceActions = useMemo(() => {
    return allActions.filter(
      (a) => a.category === "workspace" && isActionMatch(a, normalizedQuery)
    );
  }, [allActions, normalizedQuery]);

  const matchedSentinelActions = useMemo(() => {
    return allActions.filter(
      (a) => a.category === "sentinel" && isActionMatch(a, normalizedQuery)
    );
  }, [allActions, normalizedQuery]);

  const totalMatches =
    filteredClaims.length +
    matchedPlatformActions.length +
    matchedWorkspaceActions.length +
    matchedSentinelActions.length;

  // Flattened navigable list for unified keyboard navigation (ArrowUp, ArrowDown, Enter)
  interface FlatNavItem {
    id: string;
    onExecute: () => void;
  }

  const flatNavItems: FlatNavItem[] = useMemo(() => {
    const items: FlatNavItem[] = [];

    filteredClaims.forEach((c) => {
      items.push({
        id: `claim-${c._id}`,
        onExecute: () => handleSelectClaim(c._id, "radar"),
      });
    });

    matchedPlatformActions.forEach((a) => {
      items.push({
        id: a.id,
        onExecute: a.onExecute,
      });
    });

    matchedWorkspaceActions.forEach((a) => {
      items.push({
        id: a.id,
        onExecute: a.onExecute,
      });
    });

    matchedSentinelActions.forEach((a) => {
      items.push({
        id: a.id,
        onExecute: a.onExecute,
      });
    });

    return items;
  }, [
    filteredClaims,
    matchedPlatformActions,
    matchedWorkspaceActions,
    matchedSentinelActions,
  ]);

  useEffect(() => {
    if (flatNavItems.length > 0 && activeIndex >= flatNavItems.length) {
      setActiveIndex(0);
    }
  }, [flatNavItems.length, activeIndex]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (flatNavItems.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      soundEffects.play("tactile_click");
      setActiveIndex((prev) => (prev + 1) % flatNavItems.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      soundEffects.play("tactile_click");
      setActiveIndex((prev) => (prev - 1 + flatNavItems.length) % flatNavItems.length);
    } else if (e.key === "Tab") {
      // Focus trap: cycle within command palette options without escaping dialog boundary
      e.preventDefault();
      if (e.shiftKey) {
        setActiveIndex((prev) => (prev - 1 + flatNavItems.length) % flatNavItems.length);
      } else {
        setActiveIndex((prev) => (prev + 1) % flatNavItems.length);
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      const currentItem = flatNavItems[activeIndex];
      if (currentItem) {
        currentItem.onExecute();
      }
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        aria-modal="true"
        aria-labelledby="command-palette-title"
        className="p-0 max-w-xl overflow-hidden gap-0 border-border shadow-xl"
      >
        <DialogTitle id="command-palette-title" className="sr-only">
          Command Palette and Navigation
        </DialogTitle>

        {/* Search Input Bar */}
        <div className="flex items-center border-b border-border px-3 py-2.5">
          <MagnifyingGlass className="size-4 text-muted-foreground mr-2 shrink-0" />
          <input
            ref={inputRef}
            autoFocus
            type="text"
            role="combobox"
            aria-expanded={true}
            aria-controls="command-results-list"
            aria-autocomplete="list"
            aria-label="Search claims, clinical codes, or platform actions"
            placeholder="Search claims, clinical terms (e.g. subchondral, CO-50), or actions..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none font-sans"
          />
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground hover:bg-muted/80 hover:text-foreground transition-colors cursor-pointer shrink-0"
            title="Press ESC to close"
            aria-label="Close command dialog"
          >
            ESC
          </button>
        </div>

        <div
          role="listbox"
          id="command-results-list"
          aria-label="Command search results"
          className="max-h-[420px] overflow-y-auto p-2 space-y-3"
        >
          {/* Empty State when searching with zero results */}
          {isSearching && totalMatches === 0 && (
            <div className="py-8 px-4 text-center space-y-2">
              <div className="inline-flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground mb-1">
                <MagnifyingGlass className="size-5" />
              </div>
              <div className="text-xs font-semibold text-foreground">
                No matching claims or actions found
              </div>
              <div className="text-[11px] text-muted-foreground max-w-sm mx-auto">
                No results for &ldquo;{query}&rdquo;. Try searching by patient name, claim #, clinical term (e.g. &ldquo;subchondral&rdquo;, &ldquo;arthroplasty&rdquo;), CARC code (&ldquo;CO-50&rdquo;), or action keywords like &ldquo;radar&rdquo;, &ldquo;brief&rdquo;, &ldquo;p2p&rdquo;, &ldquo;ingest&rdquo;, or &ldquo;erisa&rdquo;.
              </div>
            </div>
          )}

          {/* Claims Section */}
          {filteredClaims.length > 0 && (
            <div className="space-y-1">
              <div className="flex items-center justify-between px-2 py-1">
                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider font-mono">
                  Medical Denial Claims ({filteredClaims.length})
                </div>
                {isSearching && (
                  <span className="inline-flex items-center gap-1.5 text-[9px] font-mono text-primary/90 bg-primary/10 border border-primary/25 px-2 py-0.5 rounded-full">
                    <span
                      className={cn(
                        "size-1.5 rounded-full",
                        isServerLoading ? "bg-primary animate-pulse" : "bg-emerald-400 shadow-xs"
                      )}
                    />
                    <span>{isServerLoading ? "Querying BM25..." : "Convex BM25 Index"}</span>
                  </span>
                )}
              </div>

              {filteredClaims.map((claim) => {
                const itemId = `claim-${claim._id}`;
                const itemIndex = flatNavItems.findIndex((item) => item.id === itemId);
                const isSelected = itemIndex === activeIndex;

                return (
                  <div
                    key={claim._id}
                    role="option"
                    aria-selected={isSelected}
                    tabIndex={-1}
                    onClick={() => handleSelectClaim(claim._id, "radar")}
                    onMouseEnter={() => itemIndex >= 0 && setActiveIndex(itemIndex)}
                    className={cn(
                      "flex items-center justify-between px-2.5 py-2 rounded-lg cursor-pointer transition-all duration-150 group border",
                      isSelected
                        ? "bg-muted/90 border-border text-foreground ring-1 ring-primary/25 shadow-sm"
                        : "hover:bg-muted/70 border-transparent text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={cn(
                          "flex size-7 items-center justify-center rounded-lg bg-muted shrink-0 transition-colors",
                          isSelected
                            ? "text-primary bg-primary/10"
                            : "text-muted-foreground group-hover:text-foreground"
                        )}
                      >
                        <User className="size-3.5" />
                      </div>
                      <div className="text-left min-w-0">
                        <div className="font-semibold text-xs text-foreground flex items-center gap-1.5 truncate">
                          <span>{claim.patient?.name || claim.patientName || "Patient"}</span>
                          <span className="font-mono text-[11px] text-muted-foreground">
                            ({claim.claimNumber || "PENDING"})
                          </span>
                        </div>
                        <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 font-mono truncate">
                          <span>{claim.patient?.insurancePayer || claim.insurancePayer || "Health Insurer"}</span>
                          <span>•</span>
                          <span>{(claim.cptCodes && claim.cptCodes.length > 0) ? `CPT ${claim.cptCodes.join(", ")}` : "No CPT"}</span>
                          <span>•</span>
                          <span className="text-destructive font-semibold">
                            {formatCurrency(claim.deniedAmount || 0)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setCaseToDelete(claim);
                        }}
                        className="p-1.5 text-[10px] rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                        title="Delete this case"
                        aria-label={`Delete claim ${claim.claimNumber}`}
                      >
                        <Trash className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectClaim(claim._id, "evidence");
                        }}
                        className="px-2 py-1 text-[10px] rounded bg-muted hover:bg-secondary text-foreground font-mono cursor-pointer"
                        aria-label={`Open evidence matrix for claim ${claim.claimNumber}`}
                      >
                        Evidence
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectClaim(claim._id, "studio");
                        }}
                        className="px-2 py-1 text-[10px] rounded bg-primary text-primary-foreground font-mono cursor-pointer flex items-center gap-1"
                        aria-label={`Open appeal studio for claim ${claim.claimNumber}`}
                      >
                        <span>Studio</span>
                        <ArrowRight className="size-2.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Platform Command Section */}
          {matchedPlatformActions.length > 0 && (
            <div className={cn("space-y-1", filteredClaims.length > 0 && "border-t border-border/60 pt-2")}>
              <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider font-mono">
                Platform Command {isSearching ? `(${matchedPlatformActions.length})` : ""}
              </div>

              {!isSearching ? (
                // Compact grid view when query is empty
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-1">
                  {matchedPlatformActions.map((view) => {
                    const Icon = view.icon;
                    const itemIndex = flatNavItems.findIndex((item) => item.id === view.id);
                    const isSelected = itemIndex === activeIndex;

                    return (
                      <button
                        key={view.id}
                        onClick={view.onExecute}
                        onMouseEnter={() => itemIndex >= 0 && setActiveIndex(itemIndex)}
                        className={cn(
                          "flex flex-col px-2.5 py-1.5 rounded-lg text-xs text-left transition-all border",
                          isSelected
                            ? "bg-muted/90 border-border text-foreground ring-1 ring-primary/25 shadow-sm"
                            : "hover:bg-muted/70 text-muted-foreground hover:text-foreground border-transparent hover:border-border"
                        )}
                      >
                        <div className="flex items-center gap-1.5 font-medium text-foreground">
                          <Icon className="size-3.5 text-primary" />
                          <span>{view.label}</span>
                        </div>
                        <span className="text-[10px] text-muted-foreground truncate">
                          {view.description}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                // Expanded searchable list view when filtering
                <div className="space-y-1">
                  {matchedPlatformActions.map((action) => {
                    const Icon = action.icon;
                    const itemIndex = flatNavItems.findIndex((item) => item.id === action.id);
                    const isSelected = itemIndex === activeIndex;

                    return (
                      <button
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        key={action.id}
                        onClick={action.onExecute}
                        onMouseEnter={() => itemIndex >= 0 && setActiveIndex(itemIndex)}
                        className={cn(
                          "w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-left cursor-pointer transition-all duration-150 group border",
                          isSelected
                            ? "bg-muted/90 border-border text-foreground ring-1 ring-primary/25 shadow-sm"
                            : "hover:bg-muted/70 border-transparent text-muted-foreground hover:text-foreground"
                        )}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className={cn(
                              "flex size-7 items-center justify-center rounded-lg bg-muted shrink-0 transition-colors",
                              isSelected
                                ? "text-primary bg-primary/10"
                                : "text-muted-foreground group-hover:text-primary"
                            )}
                          >
                            <Icon className="size-3.5" />
                          </div>
                          <div className="text-left min-w-0">
                            <div className="font-semibold text-xs text-foreground flex items-center gap-1.5 truncate">
                              <span>{action.label}</span>
                            </div>
                            <div className="text-[11px] text-muted-foreground truncate">
                              {action.description}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0 ml-2">
                          <Badge variant="outline" size="sm" className="font-mono text-[9px]">
                            {action.badge || "Command"}
                          </Badge>
                          <span
                            className={cn(
                              "font-mono text-[10px] transition-opacity",
                              isSelected ? "opacity-100 text-foreground" : "opacity-0 group-hover:opacity-100"
                            )}
                          >
                            <kbd className="px-1 py-0.5 rounded bg-muted/80 border border-border text-[9px]">
                              ↵
                            </kbd>
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Active Case Workspace Tools Section */}
          {matchedWorkspaceActions.length > 0 && (
            <div
              className={cn(
                "space-y-1",
                (filteredClaims.length > 0 || matchedPlatformActions.length > 0) &&
                  "border-t border-border/60 pt-2"
              )}
            >
              <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider font-mono">
                Active Case Workspace {isSearching ? `(${matchedWorkspaceActions.length})` : ""}
              </div>

              {!isSearching ? (
                // Compact grid view when query is empty
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-1">
                  {matchedWorkspaceActions.map((view) => {
                    const Icon = view.icon;
                    const itemIndex = flatNavItems.findIndex((item) => item.id === view.id);
                    const isSelected = itemIndex === activeIndex;

                    return (
                      <button
                        key={view.id}
                        onClick={view.onExecute}
                        onMouseEnter={() => itemIndex >= 0 && setActiveIndex(itemIndex)}
                        className={cn(
                          "flex flex-col px-2.5 py-1.5 rounded-lg text-xs text-left transition-all border",
                          isSelected
                            ? "bg-muted/90 border-border text-foreground ring-1 ring-primary/25 shadow-sm"
                            : "hover:bg-muted/70 text-muted-foreground hover:text-foreground border-transparent hover:border-border"
                        )}
                      >
                        <div className="flex items-center gap-1.5 font-medium text-foreground">
                          <Icon className="size-3.5 text-emerald-500" />
                          <span>{view.label}</span>
                        </div>
                        <span className="text-[10px] text-muted-foreground truncate">
                          {view.description}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                // Expanded searchable list view when filtering
                <div className="space-y-1">
                  {matchedWorkspaceActions.map((action) => {
                    const Icon = action.icon;
                    const itemIndex = flatNavItems.findIndex((item) => item.id === action.id);
                    const isSelected = itemIndex === activeIndex;

                    return (
                      <button
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        key={action.id}
                        onClick={action.onExecute}
                        onMouseEnter={() => itemIndex >= 0 && setActiveIndex(itemIndex)}
                        className={cn(
                          "w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-left cursor-pointer transition-all duration-150 group border",
                          isSelected
                            ? "bg-muted/90 border-border text-foreground ring-1 ring-primary/25 shadow-sm"
                            : "hover:bg-muted/70 border-transparent text-muted-foreground hover:text-foreground"
                        )}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className={cn(
                              "flex size-7 items-center justify-center rounded-lg bg-muted shrink-0 transition-colors",
                              isSelected
                                ? "text-emerald-400 bg-emerald-500/10"
                                : "text-muted-foreground group-hover:text-emerald-400"
                            )}
                          >
                            <Icon className="size-3.5" />
                          </div>
                          <div className="text-left min-w-0">
                            <div className="font-semibold text-xs text-foreground flex items-center gap-1.5 truncate">
                              <span>{action.label}</span>
                            </div>
                            <div className="text-[11px] text-muted-foreground truncate">
                              {action.description}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0 ml-2">
                          <Badge variant="outline" size="sm" className="font-mono text-[9px]">
                            {action.badge || "Tool"}
                          </Badge>
                          <span
                            className={cn(
                              "font-mono text-[10px] transition-opacity",
                              isSelected ? "opacity-100 text-foreground" : "opacity-0 group-hover:opacity-100"
                            )}
                          >
                            <kbd className="px-1 py-0.5 rounded bg-muted/80 border border-border text-[9px]">
                              ↵
                            </kbd>
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Quick Sentinel Actions Section */}
          {matchedSentinelActions.length > 0 && (
            <div
              className={cn(
                "space-y-1",
                (filteredClaims.length > 0 ||
                  matchedPlatformActions.length > 0 ||
                  matchedWorkspaceActions.length > 0) &&
                  "border-t border-border/60 pt-2"
              )}
            >
              <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider font-mono">
                Quick Sentinel Actions {isSearching ? `(${matchedSentinelActions.length})` : ""}
              </div>
              <div className="space-y-1">
                {matchedSentinelActions.map((action) => {
                  const Icon = action.icon;
                  const itemIndex = flatNavItems.findIndex((item) => item.id === action.id);
                  const isSelected = itemIndex === activeIndex;

                  return (
                    <button
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      key={action.id}
                      onClick={action.onExecute}
                      onMouseEnter={() => itemIndex >= 0 && setActiveIndex(itemIndex)}
                      className={cn(
                        "w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs text-left cursor-pointer transition-all border",
                        isSelected
                          ? "bg-muted/90 border-border text-foreground ring-1 ring-primary/25 shadow-sm"
                          : "hover:bg-muted/70 text-foreground border-transparent hover:border-border"
                      )}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={cn(
                            "flex size-7 items-center justify-center rounded-lg bg-muted shrink-0 transition-colors",
                            isSelected
                              ? "text-primary bg-primary/10"
                              : "text-muted-foreground group-hover:text-primary"
                          )}
                        >
                          <Icon className="size-3.5" />
                        </div>
                        <div className="text-left min-w-0">
                          <div className="font-semibold text-xs text-foreground flex items-center gap-1.5 truncate">
                            <span>{action.label}</span>
                          </div>
                          <div className="text-[11px] text-muted-foreground truncate">
                            {action.description}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 ml-2">
                        {action.badge && (
                          <Badge variant="outline" size="sm" className="font-mono text-[9px]">
                            {action.badge}
                          </Badge>
                        )}
                        <span
                          className={cn(
                            "font-mono text-[10px] transition-opacity",
                            isSelected ? "opacity-100 text-foreground" : "opacity-0 group-hover:opacity-100"
                          )}
                        >
                          <kbd className="px-1 py-0.5 rounded bg-muted/80 border border-border text-[9px]">
                            ↵
                          </kbd>
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer info & Keyboard navigation hints */}
        <div className="border-t border-border px-3 py-2 bg-muted/20 flex items-center justify-between text-[11px] text-muted-foreground font-mono">
          <span>29 CFR § 2560.503-1 Statutory Sentinel</span>
          <span className="flex items-center gap-2">
            <span className="hidden sm:inline text-[10px] text-muted-foreground/70">
              <kbd className="px-1 py-0.5 rounded bg-muted border border-border text-[9px]">↑↓</kbd> navigate{" "}
              <kbd className="px-1 py-0.5 rounded bg-muted border border-border text-[9px]">↵</kbd> select
            </span>
            <span>Clinical Intelligence Engine</span>
          </span>
        </div>
      </DialogContent>

      {/* Delete Case Confirmation Modal */}
      <DeleteCaseModal
        isOpen={Boolean(caseToDelete)}
        claim={caseToDelete}
        onClose={() => setCaseToDelete(null)}
        onConfirmDelete={onDeleteCase || (async () => {})}
        onSuccess={() => {
          setCaseToDelete(null);
        }}
      />
    </Dialog>
  );
};

