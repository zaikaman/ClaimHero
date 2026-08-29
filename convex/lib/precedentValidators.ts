import { v } from "convex/values";

export const precedentMatchValidator = v.object({
  _id: v.id("precedents"),
  sourceKind: v.string(),
  title: v.string(),
  citation: v.string(),
  jurisdiction: v.string(),
  sourceUrl: v.optional(v.string()),
  icd10Codes: v.array(v.string()),
  cptCodes: v.array(v.string()),
  carcCodes: v.array(v.string()),
  winningArgument: v.string(),
  statutoryLanguage: v.string(),
  outcome: v.string(),
  vectorScore: v.number(),
  combinedScore: v.number(),
  codeOverlap: v.number(),
});
