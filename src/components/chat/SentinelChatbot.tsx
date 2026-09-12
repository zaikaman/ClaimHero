import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
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
  ArrowElbowDownRight,
} from "@phosphor-icons/react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { BrandIcon } from "../common/BrandLogo";
import { useSentinelChat } from "../../hooks/useSentinelChat";
import { Claim } from "../../types";
import { NavigationView } from "../layout/Sidebar";
import { toast } from "sonner";

export interface SentinelChatbotProps {
  selectedClaim: Claim | null;
  currentView: NavigationView;
  isOpen?: boolean;
  onClose?: () => void;
  onOpenChange?: (open: boolean) => void;
}

export const SentinelChatbot: React.FC<SentinelChatbotProps> = ({
  selectedClaim,
  currentView,
  isOpen: controlledIsOpen,
  onClose,
  onOpenChange,
}) => {
  const {
    isOpen,
    setIsOpen,
    isSending,
    isStreaming,
    messages,
    sendMessage,
    clearHistory,
  } = useSentinelChat({
    selectedClaim,
    currentView,
    isOpen: controlledIsOpen,
    onOpenChange,
  });

  const [input, setInput] = useState<string>("");
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [insertedIndex, setInsertedIndex] = useState<number | null>(null);
  const [expandedTools, setExpandedTools] = useState<Record<number, boolean>>({});

  const drawerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isMouseDownOnBackdrop = useRef(false);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    onClose?.();
  }, [setIsOpen, onClose]);

  const handleCloseRef = useRef(handleClose);
  handleCloseRef.current = handleClose;

  // Focus textarea when drawer opens and restore previous focus on close
  useEffect(() => {
    if (isOpen && typeof window !== "undefined") {
      previousActiveElement.current = document.activeElement as HTMLElement | null;
      drawerRef.current?.focus();
      const timer = setTimeout(() => {
        textareaRef.current?.focus();
      }, 150);
      return () => {
        clearTimeout(timer);
        previousActiveElement.current?.focus();
      };
    }
  }, [isOpen]);

  // Handle escape key, focus trapping, and body scroll lock
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) {
        e.preventDefault();
        handleCloseRef.current();
        return;
      }

      // Accessible Tab Focus Trap within Drawer
      if (e.key === "Tab" && drawerRef.current) {
        const focusables = drawerRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length > 0) {
          const first = focusables[0];
          const last = focusables[focusables.length - 1];

          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener("keydown", handleKeyDown);
    }
    const originalOverflow = typeof document !== "undefined" ? document.body.style.overflow : "";
    if (typeof document !== "undefined") {
      document.body.style.overflow = "hidden";
    }

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("keydown", handleKeyDown);
      }
      if (typeof document !== "undefined") {
        document.body.style.overflow = originalOverflow;
      }
    };
  }, [isOpen]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isSending, isOpen]);

  const handleSend = () => {
    if (!input.trim() || isSending) return;
    sendMessage(input);
    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
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

  const handleInsertIntoBrief = (text: string, index: number) => {
    if (currentView !== "studio") {
      toast.info("Navigate to Appeal Studio to insert cited arguments into your brief");
      return;
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("claimhero:insert-brief-text", { detail: { text } })
      );
    }
    setInsertedIndex(index);
    setTimeout(() => setInsertedIndex(null), 2000);
  };

  const toggleTools = (index: number) => {
    setExpandedTools((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
  };

  const handleBackdropMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    isMouseDownOnBackdrop.current = e.target === e.currentTarget;
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && isMouseDownOnBackdrop.current) {
      handleClose();
    }
    isMouseDownOnBackdrop.current = false;
  };

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

  // Format tool arguments into clean readable JSON
  const formatToolArguments = (raw: unknown): string => {
    if (typeof raw === "string") {
      try {
        const parsed = JSON.parse(raw);
        return JSON.stringify(parsed, null, 2);
      } catch {
        return raw;
      }
    }
    return JSON.stringify(raw, null, 2);
  };

  if (!isOpen || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Sentinel Clinical Copilot"
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex justify-end animate-fadeIn no-print print:hidden"
      onMouseDown={handleBackdropMouseDown}
      onClick={handleBackdropClick}
    >
      <div
        ref={drawerRef}
        tabIndex={-1}
        className="w-full max-w-xl bg-background border-l border-border/80 h-full shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-200 outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drawer Header */}
        <div className="sticky top-0 z-10 shrink-0 border-b border-border/70 bg-card/95 backdrop-blur-md px-5 py-3.5 flex items-center justify-between gap-3 select-none">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="size-8 rounded-lg bg-primary/10 text-primary border border-primary/20 flex items-center justify-center shrink-0">
              <BrandIcon size="xs" className="text-primary" />
            </div>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-foreground tracking-tight">
                  Sentinel Clinical Copilot
                </span>
                <Badge variant="outline" className="font-mono text-[10px] text-primary border-primary/30 bg-primary/10 hidden sm:inline-flex">
                  ⌘J
                </Badge>
              </div>
              <span className="text-[11px] text-muted-foreground truncate">
                {isStreaming ? (
                  <span className="text-primary font-medium">Synthesizing clinical response...</span>
                ) : selectedClaim ? (
                  `Case #${selectedClaim.claimNumber} • ${selectedClaim.patient?.insurancePayer || "Insurer"}`
                ) : (
                  "Clinical Policy & ERISA Statutory Intelligence"
                )}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {messages.length > 0 && (
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={clearHistory}
                className="text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                title="Clear conversation history"
                aria-label="Clear conversation history"
              >
                <Trash className="size-3.5" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={handleClose}
              className="text-muted-foreground hover:text-foreground cursor-pointer"
              title="Close drawer (Esc)"
              aria-label="Close drawer (Esc)"
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>

        {/* Drawer Messages Scroll Area */}
        <div className="flex-1 p-4 overflow-y-auto space-y-4 text-left text-xs">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col justify-between py-2 space-y-5">
              <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 space-y-2.5">
                <div className="flex items-center gap-2 text-primary font-semibold text-xs">
                  <ShieldCheck className="size-4" />
                  <span>Autonomous Clinical & Statutory Sentinel</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Sentinel Copilot cross-references clinical denial codes against crawled insurer Clinical Policy Bulletins (CPBs), active ERISA § 502(c) statutory exposure, and vector-matched precedent briefs.
                </p>
                {selectedClaim && (
                  <div className="pt-1 flex flex-wrap gap-1.5">
                    <Badge variant="secondary" className="font-mono text-[10px]">
                      Patient: {selectedClaim.patient?.name || "Anonymous"}
                    </Badge>
                    <Badge variant="secondary" className="font-mono text-[10px]">
                      Payer: {selectedClaim.patient?.insurancePayer || "Insurer"}
                    </Badge>
                    {selectedClaim.denialReasonCode && (
                      <Badge variant="destructive" className="font-mono text-[10px]">
                        Denial: {selectedClaim.denialReasonCode}
                      </Badge>
                    )}
                  </div>
                )}
              </div>

              {/* Quick Starter Prompts */}
              <div className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <span className="text-[10px] font-mono uppercase text-muted-foreground tracking-wider">
                    Suggested Inquiries
                  </span>
                  <span className="text-[10px] text-muted-foreground/60">Click to execute</span>
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {quickPrompts.map((item, idx) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={idx}
                        onClick={() => sendMessage(item.prompt)}
                        className="w-full text-left p-2.5 rounded-lg border border-border/70 bg-card/60 hover:bg-card hover:border-primary/40 transition-all flex items-center justify-between gap-3 group cursor-pointer shadow-2xs"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Icon className="size-4 text-primary shrink-0 group-hover:scale-110 transition-transform" />
                          <span className="text-xs font-medium text-foreground truncate">
                            {item.label}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono text-muted-foreground/60 shrink-0 group-hover:text-primary transition-colors">
                          Inquire &rarr;
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
                    className={`flex flex-col ${isUser ? "items-end" : "items-start"} space-y-1.5`}
                  >
                    {/* Optional Tool Calls Tray */}
                    {isAssistant && msg.toolCalls && msg.toolCalls.length > 0 && (
                      <div className="w-full max-w-[94%] mb-1">
                        <button
                          onClick={() => toggleTools(index)}
                          aria-expanded={isToolsExpanded}
                          aria-label={`Toggle ${msg.toolCalls.length} agent action details`}
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
                          <div className="mt-1 p-2.5 rounded-lg border border-border/60 bg-muted/20 space-y-2 text-[10px] font-mono">
                            {msg.toolCalls.map((tc, tcIdx) => (
                              <div key={tcIdx} className="space-y-1">
                                <div className="font-semibold text-primary">
                                  &bull; {formatToolName(tc.name)}
                                </div>
                                {tc.arguments && (
                                  <pre className="text-[9px] text-muted-foreground/80 overflow-x-auto p-1.5 bg-background/60 rounded border border-border/40 font-mono leading-relaxed">
                                    {formatToolArguments(tc.arguments)}
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
                      className={`relative p-3.5 rounded-xl max-w-[94%] leading-relaxed group shadow-xs ${
                        isUser
                          ? "bg-primary text-primary-foreground font-medium rounded-br-xs"
                          : "bg-card text-foreground border border-border/80 rounded-bl-xs"
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

                      {/* Action Bar for Assistant Messages (Copy & Insert into Brief) */}
                      {isAssistant && msg.content && (
                        <div className="flex items-center gap-1.5 mt-2.5 pt-2 border-t border-border/40 justify-end">
                          {/* Insert into Brief Button (available during appeal workflow) */}
                          <button
                            type="button"
                            onClick={() => handleInsertIntoBrief(msg.content, index)}
                            className="bg-muted/60 hover:bg-muted border border-border/70 rounded px-2 py-1 text-[10px] font-mono text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors cursor-pointer"
                            title="Insert cited argument into active Appeal Brief"
                            aria-label="Insert cited argument into active Appeal Brief"
                          >
                            {insertedIndex === index ? (
                              <>
                                <Check className="size-3 text-emerald-500" />
                                <span className="text-emerald-500 font-semibold">Inserted into Brief</span>
                              </>
                            ) : (
                              <>
                                <ArrowElbowDownRight className="size-3 text-primary" />
                                <span>Insert into Brief</span>
                              </>
                            )}
                          </button>

                          {/* Copy Text Button */}
                          <button
                            type="button"
                            onClick={() => handleCopy(msg.content, index)}
                            className="bg-muted/60 hover:bg-muted border border-border/70 rounded px-2 py-1 text-[10px] font-mono text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors cursor-pointer"
                            title="Copy markdown text"
                            aria-label="Copy markdown text"
                          >
                            {copiedIndex === index ? (
                              <>
                                <Check className="size-3 text-emerald-500" />
                                <span className="text-emerald-500 font-semibold">Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="size-3" />
                                <span>Copy</span>
                              </>
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Single Thinking State */}
              {isSending && !messages.some((m) => m.role === "assistant" && m.isStreaming) && (
                <div className="flex flex-col items-start space-y-1">
                  <div
                    className="bg-card text-foreground border border-border/80 rounded-xl rounded-bl-xs p-3.5 max-w-[94%] shadow-sm"
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

        {/* Drawer Footer Input Area */}
        <div className="p-4 border-t border-border/80 bg-card/60 backdrop-blur-md space-y-2.5">
          <div className="flex items-end gap-2 rounded-xl bg-background/90 border border-border/80 p-2 pl-3 focus-within:border-primary/60 focus-within:ring-1 focus-within:ring-primary/40 shadow-inner transition-all">
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              aria-label="Ask Sentinel clinical, legal, or CPB questions"
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
              }}
              onKeyDown={handleTextareaKeyDown}
              placeholder={
                selectedClaim
                  ? `Ask about ${selectedClaim.claimNumber} or ERISA statutes...`
                  : "Ask clinical, legal, or CPB questions..."
              }
              className="flex-1 max-h-32 resize-none bg-transparent py-1 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none leading-relaxed font-sans scrollbar-none"
              style={{ minHeight: "24px" }}
            />
            <Button
              variant="default"
              size="icon-sm"
              onClick={handleSend}
              disabled={!input.trim() || isSending}
              aria-label="Send message"
              className="size-8 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-30 shrink-0 transition-transform active:scale-95 cursor-pointer flex items-center justify-center"
              title="Send message (Enter)"
            >
              {isSending ? (
                <CircleNotch className="size-4 animate-spin" />
              ) : (
                <PaperPlaneRight className="size-4" weight="fill" />
              )}
            </Button>
          </div>

          <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground px-1">
            <div className="flex items-center gap-1.5 truncate">
              {selectedClaim ? (
                <>
                  <span className="size-2 rounded-full bg-emerald-500 shrink-0 shadow-[0_0_6px_rgba(16,185,129,0.8)]" />
                  <span className="truncate">
                    Linked: Case #{selectedClaim.claimNumber} ({selectedClaim.patient?.insurancePayer || "Insurer"})
                  </span>
                </>
              ) : (
                <span>Global Clinical & ERISA Sentinel Active</span>
              )}
            </div>
            <span className="shrink-0 text-muted-foreground/50">Enter to send &bull; Shift+Enter for newline</span>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
