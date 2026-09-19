import React, { useState, useEffect, useRef } from "react";
import { useMutation, useAction } from "convex/react";
import { useConvexAuth } from "@convex-dev/auth/react";
import { useSignInWithPassword, useSignUpWithPassword } from "@convex-dev/auth/providers/password/react";
import { useSignInWithGoogle, useOauth } from "@convex-dev/auth/providers/oauth/react";
import { useAnonymousAuth } from "@convex-dev/auth/providers/anonymous/react";
import { api } from "../../../convex/_generated/api";
import {
  hasPendingOAuthFlow,
  wasOAuthCallbackAtBoot,
} from "../../lib/authSession";
import {
  Eye,
  EyeSlash,
  ArrowLeft,
  CircleNotch,
  WarningCircle,
  Flask,
  CheckCircle,
  Key,
  EnvelopeSimple,
  ShieldCheck,
  ArrowCounterClockwise,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { NavigationView } from "../layout/Sidebar";
import { BrandLogo } from "../common/BrandLogo";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../ui/dialog";

interface AuthPageProps {
  onNavigate: (view: NavigationView) => void;
  onSuccess?: () => void;
  /**
   * Whether the auth form is the currently visible surface.
   * Inside PublicExperience the form stays mounted (hidden) alongside the
   * landing story to keep the transition seamless. While hidden
   * it must not auto-navigate an already-authenticated visitor away from the
   * landing page. Defaults to true for standalone usage.
   */
  active?: boolean;
}

export const AuthPage: React.FC<AuthPageProps> = ({
  onNavigate,
  onSuccess,
  active = true,
}) => {
  const { signIn: signInPassword, pending: isSigningIn } = useSignInWithPassword(api.auth.signInWithPassword);
  const { signUp: signUpPassword, pending: isSigningUp } = useSignUpWithPassword(api.auth.signUpWithPassword);
  const { signInGoogle } = useSignInWithGoogle(api.auth);
  const { signInAnonymous } = useAnonymousAuth(api.auth.signInAnonymous);
  const { flowError } = useOauth();
  const { isAuthenticated, isLoading: isAuthLoading } = useConvexAuth();
  const updateProfile = useMutation(api.users.updateProfile);

  const [isGoogleLoading, setIsGoogleLoading] = useState<boolean>(false);
  const [isAnonymousLoading, setIsAnonymousLoading] = useState<boolean>(false);

  const [flow, setFlow] = useState<"signIn" | "signUp">("signIn");
  const [name, setName] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [rememberMe, setRememberMe] = useState<boolean>(true);

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const requestPasswordResetAction = useAction(api.passwordReset.requestPasswordReset);
  const verifyCodeAndResetMutation = useMutation(api.passwordReset.verifyCodeAndResetPassword);
  const resetPasswordWithTokenMutation = useMutation(api.passwordReset.resetPasswordWithToken);

  const [isResetDialogOpen, setIsResetDialogOpen] = useState<boolean>(false);
  const [resetStep, setResetStep] = useState<"request" | "verify" | "token" | "success">("request");
  const [resetEmail, setResetEmail] = useState<string>("");
  const [resetCode, setResetCode] = useState<string>("");
  const [resetNewPassword, setResetNewPassword] = useState<string>("");
  const [resetConfirmPassword, setResetConfirmPassword] = useState<string>("");
  const [resetToken, setResetToken] = useState<string>("");
  const [showResetPassword, setShowResetPassword] = useState<boolean>(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState<number>(0);
  const [isSubmittingReset, setIsSubmittingReset] = useState<boolean>(false);

  // Snapshot once: true for the whole page load that returns from the Google
  // redirect (the provider strips the callback params during init, so a live
  // URL check would miss it after mount).
  const [isOAuthReturn] = useState<boolean>(() => wasOAuthCallbackAtBoot());
  // While the OAuth code exchange is in flight the provider reports loading
  // with no session yet. Show an explicit completing state instead of a
  // static form so the return trip never looks stuck on the login page.
  const isCompletingOAuth =
    !isAuthenticated &&
    (isGoogleLoading ||
      (isAuthLoading && (isOAuthReturn || hasPendingOAuthFlow())));
  const showGoogleBusy = isGoogleLoading || isCompletingOAuth;

  // Enter the workspace the exact tick the session becomes authenticated
  // (covers the Google redirect return, which has no submit handler to call
  // onSuccess). Runs alongside the App-level redirect guard; whichever fires
  // first wins and the router dedupes identical targets.
  // Gated on `active` so the hidden pre-mounted form inside PublicExperience
  // never bounces an authenticated visitor off the landing page.
  const didAutoNavigateRef = useRef<boolean>(false);
  useEffect(() => {
    if (!isAuthenticated || didAutoNavigateRef.current || !active) return;
    didAutoNavigateRef.current = true;
    setIsGoogleLoading(false);
    setIsAnonymousLoading(false);
    setIsLoading(false);
    if (onSuccess) {
      onSuccess();
    } else {
      onNavigate("radar");
    }
  }, [isAuthenticated, onNavigate, onSuccess, active]);

  // Countdown timer for reset email resends
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  // Deep-link direct token detection (?resetToken=...)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const urlParams = new URLSearchParams(window.location.search);
    const tokenFromUrl = urlParams.get("resetToken");
    if (tokenFromUrl && tokenFromUrl.trim()) {
      setResetToken(tokenFromUrl.trim());
      setResetStep("token");
      setResetError(null);
      setIsResetDialogOpen(true);
    }
  }, []);

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = resetEmail.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      setResetError("Please enter a valid email address.");
      return;
    }
    setResetError(null);
    setIsSubmittingReset(true);

    try {
      const res = await requestPasswordResetAction({ email: cleanEmail });
      setIsSubmittingReset(false);
      if (!res.success) {
        setResetError(res.message || "Failed to dispatch recovery email. Please wait before trying again.");
        return;
      }
      setResetStep("verify");
      setResendCooldown(60);
      toast.success("Verification code dispatched via ClaimHero Security.");
    } catch (err: unknown) {
      setIsSubmittingReset(false);
      const msg = err instanceof Error ? err.message : "Failed to dispatch recovery email.";
      setResetError(msg);
    }
  };

  const handleResendCode = async () => {
    if (resendCooldown > 0 || isSubmittingReset) return;
    const cleanEmail = resetEmail.trim().toLowerCase();
    if (!cleanEmail) return;
    setResetError(null);
    setIsSubmittingReset(true);

    try {
      const res = await requestPasswordResetAction({ email: cleanEmail });
      setIsSubmittingReset(false);
      if (!res.success) {
        setResetError(res.message || "Failed to resend recovery email. Please wait before trying again.");
        return;
      }
      setResendCooldown(60);
      toast.success("A fresh verification code has been dispatched.");
    } catch (err: unknown) {
      setIsSubmittingReset(false);
      const msg = err instanceof Error ? err.message : "Failed to resend recovery email.";
      setResetError(msg);
    }
  };

  const handleVerifyAndReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError(null);

    const cleanCode = resetCode.trim().replace(/[^0-9]/g, "");
    if (cleanCode.length !== 6) {
      setResetError("Please enter the complete 6-digit verification code from your email.");
      return;
    }

    if (resetNewPassword.length < 8) {
      setResetError("Password must be at least 8 characters long.");
      return;
    }

    if (resetNewPassword !== resetConfirmPassword) {
      setResetError("Passwords do not match. Please ensure both fields are identical.");
      return;
    }

    setIsSubmittingReset(true);
    try {
      const res = await verifyCodeAndResetMutation({
        email: resetEmail.trim().toLowerCase(),
        code: cleanCode,
        newPassword: resetNewPassword,
      });
      setIsSubmittingReset(false);

      if (!res.success) {
        setResetError(res.message || "Verification failed. Please check the code or try again.");
        return;
      }

      setResetStep("success");
      setEmail(resetEmail.trim().toLowerCase());
      setPassword("");
      toast.success("Password updated successfully! You can now sign in.");
    } catch (err: unknown) {
      setIsSubmittingReset(false);
      const msg = err instanceof Error ? err.message : "Password reset failed.";
      setResetError(msg);
    }
  };

  const handleResetWithToken = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError(null);

    if (resetNewPassword.length < 8) {
      setResetError("Password must be at least 8 characters long.");
      return;
    }

    if (resetNewPassword !== resetConfirmPassword) {
      setResetError("Passwords do not match. Please ensure both fields are identical.");
      return;
    }

    setIsSubmittingReset(true);
    try {
      const res = await resetPasswordWithTokenMutation({
        token: resetToken,
        newPassword: resetNewPassword,
      });
      setIsSubmittingReset(false);

      if (!res.success) {
        setResetError(res.message || "Recovery link is invalid or expired.");
        return;
      }

      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        url.searchParams.delete("resetToken");
        window.history.replaceState({}, "", url.pathname + (url.search || ""));
      }

      if (res.email) {
        setEmail(res.email);
      }
      setResetStep("success");
      toast.success("Password updated successfully! You can now sign in.");
    } catch (err: unknown) {
      setIsSubmittingReset(false);
      const msg = err instanceof Error ? err.message : "Password reset failed.";
      setResetError(msg);
    }
  };

  const handlePasswordAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email || !password) {
      setError("Please enter both email and password.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }

    setIsLoading(true);

    try {
      if (flow === "signIn") {
        const result = await signInPassword({ username: email, password });
        if (!result.success) {
          setIsLoading(false);
          if (result.userError.error === "INVALID_CREDENTIALS" || result.userError.error === "USER_NOT_FOUND") {
            setError("Invalid email or password. Please check your credentials or click Sign Up.");
          } else if (result.userError.error === "RATE_LIMITED") {
            setError("Too many attempts. Please wait a moment and try again.");
          } else {
            setError("Authentication failed. Please check your credentials.");
          }
          return;
        }
      } else {
        const result = await signUpPassword({ username: email, password });
        if (!result.success) {
          setIsLoading(false);
          if (result.userError.error === "USERNAME_TAKEN") {
            setError("An account with this email already exists. Please sign in instead.");
          } else if (result.userError.error === "PASSWORD_TOO_SHORT") {
            setError("Password must be at least 8 characters long.");
          } else {
            setError("Sign up failed. Please check your credentials.");
          }
          return;
        }
        if (name.trim()) {
          try {
            await updateProfile({ name: name.trim() });
          } catch {
            // Best effort name update
          }
        }
      }

      setIsLoading(false);
      if (onSuccess) {
        onSuccess();
      } else {
        onNavigate("radar");
      }
    } catch (err) {
      setIsLoading(false);
      console.error("Auth error:", err);
      const msg = err instanceof Error ? err.message : "Authentication failed.";
      setError(msg);
    }
  };

  useEffect(() => {
    if (flowError) {
      setIsGoogleLoading(false);
      if (flowError.code === "access_denied") {
        setError("Google sign-in was cancelled.");
      } else if (flowError.code === "expired") {
        setError("Google sign-in timed out. Please try again.");
      } else {
        setError(flowError.message || "Google sign-in encountered an error. Please try again.");
      }
    }
  }, [flowError]);

  const handleGoogleAuth = async () => {
    setError(null);
    setIsGoogleLoading(true);

    try {
      await signInGoogle();
    } catch (err: unknown) {
      setIsGoogleLoading(false);
      console.error("Google sign-in error:", err);
      const msg = err instanceof Error ? err.message : "Google sign-in encountered an error.";
      setError(msg);
    }
  };

  const handleAnonymousAuth = async () => {
    setError(null);
    setIsAnonymousLoading(true);

    try {
      await signInAnonymous();
      setIsAnonymousLoading(false);
      if (onSuccess) {
        onSuccess();
      } else {
        onNavigate("radar");
      }
    } catch (err: unknown) {
      setIsAnonymousLoading(false);
      console.error("Anonymous sign-in error:", err);
      const msg = err instanceof Error ? err.message : "Anonymous sign-in encountered an error.";
      setError(msg);
    }
  };

  return (
    <div className="min-h-screen h-screen w-screen bg-transparent text-white font-sans flex items-center justify-center p-3 sm:p-5 md:p-6 lg:p-8 relative overflow-hidden select-none">

      {/* 1. Main Split-Card Auth Container */}
      <div className="relative z-10 w-full max-w-[1240px] h-auto min-h-0 sm:h-[88vh] sm:min-h-[500px] max-h-[96vh] sm:max-h-[820px] rounded-none p-2 sm:p-2.5 border border-white/20 shadow-2xl grid grid-cols-1 lg:grid-cols-12 gap-0 overflow-y-auto sm:overflow-hidden backdrop-blur-xs">
        
        {/* ================= LEFT COLUMN: Pure See-Through Window to Fullscreen Video Behind ================= */}
        <div className="hidden lg:flex lg:col-span-6 relative h-full flex-col justify-between p-6 sm:p-8 lg:p-9 xl:p-12 bg-gradient-to-t from-black/90 via-black/25 to-black/35 bg-gradient-to-r from-transparent via-transparent to-black/40 rounded-none overflow-hidden">
          
          {/* Subtle Right Edge Hairline Divider Line for seamless middle blending */}
          <div className="absolute right-0 top-0 bottom-0 w-[1px] bg-gradient-to-b from-white/10 via-white/35 to-white/10 pointer-events-none z-20" />

          {/* Top Row: Back to Overview Button & Sentinel Label (Nestled inside card header - never overlaps border) */}
          <div className="relative z-10 flex items-center justify-between gap-3 pt-1">
            <button
              type="button"
              onClick={() => onNavigate("landing")}
              className="flex items-center gap-2 border border-white/20 bg-black/60 px-3.5 py-1.5 text-xs font-medium uppercase tracking-widest text-white/90 transition-all hover:border-white/40 hover:text-white active:scale-95 cursor-pointer backdrop-blur-md"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Overview</span>
            </button>

            <div className="flex items-center gap-2">
              <div className="w-8 xl:w-12 h-[1px] bg-white/40" />
              <span className="text-[11px] font-mono tracking-widest text-white/80 uppercase font-medium">
                CLINICAL APPEAL SENTINEL
              </span>
            </div>
          </div>

          {/* Bottom Headline & Subtext (Tailored to ClaimHero) */}
          <div className="relative z-10 space-y-3 pb-1">
            <h2 className="text-3xl sm:text-4xl lg:text-4xl xl:text-5xl font-serif font-normal tracking-tight text-white leading-[1.08]">
              Fight the <br />
              denial. <br />
              <span className="italic">Keep your <br />
              coverage.</span>
            </h2>

            <p className="text-xs sm:text-sm text-gray-200/90 leading-relaxed font-light max-w-md">
              Turn a denial letter into a cited, dispatch-ready appeal: the
              insurer&apos;s own policy, your clinical evidence, and every
              deadline tracked. You approve before anything is sent.
            </p>
          </div>
        </div>

        {/* ================= RIGHT COLUMN: Editorial dark form card (landing language) ================= */}
        <div className="col-span-1 lg:col-span-6 bg-[#1a1a1a] text-white rounded-none p-4 sm:p-5 lg:p-6 xl:p-8 flex flex-col justify-between shadow-2xl h-full overflow-y-auto scrollbar-none relative z-10 lg:border-l lg:border-white/20">
          <div className="space-y-2.5 sm:space-y-3 max-w-sm lg:max-w-md mx-auto w-full my-auto">
            
            {/* Mobile / Tablet Top Back Button */}
            <div className="flex lg:hidden items-center justify-between w-full mb-1 pb-1">
              <button
                type="button"
                onClick={() => onNavigate("landing")}
                className="flex items-center gap-1.5 text-xs font-medium text-white/60 hover:text-white transition-colors py-1 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Overview</span>
              </button>
              <span className="text-[10px] font-mono tracking-wider text-white/40 uppercase">
                SENTINEL
              </span>
            </div>

            {/* Top Brand Logo */}
            <div className="flex items-center justify-center">
              <BrandLogo
                size="sm"
                theme="auto"
                glow={false}
                interactive={true}
                onClick={() => onNavigate("landing")}
              />
            </div>

            {/* Header Title & Subtitle */}
            <div className="space-y-1 text-center pt-0.5">
              <h1 className="text-xl sm:text-2xl xl:text-3xl font-serif font-normal tracking-tight text-white leading-tight">
                {flow === "signIn" ? "Welcome Back" : "Create Account"}
              </h1>
              <p className="text-xs text-white/60 font-light max-w-sm mx-auto text-balance">
                {flow === "signIn"
                  ? "Enter your email and password to access your account"
                  : "Sign up to start preparing evidence-grounded clinical appeals"}
              </p>
            </div>

            {/* Error Banner */}
            {error && (
              <div className="p-3 rounded-none bg-red-500/10 border border-red-500/30 text-red-200 text-xs sm:text-sm flex items-start gap-2.5 animate-fadeIn">
                <WarningCircle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
                <p>{error}</p>
              </div>
            )}

            {/* Completing Google sign-in status (OAuth redirect return) */}
            {isCompletingOAuth && !error && (
              <div className="p-3 rounded-none bg-black border border-white/20 text-white/70 text-xs sm:text-sm flex items-center gap-2.5">
                <CircleNotch className="w-4 h-4 shrink-0 animate-spin text-white/60" />
                <p>Completing Google sign-in, entering your workspace...</p>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handlePasswordAuth} className="space-y-3 text-left">
              {/* Optional Name field in sign up mode */}
              {flow === "signUp" && (
                <div className="space-y-1">
                  <label className="text-xs font-medium uppercase tracking-widest text-white/70">Full Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Dr. Jordan Vance, MD"
                    className="h-10 sm:h-11 w-full rounded-none bg-black border border-white/20 px-3.5 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-white transition-all"
                  />
                </div>
              )}

              {/* Email Field */}
              <div className="space-y-1">
                <label className="text-xs font-medium uppercase tracking-widest text-white/70">Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  className="h-10 sm:h-11 w-full rounded-none bg-black border border-white/20 px-3.5 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-white transition-all"
                />
              </div>

              {/* Password Field */}
              <div className="space-y-1">
                <label className="text-xs font-medium uppercase tracking-widest text-white/70">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="h-10 sm:h-11 w-full rounded-none bg-black border border-white/20 px-3.5 pr-10 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-white transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-colors cursor-pointer p-1"
                    title={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <EyeSlash className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Remember Me & Forgot Password Row */}
              <div className="flex items-center justify-between text-xs pt-0.5">
                <label className="flex items-center gap-2 text-white/60 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="size-4 cursor-pointer accent-white"
                  />
                  <span>Remember me</span>
                </label>

                {flow === "signIn" && (
                  <button
                    type="button"
                    onClick={() => {
                      setResetEmail(email.trim());
                      setResetCode("");
                      setResetNewPassword("");
                      setResetConfirmPassword("");
                      setResetError(null);
                      setResetStep("request");
                      setIsResetDialogOpen(true);
                    }}
                    className="text-white/60 hover:text-white transition-colors cursor-pointer text-xs font-medium"
                  >
                    Forgot Password
                  </button>
                )}
              </div>

              {/* Primary Sign In Button */}
              <button
                type="submit"
                disabled={isLoading || isSigningIn || isSigningUp || showGoogleBusy || isCompletingOAuth}
                className="w-full h-10 sm:h-11 rounded-none bg-white text-black font-bold uppercase tracking-widest text-sm hover:bg-gray-200 transition-all flex items-center justify-center gap-2 active:scale-[0.99] disabled:opacity-50 cursor-pointer shadow-md mt-1.5"
              >
                {isLoading || isSigningIn || isSigningUp ? (
                  <>
                    <CircleNotch className="w-4 h-4 animate-spin text-black" />
                    <span>{flow === "signIn" ? "Signing in..." : "Creating account..."}</span>
                  </>
                ) : (
                  <span>{flow === "signIn" ? "Sign In with Password" : "Create Account"}</span>
                )}
              </button>

              {/* Or Divider */}
              <div className="flex items-center my-1">
                <div className="flex-grow border-t border-white/20"></div>
                <span className="px-3 text-[11px] font-mono uppercase tracking-wider text-white/50">or</span>
                <div className="flex-grow border-t border-white/20"></div>
              </div>

              {/* Google Sign In Button */}
              <button
                type="button"
                onClick={handleGoogleAuth}
                disabled={isLoading || isSigningIn || isSigningUp || showGoogleBusy || isAnonymousLoading || isCompletingOAuth}
                className="w-full h-10 sm:h-11 rounded-none border border-white/20 bg-black hover:bg-white hover:text-black text-white font-medium text-sm transition-all flex items-center justify-center gap-2.5 active:scale-[0.99] disabled:opacity-50 cursor-pointer"
              >
                {showGoogleBusy ? (
                  <CircleNotch className="w-4 h-4 animate-spin text-current" />
                ) : (
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                )}
                <span>{isCompletingOAuth ? "Completing Google sign-in..." : "Continue with Google"}</span>
              </button>

              {/* Anonymous Instant Access Button */}
              <button
                type="button"
                onClick={handleAnonymousAuth}
                disabled={isLoading || isSigningIn || isSigningUp || showGoogleBusy || isAnonymousLoading || isCompletingOAuth}
                className="w-full h-10 sm:h-11 rounded-none border border-white/20 bg-black hover:bg-white hover:text-black text-white font-medium text-sm transition-all flex items-center justify-center gap-2.5 active:scale-[0.99] disabled:opacity-50 cursor-pointer"
              >
                {isAnonymousLoading ? (
                  <CircleNotch className="w-4 h-4 animate-spin text-current" />
                ) : (
                  <Flask className="w-4 h-4 opacity-70" />
                )}
                <span>
                  {isAnonymousLoading ? "Entering Demo Workspace..." : "Explore as Anonymous Advocate"}
                </span>
                <span className="text-[10px] font-mono uppercase tracking-wider text-white/60 bg-black border border-white/20 px-1.5 py-0.5 rounded-none font-medium">
                  Demo
                </span>
              </button>
            </form>
          </div>

          {/* Bottom Mode Switcher */}
          <div className="pt-1 text-center text-xs sm:text-sm text-white/50">
            {flow === "signIn" ? (
              <p>
                Don&apos;t have an account?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setFlow("signUp");
                  }}
                  className="font-semibold text-white hover:underline cursor-pointer ml-1"
                >
                  Sign Up
                </button>
              </p>
            ) : (
              <p>
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setFlow("signIn");
                  }}
                  className="font-semibold text-white hover:underline cursor-pointer ml-1"
                >
                  Sign In
                </button>
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Password Reset Modal */}
      <Dialog open={isResetDialogOpen} onOpenChange={(open) => {
        setIsResetDialogOpen(open);
        if (!open) {
          setResetError(null);
          setResetCode("");
          setResetNewPassword("");
          setResetConfirmPassword("");
        }
      }}>
        <DialogContent className="sm:max-w-md p-6 bg-[#1a1a1a] border border-white/20 text-white shadow-xl rounded-none">
          <DialogHeader className="space-y-1.5 pb-2">
            <div className="flex items-center gap-2.5">
              <div className="size-8 rounded-none bg-black border border-white/20 text-white flex items-center justify-center">
                {resetStep === "success" ? (
                  <ShieldCheck className="size-4 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <Key className="size-4 text-white" />
                )}
              </div>
              <DialogTitle className="text-base font-semibold text-white">
                {resetStep === "request" && "Reset Account Password"}
                {resetStep === "verify" && "Enter Verification Code"}
                {resetStep === "token" && "Create New Password"}
                {resetStep === "success" && "Password Updated"}
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-white/60">
              {resetStep === "request" &&
                "Enter your account email. If registered, a 6-digit verification code will be dispatched via the claimhero-sender AgentMail gateway."}
              {resetStep === "verify" &&
                `We dispatched a 6-digit code to ${resetEmail}. Enter the code and your new password below.`}
              {resetStep === "token" &&
                "Enter and confirm your new account password to complete recovery."}
              {resetStep === "success" &&
                "Your account password has been successfully updated. You can now sign in."}
            </DialogDescription>
          </DialogHeader>

          {/* Error Banner */}
          {resetError && (
            <div role="alert" aria-live="polite" className="rounded-none border border-red-500/30 bg-red-500/10 p-3 flex items-start gap-2.5 text-xs text-red-200">
              <WarningCircle className="size-4 shrink-0 mt-0.5" />
              <div className="leading-relaxed font-medium">{resetError}</div>
            </div>
          )}

          {/* STEP 1: Request Code */}
          {resetStep === "request" && (
            <form onSubmit={handleRequestReset} className="space-y-4 py-1">
              <div className="space-y-1.5">
                <label htmlFor="reset-email" className="text-xs font-medium uppercase tracking-widest text-white/70">
                  Account Email Address
                </label>
                <input
                  id="reset-email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="advocate@hospital.org"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  className="w-full h-10 px-3 rounded-none border border-white/20 bg-black text-xs text-white focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsResetDialogOpen(false)}
                  className="px-3.5 h-9 rounded-none border border-white/20 text-xs font-medium text-white/80 hover:bg-white/10 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingReset || !resetEmail.trim() || !resetEmail.includes("@")}
                  className="px-4 h-9 rounded-none bg-white text-black text-xs font-medium hover:bg-gray-200 disabled:opacity-50 transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  {isSubmittingReset ? (
                    <>
                      <CircleNotch className="size-3.5 animate-spin" />
                      <span>Dispatching Code...</span>
                    </>
                  ) : (
                    <span>Send Verification Code</span>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* STEP 2: Verify Code & Set New Password */}
          {resetStep === "verify" && (
            <form onSubmit={handleVerifyAndReset} className="space-y-3.5 py-1">
              <div className="rounded-none border border-white/20 bg-black p-3 text-xs space-y-1">
                <div className="flex items-center justify-between text-white/60">
                  <span className="flex items-center gap-1.5">
                    <EnvelopeSimple className="size-3.5" />
                    <span>Sent to <strong className="text-white font-mono">{resetEmail}</strong></span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setResetStep("request");
                      setResetError(null);
                    }}
                    className="text-[11px] text-white/50 hover:text-white underline cursor-pointer"
                  >
                    Change
                  </button>
                </div>
                <p className="text-[11px] text-white/50 leading-normal">
                  Dispatched via ClaimHero Security gateway (claimhero-sender). Check spam/junk if not visible in 2 minutes.
                </p>
              </div>

              <div className="space-y-1">
                <label htmlFor="reset-code" className="text-xs font-medium uppercase tracking-widest text-white/70">
                  6-Digit Verification Code
                </label>
                <input
                  id="reset-code"
                  type="text"
                  required
                  maxLength={6}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="one-time-code"
                  autoFocus
                  placeholder="123456"
                  value={resetCode}
                  onChange={(e) => setResetCode(e.target.value.replace(/[^0-9]/g, ""))}
                  className="w-full h-11 px-3 rounded-none border border-white/20 bg-black text-base text-center font-mono font-bold tracking-[0.35em] text-white focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-white"
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label htmlFor="reset-new-password" className="text-xs font-medium uppercase tracking-widest text-white/70">
                    New Password
                  </label>
                  <span className="text-[10px] text-white/50">Min. 8 characters</span>
                </div>
                <div className="relative">
                  <input
                    id="reset-new-password"
                    type={showResetPassword ? "text" : "password"}
                    required
                    minLength={8}
                    autoComplete="new-password"
                    placeholder="Enter new password"
                    value={resetNewPassword}
                    onChange={(e) => setResetNewPassword(e.target.value)}
                    className="w-full h-10 px-3 pr-9 rounded-none border border-white/20 bg-black text-xs text-white focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-white"
                  />
                  <button
                    type="button"
                    aria-label={showResetPassword ? "Hide password" : "Show password"}
                    title={showResetPassword ? "Hide password" : "Show password"}
                    onClick={() => setShowResetPassword((prev) => !prev)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white p-1 cursor-pointer"
                  >
                    {showResetPassword ? <EyeSlash className="size-3.5" /> : <Eye className="size-3.5" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label htmlFor="reset-confirm-password" className="text-xs font-medium uppercase tracking-widest text-white/70">
                  Confirm New Password
                </label>
                <div className="relative">
                  <input
                    id="reset-confirm-password"
                    type={showResetPassword ? "text" : "password"}
                    required
                    minLength={8}
                    autoComplete="new-password"
                    placeholder="Re-enter new password"
                    value={resetConfirmPassword}
                    onChange={(e) => setResetConfirmPassword(e.target.value)}
                    className="w-full h-10 px-3 pr-9 rounded-none border border-white/20 bg-black text-xs text-white focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-white"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  disabled={resendCooldown > 0 || isSubmittingReset}
                  onClick={handleResendCode}
                  className="text-xs font-medium text-white/60 hover:text-white disabled:opacity-40 flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
                >
                  <ArrowCounterClockwise className={`size-3.5 ${isSubmittingReset ? "animate-spin" : ""}`} />
                  <span>{resendCooldown > 0 ? `Resend (${resendCooldown}s)` : "Resend Code"}</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsResetDialogOpen(false)}
                    className="px-3 h-9 rounded-none border border-white/20 text-xs font-medium text-white/80 hover:bg-white/10 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingReset || resetCode.trim().length !== 6 || resetNewPassword.length < 8}
                    className="px-4 h-9 rounded-none bg-white text-black text-xs font-medium hover:bg-gray-200 disabled:opacity-50 transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    {isSubmittingReset ? (
                      <>
                        <CircleNotch className="size-3.5 animate-spin" />
                        <span>Updating...</span>
                      </>
                    ) : (
                      <span>Update Password</span>
                    )}
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* STEP 3: Token Mode (via direct email link) */}
          {resetStep === "token" && (
            <form onSubmit={handleResetWithToken} className="space-y-3.5 py-1">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label htmlFor="token-new-password" className="text-xs font-medium uppercase tracking-widest text-white/70">
                    New Password
                  </label>
                  <span className="text-[10px] text-white/50">Min. 8 characters</span>
                </div>
                <div className="relative">
                  <input
                    id="token-new-password"
                    type={showResetPassword ? "text" : "password"}
                    required
                    minLength={8}
                    autoComplete="new-password"
                    placeholder="Enter new password"
                    value={resetNewPassword}
                    onChange={(e) => setResetNewPassword(e.target.value)}
                    className="w-full h-10 px-3 pr-9 rounded-none border border-white/20 bg-black text-xs text-white focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-white"
                  />
                  <button
                    type="button"
                    aria-label={showResetPassword ? "Hide password" : "Show password"}
                    title={showResetPassword ? "Hide password" : "Show password"}
                    onClick={() => setShowResetPassword((prev) => !prev)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white p-1 cursor-pointer"
                  >
                    {showResetPassword ? <EyeSlash className="size-3.5" /> : <Eye className="size-3.5" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label htmlFor="token-confirm-password" className="text-xs font-medium uppercase tracking-widest text-white/70">
                  Confirm New Password
                </label>
                <input
                  id="token-confirm-password"
                  type={showResetPassword ? "text" : "password"}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  placeholder="Re-enter new password"
                  value={resetConfirmPassword}
                  onChange={(e) => setResetConfirmPassword(e.target.value)}
                  className="w-full h-10 px-3 rounded-none border border-white/20 bg-black text-xs text-white focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsResetDialogOpen(false)}
                  className="px-3.5 h-9 rounded-none border border-white/20 text-xs font-medium text-white/80 hover:bg-white/10 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingReset || resetNewPassword.length < 8 || !resetNewPassword}
                  className="px-4 h-9 rounded-none bg-white text-black text-xs font-medium hover:bg-gray-200 disabled:opacity-50 transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  {isSubmittingReset ? (
                    <>
                      <CircleNotch className="size-3.5 animate-spin" />
                      <span>Updating...</span>
                    </>
                  ) : (
                    <span>Set New Password</span>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* STEP 4: Success */}
          {resetStep === "success" && (
            <div className="space-y-4 py-2">
              <div className="rounded-none border border-emerald-500/30 bg-emerald-500/10 p-4 flex items-start gap-3 text-emerald-200">
                <CheckCircle className="size-5 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
                <div className="text-xs space-y-1">
                  <p className="font-semibold text-sm">Password Updated Successfully</p>
                  <p className="text-emerald-200/90 leading-relaxed">
                    Your account password has been updated. You can now sign in using your new credentials.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsResetDialogOpen(false);
                  setFlow("signIn");
                }}
                className="w-full h-10 rounded-none bg-white text-black font-medium text-xs hover:bg-gray-200 transition-colors cursor-pointer"
              >
                Sign In Now
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
