import { useState, useEffect, useCallback, useMemo } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { useUIMessages } from "@convex-dev/agent/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { Claim } from "../types";
import { NavigationView } from "../components/layout/Sidebar";

export interface ToolCallExecution {
  id: string;
  name: string;
  arguments: string;
  output?: string;
}

export interface ChatMessage {
  _id?: string;
  key?: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  toolCalls?: ToolCallExecution[];
  createdAt?: number;
  isStreaming?: boolean;
}

export function useSentinelChat(options: {
  selectedClaim: Claim | null;
  currentView: NavigationView;
}) {
  const { selectedClaim, currentView } = options;
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [isSending, setIsSending] = useState<boolean>(false);
  const [sessionId, setSessionId] = useState<Id<"chatbotSessions"> | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);

  const getOrCreateSessionMutation = useMutation(api.chatbot.getOrCreateSession);
  const getOrCreateAgentThreadMutation = useMutation(api.sentinelAgentQueries.getOrCreateAgentThread);
  const clearSessionMutation = useMutation(api.chatbot.clearSession);
  const streamSentinelMessageAction = useAction(api.actions.sentinelAgent.streamSentinelMessage);
  const fallbackSendMessageAction = useAction(api.actions.sentinelChatbot.sendMessageWithTools);

  // Initialize or synchronize session
  useEffect(() => {
    let isMounted = true;
    async function initSession() {
      try {
        const id = await getOrCreateSessionMutation({
          activeClaimId: selectedClaim?._id as Id<"claims"> | undefined,
        });
        if (isMounted) {
          setSessionId(id);
        }
      } catch (err) {
        console.warn("Failed to initialize chatbot session:", err);
      }
    }

    initSession();
    return () => {
      isMounted = false;
    };
  }, [getOrCreateSessionMutation, selectedClaim?._id]);

  // Initialize or synchronize agent streaming thread
  useEffect(() => {
    let isMounted = true;
    async function initThread() {
      if (!sessionId) return;
      try {
        const res = await getOrCreateAgentThreadMutation({ sessionId });
        if (isMounted && res?.threadId) {
          setThreadId(res.threadId);
        }
      } catch (err) {
        console.warn("Failed to get or create agent thread:", err);
      }
    }

    initThread();
    return () => {
      isMounted = false;
    };
  }, [sessionId, getOrCreateAgentThreadMutation]);

  // Subscribe to real-time streaming UIMessages from Convex AI Agent component
  const { results: agentUIMessages } = useUIMessages(
    api.sentinelAgentQueries.listThreadMessages,
    threadId ? { threadId } : "skip",
    { initialNumItems: 50, stream: true }
  );

  // Fallback to legacy database messages if no agent thread messages exist yet
  const messagesFromDb = useQuery(
    api.chatbot.listMessages,
    sessionId ? { sessionId } : "skip"
  );

  // Map Agent component UIMessages into ChatMessage structure
  const mappedAgentMessages = useMemo(() => {
    if (!agentUIMessages || agentUIMessages.length === 0) return null;
    return agentUIMessages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => {
        const toolCalls: ToolCallExecution[] = [];
        if (Array.isArray(m.parts)) {
          for (const part of m.parts) {
            if (part && typeof part === "object") {
              const p = part as Record<string, unknown>;
              const pType = typeof p.type === "string" ? p.type : "";
              if (pType === "tool-call" || pType.startsWith("tool-")) {
                toolCalls.push({
                  id: (typeof p.toolCallId === "string" ? p.toolCallId : undefined) || String(Math.random()),
                  name: (typeof p.toolName === "string" ? p.toolName : undefined) || "agent_tool",
                  arguments: typeof p.args === "string" ? p.args : JSON.stringify(p.args || {}),
                  output: p.result ? (typeof p.result === "string" ? p.result : JSON.stringify(p.result)) : undefined,
                });
              }
            }
          }
        }
        return {
          key: m.key,
          _id: m.key,
          role: m.role as "user" | "assistant",
          content: m.text || "",
          toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
          isStreaming: m.status === "streaming",
          createdAt: m._creationTime || Date.now(),
        } satisfies ChatMessage;
      });
  }, [agentUIMessages]);

  const isAgentStreaming = useMemo(() => {
    return agentUIMessages?.some((m) => m.status === "streaming") || false;
  }, [agentUIMessages]);

  // Keyboard shortcut (⌘J / Ctrl+J) to toggle chatbot
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isSending || isAgentStreaming || !sessionId) return;

      setIsSending(true);
      try {
        let activeThreadId = threadId;
        if (!activeThreadId) {
          const res = await getOrCreateAgentThreadMutation({ sessionId });
          activeThreadId = res?.threadId || null;
          if (activeThreadId) {
            setThreadId(activeThreadId);
          }
        }

        if (activeThreadId) {
          await streamSentinelMessageAction({
            threadId: activeThreadId,
            prompt: trimmed,
            sessionId,
            activeClaimId: selectedClaim?._id as Id<"claims"> | undefined,
            activeClaimNumber: selectedClaim?.claimNumber,
            activePayer: selectedClaim?.patient?.insurancePayer,
            currentView,
          });
        } else {
          // Fallback if thread creation was unavailable
          await fallbackSendMessageAction({
            sessionId,
            userMessage: trimmed,
            activeClaimId: selectedClaim?._id as Id<"claims"> | undefined,
            activeClaimNumber: selectedClaim?.claimNumber,
            activePayer: selectedClaim?.patient?.insurancePayer,
            currentView,
          });
        }
      } catch (error) {
        console.error("Failed to send message to Sentinel Copilot:", error);
      } finally {
        setIsSending(false);
      }
    },
    [
      isSending,
      isAgentStreaming,
      sessionId,
      threadId,
      getOrCreateAgentThreadMutation,
      streamSentinelMessageAction,
      fallbackSendMessageAction,
      selectedClaim,
      currentView,
    ]
  );

  const clearHistory = useCallback(async () => {
    if (!sessionId) return;
    try {
      await clearSessionMutation({ sessionId });
      setThreadId(null);
    } catch (err) {
      console.error("Failed to clear chat history:", err);
    }
  }, [sessionId, clearSessionMutation]);

  return {
    isOpen,
    setIsOpen,
    isSending: isSending || isAgentStreaming,
    isStreaming: isAgentStreaming,
    messages: (mappedAgentMessages || (messagesFromDb || [])) as ChatMessage[],
    sendMessage,
    clearHistory,
    selectedClaim,
    currentView,
  };
}

