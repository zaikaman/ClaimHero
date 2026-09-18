import { mutation, action, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { components, internal } from "./_generated/api";
import { rateLimiter } from "./lib/rateLimiter";
import { getSharedAgentMailboxes, sendAgentMailMessage } from "./lib/agentMail";
import { formatPasswordResetEmail } from "./lib/passwordResetEmail";

function generateSecureToken(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return (crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "")).toLowerCase();
  }
  const bytes = new Uint8Array(24);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function generateVerificationCode(): string {
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    return ((arr[0] % 900000) + 100000).toString();
  }
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Internal query to resolve a user record by email or username.
 */
export const findUserForReset = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const normalized = args.email.trim().toLowerCase();

    // 1. Check users table by email
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", normalized))
      .first();
    if (user) {
      return {
        userId: user._id,
        email: normalized,
        name: user.name,
      };
    }

    // 2. Check authUsername component mapping
    try {
      const authUserId = await ctx.runQuery(
        components.authUsername.public.getUserIdByUsername,
        { username: normalized }
      );
      if (authUserId) {
        const userId = authUserId as Id<"users">;
        const directUser = await ctx.db.get(userId);
        return {
          userId,
          email: normalized,
          name: directUser && "name" in directUser ? directUser.name : undefined,
        };
      }
    } catch {
      // Best-effort username component lookup
    }

    return null;
  },
});

/**
 * Internal mutation to record a newly generated reset token and invalidate prior unused tokens.
 */
export const createResetRecord = internalMutation({
  args: {
    userId: v.id("users"),
    email: v.string(),
    code: v.string(),
    token: v.string(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Expire any existing active tokens for this email to prevent replay (bounded to recent 20)
    const priorTokens = await ctx.db
      .query("passwordResetTokens")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .order("desc")
      .take(20);

    for (const prior of priorTokens) {
      if (!prior.usedAt && prior.expiresAt > now) {
        await ctx.db.patch(prior._id, { usedAt: now });
      }
    }

    return await ctx.db.insert("passwordResetTokens", {
      userId: args.userId,
      email: args.email,
      code: args.code,
      token: args.token,
      expiresAt: args.expiresAt,
      createdAt: now,
    });
  },
});

/**
 * Public action to initiate a password reset.
 * Sends a real transactional email via the claimhero-sender AgentMail gateway.
 * Returns success even if the email does not exist to prevent account enumeration.
 */
export const requestPasswordReset = action({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const normalizedEmail = args.email.trim().toLowerCase();
    const emailRegex = /^[^\s@\r\n]+@[^\s@\r\n]+\.[^\s@\r\n]+$/;
    if (!normalizedEmail || !emailRegex.test(normalizedEmail)) {
      return {
        success: false,
        error: "INVALID_EMAIL",
        message: "Please enter a valid email address.",
      };
    }

    // 1. Enforce rate limiting per requested email
    const limitStatus = await rateLimiter.limit(ctx, "passwordResetRequest", {
      key: normalizedEmail,
    });
    if (!limitStatus.ok) {
      const waitMinutes = Math.ceil((limitStatus.retryAfter || 60000) / 60000);
      return {
        success: false,
        error: "RATE_LIMITED",
        retryAfterMs: limitStatus.retryAfter,
        message: `Too many password reset requests. Please wait ${waitMinutes} minute${waitMinutes > 1 ? "s" : ""} before trying again.`,
      };
    }

    // 2. Lookup user record
    const user = await ctx.runQuery(internal.passwordReset.findUserForReset, {
      email: normalizedEmail,
    });

    if (user) {
      const code = generateVerificationCode();
      const token = generateSecureToken();
      const expirationMinutes = 15;
      const expiresAt = Date.now() + expirationMinutes * 60 * 1000;

      // 3. Durably record the token in Convex
      await ctx.runMutation(internal.passwordReset.createResetRecord, {
        userId: user.userId,
        email: normalizedEmail,
        code,
        token,
        expiresAt,
      });

      // 4. Dispatch transactional recovery email via claimhero-sender AgentMail
      try {
        const mailboxes = getSharedAgentMailboxes();
        const formatted = formatPasswordResetEmail({
          email: normalizedEmail,
          code,
          token,
          appSiteUrl: process.env.SITE_URL,
          expirationMinutes,
        });

        await sendAgentMailMessage({
          inboxId: mailboxes.senderInboxId,
          to: normalizedEmail,
          subject: formatted.subject,
          text: formatted.text,
          html: formatted.html,
          headers: {
            "Auto-Submitted": "auto-generated",
            "X-Auto-Response-Suppress": "All",
          },
          ctx,
        });
      } catch (mailErr) {
        console.warn("[PasswordReset] AgentMail transmission notice:", mailErr);
      }
    }

    // 5. Always return generic success to prevent account enumeration
    return {
      success: true,
      email: normalizedEmail,
      message: "If an account exists with this email, password recovery instructions have been dispatched.",
    };
  },
});

/**
 * Public mutation to verify the 6-digit OTP code and update the account password.
 */
