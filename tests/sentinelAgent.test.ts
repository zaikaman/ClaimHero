import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SENTINEL_AGENT_TOOLS, createSentinelAgent } from "../convex/actions/sentinelAgent";

describe("Convex AI Agent Component Integration (@convex-dev/agent)", () => {
  const originalKey = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    process.env.OPENAI_API_KEY = "sk-mock-test-key-for-agent-verification";
  });

  afterEach(() => {
    if (originalKey) {
      process.env.OPENAI_API_KEY = originalKey;
    } else {
      delete process.env.OPENAI_API_KEY;
    }
  });
  it("defines all 10 native tools with valid inputSchema and execute methods", () => {
    expect(SENTINEL_AGENT_TOOLS).toBeDefined();
    const toolKeys = Object.keys(SENTINEL_AGENT_TOOLS);
    expect(toolKeys.length).toBe(10);

    const expectedTools = [
      "get_active_claim_details",
      "search_claims",
      "get_clinical_evidence",
      "get_appeal_brief",
      "get_p2p_defense_script",
      "get_audit_trail",
      "search_precedents",
      "firecrawl_web_search",
      "firecrawl_scrape_url",
      "crawl_and_attach_evidence",
    ];

    for (const expected of expectedTools) {
      expect(toolKeys).toContain(expected);
      const tool = (SENTINEL_AGENT_TOOLS as Record<string, any>)[expected];
      expect(tool).toBeDefined();
      expect(typeof tool.execute).toBe("function");
      expect(typeof tool.description).toBe("string");
      expect(tool.description.length).toBeGreaterThan(10);
      expect(tool.inputSchema).toBeDefined();
      // Ensure zero emojis
      expect(tool.description).not.toMatch(/[\u{1F300}-\u{1F9FF}]/u);
    }
  });

  it("instantiates the Sentinel Agent with native components and step limits", () => {
    const agent = createSentinelAgent();
    expect(agent).toBeDefined();
    expect(agent.options).toBeDefined();
    expect(agent.options.name).toBe("Sentinel Copilot");
    expect(agent.options.tools).toBeDefined();
    expect(agent.options.stopWhen).toBeDefined();
  });
});
