import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("convex/react", () => ({
  useMutation: () => vi.fn(),
  useAction: () => vi.fn(),
  useQuery: () => null,
}));

vi.mock("@convex-dev/auth/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: false, isLoading: false }),
  useAuthActions: () => ({ signOut: vi.fn() }),
}));

vi.mock("@convex-dev/auth/providers/password/react", () => ({
  useSignInWithPassword: () => ({ signIn: vi.fn(), pending: false }),
  useSignUpWithPassword: () => ({ signUp: vi.fn(), pending: false }),
}));

vi.mock("@convex-dev/auth/providers/oauth/react", () => ({
  useSignInWithGoogle: () => ({ signInGoogle: vi.fn() }),
  useOauth: () => ({ flowError: null }),
}));

vi.mock("@convex-dev/auth/providers/anonymous/react", () => ({
  useAnonymousAuth: () => ({ signInAnonymous: vi.fn() }),
}));

import { TemplateLanding } from "../src/components/landing/TemplateLanding";
import { PublicExperience } from "../src/components/landing/PublicExperience";

describe("TemplateLanding editorial story", () => {
  it("renders ClaimHero-tailored hero, stats, workspace, denials, demo, artifacts, trust, and start", () => {
    const html = renderToStaticMarkup(
      React.createElement(TemplateLanding, { onEnterConsole: vi.fn() })
    );
    expect(html).toContain("Fight the denial.");
    expect(html).toContain("Keep your coverage.");
    expect(html).toContain("1.5B claims");
    expect(html).toContain("$200B");
    expect(html).toContain("The Workspace");
    expect(html).toContain("Case Radar");
    expect(html).toContain("Evidence Matrix");
    expect(html).toContain("Appeal Studio");
    expect(html).toContain("AgentMail Inbox");
    expect(html).toContain("Convex");
    expect(html).toContain("Firecrawl");
    expect(html).toContain("OpenAI");
    expect(html).toContain("AgentMail");
    expect(html).toContain("Fights We Take On");
    expect(html).toContain("ERISA Deadline Defense");
    expect(html).toContain("High-Dollar EOB Review");
    expect(html).toContain("P2P Physician Reviews");
    expect(html).not.toContain("CO-50 Medical Necessity");
    expect(html).toContain("Cigna Global");
    expect(html).not.toContain("Eleanor Vance");
    expect(html).toContain("Your Appeal Packet");
    expect(html).toContain("AI Prepares. You Approve.");
    expect(html).toContain("Start Your Appeal.");
    expect(html).toContain("Launch Sentinel");
    expect(html).toContain("Sign In");
  });

  it("mounts one shared WebGL background project behind the public experience", () => {
    const html = renderToStaticMarkup(
      React.createElement(PublicExperience, {
        currentView: "landing",
        onNavigate: vi.fn(),
        isAuthenticated: false,
        isAuthLoading: false,
        hasCachedSession: false,
        pendingTargetView: null,
        setPendingTargetView: vi.fn(),
      })
    );
    expect(html).toContain('data-us-project="bmaMERjX2VZDtPrh4Zwx"');
    // Exactly one scene host: landing and login share a single WebGL instance
    expect(html.split("data-us-project").length - 1).toBe(1);
  });

  it("keeps tabular numbers for hero figures", () => {
    const html = renderToStaticMarkup(
      React.createElement(TemplateLanding, { onEnterConsole: vi.fn() })
    );
    expect(html).toContain("tabular-nums");
  });

  it("embeds the editorial story inside the landing container of PublicExperience", () => {
    const html = renderToStaticMarkup(
      React.createElement(PublicExperience, {
        currentView: "landing",
        onNavigate: vi.fn(),
        isAuthenticated: false,
        isAuthLoading: false,
        hasCachedSession: false,
        pendingTargetView: null,
        setPendingTargetView: vi.fn(),
      })
    );
    expect(html).toContain("overflow-y-auto");
    expect(html).toContain("Fight the denial.");
    expect(html).toContain("Sign In");
    // Auth card speaks the same editorial language as the landing
    expect(html).toContain("bg-[#1a1a1a]");
  });

  it("updates navigation header and CTAs dynamically when user is authenticated", () => {
    const html = renderToStaticMarkup(
      React.createElement(TemplateLanding, {
        onEnterConsole: vi.fn(),
        isAuthenticated: true,
        userName: "Dr. Eleanor Vance",
        userEmail: "eleanor@example.com",
        userInitial: "E",
        onSignOut: vi.fn(),
      })
    );
    expect(html).toContain("Open Workspace");
    expect(html).not.toContain("Sign Out");
    expect(html).not.toContain("Sign In");
  });
});
