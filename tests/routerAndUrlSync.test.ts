import { describe, it, expect } from "vitest";
import { parsePathToView, PATH_TO_VIEW_MAP, VIEW_TO_PATH_MAP } from "../src/hooks/useRouterView";

describe("P1-13 & P1-18: Router View Parsing & URL Route Precision", () => {
  describe("P1-13: Known vs Unknown Routes & notFound Handling", () => {
    it("maps root and empty paths to landing", () => {
      expect(parsePathToView("/")).toBe("landing");
      expect(parsePathToView("")).toBe("landing");
    });

    it("maps all documented exact PATH_TO_VIEW_MAP routes correctly", () => {
      expect(parsePathToView("/app")).toBe("radar");
      expect(parsePathToView("/app/radar")).toBe("radar");
      expect(parsePathToView("/dashboard")).toBe("radar");
      expect(parsePathToView("/evidence")).toBe("evidence");
      expect(parsePathToView("/app/evidence")).toBe("evidence");
      expect(parsePathToView("/studio")).toBe("studio");
      expect(parsePathToView("/app/studio")).toBe("studio");
      expect(parsePathToView("/p2p")).toBe("p2p");
      expect(parsePathToView("/app/p2p")).toBe("p2p");
      expect(parsePathToView("/calculator")).toBe("calculator");
      expect(parsePathToView("/app/calculator")).toBe("calculator");
      expect(parsePathToView("/communications")).toBe("communications");
      expect(parsePathToView("/app/inbox")).toBe("communications");
      expect(parsePathToView("/inbox")).toBe("communications");
      expect(parsePathToView("/analytics")).toBe("analytics");
      expect(parsePathToView("/app/analytics")).toBe("analytics");
      expect(parsePathToView("/audit")).toBe("audit");
      expect(parsePathToView("/app/audit")).toBe("audit");
      expect(parsePathToView("/settings")).toBe("settings");
      expect(parsePathToView("/app/settings")).toBe("settings");
      expect(parsePathToView("/login")).toBe("login");
      expect(parsePathToView("/auth")).toBe("login");
      expect(parsePathToView("/signin")).toBe("login");
      expect(parsePathToView("/signup")).toBe("login");
    });

    it("returns notFound for unknown subpaths under /app or /dashboard (P1-13 fix)", () => {
      expect(parsePathToView("/app/nonexistent")).toBe("notFound");
      expect(parsePathToView("/app/foobar")).toBe("notFound");
      expect(parsePathToView("/dashboard/claims/999")).toBe("notFound");
      expect(parsePathToView("/app/evidence/invalid")).toBe("notFound");
    });

    it("returns notFound for unknown top-level routes (P1-13 fix)", () => {
      expect(parsePathToView("/invalid-route")).toBe("notFound");
      expect(parsePathToView("/random/deep/link")).toBe("notFound");
      expect(parsePathToView("/pricing")).toBe("notFound");
    });

    it("supports valid hash fallback routes", () => {
      expect(parsePathToView("/app", "#/evidence")).toBe("evidence");
      expect(parsePathToView("/app", "#evidence")).toBe("evidence");
      expect(parsePathToView("/app", "#radar")).toBe("radar");
      expect(parsePathToView("/app", "#studio")).toBe("studio");
    });

    it("returns notFound for invalid hash routes", () => {
      expect(parsePathToView("/unknown", "#invalid-hash")).toBe("notFound");
    });

    it("contains notFound in VIEW_TO_PATH_MAP", () => {
      expect(VIEW_TO_PATH_MAP.notFound).toBe("/404");
    });
  });
});
