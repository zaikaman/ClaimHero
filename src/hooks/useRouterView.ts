import { useState, useEffect, useCallback } from "react";
import { NavigationView } from "../components/layout/Sidebar";

export const PATH_TO_VIEW_MAP: Record<string, NavigationView> = {
  "/": "landing",
  "": "landing",
  "/app": "radar",
  "/dashboard": "radar",
  "/radar": "radar",
  "/app/radar": "radar",
  "/evidence": "evidence",
  "/app/evidence": "evidence",
  "/studio": "studio",
  "/app/studio": "studio",
  "/p2p": "p2p",
  "/app/p2p": "p2p",
  "/calculator": "calculator",
  "/app/calculator": "calculator",
  "/exposure": "calculator",
  "/penalties": "calculator",
  "/communications": "communications",
  "/app/communications": "communications",
  "/inbox": "communications",
  "/app/inbox": "communications",
  "/analytics": "analytics",
  "/app/analytics": "analytics",
  "/audit": "audit",
  "/app/audit": "audit",
  "/settings": "settings",
  "/app/settings": "settings",
  "/login": "login",
  "/auth": "login",
  "/signin": "login",
  "/signup": "login",
};

export const VIEW_TO_PATH_MAP: Record<NavigationView, string> = {
  landing: "/",
  radar: "/app",
  evidence: "/app/evidence",
  studio: "/app/studio",
  p2p: "/app/p2p",
  calculator: "/app/calculator",
  communications: "/app/inbox",
  analytics: "/app/analytics",
  audit: "/app/audit",
  settings: "/app/settings",
  login: "/login",
  notFound: "/404",
};

export function parsePathToView(pathname: string, hash: string = ""): NavigationView {
  // 1. Check Hash routing fallback (#/evidence, #evidence, #radar, #login)
  if (hash) {
    const cleanHash = hash.replace(/^#\/?/, "/");
    if (PATH_TO_VIEW_MAP[cleanHash]) {
      return PATH_TO_VIEW_MAP[cleanHash];
    }
  }

  // 2. Normalize pathname (remove trailing slash except for root "/")
  const normalized =
    pathname.length > 1 && pathname.endsWith("/")
      ? pathname.slice(0, -1)
      : pathname;

  if (normalized === "" || normalized === "/") {
    return "landing";
  }

  // 3. Only map known keys in PATH_TO_VIEW_MAP
  if (PATH_TO_VIEW_MAP[normalized]) {
    return PATH_TO_VIEW_MAP[normalized];
  }

  // 4. Any mistyped or unrecognized route returns notFound
  return "notFound";
}

export function useRouterView() {
  const [currentView, setCurrentViewInternal] = useState<NavigationView>(() => {
    if (typeof window === "undefined") return "landing";
    return parsePathToView(window.location.pathname, window.location.hash);
  });

  const navigateToView = useCallback(
    (view: NavigationView, replace: boolean = false) => {
      setCurrentViewInternal(view);
      if (typeof window !== "undefined") {
        const targetPath = VIEW_TO_PATH_MAP[view] || "/";
        const currentSearch = window.location.search || "";
        const targetUrl = currentSearch ? `${targetPath}${currentSearch}` : targetPath;
        const currentUrl = `${window.location.pathname}${window.location.search}`;
        if (currentUrl !== targetUrl) {
          if (replace) {
            window.history.replaceState({ view }, "", targetUrl);
          } else {
            window.history.pushState({ view }, "", targetUrl);
          }
        }
      }
    },
    []
  );

  // Listen to browser popstate (Back / Forward navigation)
  useEffect(() => {
    const handlePopState = () => {
      const detectedView = parsePathToView(
        window.location.pathname,
        window.location.hash
      );
      setCurrentViewInternal(detectedView);
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  return {
    currentView,
    setCurrentView: navigateToView,
  };
}
