"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import crypto from "crypto";
import type { Id, Doc } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { requireClaimOwnerAction } from "../lib/auth";
import { scrapeFirecrawlPolicySource } from "./policyCrawler";
import { createStructuredCompletion } from "../lib/openai";
import { getPayerClinicalDirectoryUrl } from "../../src/lib/constants";

export const POLICY_DRIFT_ANALYSIS_SCHEMA = {
  type: "object",
  properties: {
    hasDrift: { type: "boolean" },
    isRetroactiveAlteration: {
      type: "boolean",
      description: "True if criteria, step-therapy prerequisites, or experimental exclusions were added or tightened that adversely affect the patient's claim.",
    },
    severity: {
      type: "string",
      enum: ["none", "minor", "moderate", "critical_bad_faith"],
    },
    summary: { type: "string" },
    detectedChanges: {
      type: "array",
      items: {
        type: "object",
        properties: {
          category: {
            type: "string",
            enum: [
              "added_step_therapy",
              "added_exclusion",
              "tightened_criteria",
              "modified_criterion",
              "removed_pathway",
            ],
          },
          title: { type: "string" },
          baselineText: { type: "string" },
          liveText: { type: "string" },
          impact: { type: "string" },
          isAdverseToClaim: { type: "boolean" },
        },
        required: ["category", "title", "liveText", "impact", "isAdverseToClaim"],
        additionalProperties: false,
      },
    },
  },
  required: ["hasDrift", "isRetroactiveAlteration", "severity", "summary", "detectedChanges"],
  additionalProperties: false,
};

export interface DetectedPolicyChange {
  category: string;
  title: string;
  baselineText?: string;
  liveText: string;
  impact: string;
  isAdverseToClaim: boolean;
}

export interface PolicyDriftAnalysisResult {
  hasDrift: boolean;
  isRetroactiveAlteration: boolean;
  severity: "none" | "minor" | "moderate" | "critical_bad_faith";
  summary: string;
  detectedChanges: DetectedPolicyChange[];
}

/**
 * Compute standardized SHA-256 hash of normalized text.
 */
export function computeContentSha256(content: string): string {
  const normalized = content.replace(/\r\n/g, "\n").trim();
  return crypto.createHash("sha256").update(normalized, "utf8").digest("hex");
}

import {
  type GoverningFramework,
  type NoticePosture,
  type PolicyDiscrepancyNoticeParams,
  inferGoverningFramework,
  getFrameworkLabel,
  getFrameworkShortBadge,
  generatePolicyDiscrepancyNotice,
  generateErisaBadFaithNotice,
} from "../lib/policyDriftNotice";

export {
  type GoverningFramework,
  type NoticePosture,
  type PolicyDiscrepancyNoticeParams,
  inferGoverningFramework,
  getFrameworkLabel,
  getFrameworkShortBadge,
  generatePolicyDiscrepancyNotice,
  generateErisaBadFaithNotice,
};

/**
 * Fallback heuristic comparison when OpenAI is unavailable or rate limited.
 * Deterministically detects added lines, step therapy mentions, and exclusions.
 */
