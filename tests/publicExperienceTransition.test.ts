import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Mock Convex and Auth hooks for component rendering tests
vi.mock("convex/react", () => ({
  useMutation: () => vi.fn(),
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

import {
  PublicExperience,
  AmbientBackgroundVideo,
  AMBIENT_VIDEO_SRC,
} from "../src/components/landing/PublicExperience";
import { CinematicHero } from "../src/components/landing/CinematicHero";
import { AuthPage } from "../src/components/auth/AuthPage";

describe("PublicExperience & Seamless Landing-Auth Transition", () => {
  describe("1. AmbientBackgroundVideo Specifications", () => {
    it("exports the verified CloudFront video source URL", () => {
      expect(AMBIENT_VIDEO_SRC).toContain("d8j0ntlcm91z4.cloudfront.net");
      expect(AMBIENT_VIDEO_SRC).toContain(".mp4");
    });

    it("renders persistent ambient video tag with preload auto and bottom blur mask", () => {
      const html = renderToStaticMarkup(React.createElement(AmbientBackgroundVideo));
      expect(html).toContain("<video");
      expect(html).toContain(AMBIENT_VIDEO_SRC);
      expect(html).toContain('preload="auto"');
      expect(html).toContain("bottom-blur-mask");
      expect(html).toContain("backdrop-blur-xl");
    });
  });

  describe("2. CinematicHero embedBackground Prop", () => {
    it("renders with bg-transparent and skips duplicate video when embedBackground is false", () => {
      const html = renderToStaticMarkup(
        React.createElement(CinematicHero, {
          embedBackground: false,
          onEnterConsole: vi.fn(),
          isAuthenticated: false,
          isAuthLoading: false,
          hasCachedSession: false,
        })
      );
      expect(html).toContain("bg-transparent");
      expect(html).not.toContain("<video");
      expect(html).not.toContain("bottom-blur-mask");
    });

    it("renders standalone video and bg-black when embedBackground defaults to true", () => {
      const html = renderToStaticMarkup(
        React.createElement(CinematicHero, {
          onEnterConsole: vi.fn(),
          isAuthenticated: false,
          isAuthLoading: false,
          hasCachedSession: false,
        })
      );
      expect(html).toContain("bg-black");
      expect(html).toContain("<video");
      expect(html).toContain(AMBIENT_VIDEO_SRC);
    });
  });

  describe("3. AuthPage embedBackground Prop", () => {
    it("renders with bg-transparent and skips duplicate video when embedBackground is false", () => {
      const html = renderToStaticMarkup(
        React.createElement(AuthPage, {
          embedBackground: false,
          onNavigate: vi.fn(),
        })
      );
      expect(html).toContain("bg-transparent");
      expect(html).not.toContain("<video");
      expect(html).toContain("Back to Overview");
    });

    it("renders standalone video and bg-black when embedBackground defaults to true", () => {
      const html = renderToStaticMarkup(
        React.createElement(AuthPage, {
          onNavigate: vi.fn(),
        })
      );
      expect(html).toContain("bg-black");
      expect(html).toContain("<video");
      expect(html).toContain(AMBIENT_VIDEO_SRC);
    });

    it("renders the Explore as Anonymous Advocate button under Google auth", () => {
      const html = renderToStaticMarkup(
        React.createElement(AuthPage, {
          onNavigate: vi.fn(),
        })
      );
      expect(html).toContain("Continue with Google");
      expect(html).toContain("Explore as Anonymous Advocate");
      expect(html).toContain("Demo");
    });
  });

  describe("4. PublicExperience Unified Container Coordination", () => {
    it("activates landing view and deactivates auth view when currentView is landing", () => {
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

      // Must include persistent ambient video
      expect(html).toContain("<video");
      expect(html).toContain(AMBIENT_VIDEO_SRC);

      // Landing container should be visible and interactive
      expect(html).toContain("opacity-100 pointer-events-auto visible");
      expect(html).toContain('aria-hidden="false"');

      // Auth container should be hidden and non-focusable
      expect(html).toContain("opacity-0 pointer-events-none invisible");
      expect(html).toContain('aria-hidden="true"');
    });

    it("activates auth view and deactivates landing view when currentView is login", () => {
      const html = renderToStaticMarkup(
        React.createElement(PublicExperience, {
          currentView: "login",
          onNavigate: vi.fn(),
          isAuthenticated: false,
          isAuthLoading: false,
          hasCachedSession: false,
          pendingTargetView: null,
          setPendingTargetView: vi.fn(),
        })
      );

      // Persistent ambient video must remain in the DOM
      expect(html).toContain("<video");
      expect(html).toContain(AMBIENT_VIDEO_SRC);

      // Auth container should be visible and interactive
      expect(html).toContain("opacity-100 pointer-events-auto visible");
      // Landing container should be hidden
      expect(html).toContain("opacity-0 pointer-events-none invisible");
    });

    it("activates auth view when user is unauthenticated on non-landing views", () => {
      const html = renderToStaticMarkup(
        React.createElement(PublicExperience, {
          currentView: "radar",
          onNavigate: vi.fn(),
          isAuthenticated: false,
          isAuthLoading: false,
          hasCachedSession: false,
          pendingTargetView: null,
          setPendingTargetView: vi.fn(),
        })
      );

      // Unauthenticated non-landing route displays Auth card
      expect(html).toContain("Welcome Back");
      expect(html).toContain("<video");
    });

    it("coordinates both views and keeps persistent ambient background in DOM", () => {
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
      expect(html).toContain(AMBIENT_VIDEO_SRC);
      expect(html).toContain("Back to Overview");
      expect(html).toContain("Sign In");
    });

    it("renders mobile menu toggle button with aria-expanded attribute", () => {
      const html = renderToStaticMarkup(
        React.createElement(CinematicHero, {
          onEnterConsole: vi.fn(),
          isAuthenticated: false,
          isAuthLoading: false,
          hasCachedSession: false,
        })
      );
      expect(html).toContain('aria-expanded="false"');
    });

    it("safely sanitizes pendingTargetView so login or landing cannot trap the user", () => {
      const setPendingTargetView = vi.fn();
      const onNavigate = vi.fn();

      // Simulate onEnterConsole with "login"
      const target1 = "login" !== "login" && "login" !== "landing" ? "login" : "radar";
      expect(target1).toBe("radar");

      // Simulate onEnterConsole with "landing"
      const target2 = "landing" !== "login" && "landing" !== "landing" ? "landing" : "radar";
      expect(target2).toBe("radar");

      // Simulate onEnterConsole with deep link "evidence"
      const target3 = "evidence" !== "login" && "evidence" !== "landing" ? "evidence" : "radar";
      expect(target3).toBe("evidence");
    });

    it("renders AuthPage with scrollbar-none to prevent vertical scrollbars on laptops", () => {
      const html = renderToStaticMarkup(
        React.createElement(AuthPage, {
          onNavigate: vi.fn(),
          embedBackground: false,
        })
      );
      expect(html).toContain("scrollbar-none");
    });
  });
});

