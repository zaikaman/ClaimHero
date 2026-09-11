import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import { safeExternalHref } from "../../lib/urlUtils";
import {
  PaperPlaneRight,
  Trash,
  X,
  CaretDown,
  CaretUp,
  Copy,
  Check,
  ShieldCheck,
  CircleNotch,
  Scales,
  FileMagnifyingGlass,
  Globe,
  Gear,
} from "@phosphor-icons/react";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { BrandIcon } from "../common/BrandLogo";
import { useSentinelChat } from "../../hooks/useSentinelChat";
import { Claim } from "../../types";
import { NavigationView } from "../layout/Sidebar";
import { cn } from "../../lib/utils";

interface Position {
  x: number;
  y: number;
}

interface SentinelChatbotProps {
  selectedClaim: Claim | null;
  currentView: NavigationView;
}

export const SentinelChatbot: React.FC<SentinelChatbotProps> = ({
  selectedClaim,
  currentView,
}) => {
  const {
    isOpen,
    setIsOpen,
    isSending,
    isStreaming,
    messages,
    sendMessage,
    clearHistory,
  } = useSentinelChat({ selectedClaim, currentView });

  const [input, setInput] = useState<string>("" );
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [expandedTools, setExpandedTools] = useState<Record<number, boolean>>({});

  // Draggable Capsule & Window State
  const [bubblePosition, setBubblePosition] = useState<Position>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("claimhero_sentinel_assistant_pos");
        if (saved) {
          const parsed = JSON.parse(saved);
          if (typeof parsed.x === "number" && typeof parsed.y === "number") {
            return parsed;
          }
        }
      } catch {
        // Ignore JSON parse error
      }
      return {
        x: Math.max(16, window.innerWidth - 280),
        y: Math.max(16, window.innerHeight - 120),
      };
    }
    return { x: 800, y: 550 };
  });

  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartRef = useRef<{
    startX: number;
    startY: number;
    posX: number;
    posY: number;
    hasMoved: boolean;
  }>({
    startX: 0,
    startY: 0,
    posX: 0,
    posY: 0,
    hasMoved: false,
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Clamp bubble position within viewport padding
  const clampBubble = useCallback((x: number, y: number): Position => {
    if (typeof window === "undefined") return { x, y };
    const width = 260;
    const height = 44;
    const pad = 12;
    const maxX = window.innerWidth - width - pad;
    const maxY = window.innerHeight - height - pad;
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
    if (e.button !== 0) return;
    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      posX: bubblePosition.x,
      posY: bubblePosition.y,
      hasMoved: false,
    };
    setIsDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
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
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // Ignore
    }

    if (dragStartRef.current.hasMoved) {
      localStorage.setItem("claimhero_sentinel_assistant_pos", JSON.stringify(bubblePosition));
    } else {
      setIsOpen(true);
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

  // Smart anchoring anchored around bubble position
  const chatWindowStyle = useMemo(() => {
    if (typeof window === "undefined") {
      return { bottom: "16px", right: "16px" };
    }
    const winWidth = Math.min(430, window.innerWidth - 32);
    const winHeight = Math.min(600, window.innerHeight - 32);
    const pad = 16;

    // Prefer anchoring card above the capsule, aligning right
    let left = bubblePosition.x - winWidth + 240;
    let top = bubblePosition.y - winHeight - 12;

    // If overflowing top of viewport, show below the capsule
    if (top < pad) {
      top = bubblePosition.y + 48;
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
          label: "Analyze Denial Reason",
          prompt: `Analyze the denial reason code ${selectedClaim.denialReasonCode || "CO-50"} for CPT ${selectedClaim.cptCodes?.[0] || "procedure"} on claim ${selectedClaim.claimNumber} and outline our clinical rebuttal strategy.`,
          icon: FileMagnifyingGlass,
        },
        {
          label: "Inspect Policy Evidence",
          prompt: `Inspect the Clinical Policy Bulletins (CPBs) and evidence clauses retrieved for claim ${selectedClaim.claimNumber}.`,
          icon: Globe,
        },
        {
          label: "ERISA Statutory Exposure",
          prompt: `What ERISA 29 CFR § 2560.503-1 statutory deadlines, rights notices, and penalty exposures apply to claim ${selectedClaim.claimNumber}?`,
          icon: Scales,
        },
        {
          label: "P2P Tele-Script Defense",
          prompt: `Draft a targeted 3-point Peer-to-Peer tele-script defense for Dr. Reviewer regarding claim ${selectedClaim.claimNumber}.`,
          icon: ShieldCheck,
        },
      ];
    }

    return [
      {
        label: "Search High Risk Claims",
        prompt: "Search and list any active claims in my workspace that require urgent appeal attention or have deadlines within 14 days.",
        icon: FileMagnifyingGlass,
      },
      {
        label: "ERISA 180-Day Rules",
        prompt: "Explain the mandatory 180-day appeal rules and full and fair review standards under ERISA 29 CFR § 2560.503-1.",
        icon: Scales,
      },
      {
        label: "Overturn Score Rubric",
        prompt: "How does ClaimHero calculate the deterministic 4-pillar Overturn Probability score?",
        icon: Scales,
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
      case "get_audit_trail":
        return "Audited Case Event Timeline";
      case "search_claims":
        return "Searched Workspace Claims Roster";
      case "search_precedents":
        return "Queried 1536-d Legal Precedent Archive";
      default:
        return toolName.replace(/_/g, " ");
    }
  };

  return (
    <>
      {/* Draggable Case Assistant Pill / Capsule */}
      {!isOpen && (
        <div
          style={{
            left: `${bubblePosition.x}px`,
            top: `${bubblePosition.y}px`,
            touchAction: "none",
          }}
          className="fixed z-40 select-none no-print print:hidden animate-fadeIn"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <button
            type="button"
            aria-label="Ask Sentinel about this case (shortcut Cmd+J)"
            className={cn(
              "group flex items-center gap-2 px-3 py-2 rounded-full bg-card/95 hover:bg-card border border-border/80 hover:border-primary/50 text-foreground text-xs shadow-2xl backdrop-blur-xl transition-shadow duration-150 hover:shadow-primary/10 cursor-grab active:cursor-grabbing ring-1 ring-white/5",
              isDragging && "cursor-grabbing ring-primary/50 shadow-primary/25"
            )}
            title="Ask Sentinel Copilot (⌘J) • Drag anywhere"
          >
            <div className="relative flex items-center justify-center size-5 rounded-full bg-primary/10 text-primary shrink-0 pointer-events-none">
              <BrandIcon size="xs" className="text-primary" />
              <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-emerald-400 ring-1 ring-zinc-950 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
            </div>

            <div className="flex items-center gap-1.5 min-w-0 pointer-events-none">
              {selectedClaim ? (
                <>
                  <span className="font-semibold text-foreground/90 group-hover:text-foreground">
                    Ask Sentinel about
                  </span>
                  <span className="font-bold text-primary truncate max-w-[150px]">
                    {selectedClaim.patient?.name || `#${selectedClaim.claimNumber}`}
                  </span>
                </>
              ) : (
                <span className="font-semibold text-foreground/90 group-hover:text-foreground">
                  Ask Sentinel Copilot
                </span>
              )}
            </div>

            <span className="text-[10px] font-mono text-muted-foreground bg-muted/70 px-1.5 py-0.5 rounded border border-border/60 ml-0.5 shrink-0 pointer-events-none">
              ⌘J
            </span>
          </button>
        </div>
      )}

      {/* Expandable Chat Window */}
      {isOpen && (
        <Card
          style={chatWindowStyle}
          className="fixed z-50 bg-card/95 border-border shadow-2xl backdrop-blur-2xl flex flex-col rounded-2xl overflow-hidden p-0 animate-blur-fade-up border no-print print:hidden"
        >
          {/* Header Bar */}
          <div className="px-3.5 py-2.5 border-b border-border/80 flex items-center justify-between bg-card/90 backdrop-blur-md select-none">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="size-7 rounded-lg bg-primary/10 text-primary border border-primary/20 flex items-center justify-center shrink-0">
                <BrandIcon size="xs" className="text-primary" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-semibold text-foreground tracking-tight truncate">
                  Sentinel Case Copilot
                </span>
                <span className="text-[11px] text-muted-foreground truncate">
                  {isStreaming ? (
                    <span className="text-primary font-medium">Synthesizing response...</span>
                  ) : selectedClaim ? (
                    `Case #${selectedClaim.claimNumber} • ${selectedClaim.patient?.insurancePayer || "Insurer"}`
                  ) : (
                    "Clinical Evidence & Precedent Assistant"
                  )}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {messages.length > 0 && (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={clearHistory}
                  className="text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                  title="Clear conversation history"
                >
                  <Trash className="size-3.5" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => setIsOpen(false)}
                className="text-muted-foreground hover:text-foreground cursor-pointer"
                title="Minimize (⌘J)"
              >
                <CaretDown className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => setIsOpen(false)}
                className="text-muted-foreground hover:text-foreground cursor-pointer"
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
                  const isUser = msg.role === "user";
                  const isAssistant = msg.role === "assistant";
                  const isToolsExpanded = Boolean(expandedTools[index]);

                  return (
                    <div
                      key={msg._id || index}
                      className={`flex flex-col ${isUser ? "items-end" : "items-start"} space-y-1`}
                    >
                      {/* Optional Tool Calls Tray */}
                      {isAssistant && msg.toolCalls && msg.toolCalls.length > 0 && (
                        <div className="w-full max-w-[92%] mb-1">
                          <button
                            onClick={() => toggleTools(index)}
                            className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground hover:text-foreground bg-muted/40 hover:bg-muted/70 px-2 py-0.5 rounded border border-border/60 transition-colors cursor-pointer"
                          >
                            <Gear className="size-3 text-primary shrink-0" />
                            <span>{msg.toolCalls.length} Agent Action{msg.toolCalls.length > 1 ? "s" : ""}</span>
                            {isToolsExpanded ? (
                              <CaretUp className="size-2.5" />
                            ) : (
                              <CaretDown className="size-2.5" />
                            )}
                          </button>

                          {isToolsExpanded && (
                            <div className="mt-1 p-2 rounded-md border border-border/60 bg-muted/20 space-y-1.5 text-[10px] font-mono">
                              {msg.toolCalls.map((tc, tcIdx) => (
                                <div key={tcIdx} className="space-y-0.5">
                                  <div className="font-semibold text-primary">
                                    &bull; {formatToolName(tc.name)}
                                  </div>
                                  {tc.arguments && (
                                    <pre className="text-[9px] text-muted-foreground/80 overflow-x-auto p-1 bg-background/50 rounded">
                                      {typeof tc.arguments === "string" ? tc.arguments : JSON.stringify(tc.arguments, null, 2)}
                                    </pre>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Message Bubble */}
                      <div
                        className={`relative p-3 rounded-xl max-w-[92%] leading-relaxed group shadow-xs ${
                          isUser
                            ? "bg-primary text-primary-foreground font-medium rounded-br-xs"
                            : "bg-muted/40 text-foreground border border-border/80 rounded-bl-xs"
                        }`}
                      >
                        {isAssistant ? (
                          <div className="prose prose-invert prose-xs max-w-none text-foreground text-xs leading-relaxed space-y-2">
                            {msg.content ? (
                              <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                rehypePlugins={[rehypeSanitize]}
                                components={{
                                  a: ({ href, children }) => {
                                    const safe = safeExternalHref(href);
                                    if (!safe) return <span>{children}</span>;
                                    return (
                                      <a
                                        href={safe}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-primary hover:underline font-semibold"
                                      >
                                        {children}
                                      </a>
                                    );
                                  },
                                }}
                              >
                                {msg.content}
                              </ReactMarkdown>
                            ) : msg.isStreaming ? (
                              <div className="flex items-center gap-2 text-muted-foreground text-[11px] font-mono py-0.5">
                                <CircleNotch className="size-3.5 animate-spin text-primary shrink-0" />
                                <span className="text-primary/90">
                                  {msg.toolCalls && msg.toolCalls.length > 0
                                    ? `Executing ${formatToolName(msg.toolCalls[msg.toolCalls.length - 1].name)}...`
                                    : "Analyzing clinical guidelines & precedents..."}
                                </span>
                              </div>
                            ) : null}
                            {msg.isStreaming && msg.content && (
                              <span className="inline-block w-1.5 h-3 ml-0.5 bg-primary align-middle animate-pulse rounded-xs" />
                            )}
                          </div>
                        ) : (
                          <p className="whitespace-pre-wrap">{msg.content}</p>
                        )}

                        {/* Copy Button on Assistant Message */}
                        {isAssistant && msg.content && (
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

                {/* Single Thinking State */}
                {isSending && !messages.some((m) => m.role === "assistant" && m.isStreaming) && (
                  <div className="flex flex-col items-start space-y-1">
                    <div
                      className="bg-muted/30 text-foreground border border-border/80 rounded-xl rounded-bl-xs p-3 max-w-[92%] shadow-sm"
                      aria-live="polite"
                      aria-atomic="false"
                    >
                      <div className="flex items-center gap-2 text-muted-foreground text-[11px] font-mono py-0.5">
                        <CircleNotch className="size-3.5 animate-spin text-primary shrink-0" />
                        <span className="text-primary/90">Analyzing clinical guidelines & precedents...</span>
                      </div>
                    </div>
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
                aria-label="Ask Sentinel clinical, legal, or CPB questions"
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
                aria-label="Send message"
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
