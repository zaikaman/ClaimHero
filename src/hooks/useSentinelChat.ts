import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
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
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  toolCalls?: ToolCallExecution[];
  createdAt?: number;
}

export function useSentinelChat(options: {
  selectedClaim: Claim | null;
  currentView: NavigationView;
}) {
  const { selectedClaim, currentView } = options;
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [isSending, setIsSending] = useState<boolean>(false);
  const [sessionId, setSessionId] = useState<Id<"chatbotSessions"> | null>(null);

  const getOrCreateSessionMutation = useMutation(api.chatbot.getOrCreateSession);
  const clearSessionMutation = useMutation(api.chatbot.clearSession);
  const sendMessageAction = useAction(api.actions.sentinelChatbot.sendMessageWithTools);

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

  // Subscribe to reactive messages in active session
  const messagesFromDb = useQuery(
    api.chatbot.listMessages,
    sessionId ? { sessionId } : "skip"
  );

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
      if (!trimmed || isSending || !sessionId) return;

      setIsSending(true);
      try {
        await sendMessageAction({
          sessionId,
          userMessage: trimmed,
          activeClaimId: selectedClaim?._id as Id<"claims"> | undefined,
          activeClaimNumber: selectedClaim?.claimNumber,
          activePayer: selectedClaim?.patient?.insurancePayer,
          currentView,
        });

      } catch (error) {
        console.error("Failed to send message to Sentinel Copilot:", error);
      } finally {
        setIsSending(false);
      }
    },
    [isSending, sessionId, sendMessageAction, selectedClaim, currentView]
  );

  const clearHistory = useCallback(async () => {
    if (!sessionId) return;
    try {
      await clearSessionMutation({ sessionId });
    } catch (err) {
      console.error("Failed to clear chat history:", err);
    }
  }, [sessionId, clearSessionMutation]);

  return {
    isOpen,
    setIsOpen,
    isSending,
    messages: (messagesFromDb || []) as ChatMessage[],
    sendMessage,
    clearHistory,
    selectedClaim,
    currentView,
  };
}