export const verifyCodeAndResetPassword = mutation({
  args: {
    email: v.string(),
    code: v.string(),
    newPassword: v.string(),
  },
  handler: async (ctx, args) => {
    const normalizedEmail = args.email.trim().toLowerCase();
    const cleanCode = args.code.trim().replace(/[^0-9]/g, "");

    // 1. Rate limiting on verification attempts
    const limitStatus = await rateLimiter.limit(ctx, "passwordResetVerify", {
      key: normalizedEmail,
    });
    if (!limitStatus.ok) {
      return {
        success: false,
        error: "RATE_LIMITED",
        retryAfterMs: limitStatus.retryAfter,
        message: "Too many verification attempts. Please wait a few minutes before trying again.",
      };
    }

    if (cleanCode.length !== 6) {
      return {
        success: false,
        error: "INVALID_CODE",
        message: "Please enter the complete 6-digit verification code.",
      };
    }

    // 2. Query active reset token matching email and code
    const resetRecord = await ctx.db
      .query("passwordResetTokens")
      .withIndex("by_email_and_code", (q) =>
        q.eq("email", normalizedEmail).eq("code", cleanCode)
      )
      .order("desc")
      .first();

    if (!resetRecord || resetRecord.usedAt !== undefined) {
      return {
        success: false,
        error: "INVALID_CODE",
        message: "Invalid or expired verification code. Please verify the code or request a new one.",
      };
    }

    if (resetRecord.expiresAt < Date.now()) {
      return {
        success: false,
        error: "CODE_EXPIRED",
        message: "Verification code has expired. Please request a new recovery code.",
      };
    }

    // 3. Atomically update the password via the auth password provider component
    const setResult = await ctx.runMutation(
      components.authPasswordProvider.public.setPassword,
      {
        userId: resetRecord.userId,
        password: args.newPassword,
      }
    );

    if (!setResult.success) {
      let friendlyMessage = "Password does not meet security requirements.";
      if (setResult.userError.error === "PASSWORD_TOO_SHORT") {
        friendlyMessage = `Password must be at least ${setResult.userError.minimumLength} characters long.`;
      } else if (setResult.userError.error === "PASSWORD_TOO_LONG") {
        friendlyMessage = `Password must be at most ${setResult.userError.maximumLength} characters long.`;
      } else if (setResult.userError.error === "PASSWORD_HAS_SURROUNDING_WHITESPACE") {
        friendlyMessage = "Password cannot start or end with whitespace.";
      } else if (setResult.userError.error === "PASSWORD_TOO_COMMON") {
        friendlyMessage = "This password is too easily guessed. Please select a more unique password.";
      }
      return {
        success: false,
        error: setResult.userError.error,
        message: friendlyMessage,
      };
    }

    // 4. Mark token as used
    await ctx.db.patch(resetRecord._id, {
      usedAt: Date.now(),
    });

    return {
      success: true,
      message: "Password has been successfully updated. You can now sign in with your new password.",
    };
  },
});

/**
 * Public mutation to reset a password directly using the one-time link token.
 */
export const resetPasswordWithToken = mutation({
  args: {
    token: v.string(),
    newPassword: v.string(),
  },
  handler: async (ctx, args) => {
    const cleanToken = args.token.trim();
    if (!cleanToken) {
      return {
        success: false,
        error: "INVALID_TOKEN",
        message: "Invalid recovery token.",
      };
    }

    // 1. Query token record
    const resetRecord = await ctx.db
      .query("passwordResetTokens")
      .withIndex("by_token", (q) => q.eq("token", cleanToken))
      .first();

    // 2. Rate limiting (keyed on account email if found, or shared throttle on invalid token guessing)
    const rateLimitKey = resetRecord ? resetRecord.email : "invalid_token_attempts";
    const limitStatus = await rateLimiter.limit(ctx, "passwordResetVerify", {
      key: rateLimitKey,
    });
    if (!limitStatus.ok) {
      return {
        success: false,
        error: "RATE_LIMITED",
        retryAfterMs: limitStatus.retryAfter,
        message: "Too many attempts. Please wait a few minutes before trying again.",
      };
    }

    if (!resetRecord || resetRecord.usedAt !== undefined) {
      return {
        success: false,
        error: "INVALID_TOKEN",
        message: "This password recovery link is invalid or has already been used.",
      };
    }

    if (resetRecord.expiresAt < Date.now()) {
      return {
        success: false,
        error: "TOKEN_EXPIRED",
        message: "This recovery link has expired. Please request a new password reset.",
      };
    }

    // 3. Atomically update the password
    const setResult = await ctx.runMutation(
      components.authPasswordProvider.public.setPassword,
      {
        userId: resetRecord.userId,
        password: args.newPassword,
      }
    );

    if (!setResult.success) {
      let friendlyMessage = "Password does not meet security requirements.";
      if (setResult.userError.error === "PASSWORD_TOO_SHORT") {
        friendlyMessage = `Password must be at least ${setResult.userError.minimumLength} characters long.`;
      } else if (setResult.userError.error === "PASSWORD_TOO_LONG") {
        friendlyMessage = `Password must be at most ${setResult.userError.maximumLength} characters long.`;
      } else if (setResult.userError.error === "PASSWORD_HAS_SURROUNDING_WHITESPACE") {
        friendlyMessage = "Password cannot start or end with whitespace.";
      } else if (setResult.userError.error === "PASSWORD_TOO_COMMON") {
        friendlyMessage = "This password is too easily guessed. Please select a more unique password.";
      }
      return {
        success: false,
        error: setResult.userError.error,
        message: friendlyMessage,
      };
    }

    // 4. Mark token as used
    await ctx.db.patch(resetRecord._id, {
      usedAt: Date.now(),
    });

    return {
      success: true,
      email: resetRecord.email,
      message: "Password has been successfully updated. You can now sign in with your new password.",
    };
  },
});
