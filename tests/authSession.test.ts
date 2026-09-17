import { describe, it, expect, afterEach } from "vitest";
import {
  hasCachedAuthToken,
  hasPendingOAuthFlow,
  isOAuthCallbackUrl,
  OAUTH_CALLBACK_BOOT_FLAG,
  shouldDeferLandingAuthActions,
  shouldShowCompletingSignIn,
  wasOAuthCallbackAtBoot,
  type AuthTokenStorage,
} from "../src/lib/authSession";

function stubStorage(entries: Record<string, string>): AuthTokenStorage {
  const keys = Object.keys(entries);
  return {
    length: keys.length,
    key: (index: number) => keys[index] ?? null,
    getItem: (key: string) =>
      Object.prototype.hasOwnProperty.call(entries, key) ? entries[key] : null,
  };
}

describe("authSession cached-credential helpers", () => {
  it("returns false without storage (SSR)", () => {
    expect(hasCachedAuthToken(null)).toBe(false);
  });

  it("returns false for empty storage", () => {
    expect(hasCachedAuthToken(stubStorage({}))).toBe(false);
  });

  it("ignores unrelated keys", () => {
    expect(
      hasCachedAuthToken(
        stubStorage({ claimhero_onboarding_completed: "1", theme: "dark" }),
      ),
    ).toBe(false);
  });

  it("rejects empty or malformed access-token values", () => {
    expect(hasCachedAuthToken(stubStorage({ __convexAuthJWT: "" }))).toBe(false);
    expect(hasCachedAuthToken(stubStorage({ __convexAuthJWT: "garbage" }))).toBe(
      false,
    );
    expect(hasCachedAuthToken(stubStorage({ __convexAuthJWT: "a.b" }))).toBe(false);
  });

  it("accepts a well-formed access JWT", () => {
    expect(
      hasCachedAuthToken(stubStorage({ __convexAuthJWT: "header.payload.sig" })),
    ).toBe(true);
  });

  it("accepts per-deployment suffixed access-token keys", () => {
    expect(
      hasCachedAuthToken(
        stubStorage({ __convexAuthJWT_abc123: "header.payload.signature" }),
      ),
    ).toBe(true);
  });

  it("accepts a refresh token as a returning session", () => {
    expect(
      hasCachedAuthToken(stubStorage({ __convexAuthRefreshToken: "opaque-123" })),
    ).toBe(true);
    expect(
      hasCachedAuthToken(
        stubStorage({ __convexAuthRefreshToken_xyz: "opaque-456" }),
      ),
    ).toBe(true);
  });

  it("rejects empty refresh-token values", () => {
    expect(hasCachedAuthToken(stubStorage({ __convexAuthRefreshToken: "" }))).toBe(
      false,
    );
  });

  it("never throws on hostile storage", () => {
    const hostile: AuthTokenStorage = {
      length: 1,
      key: () => {
        throw new Error("blocked");
      },
      getItem: () => {
        throw new Error("blocked");
      },
    };
    expect(hasCachedAuthToken(hostile)).toBe(false);
  });
});

describe("shouldDeferLandingAuthActions", () => {
  it("defers only while a cached session is verifying", () => {
    expect(
      shouldDeferLandingAuthActions({
        isAuthenticated: false,
        isAuthLoading: true,
        hasCachedSession: true,
      }),
    ).toBe(true);
  });

  it("renders signed-out immediately for anonymous visitors, even while loading", () => {
    expect(
      shouldDeferLandingAuthActions({
        isAuthenticated: false,
        isAuthLoading: true,
        hasCachedSession: false,
      }),
    ).toBe(false);
  });

  it("never defers once loading settles", () => {
    expect(
      shouldDeferLandingAuthActions({
        isAuthenticated: true,
        isAuthLoading: false,
        hasCachedSession: true,
      }),
    ).toBe(false);
    expect(
      shouldDeferLandingAuthActions({
        isAuthenticated: false,
        isAuthLoading: false,
        hasCachedSession: false,
      }),
    ).toBe(false);
    expect(
      shouldDeferLandingAuthActions({
        isAuthenticated: true,
        isAuthLoading: false,
        hasCachedSession: false,
      }),
    ).toBe(false);
    expect(
      shouldDeferLandingAuthActions({
        isAuthenticated: false,
        isAuthLoading: false,
        hasCachedSession: true,
      }),
    ).toBe(false);
  });

  it("never defers when already authenticated", () => {
    expect(
      shouldDeferLandingAuthActions({
        isAuthenticated: true,
        isAuthLoading: true,
        hasCachedSession: true,
      }),
    ).toBe(false);
  });
});

