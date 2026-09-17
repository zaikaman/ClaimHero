import { describe, it, expect } from "vitest";
import {
  FEDERAL_FILING_WINDOW_DAYS,
  getStateRegulator,
  normalizeStateCode,
} from "../convex/lib/stateRegulators";

describe("State regulator DOI reference map (federal ERISA engine)", () => {
  it("normalizes codes, names, and legacy federal values", () => {
    expect(normalizeStateCode("CA")).toBe("CA");
    expect(normalizeStateCode("ca")).toBe("CA");
    expect(normalizeStateCode("California")).toBe("CA");
    expect(normalizeStateCode("Texas")).toBe("TX");
    expect(normalizeStateCode("NY")).toBe("NY");
    expect(normalizeStateCode("FED")).toBe("US");
    expect(normalizeStateCode("Federal")).toBe("US");
    expect(normalizeStateCode(undefined)).toBe("US");
    expect(normalizeStateCode("the State")).toBe("US");
    expect(normalizeStateCode("ZZ")).toBe("US");
  });

  it("resolves DOI references per state", () => {
    expect(getStateRegulator("California").doiShort).toBe("CA DMHC/CDI");
    expect(getStateRegulator("CA").doiName).toContain("Managed Health Care");
    expect(getStateRegulator("Texas").doiName).toBe("Texas Department of Insurance (TDI)");
    expect(getStateRegulator("New York").doiShort).toBe("NY DFS");
    expect(getStateRegulator("Florida").doiShort).toBe("FL AHCA/OIR");
    expect(getStateRegulator("Illinois").doiShort).toBe("IL IDOI");
    expect(getStateRegulator("Pennsylvania").doiShort).toBe("PA PID");
  });

  it("falls back to the generic State Insurance Commissioner with the federal 180-day clock", () => {
    const federal = getStateRegulator(undefined);
    expect(federal.code).toBe("US");
    expect(federal.doiName).toBe("State Insurance Commissioner");
    expect(FEDERAL_FILING_WINDOW_DAYS).toBe(180);
  });
});
