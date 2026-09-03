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
}

export const AuthPage: React.FC<AuthPageProps> = ({ onNavigate, onSuccess }) => {
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
      onNavigate("radar");
      if (onSuccess) {
        onSuccess();
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
    <div className="min-h-screen h-screen w-screen bg-black text-white font-sans flex items-center justify-center p-3 sm:p-6 md:p-8 lg:p-10 relative overflow-hidden select-none">
      
      {/* 1. Fullscreen Ambient Video Background */}
      <div className="fixed inset-0 w-full h-full z-0 overflow-hidden pointer-events-none">
        <video
          src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260406_094145_4a271a6c-3869-4f1c-8aa7-aeb0cb227994.mp4"
          autoPlay
          loop
          muted
          playsInline
          className="w-full h-full object-cover scale-105"
        />
      </div>

      {/* 2. Top-Left Back Button */}
      <div className="absolute top-4 sm:top-6 left-4 sm:left-8 z-30">
        <button
          onClick={() => onNavigate("landing")}
          className="liquid-glass flex items-center gap-2 px-4 py-2 rounded-md text-xs sm:text-sm text-white/90 hover:text-white transition-all active:scale-95 cursor-pointer hover:bg-white/10 shadow-lg backdrop-blur-md"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Overview</span>
        </button>
      </div>

      {/* 3. Main Split-Card Auth Container with See-Through Left Window */}
      <div className="relative z-10 w-full max-w-[1240px] h-[92vh] sm:h-[88vh] min-h-[640px] max-h-[860px] rounded-[32px] sm:rounded-[40px] p-2 sm:p-2.5 border-[1.5px] border-white/50 shadow-2xl grid grid-cols-1 lg:grid-cols-12 gap-0 overflow-hidden">
        
        {/* ================= LEFT COLUMN: Pure See-Through Window to Fullscreen Video Behind ================= */}
        <div className="lg:col-span-6 relative h-full flex flex-col justify-between p-6 sm:p-10 lg:p-12 bg-gradient-to-t from-black/85 via-black/20 to-black/30 rounded-l-[30px] sm:rounded-l-[36px]">
          
          {/* Top Label & Line Accent (Tailored to ClaimHero) */}
          <div className="relative z-10 flex items-center gap-3 pt-2">
            <span className="text-xs font-mono tracking-widest text-white uppercase font-medium">
              CLINICAL APPEAL SENTINEL
            </span>
            <div className="w-24 sm:w-32 h-[1px] bg-white/70" />
          </div>

          {/* Bottom Headline & Subtext (Tailored to ClaimHero) */}
          <div className="relative z-10 space-y-4 pb-2">
            <h2 className="text-4xl sm:text-5xl lg:text-6xl xl:text-[64px] font-serif font-normal tracking-tight text-white leading-[1.05]">
              Defend <br />
              Every Claim. <br />
              Overturn <br />
              Every Denial.
            </h2>

            <p className="text-xs sm:text-sm lg:text-base text-gray-200 leading-relaxed font-light max-w-md">
              Autonomous clinical intelligence citing insurer policy bulletins and medical guidelines in real time to protect patient coverage rights under ERISA.
            </p>
          </div>
        </div>

        {/* ================= RIGHT COLUMN: Crisp White Form Card ================= */}
        <div className="lg:col-span-6 bg-white text-zinc-900 rounded-[28px] sm:rounded-[34px] p-6 sm:p-10 lg:p-14 flex flex-col justify-between shadow-2xl h-full overflow-y-auto">
          <div className="space-y-6 max-w-sm lg:max-w-md mx-auto w-full my-auto">
            
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
            <div className="space-y-2 text-center pt-1">
              <h1 className="text-3xl sm:text-4xl lg:text-[42px] font-serif font-normal tracking-tight text-zinc-900 leading-tight">
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
              <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs sm:text-sm flex items-start gap-2.5 animate-fadeIn">
                <WarningCircle className="w-4 h-4 shrink-0 text-red-500 mt-0.5" />
                <p>{error}</p>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handlePasswordAuth} className="space-y-4 text-left">
              {/* Optional Name field in sign up mode */}
              {flow === "signUp" && (
                <div className="space-y-1.5">
                  <label className="text-xs sm:text-sm font-medium text-zinc-700">Full Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Dr. Jordan Vance, MD"
                    className="h-11 sm:h-12 w-full rounded-xl bg-[#f5f6f9] border border-[#eaedf3] px-4 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-300 transition-all dark:bg-[#f5f6f9] dark:text-zinc-900 dark:border-[#eaedf3]"
                  />
                </div>
              )}

              {/* Email Field */}
              <div className="space-y-1.5">
                <label className="text-xs sm:text-sm font-medium text-zinc-700">Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  className="h-11 sm:h-12 w-full rounded-xl bg-[#f5f6f9] border border-[#eaedf3] px-4 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-300 transition-all dark:bg-[#f5f6f9] dark:text-zinc-900 dark:border-[#eaedf3]"
                />
              </div>

              {/* Password Field */}
              <div className="space-y-1.5">
                <label className="text-xs sm:text-sm font-medium text-zinc-700">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="h-11 sm:h-12 w-full rounded-xl bg-[#f5f6f9] border border-[#eaedf3] px-4 pr-11 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-300 transition-all dark:bg-[#f5f6f9] dark:text-zinc-900 dark:border-[#eaedf3]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 transition-colors cursor-pointer p-1"
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
              <div className="flex items-center justify-between text-xs sm:text-sm pt-1">
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
                    className="text-zinc-600 hover:text-zinc-900 transition-colors cursor-pointer text-xs sm:text-sm font-medium"
                  >
                    Forgot Password
                  </button>
                )}
              </div>

              {/* Primary Sign In Button */}
              <button
                type="submit"
                disabled={isLoading || isSigningIn || isSigningUp || isGoogleLoading}
                className="w-full h-11 sm:h-12 rounded-xl bg-black text-white font-medium text-sm hover:bg-zinc-800 transition-all flex items-center justify-center gap-2 active:scale-[0.99] disabled:opacity-50 cursor-pointer shadow-md mt-2"
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
              <div className="flex items-center my-3">
                <div className="flex-grow border-t border-zinc-200"></div>
                <span className="px-3 text-xs font-mono uppercase tracking-wider text-zinc-400">or</span>
                <div className="flex-grow border-t border-zinc-200"></div>
              </div>

              {/* Google Sign In Button */}
              <button
                type="button"
                onClick={handleGoogleAuth}
                disabled={isLoading || isSigningIn || isSigningUp || isGoogleLoading}
                className="w-full h-11 sm:h-12 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-800 font-medium text-sm transition-all flex items-center justify-center gap-2.5 active:scale-[0.99] disabled:opacity-50 cursor-pointer shadow-xs"
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
          <div className="pt-6 text-center text-xs sm:text-sm text-zinc-500">
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
