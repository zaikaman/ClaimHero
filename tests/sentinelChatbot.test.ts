import { describe, it, expect } from "vitest";
import {
  buildLeanSentinelPrompt,
  SENTINEL_CHAT_TOOLS,
} from "../convex/actions/sentinelChatbot";

describe("Sentinel Chatbot Tool-Calling & Context Architecture", () => {
  it("defines standard agentic clinical & statutory tools", () => {
    expect(SENTINEL_CHAT_TOOLS).toBeDefined();
    expect(SENTINEL_CHAT_TOOLS.length).toBeGreaterThanOrEqual(7);

    const toolNames = SENTINEL_CHAT_TOOLS.map((t) => t.function.name);
    expect(toolNames).toContain("get_active_claim_details");
    expect(toolNames).toContain("search_claims");
    expect(toolNames).toContain("get_clinical_evidence");
    expect(toolNames).toContain("get_appeal_brief");
    expect(toolNames).toContain("get_p2p_defense_script");
    expect(toolNames).toContain("get_audit_trail");
    expect(toolNames).toContain("search_precedents");
  });

  it("constructs lean system prompt with active claim context", () => {
    const prompt = buildLeanSentinelPrompt({
      currentView: "evidence",
      activeClaimId: "claims_12345",
      activeClaimNumber: "CLM-88219",
      activePayer: "Aetna",
      conversationSummary: "Discussed knee arthroplasty CPT 27447 denial reason CO-50.",
    });

    expect(prompt).toContain("Sentinel Copilot");
    expect(prompt).toContain("Active Interface View: evidence");
    expect(prompt).toContain("CLM-88219 (Aetna)");
    expect(prompt).toContain("claims_12345");
    expect(prompt).toContain("PREVIOUS CONVERSATION SUMMARY");
    expect(prompt).toContain("CPT 27447");
    // Ensure no emojis
    expect(prompt).not.toMatch(/[\u{1F300}-\u{1F9FF}]/u);
  });

  it("constructs lean system prompt when no claim is active", () => {
    const prompt = buildLeanSentinelPrompt({
      currentView: "radar",
    });

    expect(prompt).toContain("Active Interface View: radar");
    expect(prompt).toContain("None (No claim currently selected)");
  });

  it("validates all tool parameter schemas have required definitions", () => {
    for (const tool of SENTINEL_CHAT_TOOLS) {
      expect(tool.type).toBe("function");
      expect(tool.function.name).toBeTruthy();
      expect(tool.function.description).toBeTruthy();
      expect(tool.function.parameters.type).toBe("object");
      expect(tool.function.parameters.properties).toBeDefined();
    }
  });
});
