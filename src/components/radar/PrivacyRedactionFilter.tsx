import React, { useState, useMemo } from "react";
import {
  ShieldCheck,
  ShieldWarning,
  Eye,
  EyeSlash,
  ArrowsLeftRight,
  Plus,
  Trash,
  Check,
  ArrowRight,
  Lock,
  FileText,
  Info,
} from "@phosphor-icons/react";
import {
  ComplianceStandard,
  PII_CATEGORY_CONFIG,
  PiiCategory,
  detectPiiEntities,
  applyRedaction,
} from "../../lib/redactionEngine";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../ui/tabs";
import { Input } from "../ui/input";
import { cn } from "../../lib/utils";

export interface PrivacyRedactionFilterProps {
  originalText: string;
  patientName?: string;
  onApplyRedaction: (
    sanitizedText: string,
    metadata: {
      mode: ComplianceStandard;
      count: number;
      categories: string[];
    }
  ) => void;
  onCancel?: () => void;
  className?: string;
}

export const PrivacyRedactionFilter: React.FC<PrivacyRedactionFilterProps> = ({
  originalText,
  patientName,
  onApplyRedaction,
  onCancel,
  className,
}) => {
  const [standard, setStandard] = useState<ComplianceStandard>("HIPAA_SAFE_HARBOR");
  const [viewMode, setViewMode] = useState<"matrix" | "diff" | "preview">("matrix");
  const [customTerms, setCustomTerms] = useState<string[]>([]);
  const [newCustomTerm, setNewCustomTerm] = useState("");
  const [disabledEntityIds, setDisabledEntityIds] = useState<Set<string>>(new Set());

  // Detect entities whenever standard, custom terms, or original text changes
  const detectedEntities = useMemo(() => {
    return detectPiiEntities(originalText, {
      standard,
      customTerms,
      patientName,
      disabledEntityIds: Array.from(disabledEntityIds),
    });
  }, [originalText, standard, customTerms, patientName, disabledEntityIds]);

  // Compute live redaction result
  const redactionResult = useMemo(() => {
    return applyRedaction(originalText, detectedEntities, standard);
  }, [originalText, detectedEntities, standard]);

  // Sync disabled entities if mode changes
  const handleStandardChange = (newStd: ComplianceStandard) => {
    setStandard(newStd);
    setDisabledEntityIds(new Set()); // Reset overrides on preset change
  };

  const handleToggleEntity = (entityId: string) => {
    setDisabledEntityIds((prev) => {
      const next = new Set(prev);
      if (next.has(entityId)) {
        next.delete(entityId);
      } else {
        next.add(entityId);
      }
      return next;
    });
    if (standard !== "CUSTOM") {
      setStandard("CUSTOM");
    }
  };

  const handleSelectAll = () => {
    setDisabledEntityIds(new Set());
  };

  const handleDeselectAll = () => {
    setDisabledEntityIds(new Set(detectedEntities.map((e) => e.id)));
    setStandard("CUSTOM");
  };

  const handleAddCustomTerm = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = newCustomTerm.trim();
    if (clean && clean.length >= 2 && !customTerms.includes(clean)) {
      setCustomTerms((prev) => [...prev, clean]);
      setNewCustomTerm("");
      setStandard("CUSTOM");
    }
  };

  const handleRemoveCustomTerm = (termToRemove: string) => {
    setCustomTerms((prev) => prev.filter((t) => t !== termToRemove));
  };

  const handleConfirm = () => {
    const activeCategories = Array.from(
      new Set(detectedEntities.filter((e) => e.isEnabled).map((e) => e.category))
    );
    onApplyRedaction(redactionResult.sanitizedText, {
      mode: standard,
      count: redactionResult.stats.redactedCount,
      categories: activeCategories,
    });
  };

  return (
    <Card
      className={cn(
        "p-4 sm:p-5 space-y-4 border-cyan-500/30 bg-card/90 shadow-lg rounded-xl",
        className
      )}
    >
      {/* Header HUD */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/70 pb-3.5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-lg bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
              <ShieldCheck className="size-4" />
            </div>
            <h3 className="text-sm font-semibold text-foreground tracking-tight">
              HIPAA Automated Privacy Filter & Redaction Engine
            </h3>
            <Badge
              variant={redactionResult.isCertifiedSafe ? "default" : "destructive"}
              className="text-[10px] font-mono gap-1 px-2 py-0.5"
            >
              {redactionResult.isCertifiedSafe ? (
                <>
                  <Lock className="size-3 text-emerald-400" />
                  <span>45 CFR § 164.514(b) Compliant</span>
                </>
              ) : (
                <>
                  <ShieldWarning className="size-3 text-amber-300" />
                  <span>Custom Overrides Active</span>
                </>
              )}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Automatically scans, identifies, and masks Social Security Numbers, Member ID suffixes, Dates of Birth, and sensitive patient PII prior to persistent storage or exhibit generation.
          </p>
        </div>

        {/* Telemetry Counter Chips */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-1.5 text-center">
            <span className="text-[10px] text-muted-foreground block font-mono">Detected PII</span>
            <span className="font-mono text-sm font-bold text-foreground">
              {redactionResult.stats.totalEntities}
            </span>
          </div>
          <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-center">
            <span className="text-[10px] text-cyan-400 block font-mono">Masked</span>
            <span className="font-mono text-sm font-bold text-cyan-300">
              {redactionResult.stats.redactedCount}
            </span>
          </div>
        </div>
      </div>

      {/* Compliance Presets & Strategy Selector */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-foreground uppercase tracking-wider text-[11px]">
            Redaction Policy Preset
          </span>
          <span className="text-[11px] text-muted-foreground font-mono">
            {standard === "HIPAA_SAFE_HARBOR" && "Standard Safe Harbor: Masks all 18 direct identifiers"}
            {standard === "BALANCED_APPELLATE" && "Appellate Mode: Preserves claim routing while masking high-risk SSN & Suffix"}
            {standard === "PUBLIC_EXHIBIT" && "Public Exhibit: Irreversible total de-identification for public precedents"}
            {standard === "CUSTOM" && "Custom Strategy: User-configured entity overrides"}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <button
            type="button"
            onClick={() => handleStandardChange("HIPAA_SAFE_HARBOR")}
            className={cn(
              "flex flex-col items-start p-2.5 rounded-lg border text-left transition-all",
              standard === "HIPAA_SAFE_HARBOR"
                ? "bg-cyan-500/15 border-cyan-500/60 text-foreground shadow-xs"
                : "bg-muted/30 border-border text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            )}
          >
            <span className="text-xs font-semibold">Safe Harbor</span>
            <span className="text-[10px] text-muted-foreground leading-tight mt-0.5">
              45 CFR § 164.514(b)
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleStandardChange("BALANCED_APPELLATE")}
            className={cn(
              "flex flex-col items-start p-2.5 rounded-lg border text-left transition-all",
              standard === "BALANCED_APPELLATE"
                ? "bg-cyan-500/15 border-cyan-500/60 text-foreground shadow-xs"
                : "bg-muted/30 border-border text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            )}
          >
            <span className="text-xs font-semibold">Appellate Payer</span>
            <span className="text-[10px] text-muted-foreground leading-tight mt-0.5">
              Masks Suffix & SSN-4
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleStandardChange("PUBLIC_EXHIBIT")}
            className={cn(
              "flex flex-col items-start p-2.5 rounded-lg border text-left transition-all",
              standard === "PUBLIC_EXHIBIT"
                ? "bg-cyan-500/15 border-cyan-500/60 text-foreground shadow-xs"
                : "bg-muted/30 border-border text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            )}
          >
            <span className="text-xs font-semibold">Public Exhibit</span>
            <span className="text-[10px] text-muted-foreground leading-tight mt-0.5">
              Court / Precedent Anonymized
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleStandardChange("CUSTOM")}
            className={cn(
              "flex flex-col items-start p-2.5 rounded-lg border text-left transition-all",
              standard === "CUSTOM"
                ? "bg-cyan-500/15 border-cyan-500/60 text-foreground shadow-xs"
                : "bg-muted/30 border-border text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            )}
          >
            <span className="text-xs font-semibold">Custom Overrides</span>
            <span className="text-[10px] text-muted-foreground leading-tight mt-0.5">
              Selective Entity Toggles
            </span>
          </button>
        </div>
      </div>

      {/* Category Breakdown Badges */}
      <div className="flex flex-wrap items-center gap-1.5 pt-1">
        <span className="text-[11px] font-medium text-muted-foreground mr-1">Detected Categories:</span>
        {(Object.keys(redactionResult.stats.byCategory) as PiiCategory[]).map((cat) => {
          const count = detectedEntities.filter((e) => e.category === cat).length;
          if (count === 0) return null;
          const config = PII_CATEGORY_CONFIG[cat];
          const activeCount = redactionResult.stats.byCategory[cat] || 0;
          return (
            <Badge
              key={cat}
              variant="outline"
              className={cn(
                "text-[10px] font-mono gap-1",
                activeCount > 0
                  ? "border-cyan-500/40 text-cyan-300 bg-cyan-500/10"
                  : "border-border/50 text-muted-foreground opacity-50"
              )}
            >
              <span>{config.label}</span>
              <span className="font-bold">({activeCount}/{count})</span>
            </Badge>
          );
        })}
        {detectedEntities.length === 0 && (
          <span className="text-xs text-emerald-400 font-medium flex items-center gap-1">
            <Check className="size-3.5" />
            No sensitive direct identifiers found in source text
          </span>
        )}
      </div>

      {/* View Tabs: Matrix, Side-by-Side Diff, Preview */}
      <Tabs value={viewMode} onValueChange={(v: any) => setViewMode(v)}>
        <div className="flex items-center justify-between border-b border-border/70 pb-2">
          <TabsList variant="line" className="h-8">
            <TabsTrigger value="matrix" className="gap-1.5 text-xs py-1">
              <Eye className="size-3.5" />
              <span>Interactive Entity Matrix ({detectedEntities.length})</span>
            </TabsTrigger>
            <TabsTrigger value="diff" className="gap-1.5 text-xs py-1">
              <ArrowsLeftRight className="size-3.5" />
              <span>Side-by-Side Highlight Diff</span>
            </TabsTrigger>
            <TabsTrigger value="preview" className="gap-1.5 text-xs py-1">
              <FileText className="size-3.5" />
              <span>Sanitized Output Preview</span>
            </TabsTrigger>
          </TabsList>

          {viewMode === "matrix" && detectedEntities.length > 0 && (
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSelectAll}
                className="h-7 text-[11px] px-2 text-muted-foreground hover:text-foreground"
              >
                Mask All
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDeselectAll}
                className="h-7 text-[11px] px-2 text-muted-foreground hover:text-foreground"
              >
                Deselect All
              </Button>
            </div>
          )}
        </div>

        {/* Tab 1: Interactive Entity Matrix */}
        <TabsContent value="matrix" className="space-y-3 pt-2">
          {detectedEntities.length > 0 ? (
            <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
              {detectedEntities.map((entity) => {
                const config = PII_CATEGORY_CONFIG[entity.category];
                return (
                  <div
                    key={entity.id}
                    onClick={() => handleToggleEntity(entity.id)}
                    className={cn(
                      "flex items-center justify-between gap-3 p-2.5 rounded-lg border transition-all cursor-pointer select-none",
                      entity.isEnabled
                        ? "bg-cyan-500/10 border-cyan-500/40 text-foreground"
                        : "bg-muted/20 border-border/70 text-muted-foreground opacity-60 hover:opacity-80"
                    )}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={cn(
                          "size-4 rounded border flex items-center justify-center shrink-0 transition-colors",
                          entity.isEnabled
                            ? "bg-cyan-500 border-cyan-400 text-black"
                            : "border-border bg-background"
                        )}
                      >
                        {entity.isEnabled && <Check className="size-3 stroke-[3]" />}
                      </div>

                      <div className="space-y-0.5 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="text-[10px] font-mono shrink-0 px-1.5 py-0">
                            {config.label}
                          </Badge>
                          <span className="font-mono text-xs font-semibold text-destructive line-through truncate max-w-[180px]">
                            {entity.originalText}
                          </span>
                          <span className="text-muted-foreground text-[10px]">&rarr;</span>
                          <span className="font-mono text-xs font-semibold text-cyan-400 truncate max-w-[180px]">
                            {entity.maskedText}
                          </span>
                        </div>
                        <div className="text-[10px] text-muted-foreground flex items-center gap-1.5">
                          <span className="truncate">{entity.rule}</span>
                          <span>•</span>
                          <span className="truncate text-muted-foreground/80">{entity.hipaaCategory}</span>
                        </div>
                      </div>
                    </div>

                    <Badge
                      variant={entity.isEnabled ? "default" : "outline"}
                      className="text-[10px] font-mono shrink-0 px-1.5 py-0"
                    >
                      {entity.isEnabled ? "Mask Active" : "Preserved"}
                    </Badge>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-lg border border-border/80 bg-muted/20 p-6 text-center text-xs text-muted-foreground space-y-1">
              <ShieldCheck className="mx-auto size-7 text-emerald-400" />
              <p className="font-semibold text-foreground">No Direct PII Identifiers Detected</p>
              <p className="text-[11px]">
                The document text does not contain explicit SSNs, Member ID suffixes, or DOB patterns. You can add custom terms below if needed.
              </p>
            </div>
          )}

          {/* Custom Term Addition Form */}
          <form onSubmit={handleAddCustomTerm} className="flex items-center gap-2 pt-2 border-t border-border/50">
            <Input
              value={newCustomTerm}
              onChange={(e) => setNewCustomTerm(e.target.value)}
              placeholder="Add custom sensitive phrase to redact (e.g. clinic name, employer, relative)..."
              className="h-8 text-xs font-sans"
            />
            <Button
              type="submit"
              variant="outline"
              size="sm"
              disabled={!newCustomTerm.trim() || newCustomTerm.trim().length < 2}
              className="h-8 text-xs gap-1 shrink-0"
            >
              <Plus className="size-3.5" />
              <span>Add Filter</span>
            </Button>
          </form>

          {/* Custom Terms Tags */}
          {customTerms.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[11px] text-muted-foreground">Custom Terms:</span>
              {customTerms.map((term) => (
                <Badge
                  key={term}
                  variant="secondary"
                  className="gap-1 text-[10px] font-mono py-0.5 pr-1"
                >
                  <span>{term}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveCustomTerm(term)}
                    className="hover:text-destructive transition-colors ml-0.5"
                  >
                    <Trash className="size-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Tab 2: Side-by-Side Live Highlight Diff */}
        <TabsContent value="diff" className="space-y-2 pt-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span className="font-semibold text-destructive">Original Ingestion Text (Raw PHI)</span>
                <EyeSlash className="size-3.5 text-destructive" />
              </div>
              <div className="max-h-60 overflow-y-auto rounded-lg border border-destructive/30 bg-destructive/5 p-3 font-mono text-xs whitespace-pre-wrap leading-relaxed text-muted-foreground select-text">
                {originalText || "No text provided"}
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span className="font-semibold text-cyan-400">Sanitized HIPAA Output (Masked)</span>
                <ShieldCheck className="size-3.5 text-cyan-400" />
              </div>
              <div className="max-h-60 overflow-y-auto rounded-lg border border-cyan-500/30 bg-cyan-500/5 p-3 font-mono text-xs whitespace-pre-wrap leading-relaxed text-foreground select-text">
                {redactionResult.sanitizedText || "No text provided"}
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Tab 3: Sanitized Document Preview */}
        <TabsContent value="preview" className="space-y-2 pt-2">
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Ready for persistent storage and brief synthesis:</span>
              <Badge variant="outline" className="font-mono text-[10px] text-emerald-400 border-emerald-500/30">
                {redactionResult.stats.redactedCount} Entities De-identified
              </Badge>
            </div>
            <div className="max-h-60 overflow-y-auto rounded-lg border border-border bg-muted/30 p-3 font-mono text-xs whitespace-pre-wrap leading-relaxed text-foreground select-text">
              {redactionResult.sanitizedText || "No text provided"}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Action Footer */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-2 border-t border-border/70 pt-3">
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Info className="size-3.5 shrink-0 text-cyan-400" />
          <span>
            {redactionResult.stats.redactedCount > 0
              ? `Applying ${redactionResult.stats.redactedCount} de-identification masks before storage.`
              : "No masks applied; raw text will be stored as ingested."}
          </span>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          {onCancel && (
            <Button
              variant="outline"
              size="sm"
              onClick={onCancel}
              className="text-xs h-8 px-3"
            >
              Cancel
            </Button>
          )}
          <Button
            size="sm"
            onClick={handleConfirm}
            className="text-xs h-8 px-3.5 gap-1.5 bg-cyan-600 hover:bg-cyan-500 text-white shadow-xs font-semibold"
          >
            <ShieldCheck className="size-3.5" />
            <span>Apply Redactions & Ingest</span>
            <ArrowRight className="size-3.5" />
          </Button>
        </div>
      </div>
    </Card>
  );
};