export function heuristicDriftComparison(
  baselineMarkdown: string,
  liveMarkdown: string,
  cptCodes: string[] = []
): PolicyDriftAnalysisResult {
  const baselineLines = new Set(
    baselineMarkdown.split("\n").map((l) => l.trim().toLowerCase()).filter((l) => l.length > 20)
  );
  const liveLines = liveMarkdown
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 20);

  const newLines = liveLines.filter((line) => !baselineLines.has(line.toLowerCase()));
  const detectedChanges: DetectedPolicyChange[] = [];

  const stepTherapyKeywords = ["step therapy", "conservative therapy", "fail", "trial of", "months", "weeks", "nsaid", "physical therapy"];
  const exclusionKeywords = ["investigational", "experimental", "not covered", "exclusion", "contraindicated", "unproven"];
  const thresholdKeywords = ["criteria", "score", "threshold", "minimum", "angle", "mm", "severity"];

  for (const line of newLines) {
    const lower = line.toLowerCase();
    const matchesCpt = cptCodes.length === 0 || cptCodes.some((code) => lower.includes(code.toLowerCase()));

    if (stepTherapyKeywords.some((kw) => lower.includes(kw))) {
      detectedChanges.push({
        category: "added_step_therapy",
        title: "Added Step-Therapy or Conservative Treatment Prerequisite",
        liveText: line,
        impact: "Requires proof of failure of conservative therapies not mandated in original policy snapshot.",
        isAdverseToClaim: true,
      });
    } else if (exclusionKeywords.some((kw) => lower.includes(kw))) {
      detectedChanges.push({
        category: "added_exclusion",
        title: "Added Experimental or Investigational Exclusion",
        liveText: line,
        impact: "Expands non-coverage exclusions to restrict reimbursement for previously covered indications.",
        isAdverseToClaim: true,
      });
    } else if (matchesCpt && thresholdKeywords.some((kw) => lower.includes(kw))) {
      detectedChanges.push({
        category: "tightened_criteria",
        title: "Tightened Clinical Threshold Criteria",
        liveText: line,
        impact: "Increases documentation burden or tightens quantitative clinical qualifying thresholds.",
        isAdverseToClaim: true,
      });
    }

    if (detectedChanges.length >= 6) break;
  }

  const hasAdverseChanges = detectedChanges.some((c) => c.isAdverseToClaim);

  return {
    hasDrift: detectedChanges.length > 0,
    isRetroactiveAlteration: hasAdverseChanges,
    severity: hasAdverseChanges ? "critical_bad_faith" : detectedChanges.length > 0 ? "minor" : "none",
    summary: hasAdverseChanges
      ? `Detected ${detectedChanges.length} retroactive alterations adding harsher criteria and step-therapy exclusions to the clinical policy bulletin.`
      : detectedChanges.length > 0
      ? `Detected ${detectedChanges.length} minor formatting or administrative updates to the policy bulletin.`
      : "No clinical policy drift detected. Baseline criteria match live document.",
    detectedChanges,
  };
}

export interface PolicyDriftActionResult {
  driftId: Id<"policyDrifts">;
  hasDrift: boolean;
  isRetroactiveAlteration: boolean;
  severity: "none" | "minor" | "moderate" | "critical_bad_faith";
  summary: string;
  baselineHash: string;
  liveHash: string;
  baselineCapturedAt: number;
  liveCapturedAt: number;
  detectedChanges: DetectedPolicyChange[];
  erisaNoticeDraft?: string;
  governingFramework?: string;
  noticePosture?: string;
}

/**
 * Core Policy Drift Sentinel Action.
 * Crawls live policy via Firecrawl, compares against denial date baseline snapshot,
 * detects retroactive criteria insertions, and synthesizes a Clinical Policy Discrepancy & Governing Criteria Notice.
 */