describe("hasPendingOAuthFlow", () => {
  it("returns false without storage (SSR)", () => {
    expect(hasPendingOAuthFlow(null)).toBe(false);
  });

  it("returns false for empty storage", () => {
    expect(hasPendingOAuthFlow(stubStorage({}))).toBe(false);
  });

  it("ignores unrelated and token keys", () => {
    expect(
      hasPendingOAuthFlow(
        stubStorage({
          theme: "dark",
          __convexAuthJWT: "header.payload.sig",
          __convexAuthRefreshToken: "opaque-123",
        }),
      ),
    ).toBe(false);
  });

  it("detects the OAuth in-flight flow key", () => {
    expect(
      hasPendingOAuthFlow(
        stubStorage({
          __convexAuthProvider_oauth_flow: JSON.stringify({
            providerName: "google",
            state: "abc",
          }),
        }),
      ),
    ).toBe(true);
  });

  it("detects per-deployment suffixed flow keys", () => {
    expect(
      hasPendingOAuthFlow(
        stubStorage({
          __convexAuthProvider_oauth_flow_abc123: JSON.stringify({
            providerName: "google",
            state: "abc",
          }),
        }),
      ),
    ).toBe(true);
  });

  it("rejects empty flow values", () => {
    expect(
      hasPendingOAuthFlow(
        stubStorage({ __convexAuthProvider_oauth_flow: "" }),
      ),
    ).toBe(false);
  });

  it("never throws on hostile storage", () => {
    const hostile: AuthTokenStorage = {
      length: 1,
      key: () => {
        throw new Error("blocked");
      },
      getItem: () => {
        throw new Error("blocked");
      },
    };
    expect(hasPendingOAuthFlow(hostile)).toBe(false);
  });
});

describe("isOAuthCallbackUrl", () => {
  it("detects the success callback param", () => {
    expect(
      isOAuthCallbackUrl("https://app.example/login?convexAuthCode=one-time"),
    ).toBe(true);
  });

  it("detects the error callback param", () => {
    expect(
      isOAuthCallbackUrl("https://app.example/login?convexAuthError=expired"),
    ).toBe(true);
  });

  it("ignores bare code params from unrelated flows", () => {
    expect(isOAuthCallbackUrl("https://app.example/login?code=abc")).toBe(
      false,
    );
  });

  it("returns false without callback params", () => {
    expect(isOAuthCallbackUrl("https://app.example/login")).toBe(false);
    expect(isOAuthCallbackUrl("https://app.example/?claim=123")).toBe(false);
    expect(isOAuthCallbackUrl(null)).toBe(false);
    expect(isOAuthCallbackUrl("")).toBe(false);
  });
});

describe("wasOAuthCallbackAtBoot", () => {
  afterEach(() => {
    // Vitest runs in node (no window); remove any stub between cases.
    delete (globalThis as Record<string, unknown>).window;
  });

  it("returns false outside the browser", () => {
    expect(wasOAuthCallbackAtBoot()).toBe(false);
  });

  it("reads the boot flag captured before param stripping", () => {
    (globalThis as Record<string, unknown>).window = {
      location: { href: "https://app.example/login", search: "" },
      [OAUTH_CALLBACK_BOOT_FLAG]: true,
    };
    expect(wasOAuthCallbackAtBoot()).toBe(true);
  });

  it("falls back to a live callback URL", () => {
    (globalThis as Record<string, unknown>).window = {
      location: {
        href: "https://app.example/login?convexAuthCode=abc",
        search: "?convexAuthCode=abc",
      },
    };
    expect(wasOAuthCallbackAtBoot()).toBe(true);
  });
});

describe("shouldShowCompletingSignIn", () => {
  it("shows completing state for an OAuth return still verifying", () => {
    expect(
      shouldShowCompletingSignIn({
        isAuthenticated: false,
        isAuthLoading: true,
        hasCachedSession: false,
        isOAuthReturn: true,
      }),
    ).toBe(true);
  });

  it("shows completing state for a pending flow still verifying", () => {
    expect(
      shouldShowCompletingSignIn({
        isAuthenticated: false,
        isAuthLoading: true,
        hasCachedSession: false,
        hasPendingFlow: true,
      }),
    ).toBe(true);
  });

  it("shows completing state for a returning session still verifying", () => {
    expect(
      shouldShowCompletingSignIn({
        isAuthenticated: false,
        isAuthLoading: true,
        hasCachedSession: true,
      }),
    ).toBe(true);
  });

  it("keeps anonymous visitors on signed-out copy while loading", () => {
    expect(
      shouldShowCompletingSignIn({
        isAuthenticated: false,
        isAuthLoading: true,
        hasCachedSession: false,
      }),
    ).toBe(false);
  });

  it("never shows completing state once authenticated or settled", () => {
    expect(
      shouldShowCompletingSignIn({
        isAuthenticated: true,
        isAuthLoading: false,
        hasCachedSession: true,
        isOAuthReturn: true,
      }),
    ).toBe(false);
    expect(
      shouldShowCompletingSignIn({
        isAuthenticated: false,
        isAuthLoading: false,
        hasCachedSession: true,
        isOAuthReturn: true,
        hasPendingFlow: true,
      }),
    ).toBe(false);
    expect(
      shouldShowCompletingSignIn({
        isAuthenticated: true,
        isAuthLoading: true,
        hasCachedSession: true,
      }),
    ).toBe(false);
  });
});
