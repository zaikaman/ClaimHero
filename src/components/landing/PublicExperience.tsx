import { useEffect, useRef, useState } from "react";
import { NavigationView } from "../layout/Sidebar";
import { CinematicHero } from "./CinematicHero";
import { AuthPage } from "../auth/AuthPage";
import { Toaster } from "sonner";

export interface PublicExperienceProps {
  currentView: NavigationView;
  onNavigate: (view: NavigationView) => void;
  isAuthenticated: boolean;
  isAuthLoading: boolean;
  hasCachedSession: boolean;
  pendingTargetView: NavigationView | null;
  setPendingTargetView: (view: NavigationView | null) => void;
}

export const AMBIENT_VIDEO_SRC =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260406_094145_4a271a6c-3869-4f1c-8aa7-aeb0cb227994.mp4";

/**
 * Ambient background video mounted continuously for public landing and auth views.
 * Persists without unmounting across route transitions between landing and login,
 * completely eliminating the dark-screen flash and video decoder re-initialization.
 */
export function AmbientBackgroundVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
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
  }, []);

  return (
    <div className="fixed inset-0 w-full h-full z-0 overflow-hidden pointer-events-none bg-radial from-slate-900 to-black">
      <video
        ref={videoRef}
        src={AMBIENT_VIDEO_SRC}
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        onLoadedData={() => setIsVideoLoaded(true)}
        className={`w-full h-full object-cover transition-opacity duration-700 ${
          isVideoLoaded ? "opacity-100" : "opacity-0"
        }`}
      />
      {/* Bottom Optical Blur Overlay */}
      <div className="fixed inset-0 w-full h-full z-[1] pointer-events-none backdrop-blur-xl bottom-blur-mask" />
    </div>
  );
}

export function PublicExperience({
  currentView,
  onNavigate,
  isAuthenticated,
  isAuthLoading,
  hasCachedSession,
  pendingTargetView,
  setPendingTargetView,
}: PublicExperienceProps) {
  const isLogin =
    currentView === "login" ||
    (!isAuthenticated && currentView !== "landing" && currentView !== "notFound");

  return (
    <div className="relative w-screen h-screen h-[100dvh] overflow-hidden bg-black text-white select-none">
      {/* 1. Continuous persistent ambient video background */}
      <AmbientBackgroundVideo />

      {/* 2. Landing View Container (smooth opacity cross-fade, preserved in DOM to eliminate flash) */}
      <div
        className={`absolute inset-0 w-full h-full transition-opacity duration-200 ease-out z-10 ${
          !isLogin
            ? "opacity-100 pointer-events-auto visible"
            : "opacity-0 pointer-events-none invisible"
        }`}
        aria-hidden={isLogin}
      >
        <CinematicHero
          embedBackground={false}
          active={!isLogin}
          isAuthenticated={isAuthenticated}
          isAuthLoading={isAuthLoading}
          hasCachedSession={hasCachedSession}
          onEnterConsole={(view) => {
            const target =
              view && view !== "login" && view !== "landing"
                ? (view as NavigationView)
                : "radar";
            if (!isAuthenticated) {
              setPendingTargetView(target);
              onNavigate("login");
            } else {
              onNavigate(target);
            }
          }}
        />
      </div>

      {/* 3. Auth View Container (smooth opacity cross-fade, see-through window directly over continuous video) */}
      <div
        className={`absolute inset-0 w-full h-full transition-opacity duration-200 ease-out z-10 ${
          isLogin
            ? "opacity-100 pointer-events-auto visible"
            : "opacity-0 pointer-events-none invisible"
        }`}
        aria-hidden={!isLogin}
      >
        <AuthPage
          embedBackground={false}
          active={isLogin}
          onNavigate={onNavigate}
          onSuccess={() => {
            const nextView =
              pendingTargetView &&
              pendingTargetView !== "login" &&
              pendingTargetView !== "landing"
                ? pendingTargetView
                : "radar";
            setPendingTargetView(null);
            onNavigate(nextView);
          }}
        />
      </div>

      <Toaster position="bottom-right" richColors theme="dark" closeButton />
    </div>
  );
}
