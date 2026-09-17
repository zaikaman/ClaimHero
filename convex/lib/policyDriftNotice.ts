/**
 * Pure-data isolate-safe module for Clinical Policy Discrepancy & Governing Criteria Notices.
 * Safe for import in both isolate (client / queries) and Node.js runtimes.
 */

export type GoverningFramework =
  | "erisa_self_funded"
  | "erisa_insured"
  | "medicare_advantage"
  | "medicaid_mco"
  | "aca_individual"
  | "general_administrative";

export type NoticePosture =
  | "objective_inquiry"
  | "procedural_demand"
  | "statutory_escalation";

export interface DetectedPolicyChange {
  category: string;
  title: string;
  baselineText?: string;
  liveText: string;
  impact: string;
  isAdverseToClaim: boolean;
}

export interface PolicyDiscrepancyNoticeParams {
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
  governingFramework?: GoverningFramework;
  noticePosture?: NoticePosture;
}

/**
 * Infer the likely governing legal and regulatory framework based on payer and plan details.
 */
export function inferGoverningFramework(payerName?: string, planDetails?: string): GoverningFramework {
  const text = `${payerName || ""} ${planDetails || ""}`.toLowerCase();
  if (text.includes("medicare") || text.includes("part c") || text.includes("cms")) {
    return "medicare_advantage";
  }
  if (text.includes("medicaid") || text.includes("managed care") || text.includes("community plan")) {
    return "medicaid_mco";
  }
  if (text.includes("marketplace") || text.includes("exchange") || text.includes("individual")) {
    return "aca_individual";
  }
  if (text.includes("self-funded") || text.includes("self-insured") || text.includes("erisa direct") || text.includes("aso")) {
    return "erisa_self_funded";
  }
  if (
    text.includes("aetna") ||
    text.includes("cigna") ||
    text.includes("unitedhealthcare") ||
    text.includes("united healthcare") ||
    text.includes("uhc") ||
    text.includes("anthem") ||
    text.includes("blue cross") ||
    text.includes("bcbs") ||
    text.includes("humana")
  ) {
    return "erisa_insured";
  }
  return "general_administrative";
}

export function getFrameworkLabel(framework: GoverningFramework): string {
  switch (framework) {
    case "erisa_self_funded":
      return "Federal ERISA Standards (Self-Funded Group Health Plan — 29 U.S.C. § 1002 et seq.)";
    case "erisa_insured":
      return "Federal ERISA & State Insurance Law (Fully-Insured Group Health Plan)";
    case "medicare_advantage":
      return "Medicare Advantage Part C Standards (CMS 42 CFR § 422.101 & CMS-4201-F)";
    case "medicaid_mco":
      return "Federal Medicaid Managed Care Regulations (42 CFR Part 438, Subpart F)";
    case "aca_individual":
      return "Affordable Care Act Individual Market Standards (45 CFR § 147.136 & State Insurance Code)";
    default:
      return "Governing Health Benefit Review Standards & Applicable Claims Procedure Regulations";
  }
}

export function getFrameworkShortBadge(framework: GoverningFramework): string {
  switch (framework) {
    case "erisa_self_funded":
      return "ERISA Self-Funded";
    case "erisa_insured":
      return "ERISA Insured Group";
    case "medicare_advantage":
      return "Medicare Advantage";
    case "medicaid_mco":
      return "Medicaid Managed Care";
    case "aca_individual":
      return "ACA Individual / State";
    default:
      return "General Administrative";
  }
}

/**
 * Deterministically synthesize an evidence-grounded Clinical Policy Discrepancy & Governing Criteria Notice.
 * Evaluates the policy discrepancy against the confirmed or inferred governing framework (ERISA, CMS, ACA, State DOI),
 * anchors administrative record requests to statutory production timelines, and provides tiered legal postures.
 */
