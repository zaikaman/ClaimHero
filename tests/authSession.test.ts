import { describe, it, expect } from "vitest";
import {
  hasCachedAuthToken,
  shouldDeferLandingAuthActions,
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
