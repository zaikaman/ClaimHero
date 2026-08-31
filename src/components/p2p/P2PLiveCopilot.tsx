import React, { useState, useRef, useEffect } from "react";
import { Claim } from "../../types";
import { useLiveCallCopilot } from "../../hooks/useLiveCallCopilot";
import {
  PhoneCall,
  PhoneDisconnect,
  Microphone,
  Lightning,
  Sparkle,
  Copy,
  Check,
  ShieldCheck,
  Scales,
  Clock,
  SpeakerHigh,
  SpeakerSlash,
  Play,
  ArrowRight,
  Waveform,
  PaperPlaneRight,
  WarningCircle,
  Stethoscope,
  CircleNotch,
  ArrowCounterClockwise,
  ArrowsLeftRight,
  FileText,
} from "@phosphor-icons/react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Card } from "../ui/card";
import { cn } from "../../lib/utils";
import { P2PEncounterSummaryModal } from "./P2PEncounterSummaryModal";

interface P2PLiveCopilotProps {
  claim: Claim;
}

export const P2PLiveCopilot: React.FC<P2PLiveCopilotProps> = ({ claim }) => {
  const {
    session,
    isCallLive,
    activeSpeaker,
    setActiveSpeaker,
    callDuration,
    audioLevel,
    interimText,
    isGeneratingAnswer,
    isGeneratingPushback,
    isSimulating,
    isReviewerVoiceMuted,
    setIsReviewerVoiceMuted,
    simulationStepIndex,
    isWaitingForDoctor,
    activeFastAnswer,
    setActiveFastAnswer,
    isOverturned,
    authorizationNumber,
    callResolutionStage,
    startLiveCall,
    endLiveCall,
    appendTranscriptItem,
    toggleTranscriptSpeaker,
    startSimulation,
    respondToDoctorSpeech,
  } = useLiveCallCopilot(claim);

  const [manualInput, setManualInput] = useState<string>("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isSummaryModalOpen, setIsSummaryModalOpen] = useState<boolean>(false);
  const transcriptContainerRef = useRef<HTMLDivElement | null>(null);
  const prevTranscriptsLengthRef = useRef<number>(0);
  const userHasScrolledUpRef = useRef<boolean>(false);

  // Auto-scroll transcript container only once when a new message arrives (and never steal page scroll)
  useEffect(() => {
    const currentLength = session?.transcripts?.length || 0;
    if (currentLength > prevTranscriptsLengthRef.current) {
      if (!userHasScrolledUpRef.current && transcriptContainerRef.current) {
        transcriptContainerRef.current.scrollTo({
          top: transcriptContainerRef.current.scrollHeight,
          behavior: "smooth",
        });
      }
      prevTranscriptsLengthRef.current = currentLength;
    }
  }, [session?.transcripts]);

  // Keyboard shortcut to quickly toggle active speaker on live call ('S' key when not typing)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInputFocused =
        activeEl instanceof HTMLInputElement ||
        activeEl instanceof HTMLTextAreaElement ||
        activeEl?.getAttribute("contenteditable") === "true";

      if (isInputFocused) return;

      if (e.key === "s" || e.key === "S") {
        e.preventDefault();
        setActiveSpeaker(activeSpeaker === "physician" ? "insurer" : "physician");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeSpeaker, setActiveSpeaker]);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualInput.trim()) return;
    appendTranscriptItem(manualInput, activeSpeaker);
    setManualInput("");
  };

  const formatSeconds = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const transcripts = session?.transcripts || [];
  const fastAnswers = session?.fastAnswers || [];
  const checklist = session?.checklistProgress || [];
  const winScore = session?.winScore ?? 50;

  return (
    <div className="space-y-3 font-sans animate-fadeIn">
      {/* Live Call Control HUD */}
      <Card className="p-3.5 rounded-xl border-border/80 bg-card/75 backdrop-blur-xl shadow-md">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Left: Call State & Audio Waveform */}
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "size-10 rounded-lg flex items-center justify-center shrink-0 transition-all",
                isCallLive
                  ? "bg-destructive text-destructive-foreground animate-pulse shadow-sm shadow-destructive/30"
                  : "bg-primary/10 text-primary border border-primary/25"
              )}
            >
              {isCallLive ? <PhoneCall className="size-5" /> : <Microphone className="size-5" />}
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-foreground tracking-tight">
                  P2P Live Call Copilot (Clinical Defense Sentinel)
                </h2>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px] font-mono uppercase px-1.5 py-0.5",
                    isOverturned
                      ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-400 font-bold"
                      : isCallLive
                      ? "border-destructive/60 bg-destructive/10 text-destructive font-bold animate-pulse"
                      : "border-border text-muted-foreground"
                  )}
                >
                  {isOverturned
                    ? "OVERTURNED • AUTH GRANTED"
                    : isCallLive
                    ? callResolutionStage === "probing"
                      ? "LIVE: PROBING PHASE"
                      : "LIVE TELE-CONFERENCE"
                    : "STANDBY / READY"}
                </Badge>
              </div>

              <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground mt-0.5">
                <Clock className="size-3.5" />
                <span className="text-foreground font-semibold">
                  {formatSeconds(callDuration)}
                </span>
                <span>•</span>
                <span>Claim #{claim.claimNumber}</span>
                <span>•</span>
                <span>{claim.patient?.insurancePayer || "Health Insurer"}</span>
              </div>
            </div>
          </div>

          {/* Center: Live Waveform Visualizer (when listening) */}
          <div className="hidden md:flex items-center gap-1 bg-background/80 border border-border/70 px-3 py-1.5 rounded-lg h-9">
            <Waveform className="size-4 text-primary shrink-0 mr-1" />
            <div className="flex items-center gap-0.5 h-5">
              {[15, 45, 80, 60, 30, 90, 70, 40, 60, 85, 40, 20].map((baseHeight, idx) => {
                const heightPct = isCallLive
                  ? Math.max(15, Math.min(100, (audioLevel || 20) * (baseHeight / 50)))
                  : 15;
                return (
                  <div
                    key={idx}
                    className={cn(
                      "w-1 rounded-full transition-all duration-75",
                      isCallLive ? "bg-primary" : "bg-muted-foreground/30"
                    )}
                    style={{ height: `${heightPct}%` }}
                  />
                );
              })}
            </div>
            <span className="text-[10px] font-mono text-muted-foreground ml-1.5">
              {isCallLive ? (isWaitingForDoctor ? "LISTENING TO YOU" : "LISTENING") : "IDLE"}
            </span>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap shrink-0">
            {/* Reviewer Voice Audio Mute Toggle */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsReviewerVoiceMuted(!isReviewerVoiceMuted)}
              className={cn(
                "h-8 rounded-md px-2 text-xs gap-1 border-border/70 cursor-pointer",
                isReviewerVoiceMuted
                  ? "text-muted-foreground bg-muted/30"
                  : "text-primary border-primary/40 bg-primary/5"
              )}
              title={isReviewerVoiceMuted ? "Reviewer Voice Audio: Muted (Text Only)" : "Reviewer Voice Audio: Enabled"}
            >
              {isReviewerVoiceMuted ? (
                <SpeakerSlash className="size-3.5" />
              ) : (
                <SpeakerHigh className="size-3.5" />
              )}
              <span className="hidden sm:inline text-[11px]">
                {isReviewerVoiceMuted ? "Voice Muted" : "Voice On"}
              </span>
            </Button>

            {/* Interactive Simulation Button */}
            {!isSimulating ? (
              <Button
                variant="outline"
                size="sm"
                onClick={startSimulation}
                className="h-8 rounded-md px-2.5 text-xs gap-1.5 border-primary/40 text-primary hover:bg-primary/10 cursor-pointer"
                title="Start interactive call where AI Medical Director speaks objections, listens to your voice, and responds"
              >
                <Play className="size-3.5" weight="fill" />
                <span>Start Reviewer Practice</span>
              </Button>
            ) : isGeneratingPushback ? (
              <Button
                variant="outline"
                size="sm"
                disabled
                className="h-8 rounded-md px-2.5 text-xs gap-1.5 border-primary/40 text-primary cursor-wait"
              >
                <CircleNotch className="size-3.5 animate-spin" />
                <span>Reviewer Listening...</span>
              </Button>
            ) : isWaitingForDoctor ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => respondToDoctorSpeech()}
                className="h-8 rounded-md px-2.5 text-xs gap-1.5 border-emerald-500/50 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 cursor-pointer animate-pulse"
                title="Medical Director will listen to your spoken argument and counter"
              >
                <Sparkle className="size-3.5" />
                <span>Hear Reviewer Pushback</span>
                <ArrowRight className="size-3.5" />
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                disabled
                className="h-8 rounded-md px-2.5 text-xs gap-1.5 border-primary/40 text-primary cursor-wait"
              >
                <CircleNotch className="size-3.5 animate-spin" />
                <span>Reviewer Speaking...</span>
              </Button>
            )}

            {/* Encounter Summary Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsSummaryModalOpen(true)}
              className="h-8 rounded-md px-2.5 text-xs font-medium gap-1.5 border-border/70 text-foreground hover:bg-muted/60 cursor-pointer shadow-2xs"
              title="View, export or print complete EHR post-call clinical encounter addendum"
            >
              <FileText className="size-3.5 text-primary" />
              <span>Encounter Summary</span>
            </Button>

            {/* Mic / Live Call Toggle */}
            {isCallLive ? (
              <Button
                variant="destructive"
                size="sm"
                onClick={endLiveCall}
                className="h-8 rounded-md px-3 text-xs font-semibold gap-1.5 bg-destructive hover:bg-destructive/90 text-white cursor-pointer shadow-xs"
              >
                <PhoneDisconnect className="size-3.5" />
                <span>End Call</span>
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={startLiveCall}
                className="h-8 rounded-md px-3 text-xs font-semibold gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer shadow-xs"
              >
                <Microphone className="size-3.5" />
                <span>Start Live Call (Mic)</span>
              </Button>
            )}
          </div>
        </div>

        {/* Turn-Taking Interactive Guide Banner */}
        {isSimulating && (
          <div
            className={cn(
              "mt-3 p-2.5 rounded-lg border text-xs font-sans flex flex-col sm:flex-row sm:items-center justify-between gap-2 transition-all",
              isOverturned
                ? "bg-emerald-950/60 border-emerald-500 text-emerald-100 ring-1 ring-emerald-500/40"
                : isGeneratingPushback
                ? "bg-primary/10 border-primary/40 text-primary"
                : isWaitingForDoctor
                ? "bg-emerald-950/40 border-emerald-500/50 text-emerald-200"
                : "bg-secondary/70 border-border/80 text-muted-foreground"
            )}
          >
            <div className="flex items-center gap-2">
              {isOverturned ? (
                <ShieldCheck className="size-4 text-emerald-400 shrink-0" weight="fill" />
              ) : isGeneratingPushback ? (
                <CircleNotch className="size-3.5 text-primary animate-spin shrink-0" />
              ) : isWaitingForDoctor ? (
                <div className="size-2 rounded-full bg-emerald-400 animate-ping shrink-0" />
              ) : (
                <CircleNotch className="size-3.5 text-primary animate-spin shrink-0" />
              )}
              <span>
                {isOverturned ? (
                  <>
                    <strong className="text-emerald-300 font-bold uppercase tracking-wider">
                      Denial Overturned • Verbal Authorization Granted:
                    </strong>{" "}
                    <span className="font-mono font-semibold text-white">{authorizationNumber}</span>. Criteria fully satisfied under clinical policy bulletin.
                  </>
                ) : isGeneratingPushback ? (
                  <>
                    <strong className="text-foreground font-semibold">
                      Medical Director is evaluating your statement... (Exchange {simulationStepIndex + 1})
                    </strong>{" "}
                    Formulating clinical evaluation.
                  </>
                ) : isWaitingForDoctor ? (
                  <>
                    <strong className="text-emerald-100 font-semibold">
                      Your turn to speak! (Exchange {simulationStepIndex + 1} of 3)
                    </strong>{" "}
                    Speak your rebuttal into your mic, then click <strong className="text-emerald-300">&ldquo;Hear Reviewer Pushback&rdquo;</strong> to hear their response.
                  </>
                ) : (
                  <>
                    <strong className="text-foreground">Reviewer is speaking...</strong> Listen to the clinical challenge.
                  </>
                )}
              </span>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {isOverturned ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setIsSummaryModalOpen(true)}
                  className="h-6 text-[11px] px-2.5 border-emerald-400 bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30 gap-1 font-semibold cursor-pointer"
                >
                  <FileText className="size-3 text-emerald-300" />
                  <span>View Encounter EHR Addendum</span>
                </Button>
              ) : isWaitingForDoctor ? (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => respondToDoctorSpeech()}
                    className="h-6 text-[11px] px-2 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/20 gap-1 cursor-pointer"
                  >
                    <span>Hear Pushback</span>
                    <ArrowRight className="size-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={startSimulation}
                    className="h-6 text-[11px] px-2 text-muted-foreground hover:text-foreground gap-1 cursor-pointer"
                  >
                    <ArrowCounterClockwise className="size-3" />
                    <span>Restart</span>
                  </Button>
                </>
              ) : null}
            </div>
          </div>
        )}
      </Card>

      {/* Main Split-Screen Copilot Command Center */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 min-h-[580px]">
        {/* LEFT PANE (5 Cols): Live Speech Stream & Transcript Feed */}
        <div className="lg:col-span-5 flex flex-col rounded-xl border border-border/80 bg-card/60 backdrop-blur-xl p-3.5 space-y-3 shadow-xs">
          {/* Pane Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/60 pb-2.5">
            <div className="flex items-center gap-1.5">
              <SpeakerHigh className="size-4 text-primary" />
              <h3 className="text-xs font-bold text-foreground font-sans">
                Live Speech Transcript Stream
              </h3>
            </div>

            {/* Speaker Selector Toggle */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <div className="flex items-center gap-0.5 bg-secondary/80 p-0.5 rounded-md border border-border/60 text-[10px] font-sans">
                <button
                  onClick={() => setActiveSpeaker("physician")}
                  className={cn(
                    "px-2 py-0.5 rounded transition-all cursor-pointer",
                    activeSpeaker === "physician"
                      ? "bg-primary/20 text-primary font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  title="Attributing mic speech to Treating MD (Press 'S' to switch)"
                >
                  Treating MD (You)
                </button>
                <button
                  onClick={() => setActiveSpeaker("insurer")}
                  className={cn(
                    "px-2 py-0.5 rounded transition-all cursor-pointer",
                    activeSpeaker === "insurer"
                      ? "bg-destructive/20 text-destructive font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  title="Attributing speech to Insurer Medical Director (Press 'S' to switch)"
                >
                  Insurer MD
                </button>
              </div>
            </div>
          </div>

          {/* Transcript Scroll Area */}
          <div
            ref={transcriptContainerRef}
            onScroll={(e) => {
              const el = e.currentTarget;
              const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
              userHasScrolledUpRef.current = !isNearBottom;
            }}
            className="flex-1 overflow-y-auto space-y-2.5 max-h-[420px] pr-1"
          >
            {transcripts.length === 0 && !interimText && (
              <div className="p-8 text-center space-y-2 text-muted-foreground my-auto">
                <Microphone className="size-8 mx-auto opacity-40 text-primary" />
                <p className="text-xs font-sans">
                  Live call speech will stream here in real time.
                </p>
                <p className="text-[11px] font-sans opacity-70">
                  Click <strong className="text-foreground">"Start Reviewer Practice"</strong> to hear the Medical Director speak and respond with your microphone.
                </p>
              </div>
            )}

            {transcripts.map((t, idx) => {
              const isInsurer = t.speaker === "insurer";
              return (
                <div
                  key={t.id || idx}
                  className={cn(
                    "p-3 rounded-lg border text-xs font-sans space-y-1.5 transition-all group/item",
                    isInsurer
                      ? "bg-destructive/5 border-destructive/25 text-foreground"
                      : "bg-primary/5 border-primary/25 text-foreground"
                  )}
                >
                  <div className="flex items-center justify-between text-[10px] font-mono">
                    <span
                      className={cn(
                        "font-bold uppercase tracking-wider",
                        isInsurer ? "text-destructive" : "text-primary"
                      )}
                    >
                      {isInsurer ? "Insurer Medical Director" : "Treating Physician (You)"}
                    </span>
                    <div className="flex items-center gap-2">
                      {/* Reassign Speaker 1-Click Button */}
                      <button
                        onClick={() => toggleTranscriptSpeaker(t.id)}
                        className="opacity-0 group-hover/item:opacity-100 transition-opacity text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-secondary border border-transparent hover:border-border/60 cursor-pointer"
                        title={isInsurer ? "Switch attribution to Treating MD" : "Switch attribution to Insurer MD & generate Fast Answer"}
                      >
                        <ArrowsLeftRight className="size-2.5" />
                        <span>Switch to {isInsurer ? "Treating MD" : "Insurer MD"}</span>
                      </button>
                      <span className="text-muted-foreground opacity-70">
                        {new Date(t.timestamp).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </span>
                    </div>
                  </div>

                  <p className="leading-relaxed text-foreground/95 text-xs">
                    {t.text}
                  </p>
                </div>
              );
            })}

            {/* Interim Speech Stream (Live Voice Typing from Doctor's Mic) */}
            {interimText && (
              <div className="p-3 rounded-lg border border-primary/40 bg-primary/10 text-xs font-sans space-y-1 animate-pulse">
                <div className="flex items-center gap-1.5 text-[10px] font-mono text-primary font-bold">
                  <CircleNotch className="size-3 animate-spin" />
                  <span>Transcribing your speech live...</span>
                </div>
                <p className="text-foreground/90 italic leading-relaxed text-xs">
                  {interimText}
                </p>
              </div>
            )}
          </div>

          {/* Quick Manual Speech Input / Objection Trigger Bar */}
          <form onSubmit={handleManualSubmit} className="flex items-center gap-1.5 pt-2 border-t border-border/50">
            <input
              type="text"
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              placeholder={`Speak or type what ${activeSpeaker === "physician" ? "you say" : "Insurer MD says"}...`}
              className="flex-1 h-8 rounded-md bg-secondary/50 border border-border/70 px-2.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary font-sans"
            />
            <Button
              type="submit"
              size="sm"
              disabled={!manualInput.trim()}
              className="h-8 rounded-md px-2.5 text-xs bg-primary text-primary-foreground hover:bg-primary/90 shrink-0 gap-1"
            >
              <span>Send</span>
              <PaperPlaneRight className="size-3" />
            </Button>
          </form>
        </div>

        {/* RIGHT PANE (7 Cols): Real-Time Fast Answers & Live Checklist HUD */}
        <div className="lg:col-span-7 flex flex-col space-y-3">
          {/* FLASH "SAY THIS RIGHT NOW" HERO CARD */}
          <div
            className={cn(
              "rounded-xl border p-4 space-y-3.5 transition-all shadow-md",
              isOverturned
                ? "bg-emerald-950/40 border-emerald-500/80 ring-1 ring-emerald-500/40"
                : activeFastAnswer
                ? "bg-card/90 border-primary/60 ring-1 ring-primary/30"
                : "bg-card/60 border-border/80"
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    "size-7 rounded-md flex items-center justify-center font-bold text-xs shadow-xs",
                    isOverturned
                      ? "bg-emerald-500 text-white"
                      : "bg-primary text-primary-foreground"
                  )}
                >
                  {isOverturned ? (
                    <ShieldCheck className="size-4 text-white" weight="fill" />
                  ) : (
                    <Lightning className="size-4 text-primary-foreground" weight="fill" />
                  )}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-foreground font-sans flex items-center gap-1.5">
                    <span>
                      {isOverturned
                        ? "Denial Overturned • Prior Authorization Issued"
                        : "Instant Verbal Counter-Strike"}
                    </span>
                    {isGeneratingAnswer && (
                      <span className="flex items-center gap-1 text-[10px] font-mono text-primary animate-pulse font-normal">
                        <CircleNotch className="size-3 animate-spin" />
                        <span>Synthesizing Fast Answer...</span>
                      </span>
                    )}
                  </h3>
                  <p className="text-[11px] text-muted-foreground font-sans">
                    {isOverturned
                      ? "Verbal authorization granted on the record. Read aloud final closing confirmation statement."
                      : "Read aloud into your microphone the instant the medical director asks this question"}
                  </p>
                </div>
              </div>

              {activeFastAnswer && (
                <div className="flex items-center gap-1.5">
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px] font-mono",
                      isOverturned
                        ? "border-emerald-500/40 text-emerald-400 font-bold"
                        : "border-primary/40 text-primary"
                    )}
                  >
                    {isOverturned ? "100% Won" : `${activeFastAnswer.confidenceScore}% Grounded`}
                  </Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleCopy(activeFastAnswer.suggestedQuote, "fast-quote")}
                    className="h-7 text-xs px-2 gap-1 border-border/70 text-foreground cursor-pointer"
                  >
                    {copiedId === "fast-quote" ? (
                      <Check className="size-3 text-emerald-400" />
                    ) : (
                      <Copy className="size-3" />
                    )}
                    <span>{copiedId === "fast-quote" ? "Copied" : "Copy"}</span>
                  </Button>
                </div>
              )}
            </div>

            {activeFastAnswer ? (
              <div className="space-y-3">
                {/* Detected Trap Question Header */}
                <div
                  className={cn(
                    "p-2.5 rounded-md text-xs text-foreground/90 font-sans flex items-start gap-2 border",
                    isOverturned
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-200"
                      : "bg-destructive/10 border-destructive/25"
                  )}
                >
                  {isOverturned ? (
                    <ShieldCheck className="size-4 text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <WarningCircle className="size-4 text-destructive shrink-0 mt-0.5" />
                  )}
                  <div>
                    <span
                      className={cn(
                        "font-bold",
                        isOverturned ? "text-emerald-300" : "text-destructive"
                      )}
                    >
                      {isOverturned ? "Reviewer Status: " : "Insurer Objection: "}
                    </span>
                    <span className="italic">&ldquo;{activeFastAnswer.trapQuestion}&rdquo;</span>
                  </div>
                </div>

                {/* THE SPOKEN REBUTTAL (BIG, HIGH CONTRAST) */}
                <div
                  className={cn(
                    "p-4 rounded-lg border text-foreground font-sans text-sm font-medium leading-relaxed shadow-xs selection:bg-primary/20",
                    isOverturned
                      ? "bg-emerald-950/30 border-emerald-500/40"
                      : "bg-secondary/70 border-primary/30"
                  )}
                >
                  <div
                    className={cn(
                      "text-[10px] font-mono uppercase font-bold tracking-wider mb-1 flex items-center gap-1",
                      isOverturned ? "text-emerald-400" : "text-primary"
                    )}
                  >
                    <Play
                      className={cn("size-2.5", isOverturned ? "text-emerald-400" : "text-primary")}
                      weight="fill"
                    />
                    <span>{isOverturned ? "SAY TO CONCLUDE CALL:" : "SAY THIS RIGHT NOW:"}</span>
                  </div>
                  <div className="text-foreground text-sm font-semibold leading-relaxed">
                    &ldquo;{activeFastAnswer.suggestedQuote}&rdquo;
                  </div>
                </div>

                {/* Grounding Facts Strip */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-sans pt-1">
                  <div className="p-2.5 rounded-md bg-card/60 border border-border/70 space-y-1">
                    <div className="text-[10px] font-mono uppercase text-muted-foreground font-bold flex items-center gap-1">
                      <Stethoscope className="size-3 text-primary" />
                      <span>Chart Proof Evidence</span>
                    </div>
                    <p className="text-foreground/90 text-xs leading-snug">
                      {activeFastAnswer.chartProof}
                    </p>
                  </div>

                  <div className="p-2.5 rounded-md bg-card/60 border border-border/70 space-y-1">
                    <div className="text-[10px] font-mono uppercase text-muted-foreground font-bold flex items-center gap-1">
                      <ShieldCheck className="size-3 text-emerald-400" />
                      <span>Exact Policy Citation</span>
                    </div>
                    <p className="text-foreground/90 text-xs leading-snug font-medium text-primary">
                      {activeFastAnswer.cpbCitation}
                    </p>
                  </div>
                </div>

                {/* Regulatory Leverage Tag */}
                {activeFastAnswer.regulatoryLeverage && (
                  <div
                    className={cn(
                      "text-xs font-sans px-3 py-1.5 rounded-md flex items-center gap-1.5 border",
                      isOverturned
                        ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-300"
                        : "text-primary/95 bg-primary/10 border-primary/20"
                    )}
                  >
                    <Scales className="size-3.5 shrink-0" />
                    <span>
                      <strong className="font-semibold">Statutory Leverage:</strong>{" "}
                      {activeFastAnswer.regulatoryLeverage}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-8 text-center space-y-2 border border-dashed border-border/80 rounded-lg text-muted-foreground">
                <Sparkle className="size-8 mx-auto text-primary opacity-50" />
                <p className="text-xs font-sans text-foreground">
                  Awaiting insurer objection or question on the live call.
                </p>
                <p className="text-[11px] font-sans opacity-75">
                  The moment the medical director speaks, ClaimHero AI will flash the exact spoken counter-strike and policy citation here.
                </p>
              </div>
            )}
          </div>

          {/* BOTTOM ROW: Fast Answer History & Spoken Statutory Checklist */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 flex-1">
            {/* Dynamic Spoken Legal Checklist */}
            <div className="rounded-xl border border-border/80 bg-card/60 backdrop-blur-xl p-3.5 space-y-2.5 flex flex-col justify-between shadow-xs">
              <div className="flex items-center justify-between border-b border-border/60 pb-2">
                <div className="flex items-center gap-1.5">
                  <ShieldCheck className="size-4 text-emerald-400" />
                  <h4 className="text-xs font-bold text-foreground font-sans">
                    Live Call Legal Checklist
                  </h4>
                </div>
                <Badge variant="outline" className="text-[10px] font-mono border-emerald-500/40 text-emerald-400">
                  {checklist.filter((c) => c.isCompleted).length} / {checklist.length || 6} Verified
                </Badge>
              </div>

              <div className="space-y-1.5 text-xs font-sans flex-1">
                {checklist.map((item) => (
                  <div
                    key={item.id}
                    className={cn(
                      "flex items-start gap-2 p-1.5 rounded transition-all",
                      item.isCompleted
                        ? "bg-emerald-500/10 text-emerald-300 font-medium"
                        : "text-muted-foreground opacity-75"
                    )}
                  >
                    <div
                      className={cn(
                        "size-4 rounded border flex items-center justify-center shrink-0 mt-0.5 text-[10px]",
                        item.isCompleted
                          ? "border-emerald-400 bg-emerald-500 text-white font-bold"
                          : "border-muted-foreground/40 bg-transparent"
                      )}
                    >
                      {item.isCompleted && <Check className="size-2.5 text-white" weight="bold" />}
                    </div>
                    <span className="leading-tight text-xs">{item.label}</span>
                  </div>
                ))}
              </div>

              {/* Call Win Momentum Gauge */}
              <div className="pt-2 border-t border-border/50 space-y-1">
                <div className="flex items-center justify-between text-[11px] font-sans">
                  <span className="text-muted-foreground font-medium">Physician Call Momentum:</span>
                  <span className="font-bold font-mono text-primary">{winScore}% Leverage</span>
                </div>
                <div className="w-full bg-secondary/80 h-1.5 rounded-full overflow-hidden">
                  <div
                    className={cn(
                      "h-full transition-all duration-500 rounded-full",
                      winScore >= 75
                        ? "bg-emerald-500"
                        : winScore >= 50
                        ? "bg-primary"
                        : "bg-amber-500"
                    )}
                    style={{ width: `${winScore}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Fast Answers Archive Strip */}
            <div className="rounded-xl border border-border/80 bg-card/60 backdrop-blur-xl p-3.5 space-y-2 flex flex-col justify-between shadow-xs">
              <div className="flex items-center justify-between border-b border-border/60 pb-2">
                <div className="flex items-center gap-1.5">
                  <Sparkle className="size-4 text-primary" />
                  <h4 className="text-xs font-bold text-foreground font-sans">
                    Fast Answers Generated
                  </h4>
                </div>
                <span className="text-[10px] font-mono text-muted-foreground">
                  {fastAnswers.length} Total
                </span>
              </div>

              <div className="space-y-1.5 overflow-y-auto max-h-[160px] pr-1 flex-1">
                {fastAnswers.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic my-auto text-center py-6">
                    No objection cards generated yet.
                  </p>
                ) : (
                  fastAnswers.map((ans) => (
                    <button
                      key={ans.id}
                      onClick={() => setActiveFastAnswer(ans)}
                      className={cn(
                        "w-full text-left p-2 rounded-md border text-xs font-sans transition-all cursor-pointer flex items-center justify-between gap-2",
                        activeFastAnswer?.id === ans.id
                          ? "border-primary bg-primary/15 text-foreground font-semibold shadow-xs"
                          : "border-border/60 bg-card/40 text-muted-foreground hover:bg-card/80 hover:text-foreground"
                      )}
                    >
                      <span className="truncate">{ans.trapQuestion}</span>
                      <ArrowRight className="size-3 shrink-0 opacity-70" />
                    </button>
                  ))
                )}
              </div>

              <div className="text-[10px] font-mono text-muted-foreground pt-2 border-t border-border/50">
                Click any objection card above to inspect exact quote & CPB proof.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Post-Call Encounter Summary & EHR Addendum Modal */}
      <P2PEncounterSummaryModal
        isOpen={isSummaryModalOpen}
        onClose={() => setIsSummaryModalOpen(false)}
        claim={claim}
        session={session}
      />
    </div>
  );
};
