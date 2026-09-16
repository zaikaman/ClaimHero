import React, { useState, useEffect } from "react";
import { useMutation } from "convex/react";
import { useSignInWithPassword, useSignUpWithPassword } from "@convex-dev/auth/providers/password/react";
import { useSignInWithGoogle, useOauth } from "@convex-dev/auth/providers/oauth/react";
import { api } from "../../../convex/_generated/api";
import {
  Eye,
  EyeSlash,
  ArrowLeft,
  CircleNotch,
  WarningCircle,
} from "@phosphor-icons/react";
import { NavigationView } from "../layout/Sidebar";
import { BrandLogo } from "../common/BrandLogo";

interface AuthPageProps {
  onNavigate: (view: NavigationView) => void;
  onSuccess?: () => void;
  embedBackground?: boolean;
}

export const AuthPage: React.FC<AuthPageProps> = ({
  onNavigate,
  onSuccess,
  embedBackground = true,
}) => {
  const { signIn: signInPassword, pending: isSigningIn } = useSignInWithPassword(api.auth.signInWithPassword);
  const { signUp: signUpPassword, pending: isSigningUp } = useSignUpWithPassword(api.auth.signUpWithPassword);
  const { signInGoogle } = useSignInWithGoogle(api.auth);
  const { flowError } = useOauth();
  const updateProfile = useMutation(api.users.updateProfile);

  const [isGoogleLoading, setIsGoogleLoading] = useState<boolean>(false);

  const [flow, setFlow] = useState<"signIn" | "signUp">("signIn");
  const [name, setName] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [rememberMe, setRememberMe] = useState<boolean>(true);

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const videoRef = React.useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!embedBackground || typeof window === "undefined" || !window.matchMedia) return;
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncMotionPreference = (matches: boolean) => {
      if (videoRef.current) {
        if (matches) {
          videoRef.current.pause();
        } else {
          videoRef.current.play().catch(() => {});
        }
      }
    };

    syncMotionPreference(mediaQuery.matches);

    const listener = (e: MediaQueryListEvent) => syncMotionPreference(e.matches);
    mediaQuery.addEventListener("change", listener);
    return () => mediaQuery.removeEventListener("change", listener);
  }, [embedBackground]);

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

  return (
    <div className={`min-h-screen h-screen w-screen ${embedBackground ? "bg-black" : "bg-transparent"} text-white font-sans flex items-center justify-center p-3 sm:p-5 md:p-6 lg:p-8 relative overflow-hidden select-none`}>
      
      {/* 1. Fullscreen Ambient Video Background (when standalone) */}
      {embedBackground && (
        <div className="fixed inset-0 w-full h-full z-0 overflow-hidden pointer-events-none bg-radial from-slate-900 to-black">
          <video
            ref={videoRef}
            src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260406_094145_4a271a6c-3869-4f1c-8aa7-aeb0cb227994.mp4"
            autoPlay
            loop
            muted
            playsInline
            preload="metadata"
            className="w-full h-full object-cover scale-105"
          />
        </div>
      )}

      {/* 2. Main Split-Card Auth Container with Seamless Middle Blend */}
      <div className="relative z-10 w-full max-w-[1240px] h-[94vh] sm:h-[88vh] min-h-[500px] max-h-[820px] rounded-[28px] sm:rounded-[36px] lg:rounded-[40px] p-2 sm:p-2.5 border-[1.5px] border-white/40 shadow-2xl grid grid-cols-1 lg:grid-cols-12 gap-0 overflow-hidden backdrop-blur-xs">
        
        {/* ================= LEFT COLUMN: Pure See-Through Window to Fullscreen Video Behind ================= */}
        <div className="hidden lg:flex lg:col-span-6 relative h-full flex-col justify-between p-6 sm:p-8 lg:p-9 xl:p-12 bg-gradient-to-t from-black/90 via-black/25 to-black/35 bg-gradient-to-r from-transparent via-transparent to-black/40 rounded-l-[24px] sm:rounded-l-[32px] lg:rounded-l-[36px] rounded-r-none overflow-hidden">
          
          {/* Subtle Right Edge Hairline Divider Line for seamless middle blending */}
          <div className="absolute right-0 top-0 bottom-0 w-[1px] bg-gradient-to-b from-white/10 via-white/35 to-white/10 pointer-events-none z-20" />

          {/* Top Row: Back to Overview Button & Sentinel Label (Nestled inside card header - never overlaps border) */}
          <div className="relative z-10 flex items-center justify-between gap-3 pt-1">
            <button
              type="button"
              onClick={() => onNavigate("landing")}
              className="liquid-glass flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium text-white/90 hover:text-white transition-all active:scale-95 cursor-pointer hover:bg-white/10 shadow-md backdrop-blur-md"
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
              Defend <br />
              Every Claim. <br />
              Overturn <br />
              Every Denial.
            </h2>

            <p className="text-xs sm:text-sm text-gray-200/90 leading-relaxed font-light max-w-md">
              Add a denial letter and we show you why the insurer said no, find their own rules,
              and write the appeal letter you send. You approve everything before it goes out.
            </p>
          </div>
        </div>

        {/* ================= RIGHT COLUMN: Fully Opaque Solid White Form Card ================= */}
        <div className="col-span-1 lg:col-span-6 bg-white text-zinc-900 rounded-[24px] sm:rounded-[32px] lg:rounded-r-[36px] lg:rounded-l-none p-4 sm:p-6 md:p-7 lg:p-6 xl:p-10 flex flex-col justify-between shadow-2xl lg:shadow-[-20px_0_40px_-10px_rgba(0,0,0,0.35)] h-full overflow-y-auto scrollbar-none relative z-10 border-l border-zinc-100 lg:border-l-zinc-200/80">
          <div className="space-y-3 sm:space-y-4 lg:space-y-3 xl:space-y-4 max-w-sm lg:max-w-md mx-auto w-full my-auto">
            
            {/* Mobile / Tablet Top Back Button */}
            <div className="flex lg:hidden items-center justify-between w-full mb-1 pb-1">
              <button
                type="button"
                onClick={() => onNavigate("landing")}
                className="flex items-center gap-1.5 text-xs font-medium text-zinc-600 hover:text-zinc-900 transition-colors py-1 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Overview</span>
              </button>
              <span className="text-[10px] font-mono tracking-wider text-zinc-400 uppercase">
                SENTINEL
              </span>
            </div>

            {/* Top Brand Logo */}
            <div className="flex items-center justify-center">
              <BrandLogo
                size="md"
                theme="light"
                glow={false}
                interactive={true}
                onClick={() => onNavigate("landing")}
              />
            </div>

            {/* Header Title & Subtitle */}
            <div className="space-y-1.5 text-center pt-0.5">
              <h1 className="text-2xl sm:text-3xl lg:text-3xl xl:text-4xl font-serif font-normal tracking-tight text-zinc-900 leading-tight">
                {flow === "signIn" ? "Welcome Back" : "Create Account"}
              </h1>
              <p className="text-xs sm:text-sm text-zinc-500 font-light max-w-xs mx-auto">
                {flow === "signIn"
                  ? "Enter your email and password to access your account"
                  : "Sign up to start defending clinical claims and overturning denials"}
              </p>
            </div>

            {/* Error Banner */}
            {error && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs sm:text-sm flex items-start gap-2.5 animate-fadeIn">
                <WarningCircle className="w-4 h-4 shrink-0 text-red-500 mt-0.5" />
                <p>{error}</p>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handlePasswordAuth} className="space-y-3.5 text-left">
              {/* Optional Name field in sign up mode */}
              {flow === "signUp" && (
                <div className="space-y-1">
                  <label className="text-xs sm:text-sm font-medium text-zinc-700">Full Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Dr. Jordan Vance, MD"
                    className="h-10 sm:h-11 w-full rounded-xl bg-[#f5f6f9] border border-[#eaedf3] px-3.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-300 transition-all dark:bg-[#f5f6f9] dark:text-zinc-900 dark:border-[#eaedf3]"
                  />
                </div>
              )}

              {/* Email Field */}
              <div className="space-y-1">
                <label className="text-xs sm:text-sm font-medium text-zinc-700">Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  className="h-10 sm:h-11 w-full rounded-xl bg-[#f5f6f9] border border-[#eaedf3] px-3.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-300 transition-all dark:bg-[#f5f6f9] dark:text-zinc-900 dark:border-[#eaedf3]"
                />
              </div>

              {/* Password Field */}
              <div className="space-y-1">
                <label className="text-xs sm:text-sm font-medium text-zinc-700">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="h-10 sm:h-11 w-full rounded-xl bg-[#f5f6f9] border border-[#eaedf3] px-3.5 pr-10 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-300 transition-all dark:bg-[#f5f6f9] dark:text-zinc-900 dark:border-[#eaedf3]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 transition-colors cursor-pointer p-1"
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
                <label className="flex items-center gap-2 text-zinc-600 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="rounded border-zinc-300 text-zinc-900 focus:ring-0 focus:ring-offset-0 size-4 cursor-pointer"
                  />
                  <span>Remember me</span>
                </label>

                {flow === "signIn" && (
                  <button
                    type="button"
                    onClick={() => {
                      setError("Password reset instructions will be sent to your email address.");
                    }}
                    className="text-zinc-600 hover:text-zinc-900 transition-colors cursor-pointer text-xs font-medium"
                  >
                    Forgot Password
                  </button>
                )}
              </div>

              {/* Primary Sign In Button */}
              <button
                type="submit"
                disabled={isLoading || isSigningIn || isSigningUp || isGoogleLoading}
                className="w-full h-10 sm:h-11 rounded-xl bg-black text-white font-medium text-sm hover:bg-zinc-800 transition-all flex items-center justify-center gap-2 active:scale-[0.99] disabled:opacity-50 cursor-pointer shadow-md mt-1.5"
              >
                {isLoading || isSigningIn || isSigningUp ? (
                  <>
                    <CircleNotch className="w-4 h-4 animate-spin text-white" />
                    <span>{flow === "signIn" ? "Signing in..." : "Creating account..."}</span>
                  </>
                ) : (
                  <span>{flow === "signIn" ? "Sign In with Password" : "Create Account"}</span>
                )}
              </button>

              {/* Or Divider */}
              <div className="flex items-center my-2 xl:my-2.5">
                <div className="flex-grow border-t border-zinc-200"></div>
                <span className="px-3 text-[11px] font-mono uppercase tracking-wider text-zinc-400">or</span>
                <div className="flex-grow border-t border-zinc-200"></div>
              </div>

              {/* Google Sign In Button */}
              <button
                type="button"
                onClick={handleGoogleAuth}
                disabled={isLoading || isSigningIn || isSigningUp || isGoogleLoading}
                className="w-full h-10 sm:h-11 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-800 font-medium text-sm transition-all flex items-center justify-center gap-2.5 active:scale-[0.99] disabled:opacity-50 cursor-pointer shadow-xs"
              >
                {isGoogleLoading ? (
                  <CircleNotch className="w-4 h-4 animate-spin text-zinc-700" />
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
                <span>Continue with Google</span>
              </button>
            </form>
          </div>

          {/* Bottom Mode Switcher */}
          <div className="pt-2 sm:pt-3 xl:pt-4 text-center text-xs sm:text-sm text-zinc-500">
            {flow === "signIn" ? (
              <p>
                Don&apos;t have an account?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setFlow("signUp");
                  }}
                  className="font-semibold text-zinc-900 hover:underline cursor-pointer ml-1"
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
                  className="font-semibold text-zinc-900 hover:underline cursor-pointer ml-1"
                >
                  Sign In
                </button>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
