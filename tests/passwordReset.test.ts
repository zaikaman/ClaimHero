import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { formatPasswordResetEmail } from "../convex/lib/passwordResetEmail";
import * as passwordResetModule from "../convex/passwordReset";
import * as libAgentMail from "../convex/lib/agentMail";
import { rateLimiter } from "../convex/lib/rateLimiter";

describe("Password Reset via AgentMail - Email Template & Logic", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.SITE_URL = "https://test.convex.site";
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe("formatPasswordResetEmail", () => {
    it("formats high-security email containing the 6-digit code and direct link", () => {
      const email = formatPasswordResetEmail({
        email: "advocate@hospital.org",
        code: "839201",
        token: "tok_secure_123456789abcdef",
        appSiteUrl: "https://claimhero.ai",
        expirationMinutes: 15,
      });

      expect(email.subject).toContain("839201");
      expect(email.text).toContain("839201");
      expect(email.text).toContain("advocate@hospital.org");
      expect(email.text).toContain("https://claimhero.ai/?resetToken=tok_secure_123456789abcdef");
      expect(email.text).toContain("15 minutes");

      expect(email.html).toContain("8 3 9 2 0 1");
      expect(email.html).toContain("advocate@hospital.org");
      expect(email.html).toContain("claimhero.ai/?resetToken=tok_secure_123456789abcdef");
      expect(email.html).toContain("Reset Password Directly");
    });

    it("sanitizes email and code to prevent HTML injection", () => {
      const email = formatPasswordResetEmail({
        email: 'victim@test.org<script>alert("xss")</script>',
        code: "123456<img src=x onerror=alert(1)>",
        token: "tok_xss",
      });

      expect(email.html).not.toContain("<script>");
      expect(email.html).not.toContain("<img");
      expect(email.subject).toBe("[ClaimHero Security] Password Reset Code: 123456");
    });

    it("handles missing appSiteUrl gracefully without crashing", () => {
      delete process.env.SITE_URL;
      const email = formatPasswordResetEmail({
        email: "user@test.org",
        code: "999888",
        token: "tok_abc",
      });

      expect(email.subject).toBe("[ClaimHero Security] Password Reset Code: 999888");
      expect(email.text).toContain("999888");
      expect(email.html).toContain("9 9 9 8 8 8");
    });
  });

  describe("Convex Functions - Password Reset Flow", () => {
    it("requestPasswordReset: rejects invalid email addresses", async () => {
      const mockCtx: any = {};
      const handler = (passwordResetModule.requestPasswordReset as any)._handler;

      const result = await handler(mockCtx, { email: "invalid-email-format" });
      expect(result.success).toBe(false);
      expect(result.error).toBe("INVALID_EMAIL");
    });

    it("requestPasswordReset: respects rate limiting per email", async () => {
      const mockCtx: any = {};
      vi.spyOn(rateLimiter, "limit").mockResolvedValue({
        ok: false,
        retryAfter: 300000,
      } as any);

      const handler = (passwordResetModule.requestPasswordReset as any)._handler;
      const result = await handler(mockCtx, { email: "busy@hospital.org" });

      expect(result.success).toBe(false);
      expect(result.error).toBe("RATE_LIMITED");
      expect(result.retryAfterMs).toBe(300000);
    });

    it("requestPasswordReset: returns generic success when user is not found (anti-enumeration)", async () => {
      vi.spyOn(rateLimiter, "limit").mockResolvedValue({ ok: true } as any);
      const mockCtx: any = {
        runQuery: vi.fn().mockResolvedValue(null),
        runMutation: vi.fn(),
      };

      const handler = (passwordResetModule.requestPasswordReset as any)._handler;
      const result = await handler(mockCtx, { email: "unknown@hospital.org" });

      expect(result.success).toBe(true);
      expect(result.email).toBe("unknown@hospital.org");
      expect(mockCtx.runMutation).not.toHaveBeenCalled();
    });

    it("requestPasswordReset: dispatches reset email via AgentMail when user is found", async () => {
      vi.spyOn(rateLimiter, "limit").mockResolvedValue({ ok: true } as any);
      vi.spyOn(libAgentMail, "getSharedAgentMailboxes").mockReturnValue({
        senderInboxId: "inbox_sender_claimhero",
        senderEmail: "claimhero-sender@agentmail.to",
      });
      const sendSpy = vi.spyOn(libAgentMail, "sendAgentMailMessage").mockResolvedValue({
        outboundId: "out_123" as any,
      });

      const mockCtx: any = {
        runQuery: vi.fn().mockResolvedValue({
          userId: "user_advocate_1",
          email: "advocate@hospital.org",
          name: "Dr. Jane",
        }),
        runMutation: vi.fn().mockResolvedValue("tok_doc_id"),
      };

      const handler = (passwordResetModule.requestPasswordReset as any)._handler;
      const result = await handler(mockCtx, { email: "Advocate@Hospital.org " });

      expect(result.success).toBe(true);
      expect(result.email).toBe("advocate@hospital.org");

      // Verify token creation mutation was called
      expect(mockCtx.runMutation).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          userId: "user_advocate_1",
          email: "advocate@hospital.org",
        })
      );

      // Verify sendAgentMailMessage was called with claimhero-sender
      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          inboxId: "inbox_sender_claimhero",
          to: "advocate@hospital.org",
          subject: expect.stringContaining("[ClaimHero Security] Password Reset Code:"),
        })
      );
    });

    it("verifyCodeAndResetPassword: validates code format and length", async () => {
      vi.spyOn(rateLimiter, "limit").mockResolvedValue({ ok: true } as any);
      const mockCtx: any = {
        db: {
          query: vi.fn(),
        },
      };

      const handler = (passwordResetModule.verifyCodeAndResetPassword as any)._handler;
      const result = await handler(mockCtx, {
        email: "test@hospital.org",
        code: "123", // Too short
        newPassword: "ValidPassword123!",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("INVALID_CODE");
    });

    it("verifyCodeAndResetPassword: fails on invalid or expired code", async () => {
      vi.spyOn(rateLimiter, "limit").mockResolvedValue({ ok: true } as any);

      // Scenario A: No active record found
      const mockCtxA: any = {
        db: {
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                first: vi.fn().mockResolvedValue(null),
              }),
            }),
          }),
        },
      };
      const handler = (passwordResetModule.verifyCodeAndResetPassword as any)._handler;
      const resA = await handler(mockCtxA, {
        email: "test@hospital.org",
        code: "123456",
        newPassword: "ValidPassword123!",
      });
      expect(resA.success).toBe(false);
      expect(resA.error).toBe("INVALID_CODE");

      // Scenario B: Expired record
      const mockCtxB: any = {
        db: {
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                first: vi.fn().mockResolvedValue({
                  _id: "tok_1",
                  userId: "u1",
                  expiresAt: Date.now() - 10000, // Expired
                }),
              }),
            }),
          }),
        },
      };
      const resB = await handler(mockCtxB, {
        email: "test@hospital.org",
        code: "123456",
        newPassword: "ValidPassword123!",
      });
      expect(resB.success).toBe(false);
      expect(resB.error).toBe("CODE_EXPIRED");
    });

    it("verifyCodeAndResetPassword: resets password and marks token used on valid code", async () => {
      vi.spyOn(rateLimiter, "limit").mockResolvedValue({ ok: true } as any);

      const patchMock = vi.fn().mockResolvedValue(undefined);
      const runMutationMock = vi.fn().mockResolvedValue({ success: true });

      const mockCtx: any = {
        db: {
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                first: vi.fn().mockResolvedValue({
                  _id: "tok_valid_1",
                  userId: "user_test_99",
                  expiresAt: Date.now() + 600000,
                  usedAt: undefined,
                }),
              }),
            }),
          }),
          patch: patchMock,
        },
        runMutation: runMutationMock,
      };

      const handler = (passwordResetModule.verifyCodeAndResetPassword as any)._handler;
      const result = await handler(mockCtx, {
        email: "test@hospital.org",
        code: "654321",
        newPassword: "NewStrongPassword987!",
      });

      expect(result.success).toBe(true);
      // Verify setPassword was called on password component
      expect(runMutationMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          userId: "user_test_99",
          password: "NewStrongPassword987!",
        })
      );
      // Verify token was marked as used
      expect(patchMock).toHaveBeenCalledWith("tok_valid_1", expect.objectContaining({
        usedAt: expect.any(Number),
      }));
    });

    it("resetPasswordWithToken: resets password via direct token", async () => {
      vi.spyOn(rateLimiter, "limit").mockResolvedValue({ ok: true } as any);

      const patchMock = vi.fn().mockResolvedValue(undefined);
      const runMutationMock = vi.fn().mockResolvedValue({ success: true });

      const mockCtx: any = {
        db: {
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              first: vi.fn().mockResolvedValue({
                _id: "tok_valid_2",
                userId: "user_token_99",
                email: "tokenuser@hospital.org",
                expiresAt: Date.now() + 600000,
                usedAt: undefined,
              }),
            }),
          }),
          patch: patchMock,
        },
        runMutation: runMutationMock,
      };

      const handler = (passwordResetModule.resetPasswordWithToken as any)._handler;
      const result = await handler(mockCtx, {
        token: "tok_direct_access_string",
        newPassword: "NewTokenPassword123!",
      });

      expect(result.success).toBe(true);
      expect(result.email).toBe("tokenuser@hospital.org");
      expect(runMutationMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          userId: "user_token_99",
          password: "NewTokenPassword123!",
        })
      );
      expect(patchMock).toHaveBeenCalledWith("tok_valid_2", expect.objectContaining({
        usedAt: expect.any(Number),
      }));
    });

    it("requestPasswordReset: rejects multiline or CRLF injection in email", async () => {
      const mockCtx: any = {};
      const handler = (passwordResetModule.requestPasswordReset as any)._handler;

      const result = await handler(mockCtx, { email: "victim@hospital.org\r\nBcc: evil@phish.com" });
      expect(result.success).toBe(false);
      expect(result.error).toBe("INVALID_EMAIL");
    });

    it("resetPasswordWithToken: rejects empty or blank tokens", async () => {
      const mockCtx: any = {};
      const handler = (passwordResetModule.resetPasswordWithToken as any)._handler;

      const result = await handler(mockCtx, {
        token: "   ",
        newPassword: "ValidPassword123!",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("INVALID_TOKEN");
    });

    it("resetPasswordWithToken: rejects non-existent or already used token", async () => {
      vi.spyOn(rateLimiter, "limit").mockResolvedValue({ ok: true } as any);

      // Scenario A: Non-existent token
      const mockCtxA: any = {
        db: {
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              first: vi.fn().mockResolvedValue(null),
            }),
          }),
        },
      };
      const handler = (passwordResetModule.resetPasswordWithToken as any)._handler;
      const resA = await handler(mockCtxA, {
        token: "tok_non_existent",
        newPassword: "ValidPassword123!",
      });
      expect(resA.success).toBe(false);
      expect(resA.error).toBe("INVALID_TOKEN");

      // Scenario B: Already used token
      const mockCtxB: any = {
        db: {
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              first: vi.fn().mockResolvedValue({
                _id: "tok_already_used",
                userId: "user_1",
                email: "user@test.org",
                expiresAt: Date.now() + 600000,
                usedAt: Date.now() - 5000,
              }),
            }),
          }),
        },
      };
      const resB = await handler(mockCtxB, {
        token: "tok_already_used",
        newPassword: "ValidPassword123!",
      });
      expect(resB.success).toBe(false);
      expect(resB.error).toBe("INVALID_TOKEN");
    });

    it("resetPasswordWithToken: rejects expired recovery token", async () => {
      vi.spyOn(rateLimiter, "limit").mockResolvedValue({ ok: true } as any);

      const mockCtx: any = {
        db: {
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              first: vi.fn().mockResolvedValue({
                _id: "tok_expired_doc",
                userId: "user_expired",
                email: "expired@test.org",
                expiresAt: Date.now() - 10000, // Expired
                usedAt: undefined,
              }),
            }),
          }),
        },
      };

      const handler = (passwordResetModule.resetPasswordWithToken as any)._handler;
      const result = await handler(mockCtx, {
        token: "tok_expired_doc",
        newPassword: "ValidPassword123!",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("TOKEN_EXPIRED");
    });

    it("resetPasswordWithToken: handles password complexity validation error", async () => {
      vi.spyOn(rateLimiter, "limit").mockResolvedValue({ ok: true } as any);

      const mockCtx: any = {
        db: {
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              first: vi.fn().mockResolvedValue({
                _id: "tok_valid_pwd_err",
                userId: "user_short_pwd",
                email: "shortpwd@hospital.org",
                expiresAt: Date.now() + 600000,
                usedAt: undefined,
              }),
            }),
          }),
        },
        runMutation: vi.fn().mockResolvedValue({
          success: false,
          userError: {
            error: "PASSWORD_TOO_SHORT",
            minimumLength: 8,
          },
        }),
      };

      const handler = (passwordResetModule.resetPasswordWithToken as any)._handler;
      const result = await handler(mockCtx, {
        token: "tok_valid_pwd_err",
        newPassword: "short",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("PASSWORD_TOO_SHORT");
      expect(result.message).toContain("8 characters long");
    });
  });
});
