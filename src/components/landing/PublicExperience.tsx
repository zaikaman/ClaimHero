import { NavigationView } from "../layout/Sidebar";
import { TemplateLanding } from "./TemplateLanding";
import { UnicornBackground } from "./UnicornBackground";
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

export function PublicExperience({
  currentView,
  onNavigate,
  isAuthenticated,
  pendingTargetView,
  setPendingTargetView,
}: PublicExperienceProps) {
  const isLogin =
    currentView === "login" ||
    (!isAuthenticated && currentView !== "landing" && currentView !== "notFound");

  const handleEnterConsole = (view?: NavigationView) => {
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
  };

  return (
    // `isolate` pins the backdrop (z-0) / content (z-10) stacking locally so
    // the background layer can never composite above page content. `w-full`
    // instead of `w-screen` avoids 100vw scrollbar-overflow quirks on mobile.
    <div className="relative isolate w-full h-screen h-[100dvh] overflow-hidden bg-black text-white select-none">
      {/* 1. Shared WebGL scene: the sole backdrop for landing and login */}
      <UnicornBackground />

      {/* 2. Landing View Container (scrollable story, smooth opacity cross-fade, preserved in DOM to eliminate flash) */}
      <div
        className={`absolute inset-0 w-full h-full overflow-y-auto overflow-x-hidden transition-opacity duration-200 ease-out z-10 ${
          !isLogin
            ? "opacity-100 pointer-events-auto visible"
            : "opacity-0 pointer-events-none invisible"
        }`}
        aria-hidden={isLogin}
      >
        <TemplateLanding onEnterConsole={handleEnterConsole} />
      </div>

      {/* 3. Auth View Container (smooth opacity cross-fade, see-through window directly over the shared 3D scene) */}
      <div
        className={`absolute inset-0 w-full h-full transition-opacity duration-200 ease-out z-10 ${
          isLogin
            ? "opacity-100 pointer-events-auto visible"
            : "opacity-0 pointer-events-none invisible"
        }`}
        aria-hidden={!isLogin}
      >
        <AuthPage
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
