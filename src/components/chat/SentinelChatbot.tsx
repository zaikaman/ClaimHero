import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  PaperPlaneRight,
  Trash,
  X,
  CaretDown,
  CaretUp,
  Copy,
  Check,
  Cpu,
  ShieldCheck,
  CircleNotch,
  Scales,
  FileMagnifyingGlass,
  Globe,
} from "@phosphor-icons/react";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { BrandIcon } from "../common/BrandLogo";




import { useSentinelChat } from "../../hooks/useSentinelChat";
import { Claim } from "../../types";
import { NavigationView } from "../layout/Sidebar";

interface SentinelChatbotProps {
  selectedClaim: Claim | null;
  currentView: NavigationView;
}

interface Position {
  x: number;
  y: number;
}

export const SentinelChatbot: React.FC<SentinelChatbotProps> = ({
  selectedClaim,
  currentView,
}) => {
  const {
    isOpen,
    setIsOpen,
    isSending,
    messages,
    sendMessage,
    clearHistory,
  } = useSentinelChat({ selectedClaim, currentView });

  const [input, setInput] = useState<string>("");
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [expandedTools, setExpandedTools] = useState<Record<number, boolean>>({});

  // Draggable Bubble & Window State
  const [bubblePosition, setBubblePosition] = useState<Position>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("claimhero_chatbot_bubble_pos");
        if (saved) {
          const parsed = JSON.parse(saved);
          if (typeof parsed.x === "number" && typeof parsed.y === "number") {
            return parsed;
          }
        }
      } catch {
        // Ignore JSON error
      }
      return {
        x: Math.max(16, window.innerWidth - 76),
        y: Math.max(16, window.innerHeight - 76),
      };
    }
    return { x: 800, y: 600 };
  });

  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartRef = useRef<{ startX: number; startY: number; posX: number; posY: number; hasMoved: boolean }>({
    startX: 0,
    startY: 0,
    posX: 0,
    posY: 0,
    hasMoved: false,
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Clamp bubble position within viewport
  const clampBubble = useCallback((x: number, y: number): Position => {
    if (typeof window === "undefined") return { x, y };
    const size = 60;
    const pad = 16;
    const maxX = window.innerWidth - size - pad;
    const maxY = window.innerHeight - size - pad;
    return {
      x: Math.max(pad, Math.min(maxX, x)),
      y: Math.max(pad, Math.min(maxY, y)),
    };
  }, []);


  // Update on window resize
  useEffect(() => {
    const handleResize = () => {
      setBubblePosition((prev) => clampBubble(prev.x, prev.y));
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [clampBubble]);

  // Pointer drag listeners
  const handlePointerDown = (e: React.PointerEvent) => {
    // Only left click / touch
    if (e.button !== 0) return;
    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      posX: bubblePosition.x,
      posY: bubblePosition.y,
      hasMoved: false,
    };
    setIsDragging(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartRef.current.startX;
    const dy = e.clientY - dragStartRef.current.startY;
    if (Math.hypot(dx, dy) > 4) {
      dragStartRef.current.hasMoved = true;
    }
    const nextPos = clampBubble(
      dragStartRef.current.posX + dx,
      dragStartRef.current.posY + dy
    );
    setBubblePosition(nextPos);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDragging) return;
    setIsDragging(false);
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // Ignore
    }

    if (dragStartRef.current.hasMoved) {
      // Saved position after moving
      localStorage.setItem("claimhero_chatbot_bubble_pos", JSON.stringify(bubblePosition));
    } else {
      // Click without drag: toggle window
      setIsOpen((prev) => !prev);
    }
  };

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isSending, isOpen]);

  // Focus textarea when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  const handleSend = () => {
    if (!input.trim() || isSending) return;
    sendMessage(input);
    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleCopy = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const toggleTools = (index: number) => {
    setExpandedTools((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
  };

  // Calculate chat window coordinates anchored around bubble
  const chatWindowStyle = useMemo(() => {
    if (typeof window === "undefined") {
      return { bottom: 80, right: 20 };
    }
    const winWidth = Math.min(420, window.innerWidth - 32);
    const winHeight = Math.min(580, window.innerHeight - 32);
    const pad = 16;

    // Prefer anchoring card above or to the left of the bubble
    let left = bubblePosition.x - winWidth + 60;
    let top = bubblePosition.y - winHeight - 14;

    // If too close to top edge, open downwards
    if (top < pad) {
      top = bubblePosition.y + 68;
    }

    // Clamp inside viewport
    left = Math.max(pad, Math.min(window.innerWidth - winWidth - pad, left));
    top = Math.max(pad, Math.min(window.innerHeight - winHeight - pad, top));

    return {
      left: `${left}px`,
      top: `${top}px`,
      width: `${winWidth}px`,
      height: `${winHeight}px`,
    };
  }, [bubblePosition]);


  // Context-aware quick prompt chips
  const quickPrompts = useMemo(() => {
    if (selectedClaim) {
      return [
        {
          label: "Live CPB Research",
          prompt: `Use Firecrawl to search live insurer Clinical Policy Bulletins for ${selectedClaim.patient?.insurancePayer || "payer"} regarding CPT ${selectedClaim.cptCodes?.[0] || "procedure"} and denial reason ${selectedClaim.denialReasonCode}.`,
          icon: Globe,
        },
        {
          label: "Analyze Denial Reason",
          prompt: `Analyze the denial reason code ${selectedClaim.denialReasonCode} and outline our clinical rebuttal strategy for claim ${selectedClaim.claimNumber}.`,
          icon: FileMagnifyingGlass,
        },
        {
          label: "ERISA Statutory Rights",
          prompt: `What ERISA 29 CFR § 2560.503-1 statutory protections and deadline requirements apply to claim ${selectedClaim.claimNumber}?`,
          icon: Scales,
        },
        {
          label: "P2P Defense Counter",
          prompt: `Draft a 3-point Peer-to-Peer (P2P) tele-script counter for Dr. Reviewer on claim ${selectedClaim.claimNumber}.`,
          icon: ShieldCheck,
        },
      ];
    }

    return [
      {
        label: "Live Payer CPB Search",
        prompt: "Use Firecrawl to search latest clinical policy bulletins and coverage criteria for knee arthroplasty (CPT 27447).",
        icon: Globe,
      },
      {
        label: "ERISA 180-Day Rules",
        prompt: "Explain the mandatory 180-day appeal rules and de novo review standards under ERISA 29 CFR § 2560.503-1.",
        icon: Scales,
      },
      {
        label: "Overturn Score Rubric",
        prompt: "How does ClaimHero calculate the deterministic 4-pillar Overturn Probability score?",
        icon: Scales,
      },
      {
        label: "Search High Risk Claims",
        prompt: "Search and list any active claims in my workspace that require urgent appeal attention.",
        icon: FileMagnifyingGlass,
      },
    ];
  }, [selectedClaim]);

  // Format tool name into clean user-facing title
  const formatToolName = (toolName: string) => {
    switch (toolName) {
      case "get_active_claim_details":
        return "Retrieved Claim & Clinical Facts";
      case "get_clinical_evidence":
        return "Inspected Clinical Policy Bulletins (CPBs)";
      case "get_appeal_brief":
        return "Loaded Synthesized Appeal Memorandum";
      case "get_p2p_defense_script":
        return "Retrieved Physician P2P Tele-Script";
      case "get_audit_trail":
        return "Audited Immutable Event Timeline";
      case "search_claims":
        return "Searched Workspace Claims Roster";
      case "search_precedents":
        return "Queried 1536-d Legal Precedent Archive";
      case "firecrawl_web_search":
        return "Firecrawl Live Web & Policy Search";
      case "firecrawl_scrape_url":
        return "Firecrawl Scraped Clinical Document";
      case "crawl_and_attach_evidence":
        return "Firecrawl Multi-Source Evidence Ingestion";
      default:
        return toolName.replace(/_/g, " ");
    }
  };

  return (
    <>
      {/* Draggable Round Floating Bubble */}
      <div
        style={{
          position: "fixed",
          left: `${bubblePosition.x}px`,
          top: `${bubblePosition.y}px`,
          touchAction: "none",
          zIndex: 50,
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className="select-none group no-print"
      >
        <button
          type="button"
          className={`relative w-[60px] h-[60px] rounded-full flex items-center justify-center backdrop-blur-2xl transition-all cursor-grab active:cursor-grabbing ${
            isOpen
              ? "bg-zinc-900 text-zinc-100 border border-white/25 shadow-2xl scale-105"
              : "bg-zinc-950/90 hover:bg-zinc-900/90 text-zinc-100 border border-white/15 hover:border-white/30 shadow-[0_12px_36px_rgba(0,0,0,0.75)] hover:shadow-[0_12px_36px_rgba(14,165,233,0.15)] ring-1 ring-white/5 hover:scale-105"
          }`}
          title="Sentinel Copilot (⌘J) • Drag to reposition"
        >
          {/* Subtle Top Specular Glass Sheen */}
          <div className="absolute inset-0 rounded-full bg-gradient-to-b from-white/[0.12] to-transparent pointer-events-none" />

          {isOpen ? (
            <X className="size-6 text-zinc-200" />
          ) : (
            <div className="flex items-center justify-center">
              <BrandIcon size="md" className="text-zinc-100 group-hover:scale-105 transition-transform" />
            </div>
          )}

          {/* Micro Live Status Pulse Indicator */}
          {!isOpen && (
            <span className="absolute top-3 right-3 size-2.5 rounded-full bg-emerald-400 ring-2 ring-zinc-950 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
          )}

          {/* Sleek Tooltip Pill on Hover */}
          {!isOpen && (
            <div className="absolute right-17 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-all duration-150 pointer-events-none whitespace-nowrap">
              <div className="bg-zinc-950/95 border border-zinc-800/80 text-zinc-200 text-[11px] font-medium px-2.5 py-1 rounded-md shadow-2xl backdrop-blur-xl flex items-center gap-1.5 ring-1 ring-white/5">
                <span className="font-sans">Sentinel Copilot</span>
                <span className="text-[10px] font-mono text-zinc-400 bg-zinc-800/90 px-1 py-0.2 rounded border border-zinc-700/60">
                  ⌘J
                </span>
              </div>
            </div>
          )}
        </button>
      </div>



      {/* Expandable Chat Window */}
      {isOpen && (
        <Card
          style={chatWindowStyle}
          className="fixed z-50 bg-card/95 border-border shadow-2xl backdrop-blur-2xl flex flex-col rounded-2xl overflow-hidden p-0 animate-blur-fade-up border no-print"
        >
          {/* Header Bar (also acts as secondary drag handle) */}
          <div className="p-3.5 pb-3 border-b border-border/80 flex items-center justify-between bg-muted/40 select-none">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="size-7 rounded-lg bg-primary/10 text-primary border border-primary/20 flex items-center justify-center shrink-0">
                <BrandIcon size="xs" className="text-primary" />
              </div>
              <div className="flex flex-col min-w-0">

                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-foreground truncate">
                    Sentinel AI Copilot
                  </span>
                  <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-mono">
                  <Cpu className="size-2.5 text-primary shrink-0" />
                  <span className="truncate">
                    {selectedClaim
                      ? `Active: ${selectedClaim.claimNumber} (${selectedClaim.patient?.insurancePayer || "Payer"})`
                      : "Workspace Context Active"}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {messages.length > 0 && (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={clearHistory}
                  className="text-muted-foreground hover:text-destructive transition-colors"
                  title="Clear conversation history"
                >
                  <Trash className="size-3.5" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => setIsOpen(false)}
                className="text-muted-foreground hover:text-foreground"
                title="Minimize (⌘J)"
              >
                <CaretDown className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => setIsOpen(false)}
                className="text-muted-foreground hover:text-foreground"
                title="Close"
              >
                <X className="size-3.5" />
              </Button>
            </div>
          </div>

          {/* Messages Scroll Area */}
          <div className="flex-1 p-3.5 overflow-y-auto space-y-3.5 text-left text-xs">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col justify-between py-2 space-y-4">
                <div className="p-3.5 rounded-lg border border-primary/20 bg-primary/5 space-y-2">
                  <div className="flex items-center gap-2 text-primary font-semibold text-xs">
                    <ShieldCheck className="size-4" />
                    <span>Autonomous Clinical & Legal Assistant</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Sentinel Copilot has full visibility into active claims, crawled insurer CPBs, ERISA § 502(c) penalties, and synthesized appeal briefs.
                  </p>
                </div>

                {/* Quick Starter Prompts */}
                <div className="space-y-1.5">
                  <span className="text-[10px] font-mono uppercase text-muted-foreground tracking-wider px-1">
                    Suggested Prompts
                  </span>
                  <div className="grid grid-cols-1 gap-1.5">
                    {quickPrompts.map((item, idx) => {
                      const Icon = item.icon;
                      return (
                        <button
                          key={idx}
                          onClick={() => sendMessage(item.prompt)}
                          className="w-full text-left p-2 rounded-md border border-border/70 bg-muted/20 hover:bg-muted/40 hover:border-primary/30 transition-all flex items-center justify-between gap-2 group cursor-pointer"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <Icon className="size-3.5 text-primary shrink-0 group-hover:scale-110 transition-transform" />
                            <span className="text-[11px] font-medium text-foreground truncate">
                              {item.label}
                            </span>
                          </div>
                          <span className="text-[10px] font-mono text-muted-foreground/60 shrink-0">
                            Ask &rarr;
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <>
                {messages.map((msg, index) => {
                  const isAssistant = msg.role === "assistant";
                  const isUser = msg.role === "user";

                  if (!isAssistant && !isUser) return null;

                  return (
                    <div
                      key={msg._id || index}
                      className={`flex flex-col ${isUser ? "items-end" : "items-start"} space-y-1`}
                    >
                      {/* Tool Call Execution Indicator */}
                      {isAssistant && msg.toolCalls && msg.toolCalls.length > 0 && (
                        <div className="w-full max-w-[95%] mb-1">
                          <button
                            onClick={() => toggleTools(index)}
                            className="text-[10px] font-mono text-primary/90 bg-primary/10 border border-primary/20 rounded px-2 py-0.5 flex items-center gap-1.5 hover:bg-primary/15 transition-colors cursor-pointer"
                          >
                            <Cpu className="size-2.5 shrink-0" />
                            <span>
                              {msg.toolCalls.length} Agentic Tool{msg.toolCalls.length > 1 ? "s" : ""} Executed
                            </span>
                            {expandedTools[index] ? (
                              <CaretUp className="size-2.5 ml-auto" />
                            ) : (
                              <CaretDown className="size-2.5 ml-auto" />
                            )}
                          </button>

                          {expandedTools[index] && (
                            <div className="mt-1 p-2 rounded bg-muted/40 border border-border/80 space-y-1 text-[10px] font-mono">
                              {msg.toolCalls.map((tc, tcIdx) => (
                                <div key={tcIdx} className="flex items-center justify-between text-muted-foreground">
                                  <span className="text-primary font-semibold">
                                    &bull; {formatToolName(tc.name)}
                                  </span>
                                  <span className="text-[9px] text-muted-foreground/60">
                                    {tc.name}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Message Bubble */}
                      <div
                        className={`relative group rounded-xl p-3 max-w-[92%] leading-relaxed ${
                          isUser
                            ? "bg-primary/20 text-foreground border border-primary/30 rounded-br-xs"
                            : "bg-muted/30 text-foreground border border-border/80 rounded-bl-xs shadow-sm"
                        }`}
                      >
                        {isAssistant ? (
                          <div className="prose prose-invert prose-xs max-w-none text-foreground space-y-2">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {msg.content}
                            </ReactMarkdown>
                          </div>
                        ) : (
                          <p className="whitespace-pre-wrap">{msg.content}</p>
                        )}

                        {/* Copy Button on Assistant Message */}
                        {isAssistant && (
                          <button
                            onClick={() => handleCopy(msg.content, index)}
                            className="absolute -bottom-2.5 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-card border border-border rounded px-1.5 py-0.5 text-[9px] font-mono text-muted-foreground hover:text-foreground flex items-center gap-1 shadow-sm cursor-pointer"
                            title="Copy text"
                          >
                            {copiedIndex === index ? (
                              <>
                                <Check className="size-2.5 text-emerald-500" />
                                <span className="text-emerald-500">Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="size-2.5" />
                                <span>Copy</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Thinking / Tool Calling State */}
                {isSending && (
                  <div className="flex items-center gap-2 p-2.5 rounded-lg border border-primary/20 bg-primary/5 text-primary text-xs font-mono">
                    <CircleNotch className="size-3.5 animate-spin shrink-0" />
                    <span className="animate-pulse text-[11px]">
                      Sentinel Copilot is inspecting evidence & statutes...
                    </span>
                  </div>
                )}
              </>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="p-3 border-t border-border/80 bg-muted/20 space-y-2">
            <div className="flex items-center gap-2 rounded-xl bg-background/90 border border-border/80 p-1.5 pl-3 focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/50 shadow-inner transition-all">
              <textarea
                ref={textareaRef}
                rows={1}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = `${Math.min(e.target.scrollHeight, 84)}px`;
                }}
                onKeyDown={handleKeyDown}
                placeholder={
                  selectedClaim
                    ? `Ask about ${selectedClaim.claimNumber} or ERISA statutes...`
                    : "Ask clinical, legal, or CPB questions..."
                }
                className="flex-1 max-h-24 resize-none bg-transparent py-1 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none leading-relaxed font-sans scrollbar-none"
                style={{ minHeight: "22px" }}
              />
              <Button
                variant="default"
                size="icon-xs"
                onClick={handleSend}
                disabled={!input.trim() || isSending}
                className="size-7 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-30 shrink-0 transition-transform active:scale-95 cursor-pointer flex items-center justify-center"
                title="Send message (Enter)"
              >
                {isSending ? (
                  <CircleNotch className="size-3.5 animate-spin" />
                ) : (
                  <PaperPlaneRight className="size-3.5" weight="fill" />
                )}
              </Button>
            </div>

            <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground px-1">
              <div className="flex items-center gap-1 truncate">
                {selectedClaim ? (
                  <>
                    <span className="size-1.5 rounded-full bg-emerald-500 shrink-0" />
                    <span className="truncate">
                      Linked: {selectedClaim.claimNumber} ({selectedClaim.patient?.insurancePayer || "Payer"})
                    </span>
                  </>
                ) : (
                  <span>Platform Context Active</span>
                )}
              </div>
              <span className="shrink-0 text-muted-foreground/50">Enter ↵</span>
            </div>
          </div>
        </Card>
      )}
    </>
  );
};
