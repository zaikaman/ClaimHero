import React, { useState, useEffect } from "react";
import {
  Shield,
  CheckCircle2,
  Circle,
  ChevronDown,
  ChevronUp,
  Sparkles,
  ArrowRight,
  X,
  FileSearch,
  FileText,
  Mail,
  Zap,
  Award,
} from "lucide-react";
import confetti from "canvas-confetti";
import { NavigationView } from "../layout/Sidebar";
import { Claim } from "../../types";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Progress } from "../ui/progress";

interface OnboardingChecklistProps {
  currentView: NavigationView;
  onNavigate: (view: NavigationView) => void;
  claims: Claim[];
  onOpenIngestion: () => void;
}

export const OnboardingChecklist: React.FC<OnboardingChecklistProps> = ({
  currentView,
  onNavigate,
  claims,
  onOpenIngestion,
}) => {
  const [isMinimized, setIsMinimized] = useState<boolean>(false);
  const [isDismissed, setIsDismissed] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("claimhero_checklist_dismissed") === "true";
    }
    return false;
  });

  const [hasVisitedEvidence, setHasVisitedEvidence] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("claimhero_visited_evidence") === "true";
    }
    return false;
  });

  const [hasVisitedStudio, setHasVisitedStudio] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("claimhero_visited_studio") === "true";
    }
    return false;
  });

  const [hasVisitedCommunications, setHasVisitedCommunications] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("claimhero_visited_comms") === "true";
    }
    return false;
  });

  // Track page visits to automatically check items
  useEffect(() => {
    if (currentView === "evidence" && !hasVisitedEvidence) {
      setHasVisitedEvidence(true);
      localStorage.setItem("claimhero_visited_evidence", "true");
    }
    if (currentView === "studio" && !hasVisitedStudio) {
      setHasVisitedStudio(true);
      localStorage.setItem("claimhero_visited_studio", "true");
    }
    if (currentView === "communications" && !hasVisitedCommunications) {
      setHasVisitedCommunications(true);
      localStorage.setItem("claimhero_visited_comms", "true");
    }
  }, [currentView, hasVisitedEvidence, hasVisitedStudio, hasVisitedCommunications]);

  // Tasks definitions
  const tasks = [
    {
      id: "ingest",
      title: "Ingest First Denial Letter",
      description: "Upload a PDF or load a high-value sample case into Radar.",
      isDone: claims.length > 0,
      icon: Zap,
      actionLabel: "Ingest Case",
      onClick: onOpenIngestion,
    },
    {
      id: "evidence",
      title: "Inspect Clinical Policy Precedents",
      description: "Review crawled insurer CPB clauses and calculate overturn score.",
      isDone: hasVisitedEvidence,
      icon: FileSearch,
      actionLabel: "View Matrix",
      onClick: () => onNavigate("evidence"),
    },
    {
      id: "studio",
      title: "Synthesize ERISA Appeal Brief",
      description: "Review statutory legal arguments and cited medical clauses.",
      isDone: hasVisitedStudio,
      icon: FileText,
      actionLabel: "Open Studio",
      onClick: () => onNavigate("studio"),
    },
    {
      id: "dispatch",
      title: "Review AgentMail Payer Inbox",
      description: "Inspect dedicated claim email gateway and audit timeline.",
      isDone: hasVisitedCommunications,
      icon: Mail,
      actionLabel: "Open Inbox",
      onClick: () => onNavigate("communications"),
    },
  ];

  const completedCount = tasks.filter((t) => t.isDone).length;
  const isAllDone = completedCount === tasks.length;
  const progressPercent = Math.round((completedCount / tasks.length) * 100);

  const [hasCelebrated, setHasCelebrated] = useState(false);
  useEffect(() => {
    if (isAllDone && !hasCelebrated) {
      confetti({
        particleCount: 100,
        spread: 80,
        origin: { y: 0.7, x: 0.85 },
        colors: ["#00e5ff", "#10b981", "#fbbf24"],
      });
      setHasCelebrated(true);
    }
  }, [isAllDone, hasCelebrated]);

  if (isDismissed) return null;

  // Minimized Floating Button
  if (isMinimized) {
    return (
      <div className="fixed bottom-5 right-5 z-40 animate-fadeIn">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsMinimized(false)}
          className="shadow-xl bg-card/95 border-border backdrop-blur-md gap-2 h-9 px-3 text-xs"
        >
          <Sparkles className="size-3.5 text-primary" />
          <span className="font-medium text-foreground">
            Sentinel Checklist
          </span>
          <Badge variant="secondary" className="font-mono text-[10px] h-4.5 px-1.5">
            {completedCount}/{tasks.length}
          </Badge>
          <ChevronUp className="size-3.5 text-muted-foreground ml-0.5" />
        </Button>
      </div>
    );
  }

  return (
    <Card className="fixed bottom-5 right-5 z-40 w-[340px] sm:w-[370px] bg-card/95 border-border shadow-2xl backdrop-blur-md overflow-hidden text-left p-0 animate-blur-fade-up">
      
      {/* Header Bar */}
      <div className="p-3.5 pb-2.5 border-b border-border/70 flex items-center justify-between bg-muted/20">
        <div className="flex items-center gap-2.5">
          <div className="size-6 rounded-md bg-primary/10 text-primary border border-primary/20 flex items-center justify-center">
            {isAllDone ? (
              <Award className="size-3.5 text-amber-500" />
            ) : (
              <Shield className="size-3.5" />
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-foreground">
              Sentinel Onboarding
            </span>
            <Badge variant="outline" className="font-mono text-[10px] h-4.5 px-1.5">
              {completedCount}/{tasks.length}
            </Badge>
          </div>
        </div>

        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => setIsMinimized(true)}
            className="text-muted-foreground hover:text-foreground"
            title="Minimize checklist"
          >
            <ChevronDown className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => {
              setIsDismissed(true);
              localStorage.setItem("claimhero_checklist_dismissed", "true");
            }}
            className="text-muted-foreground hover:text-foreground"
            title="Dismiss checklist"
          >
            <X className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="px-3.5 pt-2.5 pb-1">
        <Progress value={progressPercent} className="h-1.5" />
      </div>

      {/* Task List */}
      <div className="p-3.5 space-y-2 max-h-[280px] overflow-y-auto">
        {tasks.map((task) => {
          const Icon = task.icon;
          return (
            <div
              key={task.id}
              className={`p-2.5 rounded-lg border transition-all ${
                task.isDone
                  ? "bg-emerald-500/5 border-emerald-500/20 text-muted-foreground"
                  : "bg-muted/20 border-border hover:bg-muted/40 text-foreground"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2.5">
                  <div className="mt-0.5 shrink-0">
                    {task.isDone ? (
                      <CheckCircle2 className="size-4 text-emerald-500" />
                    ) : (
                      <Circle className="size-4 text-muted-foreground/60" />
                    )}
                  </div>
                  <div className="space-y-0.5">
                    <div
                      className={`text-xs font-medium flex items-center gap-1.5 ${
                        task.isDone ? "line-through text-muted-foreground" : "text-foreground"
                      }`}
                    >
                      <Icon className="size-3 text-primary shrink-0" />
                      <span>{task.title}</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground font-light leading-tight">
                      {task.description}
                    </p>
                  </div>
                </div>

                {!task.isDone && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={task.onClick}
                    className="shrink-0 h-6 px-2 text-[10px] font-mono gap-1 border-primary/30 text-primary hover:bg-primary/10"
                  >
                    <span>{task.actionLabel}</span>
                    <ArrowRight className="size-2.5" />
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer / All Done Celebration Banner */}
      {isAllDone && (
        <div className="p-3 bg-emerald-500/10 border-t border-emerald-500/20 text-center space-y-1">
          <div className="text-xs font-semibold text-emerald-500 flex items-center justify-center gap-1.5">
            <Sparkles className="size-3.5 text-amber-500" />
            <span>Sentinel Readiness: 100% Certified</span>
          </div>
          <p className="text-[10px] text-muted-foreground">
            You are ready to autonomously defend claims and overturn health insurance denials.
          </p>
        </div>
      )}
    </Card>
  );
};
