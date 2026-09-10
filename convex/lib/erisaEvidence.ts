/**
 * Baseline ERISA statutory evidence for the full & fair review protocol.
 *
 * Isolate-safe pure-data module: this file must NOT import Node.js built-ins
 * or any `"use node"` action module. It is imported by both isolate-runtime
 * modules (`convex/workflows.ts`, which exports queries/mutations and therefore
 * cannot carry a `"use node"` directive) and Node-runtime actions
 * (`convex/actions/policyCrawler.ts`, `convex/actions/sentinelPipeline.ts`).
 * Importing it from an isolate module never pulls Node APIs into the isolate
 * bundle (see https://docs.convex.dev/functions/runtimes#nodejs-runtime).
 */
export const ERISA_STATUTORY_EVIDENCE = {
  sourceType: "legal_precedent",
  title: "ERISA Full & Fair Review Statutory Protocol",
  sourceUrl:
    "https://www.ecfr.gov/current/title-29/subtitle-B/chapter-XXV/subchapter-L/part-2560/section-2560.503-1",
  citationClause: "29 CFR § 2560.503-1(h)(2)(iii)",
  extractedEvidenceMarkdown:
    "Statutory Requirement: Plan administrators must provide claimants upon request with all documents, records, and internal clinical criteria utilized in making the adverse determination. Adverse benefit determinations lacking specific clinical justification violate the claimant's right to a full and fair review.",
  relevanceScore: 95,
} as const;
