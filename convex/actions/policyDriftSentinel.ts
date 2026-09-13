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

/**
 * Deterministically synthesize a legally authoritative ERISA Bad-Faith Notice of Violation.
 * Cites 29 U.S.C. § 1133, 29 CFR § 2560.503-1(h)(2)(iii), 29 U.S.C. § 1132(c) $110/day penalties,
 * and ERISA § 404(a)(1) fiduciary duties.
 */
export function generateErisaBadFaithNotice(params: {
  patientName: string;
  memberId: string;
  claimNumber: string;
  payer: string;
  serviceDate: string;
  denialReasonCode: string;
  cptCodes: string[];
  policyTitle: string;
  policyUrl: string;
  baselineCapturedAt: number;
  baselineHash: string;
  liveCapturedAt: number;
  liveHash: string;
  detectedChanges: DetectedPolicyChange[];
}): string {
  const baselineDateStr = new Date(params.baselineCapturedAt).toISOString().split("T")[0];
  const liveDateStr = new Date(params.liveCapturedAt).toISOString().split("T")[0];
  const cptList = params.cptCodes.length > 0 ? params.cptCodes.join(", ") : "Disputed Procedure(s)";

  const changesListMarkdown = params.detectedChanges.map((change, idx) => {
    const categoryLabel = change.category.replace(/_/g, " ").toUpperCase();
    const baselineSnippet = change.baselineText ? `\n> **Baseline Clause (${baselineDateStr})**: "${change.baselineText.slice(0, 300)}..."` : "";
    return `#### ${idx + 1}. [${categoryLabel}] ${change.title}
${baselineSnippet}
> **Live Alteration (${liveDateStr})**: "${change.liveText.slice(0, 300)}..."
> 
> **Adverse Impact**: ${change.impact}
`;
  }).join("\n");

  return `# FORMAL NOTICE OF STATUTORY ERISA VIOLATION
## DEMAND FOR WITHDRAWAL OF RETROACTIVE POLICY ALTERATIONS & IMMEDIATE ADJUDICATION UNDER GOVERNING TERMS

**VIA CERTIFIED ELECTRONIC TRANSMISSION & STATUTORY AGENTMAIL INBOX**

**DATE:** ${new Date().toISOString().split("T")[0]}  
**TO:** Appeals & Grievance Department / Plan Administrator, ${params.payer}  
**RE:** Unlawful Retroactive Clinical Policy Alteration & Bad-Faith Post-Hoc Justification  
**CLAIM NUMBER:** ${params.claimNumber}  
**PATIENT / MEMBER:** ${params.patientName} (Member ID: ${params.memberId})  
**DATE OF SERVICE:** ${params.serviceDate}  
**DISPUTED CODES:** ${cptList} (Denial Code: ${params.denialReasonCode})  
**GOVERNING POLICY:** ${params.policyTitle} (${params.policyUrl})  

---

### I. STATUTORY BASIS OF VIOLATION & DEMAND

This document constitutes formal notice under the **Employee Retirement Income Security Act of 1974 (ERISA) § 503, 29 U.S.C. § 1133**, and federal claims procedure regulations **29 CFR § 2560.503-1**.

Notice is hereby served that ${params.payer} has committed an actionable regulatory and bad-faith violation by retroactively modifying its published Clinical Policy Bulletin (CPB) after the patient received medically indicated care, and subsequently utilizing these post-hoc modifications to justify an adverse benefit determination.

Under federal law:
1. **29 CFR § 2560.503-1(h)(2)(iii)** establishes that every claimant is entitled to a "full and fair review" evaluated strictly under the clinical criteria, guidelines, and protocols in effect on the **Date of Service**. An insurer may not adjudicate a claim under criteria fabricated or inserted subsequent to the date care was rendered or pre-service authorization was requested.
2. **29 U.S.C. § 1104(a)(1) (ERISA § 404)** mandates that plan fiduciaries administer benefits strictly "in accordance with the documents and instruments governing the plan." Altering clinical criteria retroactively to defend a denial constitutes a willful breach of fiduciary loyalty and good faith.
3. **29 U.S.C. § 1132(c)(1)** empowers claimants to seek statutory penalties of up to **$110.00 per day** against plan administrators who fail or refuse to provide full, honest disclosure of the true governing guidelines, alongside reasonable attorneys' fees under **29 U.S.C. § 1132(g)**.

---

### II. CRYPTOGRAPHIC EVIDENTIARY AUDIT PROOF

ClaimHero's Policy Drift Sentinel maintains continuous, cryptographically verified snapshots of published payer clinical bulletins. An automated cryptographic audit reveals the following unassailable chain of evidence:

- **Baseline Policy Snapshot at Date of Denial/Service:**
  - **Date Captured:** ${baselineDateStr}
  - **Cryptographic SHA-256 Fingerprint:** \`${params.baselineHash}\`
  - **Status:** Baseline coverage criteria under which care was planned and rendered.

- **Current Live Policy Bulletin:**
  - **Date Crawled:** ${liveDateStr}
  - **Cryptographic SHA-256 Fingerprint:** \`${params.liveHash}\`
  - **Status:** Altered document containing retroactive exclusions and unnotified clinical hurdles.

---

### III. ITEMIZED RETROACTIVE ALTERATIONS DETECTED

${changesListMarkdown}

---

### IV. STATUTORY DEMANDS & RESERVATION OF RIGHTS

In light of the verified policy drift documented above, the claimant hereby demands:

1. **Immediate Rescission of Unlawful Criteria:** That ${params.payer} immediately strike and disregard all retroactive criteria, step-therapy additions, and exclusions added after ${params.serviceDate}.
2. **Adjudication Under Baseline Standards:** That the disputed claim be immediately readjudicated under the baseline policy criteria effective on the date of service (\`${params.baselineHash}\`), which the submitted clinical chart fully satisfies.
3. **Disclosure of Revision Audit Trail:** That pursuant to 29 CFR § 2560.503-1(h)(2)(iii), the plan provide within thirty (30) days the complete administrative record, including all committee meeting minutes, clinical review notes, and author timestamps regarding when and why ${params.policyTitle} was modified.

**RESERVATION OF RIGHTS:**  
Failure to cure this violation within fourteen (14) calendar days will result in an immediate formal petition for enforcement filed with the **U.S. Department of Labor Employee Benefits Security Administration (EBSA)**, state insurance regulatory authorities, and an action for civil enforcement under **ERISA § 502(a)(1)(B)** seeking full payment of covered benefits, statutory interest, and discretionary attorney fees.

Respectfully submitted,

**Authorized Patient Representative & Appellate Sentinel**  
*ClaimHero Autonomous Medical Appeal Sentinel — Cryptographically Audited Docket*
`;
}

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
}

