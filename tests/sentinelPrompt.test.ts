import { describe, it, expect } from "vitest";
import { buildLeanSentinelPrompt } from "../convex/lib/sentinelPrompt";

describe("Sentinel Copilot system prompt", () => {
  it("constructs a lean prompt with active claim context and tool instructions", () => {
    const prompt = buildLeanSentinelPrompt({
      currentView: "evidence",
      activeClaimId: "claims_12345",
      activeClaimNumber: "CLM-88219",
      activePayer: "Aetna",
    });

    expect(prompt).toContain("Sentinel Copilot");
    expect(prompt).toContain("Active Interface View: evidence");
    expect(prompt).toContain("CLM-88219 (Aetna)");
    expect(prompt).toContain("claims_12345");
    expect(prompt).toContain("firecrawl_web_search");
    expect(prompt).toContain("firecrawl_scrape_url");
    expect(prompt).toContain("crawl_and_attach_evidence");
    // Zero emojis in any model-facing prompt
    expect(prompt).not.toMatch(/[\u{1F300}-\u{1F9FF}]/u);
  });

  it("names only tools that the Sentinel agent actually registers", async () => {
    const { SENTINEL_AGENT_TOOLS } = await import("../convex/actions/sentinelAgent");
    const registered = Object.keys(SENTINEL_AGENT_TOOLS);
    const prompt = buildLeanSentinelPrompt({ currentView: "radar" });

    // Tools are referenced in the prompt as backticked snake_case names. Every
    // one of them must exist on the agent, otherwise the model is instructed to
    // call tools it cannot reach.
    const referenced = [...prompt.matchAll(/`([a-z]+_[a-z_]+)`/g)].map(
      (match) => match[1]
    );

    expect(referenced).toContain("firecrawl_web_search");
    for (const toolName of referenced) {
      expect(registered).toContain(toolName);
    }
  });

  it("falls back to the radar view and no active claim when none is selected", () => {
    const prompt = buildLeanSentinelPrompt({});

    expect(prompt).toContain("Active Interface View: radar");
    expect(prompt).toContain("None (No claim currently selected)");
  });
});
