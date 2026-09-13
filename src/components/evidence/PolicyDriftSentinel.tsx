import React, { useState } from "react";
import {
  Warning,
  CheckCircle,
  CircleNotch,
  ArrowsClockwise,
  Fingerprint,
  FileText,
  Copy,
  Check,
  Scales,
  Clock,
  ArrowRight,
  Globe,
  CaretRight,
  CaretDown,
  Info,
  FileMagnifyingGlass,
} from "@phosphor-icons/react";
import { useQuery, useAction, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { Claim, ClinicalEvidence } from "../../types";
import { Card } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../ui/dialog";
import { formatDateTime, formatDate, cn } from "../../lib/utils";
import { toast } from "sonner";

interface PolicyDriftSentinelProps {
  claim: Claim;
  evidences?: ClinicalEvidence[];
  onNavigateToStudio?: () => void;
}

export const PolicyDriftSentinel: React.FC<PolicyDriftSentinelProps> = ({
  claim,
  evidences = [],
  onNavigateToStudio,
}) => {
  const [isScanning, setIsScanning] = useState(false);
  const [scanStage, setScanStage] = useState<string>("");
  const [isNoticeModalOpen, setIsNoticeModalOpen] = useState(false);
  const [isDiffExpanded, setIsDiffExpanded] = useState(true);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);
  const [copiedNotice, setCopiedNotice] = useState(false);
  const [isAppendingNotice, setIsAppendingNotice] = useState(false);

  // Reactive queries and actions
  const latestDrift = useQuery(api.policyDrift.getLatestDrift, {
    claimId: claim._id as Id<"claims">,
  });

  const detectDriftAction = useAction(api.actions.policyDriftSentinel.detectPolicyDriftAction);
  const appendNoticeMutation = useMutation(api.policyDrift.appendErisaNoticeToAppeal);

  // Timer ref to prevent race conditions and memory leaks on unmount
  const timersRef = React.useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearAllTimers = React.useCallback(() => {
    timersRef.current.forEach((t) => clearTimeout(t));
    timersRef.current = [];
  }, []);

  React.useEffect(() => {
    return () => {
      clearAllTimers();
    };
  }, [clearAllTimers]);

  // Identify active CPB from evidence if available
  const cpbEvidence = evidences.find((e) => e.sourceType === "payer_cpb" && e.sourceUrl);
  const activePolicyUrl = cpbEvidence?.sourceUrl;
  const activePolicyTitle = cpbEvidence?.title || `${claim.insurancePayer || "Insurer"} Clinical Policy Bulletin`;

  const handleCopy = async (text: string, type: "hash" | "notice") => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      }
      if (type === "hash") {
        setCopiedHash(text);
        const timer = setTimeout(() => setCopiedHash(null), 2000);
        timersRef.current.push(timer);
        toast.success("Cryptographic SHA-256 fingerprint copied to clipboard");
      } else {
        setCopiedNotice(true);
        const timer = setTimeout(() => setCopiedNotice(false), 2000);
        timersRef.current.push(timer);
        toast.success("ERISA Bad-Faith Notice of Violation copied to clipboard");
      }
    } catch {
      toast.error("Unable to copy to clipboard");
    }
  };

  const handleDetectDrift = async () => {
    if (isScanning) return;
    setIsScanning(true);
    setScanStage("Accessing Denial Date Policy Snapshot...");
    clearAllTimers();

    try {
      timersRef.current.push(
        setTimeout(() => setScanStage("Crawling Live Insurer Bulletin via Firecrawl..."), 1200)
      );
      timersRef.current.push(
        setTimeout(() => setScanStage("Computing Cryptographic Fingerprints & Hashes..."), 2400)
      );
      timersRef.current.push(
        setTimeout(() => setScanStage("Analyzing Criteria Drift & ERISA Bad-Faith Alterations..."), 3600)
      );

      const result = await detectDriftAction({
        claimId: claim._id as Id<"claims">,
        policyUrl: activePolicyUrl,
      });

      if (result.isRetroactiveAlteration) {
        toast.error("Retroactive Policy Alteration Flagged! Insurer inserted new criteria post-denial.");
      } else if (result.hasDrift) {
        toast.info("Policy updates detected, but no adverse retroactive criteria identified.");
      } else {
        toast.success("Policy Integrity Verified: Baseline snapshot matches live document (0 drift).");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to run policy drift scan";
      toast.error(`Policy Drift Sentinel scan failed: ${msg}`);
    } finally {
      clearAllTimers();
      setIsScanning(false);
      setScanStage("");
    }
  };

  const handleAppendToAppeal = async () => {
    if (!latestDrift?._id) return;
    setIsAppendingNotice(true);
    try {
      await appendNoticeMutation({
        claimId: claim._id as Id<"claims">,
        driftId: latestDrift._id as Id<"policyDrifts">,
      });
      toast.success("ERISA Bad-Faith Notice appended to active appeal brief!");
      setIsNoticeModalOpen(false);
      if (onNavigateToStudio) {
        onNavigateToStudio();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to append notice";
      toast.error(`Could not append notice: ${msg}`);
    } finally {
      setIsAppendingNotice(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header Banner & Scan Trigger */}
      <Card className="p-4 border-border/90 bg-gradient-to-br from-card via-card/95 to-muted/20 relative overflow-hidden shadow-sm">
        <div className="absolute -right-8 -top-8 w-40 h-40 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px] uppercase font-mono tracking-wider bg-cyan-500/10 text-cyan-400 border-cyan-500/30">
                Retroactive Alteration Detector
              </Badge>
              {latestDrift && (
                <span className="text-[10px] text-muted-foreground font-mono">
                  Last Scanned: {formatDateTime(latestDrift.createdAt)}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Scales className="size-4 text-cyan-400" />
              <h3 className="font-semibold text-sm text-foreground tracking-tight">
                Policy Drift Sentinel
              </h3>
              <span className="text-xs text-cyan-400/80 font-mono truncate max-w-xs">
                &bull; {activePolicyTitle}
              </span>
            </div>

            <p className="text-xs text-muted-foreground max-w-2xl leading-relaxed">
              Insurers frequently alter online Clinical Policy Bulletins (CPBs) after issuing a denial, retroactively inserting stricter step-therapy or experimental exclusions. Firecrawl compares the live policy against the cryptographically hashed snapshot from the date of denial.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              onClick={handleDetectDrift}
              disabled={isScanning}
              className={cn(
                "relative text-xs font-semibold gap-2 shadow-sm transition-all duration-300",
                isScanning ? "bg-muted text-muted-foreground" : "bg-cyan-500 hover:bg-cyan-600 text-slate-950 font-bold"
              )}
            >
              {isScanning ? (
                <>
                  <CircleNotch className="size-3.5 animate-spin text-cyan-400" />
                  <span>Scanning Live CPB...</span>
                </>
              ) : (
                <>
                  <ArrowsClockwise className="size-3.5" />
                  <span>Detect Policy Drift</span>
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Live Scan Telemetry Progress */}
        {isScanning && (
          <div className="mt-3 pt-3 border-t border-border/50 flex items-center gap-2 text-xs text-cyan-400 font-mono animate-pulse">
            <CircleNotch className="size-3.5 animate-spin shrink-0" />
            <span>{scanStage || "Initiating Firecrawl live crawler..."}</span>
          </div>
        )}
      </Card>

      {/* Main Drift Status & Findings */}
      {latestDrift && (
        <Card className="border-border/80 bg-card/90 overflow-hidden divide-y divide-border/50 shadow-xs">
          {/* Status Bar */}
          <div className={cn(
            "p-3.5 px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3",
            latestDrift.isRetroactiveAlteration
              ? "bg-rose-500/10 border-b border-rose-500/20"
              : latestDrift.hasDrift
              ? "bg-amber-500/10 border-b border-amber-500/20"
              : "bg-emerald-500/10 border-b border-emerald-500/20"
          )}>
            <div className="flex items-center gap-2.5">
              {latestDrift.isRetroactiveAlteration ? (
                <div className="size-7 rounded-full bg-rose-500/20 border border-rose-500/40 flex items-center justify-center shrink-0">
                  <Warning className="size-4 text-rose-400 animate-pulse" />
                </div>
              ) : latestDrift.hasDrift ? (
                <div className="size-7 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center shrink-0">
                  <Info className="size-4 text-amber-400" />
                </div>
              ) : (
                <div className="size-7 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center shrink-0">
                  <CheckCircle className="size-4 text-emerald-400" />
                </div>
              )}

              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-xs text-foreground">
                    {latestDrift.isRetroactiveAlteration
                      ? "Retroactive Policy Alteration Flagged"
                      : latestDrift.hasDrift
                      ? "Policy Drift Detected (Non-Retroactive)"
                      : "Policy Integrity Verified (0 Drift)"}
                  </span>
                  <Badge
                    variant={latestDrift.isRetroactiveAlteration ? "destructive" : "secondary"}
                    className="text-[10px] font-mono uppercase"
                  >
                    {latestDrift.severity.replace(/_/g, " ")}
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {latestDrift.summary}
                </p>
              </div>
            </div>

            {latestDrift.erisaNoticeDraft && (
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setIsNoticeModalOpen(true)}
                  className="text-xs gap-1.5 border-rose-500/30 text-rose-300 hover:bg-rose-500/15"
                >
                  <FileText className="size-3.5 text-rose-400" />
                  <span>Inspect ERISA Violation Notice</span>
                </Button>
              </div>
            )}
          </div>

          {/* Cryptographic Hash Comparison Grid */}
          <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4 bg-muted/20">
            {/* Baseline Snapshot Card */}
            <div className="rounded-lg border border-border/70 bg-card p-3 space-y-2">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1 font-semibold text-foreground">
                  <Clock className="size-3 text-cyan-400" />
                  Baseline Snapshot (Denial Date)
                </span>
                <span className="font-mono text-[10px]">
                  {formatDate(latestDrift.baselineCapturedAt)}
                </span>
              </div>

              <div className="flex items-center justify-between gap-2 p-2 rounded bg-muted/50 font-mono text-[10.5px]">
                <span className="truncate text-muted-foreground">
                  SHA-256: <span className="text-foreground">{latestDrift.baselineContentHash}</span>
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy(latestDrift.baselineContentHash, "hash")}
                  className="p-1 hover:text-foreground text-muted-foreground transition-colors shrink-0"
                  title="Copy Baseline SHA-256 Hash"
                  aria-label="Copy Baseline SHA-256 Hash"
                >
                  {copiedHash === latestDrift.baselineContentHash ? (
                    <Check className="size-3 text-emerald-400" />
                  ) : (
                    <Copy className="size-3" />
                  )}
                </button>
              </div>
              <p className="text-[10.5px] text-muted-foreground">
                Original governing policy captured when claim was denied on {latestDrift.denialDate || formatDate(latestDrift.baselineCapturedAt)}.
              </p>
            </div>

            {/* Live Web Version Card */}
            <div className="rounded-lg border border-border/70 bg-card p-3 space-y-2">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1 font-semibold text-foreground">
                  <Globe className="size-3 text-emerald-400" />
                  Current Live Policy (Firecrawl Crawled)
                </span>
                <span className="font-mono text-[10px]">
                  {formatDate(latestDrift.liveCapturedAt)}
                </span>
              </div>

              <div className="flex items-center justify-between gap-2 p-2 rounded bg-muted/50 font-mono text-[10.5px]">
                <span className="truncate text-muted-foreground">
                  SHA-256: <span className="text-foreground">{latestDrift.liveContentHash}</span>
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy(latestDrift.liveContentHash, "hash")}
                  className="p-1 hover:text-foreground text-muted-foreground transition-colors shrink-0"
                  title="Copy Live SHA-256 Hash"
                  aria-label="Copy Live SHA-256 Hash"
                >
                  {copiedHash === latestDrift.liveContentHash ? (
                    <Check className="size-3 text-emerald-400" />
                  ) : (
                    <Copy className="size-3" />
                  )}
                </button>
              </div>
              <p className="text-[10.5px] text-muted-foreground">
                Live document scraped directly from the insurer's portal via Firecrawl.
              </p>
            </div>
          </div>

          {/* Itemized Detected Criteria Alterations */}
          {latestDrift.detectedChanges && latestDrift.detectedChanges.length > 0 && (
            <div className="p-4 space-y-3">
              <div
                role="button"
                tabIndex={0}
                aria-expanded={isDiffExpanded}
                className="flex items-center justify-between cursor-pointer select-none rounded p-1 -m-1 focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                onClick={() => setIsDiffExpanded(!isDiffExpanded)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setIsDiffExpanded(!isDiffExpanded);
                  }
                }}
              >
                <div className="flex items-center gap-2">
                  <FileMagnifyingGlass className="size-4 text-cyan-400" />
                  <span className="text-xs font-semibold text-foreground">
                    Retroactive Criteria Changes Identified ({latestDrift.detectedChanges.length})
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  tabIndex={-1}
                  aria-label={isDiffExpanded ? "Collapse detected criteria changes" : "Expand detected criteria changes"}
                >
                  {isDiffExpanded ? <CaretDown className="size-3.5" /> : <CaretRight className="size-3.5" />}
                </Button>
              </div>

              {isDiffExpanded && (
                <div className="grid grid-cols-1 gap-2.5 pt-1">
                  {latestDrift.detectedChanges.map((change, idx) => (
                    <div
                      key={idx}
                      className={cn(
                        "rounded-lg border p-3 text-xs space-y-2",
                        change.isAdverseToClaim
                          ? "bg-rose-500/5 border-rose-500/30"
                          : "bg-muted/30 border-border"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={change.isAdverseToClaim ? "destructive" : "secondary"}
                            className="text-[9.5px] uppercase font-mono"
                          >
                            {change.category.replace(/_/g, " ")}
                          </Badge>
                          <span className="font-semibold text-foreground">
                            {change.title}
                          </span>
                        </div>
                        {change.isAdverseToClaim && (
                          <span className="text-[10px] text-rose-400 font-medium shrink-0">
                            Adverse to Claim
                          </span>
                        )}
                      </div>

                      {change.baselineText && (
                        <div className="space-y-1 bg-muted/40 p-2 rounded text-[11px]">
                          <span className="text-[10px] text-muted-foreground uppercase font-mono block">
                            Baseline Rule (At Denial Date):
                          </span>
                          <p className="text-muted-foreground line-through italic">
                            "{change.baselineText}"
                          </p>
                        </div>
                      )}

                      <div className="space-y-1 bg-muted/60 p-2 rounded text-[11px] border border-border/50">
                        <span className="text-[10px] text-cyan-400 uppercase font-mono block">
                          Current Live Alteration (Inserted Post-Denial):
                        </span>
                        <p className="text-foreground font-mono text-[11px]">
                          "{change.liveText}"
                        </p>
                      </div>

                      <p className="text-[11px] text-muted-foreground leading-relaxed pt-1">
                        <span className="font-semibold text-foreground">Regulatory Impact:</span> {change.impact}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {/* Loading Skeleton while Convex query resolves */}
      {latestDrift === undefined && !isScanning && (
        <Card className="p-6 text-center border border-border/60 bg-muted/10 animate-pulse space-y-2">
          <div className="size-8 rounded-full bg-cyan-500/10 mx-auto" />
          <div className="h-3 w-48 bg-muted rounded mx-auto" />
          <div className="h-2.5 w-64 bg-muted/60 rounded mx-auto" />
        </Card>
      )}

      {/* Empty State when no drift scan has been run yet */}
      {latestDrift === null && !isScanning && (
        <Card className="p-6 text-center border-dashed border-border/80 bg-muted/10 space-y-3">
          <div className="size-10 rounded-full bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center mx-auto text-cyan-400">
            <Fingerprint className="size-5" />
          </div>
          <div className="space-y-1 max-w-md mx-auto">
            <h4 className="text-xs font-semibold text-foreground">No Policy Drift Scans Executed Yet</h4>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Verify whether {claim.insurancePayer || "the insurer"} quietly updated their clinical policy criteria after denying Claim #{claim.claimNumber}. Click "Detect Policy Drift" to initiate a real-time Firecrawl audit.
            </p>
          </div>
          <Button
            size="sm"
            onClick={handleDetectDrift}
            className="bg-cyan-500 hover:bg-cyan-600 text-slate-950 font-bold text-xs gap-1.5"
          >
            <ArrowsClockwise className="size-3.5" />
            <span>Run Initial Policy Audit</span>
          </Button>
        </Card>
      )}

      {/* ERISA Bad-Faith Notice of Violation Modal / Drawer */}
      {latestDrift?.erisaNoticeDraft && (
        <Dialog open={isNoticeModalOpen} onOpenChange={setIsNoticeModalOpen}>
          <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col bg-card border-border shadow-2xl p-0 overflow-hidden">
            <DialogHeader className="p-4 px-6 border-b border-border/80 bg-muted/20">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="destructive" className="text-[10px] font-mono uppercase">
                      29 CFR § 2560.503-1 Violation
                    </Badge>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      $110/Day Statutory Demand
                    </span>
                  </div>
                  <DialogTitle className="text-sm font-semibold text-foreground">
                    ERISA Bad-Faith Notice of Violation (Retroactive Policy Alteration)
                  </DialogTitle>
                </div>
              </div>
              <DialogDescription className="text-xs text-muted-foreground">
                Formal statutory notice citing ERISA § 503, demanding immediate withdrawal of retroactive criteria and adjudication under baseline policy terms.
              </DialogDescription>
            </DialogHeader>

            {/* Scrollable Document Body */}
            <div className="flex-1 overflow-y-auto p-6 text-xs leading-relaxed text-foreground font-sans space-y-4 bg-background/50 select-text">
              <div className="rounded-lg border border-border/80 bg-card p-4 font-mono text-[11px] whitespace-pre-wrap leading-normal text-muted-foreground select-text">
                {latestDrift.erisaNoticeDraft}
              </div>
            </div>

            {/* Footer Action Controls */}
            <div className="p-3 px-6 border-t border-border/80 bg-muted/20 flex items-center justify-between gap-3">
              <span className="text-[11px] text-muted-foreground font-mono">
                Statutory Authority: 29 U.S.C. § 1133 & 29 CFR § 2560.503-1(h)(2)(iii)
              </span>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleCopy(latestDrift.erisaNoticeDraft || "", "notice")}
                  className="text-xs gap-1.5"
                >
                  {copiedNotice ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
                  <span>{copiedNotice ? "Copied!" : "Copy Notice Text"}</span>
                </Button>

                <Button
                  size="sm"
                  onClick={handleAppendToAppeal}
                  disabled={isAppendingNotice}
                  className="text-xs gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
                >
                  {isAppendingNotice ? (
                    <CircleNotch className="size-3.5 animate-spin" />
                  ) : (
                    <ArrowRight className="size-3.5" />
                  )}
                  <span>Append to Appeal Brief</span>
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};
