import { describe, it, expect } from "vitest";
import { readStreamingStringField } from "../src/lib/streamingJson";

describe("src/lib/streamingJson: partial field reader", () => {
  it("returns nothing before the field starts arriving", () => {
    expect(readStreamingStringField("", "executiveSummary")).toBe("");
    expect(readStreamingStringField('{"statutory', "executiveSummary")).toBe("");
    expect(readStreamingStringField('{"executiveSummary":', "executiveSummary")).toBe("");
  });

  it("reads a partially streamed string value", () => {
    const partial = '{"executiveSummary":"The record documents twelve weeks';
    expect(readStreamingStringField(partial, "executiveSummary")).toBe(
      "The record documents twelve weeks"
    );
  });

  it("stops at the closing quote and ignores later fields", () => {
    const complete =
      '{"executiveSummary":"Short summary.","medicalNecessityArguments":"Second field."}';
    expect(readStreamingStringField(complete, "executiveSummary")).toBe("Short summary.");
    expect(readStreamingStringField(complete, "medicalNecessityArguments")).toBe(
      "Second field."
    );
  });

  it("decodes JSON escapes as they arrive", () => {
    const raw = '{"executiveSummary":"Line one\\nLine two \\"quoted\\" \\u2028 \\\\ end"}';
    expect(readStreamingStringField(raw, "executiveSummary")).toBe(
      'Line one\nLine two "quoted" \u2028 \\ end'
    );
  });

  it("holds back an escape sequence that is still in flight", () => {
    expect(readStreamingStringField('{"executiveSummary":"half\\', "executiveSummary")).toBe(
      "half"
    );
    expect(readStreamingStringField('{"executiveSummary":"half\\u20', "executiveSummary")).toBe(
      "half"
    );
  });

  it("tolerates whitespace between the key and the value", () => {
    const raw = '{ "executiveSummary" :  "Spaced out." }';
    expect(readStreamingStringField(raw, "executiveSummary")).toBe("Spaced out.");
  });

  it("ignores a non-string value", () => {
    expect(readStreamingStringField('{"policyCitations":[{"source":', "policyCitations")).toBe(
      ""
    );
  });
});
