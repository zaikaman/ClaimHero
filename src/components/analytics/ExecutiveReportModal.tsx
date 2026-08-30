import React, { useState } from "react";
import {
  Printer,
  Copy,
  Check,
  DownloadSimple,
  ChartPieSlice,
  Clock,
  X,
} from "@phosphor-icons/react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "../ui/dialog";
import { Button } from "../ui/button";
import { formatCurrency } from "../../lib/utils";

interface PayerStatItem {
  payer: string;
  totalClaims: number;
  totalDisputed: number;
  wonCount: number;
  wonAmount: number;
  averageScore: number;
}

interface PortfolioAnalyticsStats {
  totalClaims: number;
  totalDisputedAmount: number;
  overturnedWonAmount: number;
  recoveryRatePercent: number;
  averageWinScore: number;
  criticalDeadlinesCount: number;
  urgentDeadlinesCount: number;
  payerBreakdown: PayerStatItem[];
}

interface ExecutiveReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  stats: PortfolioAnalyticsStats;
}

export const ExecutiveReportModal: React.FC<ExecutiveReportModalProps> = ({
  isOpen,
  onClose,
  stats,
}) => {
  const [copied, setCopied] = useState(false);

  const reportDate = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const generateReportPlainText = () => {
    const lines: string[] = [];
    lines.push("================================================================================");
    lines.push("CLAIMHERO MEDICAL APPELLATE SENTINEL - EXECUTIVE AUDIT STATEMENT");
    lines.push(`Report Date: ${reportDate} | Statutory Standard: ERISA 29 CFR § 2560.503-1`);
    lines.push("================================================================================");
    lines.push("");
    lines.push("1. EXECUTIVE FINANCIAL RECOVERY METRICS");
    lines.push("--------------------------------------------------------------------------------");
    lines.push(`- Total Disputed Clinical Pipeline:  ${formatCurrency(stats.totalDisputedAmount)} (${stats.totalClaims} cases)`);
    lines.push(`- Overturned / Won Benefit Yield:     ${formatCurrency(stats.overturnedWonAmount)} (${stats.recoveryRatePercent}% net recovery)`);
    lines.push(`- Portfolio Average Overturn Score:   ${stats.averageWinScore}%`);
    lines.push(`- Critical Statutory Alarms (<14d):   ${stats.criticalDeadlinesCount} active claims`);
    lines.push("");
    lines.push("2. INSURER ACCOUNTABILITY & PERFORMANCE BREAKDOWN");
    lines.push("--------------------------------------------------------------------------------");
    lines.push("Insurer / Payer               | Cases | Total Disputed | Recovered (Won) | Win % | Avg Score");
    lines.push("--------------------------------------------------------------------------------");
    stats.payerBreakdown.forEach((p) => {
      const winRate = Math.round((p.wonCount / (p.totalClaims || 1)) * 100);
      const payerName = p.payer.padEnd(29, " ").slice(0, 29);
      const count = String(p.totalClaims).padStart(5, " ");
      const disputed = formatCurrency(p.totalDisputed).padStart(14, " ");
      const won = formatCurrency(p.wonAmount).padStart(15, " ");
      const winStr = `${winRate}%`.padStart(5, " ");
      const score = `${p.averageScore}%`.padStart(9, " ");
      lines.push(`${payerName} | ${count} | ${disputed} | ${won} | ${winStr} | ${score}`);
    });
    lines.push("");
    lines.push("3. STATUTORY ERISA 180-DAY DEADLINE EXPOSURE (29 CFR § 2560.503-1)");
    lines.push("--------------------------------------------------------------------------------");
    lines.push(`- Immediate Action (<14 Days):  ${stats.criticalDeadlinesCount} claims at risk of forfeiture`);
    lines.push(`- Urgent Review (15-30 Days):   ${stats.urgentDeadlinesCount} claims in escalation posture`);
    lines.push(`- Standard Review (31-180 Days): ${Math.max(0, stats.totalClaims - stats.criticalDeadlinesCount - stats.urgentDeadlinesCount)} claims active`);
    lines.push("");
    lines.push("================================================================================");
    lines.push("AUDIT SIGN-OFF & ATTESTATION");
    lines.push("This executive statement is compiled from immutable ledger logs in ClaimHero Sentinel.");
    lines.push(`Verification Key: CH-${stats.totalClaims}-${stats.averageWinScore}-ERISA`);
    lines.push("================================================================================");
    return lines.join("\n");
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generateReportPlainText());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadCsv = () => {
    const headers = [
      "Payer / Insurer",
      "Active Cases",
      "Total Disputed ($)",
      "Overturned Won ($)",
      "Win Rate (%)",
      "Average Overturn Score (%)",
    ];

    const rows = stats.payerBreakdown.map((p) => [
      `"${p.payer.replace(/"/g, '""')}"`,
      p.totalClaims,
      p.totalDisputed.toFixed(2),
      p.wonAmount.toFixed(2),
      Math.round((p.wonCount / (p.totalClaims || 1)) * 100),
      p.averageScore,
    ]);

    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `claimhero-executive-payer-report-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="max-w-4xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden font-sans border-border bg-card shadow-2xl"
      >
        {/* Header Toolbar */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-muted/40 no-print">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <ChartPieSlice className="size-4" />
            </div>
            <div>
              <DialogTitle className="text-sm font-semibold text-foreground">
                Executive Portfolio & Appellate Audit Statement
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Live practice management reconciliation & insurer overturn report
              </DialogDescription>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopy}
              className="gap-1.5 text-xs h-8"
            >
              {copied ? (
                <>
                  <Check className="size-3.5 text-emerald-500" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="size-3.5" />
                  <span>Copy Text</span>
                </>
              )}
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadCsv}
              className="gap-1.5 text-xs h-8"
            >
              <DownloadSimple className="size-3.5" />
              <span>Export CSV</span>
            </Button>

            <Button
              size="sm"
              onClick={handlePrint}
              className="gap-1.5 text-xs h-8 bg-primary text-primary-foreground shadow-xs"
            >
              <Printer className="size-3.5" />
              <span>Print Report</span>
            </Button>

            <div className="h-4 w-px bg-border/80 mx-0.5" />

            <button
              onClick={onClose}
              className="size-8 flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              title="Close modal"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Printable Executive Document Body */}
        <div className="printable-dossier-scroll-area flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-900/40">
          <div className="printable-dossier max-w-4xl mx-auto bg-white text-slate-900 border border-slate-300 rounded-lg p-6 sm:p-8 shadow-lg font-sans space-y-6">
            {/* Formal Letterhead */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b-2 border-slate-900">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-base tracking-tight text-slate-950 font-serif">
                    CLAIMHERO™ MEDICAL APPELLATE SENTINEL
                  </span>
                  <span className="text-[10px] font-mono font-bold uppercase px-1.5 py-0.5 border border-slate-300 rounded bg-slate-100 text-slate-700">
                    CONFIDENTIAL AUDIT
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-1">
                  Executive Portfolio Recovery & Statutory ERISA Compliance Statement
                </p>
              </div>

              <div className="text-left sm:text-right font-mono text-xs text-slate-600">
                <div>Report Date: <span className="font-bold text-slate-950">{reportDate}</span></div>
                <div>Standard: <span className="font-bold text-slate-950">29 CFR § 2560.503-1</span></div>
              </div>
            </div>

            {/* Key Executive KPI Grid */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2.5 font-mono">
                1. Executive Financial Summary
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded border border-slate-300 bg-slate-50">
                  <div className="text-[10px] font-mono uppercase font-bold text-slate-500">Total Disputed Pipeline</div>
                  <div className="text-xl font-bold font-mono text-slate-950 mt-1">
                    {formatCurrency(stats.totalDisputedAmount)}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">{stats.totalClaims} active cases</div>
                </div>

                <div className="p-3 rounded border border-emerald-300 bg-emerald-50">
                  <div className="text-[10px] font-mono uppercase font-bold text-emerald-800">Overturned / Won Yield</div>
                  <div className="text-xl font-bold font-mono text-emerald-700 mt-1">
                    {formatCurrency(stats.overturnedWonAmount)}
                  </div>
                  <div className="text-[10px] text-emerald-800 mt-0.5 font-medium">{stats.recoveryRatePercent}% net recovery</div>
                </div>

                <div className="p-3 rounded border border-slate-300 bg-slate-50">
                  <div className="text-[10px] font-mono uppercase font-bold text-slate-500">Average Overturn Score</div>
                  <div className="text-xl font-bold font-mono text-blue-700 mt-1">
                    {stats.averageWinScore}%
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">4-Pillar clinical rubric</div>
                </div>

                <div className="p-3 rounded border border-red-300 bg-red-50">
                  <div className="text-[10px] font-mono uppercase font-bold text-red-800">Critical ERISA Alarms</div>
                  <div className="text-xl font-bold font-mono text-red-700 mt-1">
                    {stats.criticalDeadlinesCount}
                  </div>
                  <div className="text-[10px] text-red-800 mt-0.5 font-medium">&lt;14 days remaining</div>
                </div>
              </div>
            </div>

            {/* Insurer Performance Table */}
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 font-mono">
                  2. Insurer Accountability & Overturn Performance Breakdown
                </h3>
                <span className="text-[11px] font-mono text-slate-500">
                  {stats.payerBreakdown.length} Payers Tracked
                </span>
              </div>

              <div className="border border-slate-300 rounded overflow-hidden">
                <table className="w-full text-xs text-left border-collapse font-mono">
                  <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-300">
                    <tr>
                      <th className="p-2.5 border-r border-slate-300 font-sans">Insurer / Payer</th>
                      <th className="p-2.5 border-r border-slate-300 text-center">Volume</th>
                      <th className="p-2.5 border-r border-slate-300 text-right">Total Disputed</th>
                      <th className="p-2.5 border-r border-slate-300 text-right">Recovered (Won)</th>
                      <th className="p-2.5 border-r border-slate-300 text-center">Win Rate</th>
                      <th className="p-2.5 text-center">Avg Score</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {stats.payerBreakdown.map((payer) => (
                      <tr key={payer.payer} className="hover:bg-slate-50">
                        <td className="p-2.5 border-r border-slate-200 font-sans font-semibold text-slate-950">
                          {payer.payer}
                        </td>
                        <td className="p-2.5 border-r border-slate-200 text-center text-slate-700">
                          {payer.totalClaims}
                        </td>
                        <td className="p-2.5 border-r border-slate-200 text-right text-slate-950 font-bold">
                          {formatCurrency(payer.totalDisputed)}
                        </td>
                        <td className="p-2.5 border-r border-slate-200 text-right text-emerald-700 font-bold">
                          {formatCurrency(payer.wonAmount)}
                        </td>
                        <td className="p-2.5 border-r border-slate-200 text-center">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              payer.wonCount > 0
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {Math.round((payer.wonCount / (payer.totalClaims || 1)) * 100)}%
                          </span>
                        </td>
                        <td className="p-2.5 text-center font-bold text-slate-950">
                          {payer.averageScore}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Statutory ERISA 180-Day Risk Exposure */}
            <div className="p-4 rounded border border-slate-300 bg-slate-50 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 font-mono flex items-center gap-1.5">
                <Clock className="size-4 text-amber-600" />
                <span>3. Statutory 180-Day ERISA Urgency Exposure</span>
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed font-sans">
                Pursuant to <strong className="text-slate-900">29 CFR § 2560.503-1(h)(2)(i)</strong>, adverse benefit determinations expire precisely 180 days from the initial denial notice. Failure to dispatch formal appeal briefs or petition for external review before expiration forfeits civil recovery rights under ERISA § 502(a)(1)(B).
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                <div className="p-2.5 rounded bg-white border border-red-200">
                  <div className="text-[10px] font-mono text-slate-500">Immediate Action (&lt;14 Days)</div>
                  <div className="text-base font-bold font-mono text-red-700 mt-0.5">
                    {stats.criticalDeadlinesCount} Claims
                  </div>
                </div>
                <div className="p-2.5 rounded bg-white border border-amber-200">
                  <div className="text-[10px] font-mono text-slate-500">Urgent Review (15-30 Days)</div>
                  <div className="text-base font-bold font-mono text-amber-700 mt-0.5">
                    {stats.urgentDeadlinesCount} Claims
                  </div>
                </div>
                <div className="p-2.5 rounded bg-white border border-slate-200">
                  <div className="text-[10px] font-mono text-slate-500">Standard Review (31-180 Days)</div>
                  <div className="text-base font-bold font-mono text-slate-950 mt-0.5">
                    {Math.max(0, stats.totalClaims - stats.criticalDeadlinesCount - stats.urgentDeadlinesCount)} Claims
                  </div>
                </div>
              </div>
            </div>

            {/* Governance & Certification Footer */}
            <div className="pt-3 border-t-2 border-slate-900 flex flex-col sm:flex-row items-center justify-between gap-2 text-[10px] text-slate-500 font-mono">
              <div>ClaimHero Sentinel Autonomous Governance</div>
              <div>Verification Key: CH-{stats.totalClaims}-{stats.averageWinScore}-ERISA</div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