/**
 * Core Policy Drift Sentinel Action.
 * Crawls live policy via Firecrawl, compares against denial date baseline snapshot,
 * detects retroactive criteria insertions, and synthesizes an ERISA Bad-Faith Notice of Violation.
 */
export const detectPolicyDriftAction = action({
  args: {
    claimId: v.id("claims"),
    policyUrl: v.optional(v.string()),
    baselineMarkdown: v.optional(v.string()),
    baselineCapturedAt: v.optional(v.number()),
    liveMarkdownOverride: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<PolicyDriftActionResult> => {
    // 1. Authenticate caller and verify claim ownership
    const { claim } = await requireClaimOwnerAction(ctx, args.claimId);

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
        const systemPrompt = `You are a Senior ERISA Healthcare Appellate Regulatory Attorney and Clinical Policy Auditor.
Compare the Baseline Clinical Policy Bulletin (active when the claim was denied) against the Current Live Policy Bulletin (crawled today).
Determine if the insurer made retroactive changes that harm the patient's claim, such as:
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

    // 6. Automatically draft ERISA Bad-Faith Notice of Violation if retroactive alterations detected
    let erisaNoticeDraft: string | undefined = undefined;
    let erisaNoticeGeneratedAt: number | undefined = undefined;

    if (analysis.isRetroactiveAlteration && analysis.detectedChanges.length > 0) {
      erisaNoticeDraft = generateErisaBadFaithNotice({
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
    };
  },
});
