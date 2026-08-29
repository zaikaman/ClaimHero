import React from "react";
import {
  FileMagnifyingGlass,
  FileText,
  Envelope,
  ArrowRight,
  PlusCircle,
  Shield,
  Sparkle,
} from "@phosphor-icons/react";
import { Claim } from "../../types";
import { formatCurrency, formatDate } from "../../lib/utils";
import { Card } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Avatar, AvatarFallback } from "../ui/avatar";

interface CasePickerEmptyStateProps {
  viewType: "evidence" | "studio" | "communications";
  claims: Claim[];
  onSelectClaim: (claimId: string) => void;
  onOpenIngestion: () => void;
  onNavigateToRadar: () => void;
}

const VIEW_META = {
  evidence: {
    title: "Clinical Evidence & Policy Matrix",
    subtitle: "Select an active claim below to cross-examine insurer Clinical Policy Bulletins (CPBs) and compute overturn win probabilities.",
    icon: FileMagnifyingGlass,
    actionText: "Inspect Evidence",
  },
  studio: {
    title: "Collaborative Appeal Studio",
    subtitle: "Select an active claim below to synthesize an ERISA 29 CFR § 2560.503-1 legal brief citing policy clauses and physician records.",
    icon: FileText,
    actionText: "Open Studio",
  },
  communications: {
    title: "Dedicated Payer Communications Inbox",
    subtitle: "Select an active claim below to monitor two-way transmissions and deliver appeal packets to the payer.",
    icon: Envelope,
    actionText: "View Inbox",
  },
};

export const CasePickerEmptyState: React.FC<CasePickerEmptyStateProps> = ({
  viewType,
  claims,
  onSelectClaim,
  onOpenIngestion,
  onNavigateToRadar,
}) => {
  const meta = VIEW_META[viewType];
  const IconComponent = meta.icon;

  return (
    <div className="space-y-6 max-w-5xl mx-auto py-6 animate-fadeIn font-sans">
      {/* Header Banner */}
      <Card className="p-6 text-center sm:text-left flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm shrink-0">
            <IconComponent className="size-6" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2 justify-center sm:justify-start">
              <h2 className="text-lg font-semibold text-foreground tracking-tight">
                {meta.title}
              </h2>
              <Badge variant="outline" className="font-mono text-[10px]">
                Case Context Required
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground max-w-xl leading-relaxed">
              {meta.subtitle}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={onNavigateToRadar}
            className="gap-1 text-xs"
          >
            <span>Case Radar</span>
            <ArrowRight className="size-3" />
          </Button>
          <Button
            size="sm"
            onClick={onOpenIngestion}
            className="gap-1.5 text-xs shadow-xs"
          >
            <PlusCircle className="size-3.5" />
            <span>Ingest New Claim</span>
          </Button>
        </div>
      </Card>

      {/* Available Claims Selection Grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-foreground uppercase tracking-wider font-mono">
              Available Active Claims ({claims.length})
            </span>
            <span className="text-[11px] text-muted-foreground">
              — Choose a case to load into {meta.title.split(" ")[0]} {meta.title.split(" ")[1]}
            </span>
          </div>
        </div>

        {claims.length === 0 ? (
          <Card className="p-12 text-center items-center justify-center space-y-4 bg-muted/20 border-dashed">
            <div className="size-12 rounded-2xl bg-muted flex items-center justify-center mx-auto text-muted-foreground">
              <Shield className="size-6" />
            </div>
            <div className="space-y-1 max-w-sm mx-auto">
              <h3 className="text-sm font-semibold text-foreground">
                No Medical Denial Claims Found
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Ingest a denial letter (PDF/image/text) or load a high-value sample case into ClaimHero to start analyzing evidence and generating appeals.
              </p>
            </div>
            <Button onClick={onOpenIngestion} className="gap-2 text-xs shadow-xs">
              <Sparkle className="size-3.5" />
              <span>Ingest First Denial Notice</span>
            </Button>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {claims.map((claim) => {
              const initials = claim.patient?.name
                ? claim.patient.name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase()
                : "PT";

              const isWon = claim.status === "won";
              const isUrgent = claim.daysRemaining <= 14 && !isWon;

              return (
                <Card
                  key={claim._id}
                  onClick={() => onSelectClaim(claim._id)}
                  className="p-4 bg-card hover:bg-muted/40 border-border hover:border-primary/40 cursor-pointer transition-all duration-150 flex flex-col justify-between group shadow-xs hover:shadow-sm"
                >
                  <div className="space-y-3">
                    {/* Header Row: Patient + Status */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Avatar size="sm" className="bg-primary/10 text-primary font-semibold shrink-0">
                          <AvatarFallback className="text-[11px] font-mono font-bold">
                            {initials}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <h4 className="font-semibold text-xs text-foreground truncate group-hover:text-primary transition-colors">
                            {claim.patient?.name || "Patient Record"}
                          </h4>
                          <span className="font-mono text-[10px] text-muted-foreground block truncate">
                            Claim #{claim.claimNumber}
                          </span>
                        </div>
                      </div>

                      <Badge
                        variant={isWon ? "secondary" : isUrgent ? "destructive" : "outline"}
                        className="text-[9px] font-mono shrink-0"
                      >
                        {isWon
                          ? "Won"
                          : isUrgent
                          ? `${claim.daysRemaining}d Left`
                          : claim.status.replace(/_/g, " ")}
                      </Badge>
                    </div>

                    {/* Insurer & Procedure Details */}
                    <div className="space-y-1.5 text-xs">
                      <div className="flex items-center justify-between text-muted-foreground">
                        <span className="text-[11px]">Payer:</span>
                        <span className="font-medium text-foreground truncate max-w-[140px]">
                          {claim.patient?.insurancePayer || "Insurer"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-muted-foreground">
                        <span className="text-[11px]">CPT Code:</span>
                        <Badge variant="secondary" className="font-mono text-[10px] h-4.5 px-1.5">
                          CPT {claim.cptCodes[0] || "27447"}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between text-muted-foreground">
                        <span className="text-[11px]">Disputed Amount:</span>
                        <span className="font-mono font-bold text-destructive text-xs">
                          {formatCurrency(claim.deniedAmount)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Action Footer */}
                  <div className="pt-3 mt-3 border-t border-border/60 flex items-center justify-between">
                    <span className="text-[10px] font-mono text-muted-foreground">
                      Service: {formatDate(claim.serviceDate)}
                    </span>
                    <Button
                      variant="ghost"
                      size="xs"
                      className="gap-1 text-[11px] font-medium text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-all"
                    >
                      <span>{meta.actionText}</span>
                      <ArrowRight className="size-2.5 group-hover:translate-x-0.5 transition-transform" />
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