export const detectPolicyDriftAction = action({
  args: {
    claimId: v.id("claims"),
    policyUrl: v.optional(v.string()),
    baselineMarkdown: v.optional(v.string()),
    baselineCapturedAt: v.optional(v.number()),
    liveMarkdownOverride: v.optional(v.string()),
    governingFramework: v.optional(v.string()),
    noticePosture: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<PolicyDriftActionResult> => {
    // 1. Authenticate caller and verify claim ownership
    const { claim } = await requireClaimOwnerAction(ctx, args.claimId);
    const resolvedFramework: GoverningFramework =
      (args.governingFramework as GoverningFramework) || inferGoverningFramework(claim.insurancePayer);
    const resolvedPosture: NoticePosture =
      (args.noticePosture as NoticePosture) || "procedural_demand";

    // 2. Resolve target policy URL
    let targetPolicyUrl = args.policyUrl?.trim() || "";
    let baselineSnapshot: Doc<"policySnapshots"> | null = null;

    if (!targetPolicyUrl) {
      // Find existing clinical evidence with payer_cpb
      const rawEvidences = await ctx.runQuery(internal.clinicalEvidences.listByClaimInternal, {
        claimId: args.claimId,
      });
      const evidences: Doc<"clinicalEvidences">[] = Array.isArray(rawEvidences) ? rawEvidences : [];
      const cpbEvidence = evidences.find((e: Doc<"clinicalEvidences">) => e.sourceType === "payer_cpb" && e.sourceUrl);
      if (cpbEvidence?.sourceUrl) {
        targetPolicyUrl = cpbEvidence.sourceUrl;
      } else {
        // Fall back to default payer clinical directory URL
        targetPolicyUrl = getPayerClinicalDirectoryUrl(claim.insurancePayer || "Aetna") || "https://www.aetna.com/cpb";
      }
    }

    const urlHash = crypto.createHash("sha256").update(targetPolicyUrl.toLowerCase()).digest("hex");

    // 3. Resolve baseline snapshot
    baselineSnapshot = await ctx.runQuery(internal.policyDrift.getBaselineSnapshotInternal, {
      urlHash,
    });

    let resolvedBaselineMarkdown: string | undefined = args.baselineMarkdown?.trim();
    let resolvedBaselineCapturedAt: number | undefined = args.baselineCapturedAt;
    let resolvedPolicyTitle = baselineSnapshot?.title || `${claim.insurancePayer || "Insurer"} Clinical Policy Bulletin`;

    if (!resolvedBaselineMarkdown && baselineSnapshot) {
      resolvedBaselineMarkdown = baselineSnapshot.markdown;
      resolvedBaselineCapturedAt = baselineSnapshot.capturedAt;
    }

    // If still no baseline, check clinicalEvidences
    if (!resolvedBaselineMarkdown) {
      const rawEvidences = await ctx.runQuery(internal.clinicalEvidences.listByClaimInternal, {
        claimId: args.claimId,
      });
      const evidences: Doc<"clinicalEvidences">[] = Array.isArray(rawEvidences) ? rawEvidences : [];
      const cpbEvidence = evidences.find((e: Doc<"clinicalEvidences">) => e.sourceType === "payer_cpb" && e.extractedEvidenceMarkdown);
      if (cpbEvidence) {
        resolvedBaselineMarkdown = cpbEvidence.extractedEvidenceMarkdown;
        resolvedBaselineCapturedAt = cpbEvidence.capturedAt || cpbEvidence.createdAt;
        resolvedPolicyTitle = cpbEvidence.title || resolvedPolicyTitle;
      }
    }

    // 4. Retrieve or live-crawl the current live policy via Firecrawl
    let liveMarkdown: string | undefined = args.liveMarkdownOverride?.trim();
    const liveCapturedAt = Date.now();

    if (!liveMarkdown) {
      try {
        const liveCrawl = await scrapeFirecrawlPolicySource(ctx, targetPolicyUrl, {
          forceRescan: true, // Force fresh crawl to detect drift
          payer: claim.insurancePayer,
          cptCodes: claim.cptCodes,
          denialReasonCode: claim.denialReasonCode,
        });
        liveMarkdown = liveCrawl.markdown;
        if (liveCrawl.json && typeof liveCrawl.json === "object") {
          const jsonTitle = (liveCrawl.json as Record<string, unknown>).policyTitle;
          if (typeof jsonTitle === "string" && jsonTitle.trim()) {
            resolvedPolicyTitle = jsonTitle.trim();
          }
        }
      } catch (crawlErr) {
        const crawlErrMsg = crawlErr instanceof Error ? crawlErr.message : String(crawlErr);
        console.warn(`Live policy crawl failed for drift detection (${crawlErrMsg}); evaluating against existing evidence.`);
        if (resolvedBaselineMarkdown) {
          liveMarkdown = resolvedBaselineMarkdown;
        } else {
          throw new Error(`Could not crawl live policy for drift detection: ${crawlErrMsg}`);
        }
      }
    }

    // If baseline was missing, use the scraped markdown as the initial baseline
    if (!resolvedBaselineMarkdown) {
      resolvedBaselineMarkdown = liveMarkdown || "Clinical Policy Bulletin - Standard of Care";
      resolvedBaselineCapturedAt = claim.createdAt;
    }

    if (!liveMarkdown) {
      liveMarkdown = resolvedBaselineMarkdown;
    }

    if (!resolvedBaselineCapturedAt) {
      resolvedBaselineCapturedAt = claim.createdAt;
    }

    // 5. Cryptographic hash comparison
    const baselineHash = computeContentSha256(resolvedBaselineMarkdown);
    const liveHash = computeContentSha256(liveMarkdown);
    const hashesIdentical = baselineHash === liveHash;

    let analysis: PolicyDriftAnalysisResult;

    if (hashesIdentical) {
      // Zero drift
      analysis = {
        hasDrift: false,
        isRetroactiveAlteration: false,
        severity: "none",
        summary: `Policy content matches the baseline snapshot from date of denial. 0 policy alterations detected. Cryptographic fingerprint: ${baselineHash.slice(0, 16)}...`,
        detectedChanges: [],
      };
    } else {
      // Content has changed - perform semantic clinical drift analysis
      try {
        const systemPrompt = `You are a Senior Healthcare Appellate Regulatory Specialist and Clinical Policy Auditor.
Compare the Baseline Clinical Policy Bulletin (active when the claim was denied) against the Current Live Policy Bulletin (crawled today).
Determine if the insurer made retroactive changes that adversely affect the patient's claim, such as:
1. Inserting new step-therapy prerequisites (e.g. demanding 6 months of conservative therapy instead of 6 weeks).
2. Adding new experimental/investigational exclusions for CPT codes [${claim.cptCodes.join(", ")}].
3. Tightening diagnostic score requirements or clinical documentation standards.
4. Removing alternative qualification pathways.

If harsher criteria were added, flag isRetroactiveAlteration: true and severity: "critical_bad_faith".`;

        const userPrompt = `Patient Denial Context:
- Payer: ${claim.insurancePayer || "Health Insurer"}
- Service Date: ${claim.serviceDate}
- Denial Date: ${new Date(claim.createdAt).toISOString().split("T")[0]}
- Disputed CPT Codes: ${claim.cptCodes.join(", ")}
- Denial Reason: ${claim.denialReasonCode} (${claim.denialReasonDescription})

Baseline Policy Snapshot (SHA-256: ${baselineHash.slice(0, 12)}):
${resolvedBaselineMarkdown.slice(0, 5000)}

Current Live Policy Bulletin (SHA-256: ${liveHash.slice(0, 12)}):
${liveMarkdown.slice(0, 5000)}

Perform structured policy drift comparison according to the schema.`;

        analysis = await createStructuredCompletion<PolicyDriftAnalysisResult>({
          schema: POLICY_DRIFT_ANALYSIS_SCHEMA,
          schemaName: "PolicyDriftAnalysis",
          systemPrompt,
          userPrompt,
        });
      } catch (err) {
        console.warn("OpenAI drift comparison failed or unavailable, engaging deterministic fallback:", err);
        analysis = heuristicDriftComparison(resolvedBaselineMarkdown, liveMarkdown, claim.cptCodes);
      }
    }

    // 6. Automatically draft Clinical Policy Discrepancy & Governing Criteria Notice if retroactive alterations detected
    let erisaNoticeDraft: string | undefined = undefined;
    let erisaNoticeGeneratedAt: number | undefined = undefined;

    if (analysis.isRetroactiveAlteration && analysis.detectedChanges.length > 0) {
      erisaNoticeDraft = generatePolicyDiscrepancyNotice({
        patientName: claim.patientName || "Claimant",
        memberId: "REDACTED-MEM",
        claimNumber: claim.claimNumber,
        payer: claim.insurancePayer || "Health Insurer",
        serviceDate: claim.serviceDate,
        denialReasonCode: claim.denialReasonCode,
        cptCodes: claim.cptCodes,
        policyTitle: resolvedPolicyTitle,
        policyUrl: targetPolicyUrl,
        baselineCapturedAt: resolvedBaselineCapturedAt,
        baselineHash,
        liveCapturedAt,
        liveHash,
        detectedChanges: analysis.detectedChanges,
        governingFramework: resolvedFramework,
        noticePosture: resolvedPosture,
      });
      erisaNoticeGeneratedAt = Date.now();
    }

    // 7. Persist drift report into Convex
    const driftId: Id<"policyDrifts"> = await ctx.runMutation(internal.policyDrift.saveDriftInternal, {
      claimId: args.claimId,
      policyUrl: targetPolicyUrl,
      policyTitle: resolvedPolicyTitle,
      payer: claim.insurancePayer,
      baselineSnapshotId: baselineSnapshot?._id,
      baselineCapturedAt: resolvedBaselineCapturedAt,
      baselineContentHash: baselineHash,
      baselineMarkdown: resolvedBaselineMarkdown,
      liveCapturedAt,
      liveContentHash: liveHash,
      liveMarkdown,
      hasDrift: analysis.hasDrift,
      isRetroactiveAlteration: analysis.isRetroactiveAlteration,
      severity: analysis.severity,
      summary: analysis.summary,
      denialDate: new Date(claim.createdAt).toISOString().split("T")[0],
      serviceDate: claim.serviceDate,
      detectedChanges: analysis.detectedChanges,
      erisaNoticeDraft,
      erisaNoticeGeneratedAt,
      governingFramework: resolvedFramework,
      noticePosture: resolvedPosture,
      status: "completed",
    });

    return {
      driftId,
      hasDrift: analysis.hasDrift,
      isRetroactiveAlteration: analysis.isRetroactiveAlteration,
      severity: analysis.severity,
      summary: analysis.summary,
      baselineHash,
      liveHash,
      baselineCapturedAt: resolvedBaselineCapturedAt,
      liveCapturedAt,
      detectedChanges: analysis.detectedChanges,
      erisaNoticeDraft,
      governingFramework: resolvedFramework,
      noticePosture: resolvedPosture,
    };
  },
});