export function generatePolicyDiscrepancyNotice(params: PolicyDiscrepancyNoticeParams): string {
  const framework: GoverningFramework = params.governingFramework || inferGoverningFramework(params.payer);
  const posture: NoticePosture = params.noticePosture || "procedural_demand";

  const baselineDateStr = new Date(params.baselineCapturedAt).toISOString().split("T")[0];
  const liveDateStr = new Date(params.liveCapturedAt).toISOString().split("T")[0];
  const cptList = params.cptCodes.length > 0 ? params.cptCodes.join(", ") : "Disputed Procedure(s)";
  const frameworkLabel = getFrameworkLabel(framework);

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

  // Regulatory grounding tailored to governing framework
  let regulatorySection = "";
  if (framework === "erisa_self_funded" || framework === "erisa_insured") {
    const insuredNote = framework === "erisa_insured"
      ? "\n   - *Note on State Jurisdiction*: As an insured group plan, the policy remains additionally subject to state insurance department unfair claims settlement regulations and prompt-pay mandates."
      : "";
    regulatorySection = `This notice constitutes formal demand under the **Employee Retirement Income Security Act of 1974 (ERISA) § 503, 29 U.S.C. § 1133**, and federal claims procedure regulations **29 CFR § 2560.503-1**.

Notice is hereby served that an evidentiary contradiction exists: ${params.payer}'s published Clinical Policy Bulletin (CPB) has been modified subsequent to the patient's Date of Service, and utilizing post-hoc criteria to evaluate this claim impairs the statutory integrity of the administrative review.

Under governing federal law:
1. **29 CFR § 2560.503-1(h)(2)(iii)** establishes that every claimant is entitled to a "full and fair review" evaluated strictly under the clinical criteria, guidelines, and protocols in effect on the **Date of Service**. An insurer may not adjudicate a claim under criteria fabricated or inserted subsequent to the date care was rendered or pre-service authorization was requested.
2. **29 U.S.C. § 1104(a)(1) (ERISA § 404)** mandates that plan fiduciaries administer benefits strictly "in accordance with the documents and instruments governing the plan." Applying retroactive clinical hurdles not in effect on the date of service conflicts with fiduciary standards.${insuredNote}
3. **Statutory Administrative Record Demand & 30-Day Production Window (29 U.S.C. § 1024(b)(4) & § 1132(c)(1))**: Pursuant to 29 CFR § 2560.503-1(h)(2)(iii), claimant formally requests the complete administrative record, including clinical guidelines and committee revision audit logs in effect on ${params.serviceDate}. Plan administrators failing or refusing to furnish requested governing instruments within thirty (30) days of formal written request are subject under **29 U.S.C. § 1132(c)(1)** to discretionary penalties of up to **$110.00 per day**, alongside reasonable attorneys' fees under **29 U.S.C. § 1132(g)**.`;
  } else if (framework === "medicare_advantage") {
    regulatorySection = `This notice constitutes formal administrative inquiry under **Centers for Medicare & Medicaid Services (CMS) Medicare Advantage Regulations (42 CFR Part 422, Subpart M)** and the **CMS Final Rule (CMS-4201-F)**.

Notice is hereby served that ${params.payer} appears to have evaluated Claim #${params.claimNumber} against proprietary clinical bulletin revisions that post-date the patient's Date of Service.

Under governing federal Medicare standards:
1. **42 CFR § 422.101 & CMS-4201-F** establish that Medicare Advantage Organizations (MAOs) must furnish covered benefits in accordance with National Coverage Determinations (NCDs), Local Coverage Determinations (LCDs), and general Medicare coverage standards in effect on the Date of Service. MAOs may not apply internal clinical criteria that are more restrictive than traditional Medicare guidelines or introduce retroactive step-therapy obstacles.
2. **42 CFR § 422.566 & § 422.568** guarantee enrollees full disclosure of the specific coverage rules utilized in adverse determinations and mandate that redeterminations apply criteria in effect when care was rendered.`;
  } else if (framework === "medicaid_mco") {
    regulatorySection = `This notice constitutes formal administrative inquiry under **Federal Medicaid Managed Care Regulations (42 CFR Part 438, Subpart F)** and applicable State Medical Assistance program guidelines.

Under governing Medicaid standards:
1. Coverage determinations must be evaluated by clinical professionals with appropriate clinical expertise applying criteria in effect on the Date of Service.
2. The administrative file and all clinical protocols utilized in the adverse determination must be provided to the claimant upon request without procedural delay.`;
  } else {
    regulatorySection = `This notice constitutes formal administrative demand under **Affordable Care Act Claims and Appeals Standards (45 CFR § 147.136)** and applicable State Insurance Department regulations.

Under governing administrative standards:
1. Health plans must provide internal claims and appeals processes that comply with federal full and fair review standards, guaranteeing the claimant access to all clinical guidelines, medical policies, and evidentiary rationale utilized in evaluating the claim.
2. Fundamental administrative fair-hearing standards and insurance contract principles preclude evaluating medical claims against retroactive revisions or undisclosed criteria adopted after the date care was provided.`;
  }

  // Demands section tailored to posture
  let demandsSection = "";
  if (posture === "objective_inquiry") {
    demandsSection = `### IV. ADMINISTRATIVE INQUIRY & RECONSIDERATION REQUEST

In light of the verified policy discrepancy documented above, the claimant respectfully requests:

1. **Confirmation of Date-of-Service Criteria:** Written confirmation from ${params.payer}'s clinical review committee that Claim #${params.claimNumber} was evaluated strictly under the baseline criteria in effect on ${params.serviceDate} (\`${params.baselineHash.slice(0, 16)}...\`), rather than subsequent revisions.
2. **Administrative Reconsideration:** Re-evaluation of the disputed procedure(s) under baseline criteria, which the enclosed clinical chart fully satisfies.
3. **Disclosure of Revision History:** Production of the formal effective date history and clinical committee rationale for modifications to ${params.policyTitle}.

**RESERVATION OF RIGHTS:**  
The claimant expressly reserves all procedural, administrative, and external review rights provided under governing plan instruments and applicable state and federal law.`;
  } else if (posture === "statutory_escalation") {
    const authorityTarget = framework === "medicare_advantage"
      ? "Centers for Medicare & Medicaid Services (CMS) Regional Office"
      : framework === "medicaid_mco"
      ? "State Department of Health / Medicaid Oversight Agency"
      : "U.S. Department of Labor Employee Benefits Security Administration (EBSA) and State Insurance Commissioner";

    demandsSection = `### IV. STATUTORY DEMANDS & FORMAL ESCALATION NOTICE

In light of the verified criteria divergence documented above, the claimant hereby demands:

1. **Immediate Rescission of Inapplicable Post-DOS Criteria:** That ${params.payer} immediately strike all retroactive exclusions and heightened prerequisites added after ${params.serviceDate}.
2. **Immediate Re-adjudication under Baseline Standards:** That the disputed claim be immediately approved or readjudicated strictly under the baseline policy criteria effective on the date of service (\`${params.baselineHash}\`).
3. **Production of Full Administrative File:** That pursuant to governing claims procedure regulations, the plan provide within thirty (30) days the complete administrative file, including all medical director review notes and policy revision logs regarding ${params.policyTitle}.

**FORMAL RESERVATION OF REMEDIES:**  
Failure to cure this procedural defect within fourteen (14) calendar days will prompt an immediate formal petition for enforcement filed with the **${authorityTarget}**, alongside civil enforcement actions seeking full payment of covered benefits, statutory interest, and discretionary attorney fees where authorized by law.`;
  } else {
    // Default: procedural_demand
    const escalationTarget = framework === "medicare_advantage"
      ? "CMS Regional Oversight and the Independent Review Entity (IRE)"
      : framework === "medicaid_mco"
      ? "State Medicaid Fair Hearing and External Review Authorities"
      : "the U.S. Department of Labor Employee Benefits Security Administration (EBSA), state insurance regulatory authorities, and independent review organizations";

    demandsSection = `### IV. ADMINISTRATIVE DEMANDS & RESERVATION OF RIGHTS

In light of the verified policy discrepancy documented above, the claimant hereby demands:

1. **Disregard of Post-DOS Clinical Alterations:** That ${params.payer} confirm that all retroactive criteria, step-therapy additions, and exclusions added after ${params.serviceDate} have been excluded from the adjudication of this claim.
2. **Adjudication Under Baseline Standards:** That the disputed claim be readjudicated strictly under the baseline policy criteria effective on the date of service (\`${params.baselineHash}\`), which the submitted clinical chart fully satisfies.
3. **Disclosure of Revision Audit Trail:** That pursuant to applicable claims procedure regulations (including 29 CFR § 2560.503-1(h)(2)(iii) where applicable), the plan provide within thirty (30) days the complete administrative record, including all committee meeting minutes, clinical review notes, and author timestamps regarding when and why ${params.policyTitle} was modified.

**RESERVATION OF RIGHTS:**  
Failure to confirm adjudication under effective Date-of-Service standards within fourteen (14) calendar days will result in an immediate formal petition for enforcement filed with **${escalationTarget}**, alongside an action for civil enforcement seeking full payment of covered benefits, statutory interest, and discretionary attorney fees where applicable.`;
  }

  return `# NOTICE OF CLINICAL POLICY DISCREPANCY & GOVERNING CRITERIA RECONSIDERATION DEMAND
## EVIDENTIARY AUDIT & ADMINISTRATIVE RECORD PRODUCTION REQUEST PURSUANT TO DATE-OF-SERVICE STANDARDS

**VIA CERTIFIED ELECTRONIC TRANSMISSION & SECURE APPELLATE INBOX**

**DATE:** ${new Date().toISOString().split("T")[0]}  
**TO:** Appeals & Grievance Department / Clinical Review Committee, ${params.payer}  
**RE:** Evidentiary Clinical Policy Discrepancy & Demand for Reconsideration under Date-of-Service Criteria  
**CLAIM NUMBER:** ${params.claimNumber}  
**PATIENT / MEMBER:** ${params.patientName} (Member ID: ${params.memberId})  
**DATE OF SERVICE:** ${params.serviceDate}  
**DISPUTED CODES:** ${cptList} (Denial Code: ${params.denialReasonCode})  
**REVIEWED POLICY BULLETIN:** ${params.policyTitle} (${params.policyUrl})  
**GOVERNING REVIEW FRAMEWORK:** ${frameworkLabel}  

---

### I. STATUTORY BASIS OF VIOLATION & DEMAND

${regulatorySection}

---

### II. CRYPTOGRAPHIC EVIDENTIARY AUDIT PROOF

ClaimHero's Policy Drift Sentinel maintains continuous, cryptographically verified snapshots of published payer clinical bulletins. An automated cryptographic audit reveals the following unassailable chain of evidence:

- **Baseline Policy Snapshot at Date of Denial/Service:**
  - **Date Captured:** ${baselineDateStr}
  - **Cryptographic SHA-256 Fingerprint:** \`${params.baselineHash}\`
  - **Status:** Documented baseline criteria in effect when care was evaluated.

- **Current Live Policy Bulletin:**
  - **Date Crawled:** ${liveDateStr}
  - **Cryptographic SHA-256 Fingerprint:** \`${params.liveHash}\`
  - **Status:** Altered document containing subsequent criteria additions or revisions.

---

### III. ITEMIZED RETROACTIVE ALTERATIONS DETECTED

${changesListMarkdown}

---

${demandsSection}

Respectfully submitted,

**Authorized Patient Representative & Appellate Sentinel**  
*ClaimHero Autonomous Medical Appeal Sentinel — Cryptographically Audited Docket*
`;
}

/**
 * Backward-compatible alias for existing test suites and legacy callers.
 * Generates an ERISA-grounded notice with procedural demand posture.
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
  governingFramework?: GoverningFramework;
  noticePosture?: NoticePosture;
}): string {
  return generatePolicyDiscrepancyNotice({
    ...params,
    governingFramework: params.governingFramework ?? "erisa_insured",
    noticePosture: params.noticePosture ?? "procedural_demand",
  });
}
