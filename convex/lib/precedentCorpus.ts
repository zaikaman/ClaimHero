import type { PrecedentSourceKind } from "./embeddings";

/**
 * Public, citable authorities for the Precedent Vector Archive.
 * Every entry is a real statute, regulation, or published opinion — not a
 * fabricated case caption. Won ClaimHero briefs are indexed separately at
 * adjudication time.
 */
export interface PrecedentCorpusEntry {
  corpusKey: string;
  sourceKind: PrecedentSourceKind;
  title: string;
  citation: string;
  jurisdiction: string;
  sourceUrl?: string;
  icd10Codes: string[];
  cptCodes: string[];
  carcCodes: string[];
  winningArgument: string;
  statutoryLanguage: string;
  outcome: string;
}

export const PRECEDENT_CORPUS: PrecedentCorpusEntry[] = [
  {
    corpusKey: "scotus-firestone-bruch-1989",
    sourceKind: "court_overturn",
    title: "Firestone Tire & Rubber Co. v. Bruch",
    citation: "489 U.S. 101 (1989)",
    jurisdiction: "US-SCOTUS",
    sourceUrl: "https://www.law.cornell.edu/supremecourt/text/489/101",
    icd10Codes: ["M17.11", "M17.12", "M51.16", "M48.06"],
    cptCodes: ["27447", "63047", "73721", "29881"],
    carcCodes: ["CO-50", "CO-197", "CO-96"],
    winningArgument:
      "Where an ERISA plan does not grant the administrator discretionary authority to determine eligibility or construe plan terms, a denial of benefits is reviewed de novo. A medical-necessity denial that rests on undisclosed internal criteria, rather than the plan's published terms, cannot survive de novo review.",
    statutoryLanguage:
      "Consistent with established principles of trust law, a denial of benefits challenged under ERISA § 1132(a)(1)(B) is to be reviewed under a de novo standard unless the benefit plan gives the administrator or fiduciary discretionary authority to determine eligibility for benefits or to construe the terms of the plan. Firestone Tire & Rubber Co. v. Bruch, 489 U.S. 101, 115 (1989).",
    outcome: "Supreme Court established de novo review as the default ERISA standard.",
  },
  {
    corpusKey: "scotus-metlife-glenn-2008",
    sourceKind: "court_overturn",
    title: "Metropolitan Life Insurance Co. v. Glenn",
    citation: "554 U.S. 105 (2008)",
    jurisdiction: "US-SCOTUS",
    sourceUrl: "https://www.law.cornell.edu/supremecourt/text/554/105",
    icd10Codes: ["M17.11", "M51.16", "G89.4"],
    cptCodes: ["27447", "63047", "99214"],
    carcCodes: ["CO-50", "CO-197"],
    winningArgument:
      "A payer that both evaluates claims and pays benefits operates under a structural conflict of interest. That conflict must be weighed as a factor in determining whether a medical-necessity or prior-authorization denial was an abuse of discretion, particularly where the reviewer ignored treating-physician evidence.",
    statutoryLanguage:
      "A plan administrator that both evaluates claims for benefits and pays benefits claims has a conflict of interest that a reviewing court should consider as a factor in determining whether the plan administrator has abused its discretion in denying benefits. Metropolitan Life Ins. Co. v. Glenn, 554 U.S. 105, 112 (2008).",
    outcome: "Conflict-of-interest factor required in ERISA abuse-of-discretion review.",
  },
  {
    corpusKey: "scotus-black-decker-nord-2003",
    sourceKind: "court_overturn",
    title: "Black & Decker Disability Plan v. Nord",
    citation: "538 U.S. 822 (2003)",
    jurisdiction: "US-SCOTUS",
    sourceUrl: "https://www.law.cornell.edu/supremecourt/text/538/822",
    icd10Codes: ["M17.11", "M51.16", "M25.561"],
    cptCodes: ["27447", "63047", "73721"],
    carcCodes: ["CO-50", "CO-16"],
    winningArgument:
      "Although ERISA does not impose a special treating-physician rule, plan administrators may not arbitrarily refuse to credit a claimant's reliable evidence, including the opinions of a treating physician. A paper-review denial that never engages the treating orthopedist's imaging and conservative-care chronology is arbitrary.",
    statutoryLanguage:
      "Plan administrators may not arbitrarily refuse to credit a claimant's reliable evidence, including the opinions of a treating physician. Black & Decker Disability Plan v. Nord, 538 U.S. 822, 834 (2003).",
    outcome: "Treating-physician evidence cannot be arbitrarily discarded in ERISA review.",
  },
  {
    corpusKey: "9thcir-wit-ubh-2023",
    sourceKind: "court_overturn",
    title: "Wit v. United Behavioral Health",
    citation: "58 F.4th 1080 (9th Cir. 2023)",
    jurisdiction: "US-CA9",
    sourceUrl: "https://cdn.ca9.uscourts.gov/datastore/opinions/2023/01/26/20-17363.pdf",
    icd10Codes: ["F32.1", "F41.1", "M51.16"],
    cptCodes: ["99214", "63047"],
    carcCodes: ["CO-50", "CO-96"],
    winningArgument:
      "When plan terms require coverage consistent with generally accepted standards of care, a fiduciary may not substitute more restrictive internal guidelines to deny medically necessary treatment. Internal medical-necessity screens that silently narrow published CPB or specialty-society criteria are a fiduciary breach.",
    statutoryLanguage:
      "To the extent a plan incorporates generally accepted standards of care, a fiduciary's administration of claims through internal guidelines that are more restrictive than those standards can constitute a breach of ERISA fiduciary duty. Wit v. United Behavioral Health, 58 F.4th 1080 (9th Cir. 2023).",
    outcome: "Internal guidelines may not silently restrict plan-promised standards of care.",
  },
  {
    corpusKey: "cfr-2560-503-1-g-notice",
    sourceKind: "statutory_authority",
    title: "ERISA Claims Procedure — Specific Reason for Denial",
    citation: "29 CFR § 2560.503-1(g)",
    jurisdiction: "US-DOL",
    sourceUrl: "https://www.ecfr.gov/current/title-29/section-2560.503-1",
    icd10Codes: ["M17.11", "M51.16", "S83.241A"],
    cptCodes: ["27447", "63047", "73721", "29881"],
    carcCodes: ["CO-50", "CO-16", "CO-197", "CO-96"],
    winningArgument:
      "A CARC code standing alone is not a specific reason for denial. The administrator must identify the specific plan provision, clinical criterion, and additional material needed. Generic CO-50 or CO-16 notices that omit the governing CPB clause are procedurally defective and independently require remand and reprocessing.",
    statutoryLanguage:
      "The notification of any adverse benefit determination shall set forth, in a manner calculated to be understood by the claimant: the specific reason or reasons for the adverse determination; reference to the specific plan provisions on which the determination is based; a description of any additional material or information necessary for the claimant to perfect the claim and an explanation of why such material or information is necessary. 29 CFR § 2560.503-1(g)(1).",
    outcome: "Boilerplate denial codes without specific plan criteria violate federal claims procedure.",
  },
  {
    corpusKey: "cfr-2560-503-1-h-full-fair-review",
    sourceKind: "statutory_authority",
    title: "ERISA Claims Procedure — Full and Fair Review",
    citation: "29 CFR § 2560.503-1(h)(2)-(3)",
    jurisdiction: "US-DOL",
    sourceUrl: "https://www.ecfr.gov/current/title-29/section-2560.503-1",
    icd10Codes: ["M17.11", "M17.12", "M51.16", "M48.06"],
    cptCodes: ["27447", "63047", "73721"],
    carcCodes: ["CO-50", "CO-197", "CO-16"],
    winningArgument:
      "On appeal the claimant is entitled to copies of all documents, records, and internal criteria used in the adverse determination, and to a review that does not afford deference to the initial denial. A same-specialty health-care professional who was not consulted in the original denial must be consulted when the dispute is medical-necessity.",
    statutoryLanguage:
      "The claims procedures of a plan will not be deemed to provide a claimant with a reasonable opportunity for a full and fair review unless they provide that a claimant shall be provided, upon request and free of charge, reasonable access to and copies of all documents, records, and other information relevant to the claimant's claim for benefits; and, for medical-judgment claims, that the review is conducted by a health care professional who is neither an individual who was consulted in connection with the adverse determination nor the subordinate of such individual. 29 CFR § 2560.503-1(h)(2)(iii), (h)(3)(ii)-(iii).",
    outcome: "Full record disclosure and independent same-specialty review are mandatory on appeal.",
  },
  {
    corpusKey: "usc-erisa-1133",
    sourceKind: "statutory_authority",
    title: "ERISA Section 503 — Adequate Notice and Fair Review",
    citation: "29 U.S.C. § 1133",
    jurisdiction: "US-FED",
    sourceUrl: "https://www.law.cornell.edu/uscode/text/29/1133",
    icd10Codes: ["M17.11", "M51.16", "M25.561"],
    cptCodes: ["27447", "63047", "73721", "99214"],
    carcCodes: ["CO-50", "CO-197", "CO-16", "CO-96"],
    winningArgument:
      "Every employee benefit plan must provide adequate written notice setting forth the specific reasons for denial and a reasonable opportunity for a full and fair review. A utilization-management denial that conceals the clinical rule applied is a statutory violation, not a mere documentation dispute.",
    statutoryLanguage:
      "In accordance with regulations of the Secretary, every employee benefit plan shall provide adequate notice in writing to any participant or beneficiary whose claim for benefits under the plan has been denied, setting forth the specific reasons for such denial, written in a manner calculated to be understood by the participant, and afford a reasonable opportunity to any participant whose claim for benefits has been denied for a full and fair review by the appropriate named fiduciary of the decision denying the claim. 29 U.S.C. § 1133.",
    outcome: "Federal statute independently requires specific-reason notice and full-and-fair review.",
  },
  {
    corpusKey: "cfr-147-136-external-review",
    sourceKind: "statutory_authority",
    title: "ACA Independent External Review",
    citation: "45 CFR § 147.136 / PHS Act § 2719",
    jurisdiction: "US-HHS",
    sourceUrl: "https://www.ecfr.gov/current/title-45/section-147.136",
    icd10Codes: ["M17.11", "M51.16", "C50.911"],
    cptCodes: ["27447", "63047", "73721"],
    carcCodes: ["CO-50", "CO-197", "CO-96"],
    winningArgument:
      "After internal appeal, the claimant is entitled to binding independent external review of medical-necessity and prior-authorization denials. Notice of that right, including the four-month filing window, must accompany any final internal adverse benefit determination.",
    statutoryLanguage:
      "A non-grandfathered health plan must provide an external review process that meets the minimum consumer protections in PHS Act section 2719 and 45 CFR § 147.136, including independent review of medical-necessity, experimental/investigational, and appropriateness denials, with a binding determination on the plan.",
    outcome: "Independent external review is a statutory right after exhaustion of internal appeal.",
  },
  {
    corpusKey: "ca-hsc-1374-30-imr",
    sourceKind: "commissioner_ruling",
    title: "California Independent Medical Review",
    citation: "Cal. Health & Safety Code § 1374.30",
    jurisdiction: "CA-DMHC",
    sourceUrl: "https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=HSC&sectionNum=1374.30",
    icd10Codes: ["M17.11", "M17.12", "M51.16", "M48.06"],
    cptCodes: ["27447", "63047", "73721", "29881"],
    carcCodes: ["CO-50", "CO-197"],
    winningArgument:
      "California Independent Medical Review is de novo. The reviewer applies professionally recognized standards of care, not the plan's more restrictive internal screens. Documented Kellgren-Lawrence Grade III/IV osteoarthritis after failed conservative therapy, or progressive neurologic deficit from lumbar stenosis, is regularly found medically necessary on IMR.",
    statutoryLanguage:
      "A disputed health care service is eligible for independent medical review if the employee or enrollee's provider has recommended a health care service as medically necessary and the plan has denied, modified, or delayed that service based in whole or in part on a finding that the service is not medically necessary. The independent medical review organization's determination is binding on the plan. Cal. Health & Safety Code § 1374.30.",
    outcome: "California IMR bindings overturn medical-necessity denials under professionally recognized standards of care.",
  },
  {
    corpusKey: "ny-ins-4910-external-appeal",
    sourceKind: "commissioner_ruling",
    title: "New York External Appeal of Adverse Determinations",
    citation: "N.Y. Ins. Law § 4910",
    jurisdiction: "NY-DFS",
    sourceUrl: "https://www.nysenate.gov/legislation/laws/ISC/4910",
    icd10Codes: ["M17.11", "M51.16", "M25.561"],
    cptCodes: ["27447", "63047", "73721"],
    carcCodes: ["CO-50", "CO-197", "CO-96"],
    winningArgument:
      "New York insureds may appeal an adverse medical-necessity or experimental determination to an independent external appeal agent certified by the Superintendent. The agent's determination is binding on the insurer. Prior-authorization denials that ignore specialist certification of urgency are reversed when the clinical record shows progressive functional loss.",
    statutoryLanguage:
      "An insured, the insured's designee, or the insured's health care provider has the right to request an external appeal of an adverse determination by a health care plan when the determination is based on medical necessity, experimental or investigational services, or a rare-disease treatment, and the external appeal agent's determination is binding on the plan. N.Y. Ins. Law § 4910.",
    outcome: "New York DFS external appeal is binding on medical-necessity and experimental denials.",
  },
  {
    corpusKey: "tx-ins-4201-152-ur",
    sourceKind: "commissioner_ruling",
    title: "Texas Utilization Review Specialty Requirement",
    citation: "Tex. Ins. Code § 4201.152",
    jurisdiction: "TX-TDI",
    sourceUrl: "https://statutes.capitol.texas.gov/Docs/IN/htm/IN.4201.htm",
    icd10Codes: ["M17.11", "M51.16", "M48.06"],
    cptCodes: ["27447", "63047"],
    carcCodes: ["CO-50", "CO-197"],
    winningArgument:
      "A utilization-review adverse determination of an orthopedic or neurosurgical procedure must be made by a physician licensed to practice medicine who is of the same or similar specialty as the requesting physician. A generalist paper review of CPT 27447 or 63047 is statutorily defective in Texas.",
    statutoryLanguage:
      "A utilization review agent shall ensure that an adverse determination is made by a physician licensed to practice medicine under Subtitle B, Title 3, Occupations Code, and that the physician is of the same or a similar specialty as a physician who typically manages the medical condition, procedure, or treatment under review. Tex. Ins. Code § 4201.152.",
    outcome: "Same-specialty physician review is mandatory for Texas utilization-review denials.",
  },
  {
    corpusKey: "cms-tka-conservative-care",
    sourceKind: "commissioner_ruling",
    title: "CMS Total Knee Arthroplasty Coverage Criteria",
    citation: "CMS LCD L36573 / Medicare Benefit Policy Manual Ch. 1",
    jurisdiction: "US-CMS",
    sourceUrl: "https://www.cms.gov/medicare-coverage-database",
    icd10Codes: ["M17.11", "M17.12", "M17.0", "Z96.651"],
    cptCodes: ["27447"],
    carcCodes: ["CO-50", "CO-197"],
    winningArgument:
      "Medicare administrative contractor LCDs covering total knee arthroplasty treat the procedure as medically necessary when radiographic evidence documents advanced osteoarthritis (joint-space narrowing, subchondral sclerosis, osteophytes) and the record shows failed conservative management (analgesics/NSAIDs, physical therapy, activity modification, and intra-articular injections where appropriate). A CO-50 denial that never addresses those published criteria is contrary to the coverage rule the payer itself invokes.",
    statutoryLanguage:
      "Total knee arthroplasty is considered medically necessary when the medical record documents both: (1) radiographic or other objective evidence of advanced joint disease, and (2) failure of a reasonable course of conservative therapy, unless conservative therapy is contraindicated. Coverage is not denied solely because the procedure is elective once those criteria are met.",
    outcome: "Published CMS TKA criteria are satisfied by Grade III/IV OA plus failed conservative care.",
  },
  {
    corpusKey: "aaos-knee-oa-cpg",
    sourceKind: "statutory_authority",
    title: "AAOS Surgical Management of Osteoarthritis of the Knee",
    citation: "AAOS CPG (Surgical Management of Osteoarthritis of the Knee)",
    jurisdiction: "US-AAOS",
    sourceUrl: "https://www.aaos.org/quality/quality-programs/quality-toolkits/osteoarthritis-of-the-knee/",
    icd10Codes: ["M17.11", "M17.12", "M17.0"],
    cptCodes: ["27447", "29881"],
    carcCodes: ["CO-50"],
    winningArgument:
      "The American Academy of Orthopaedic Surgeons clinical practice guideline supports surgical management, including total knee arthroplasty, for patients with symptomatic osteoarthritis who have exhausted appropriate nonoperative care. Functional limitation, pain refractory to conservative modalities, and radiographic advanced disease constitute the accepted indication set — not payer-invented duration thresholds that exceed the guideline.",
    statutoryLanguage:
      "AAOS recommends surgical treatment for patients with symptomatic osteoarthritis of the knee who have not achieved adequate pain relief and functional improvement after appropriate nonoperative therapy. Radiographic confirmation of osteoarthritis and documented impact on activities of daily living support medical necessity for arthroplasty.",
    outcome: "National orthopedic standard of care supports TKA after failed nonoperative management.",
  },
  {
    corpusKey: "nass-lumbar-decompression",
    sourceKind: "statutory_authority",
    title: "NASS Coverage Policy — Lumbar Laminectomy",
    citation: "North American Spine Society Coverage Policy (Lumbar Laminectomy)",
    jurisdiction: "US-NASS",
    sourceUrl: "https://www.spine.org/PolicyPractice/CoverageRecommendations",
    icd10Codes: ["M51.16", "M48.06", "M51.17", "G83.4"],
    cptCodes: ["63047"],
    carcCodes: ["CO-50", "CO-197"],
    winningArgument:
      "NASS coverage recommendations treat lumbar laminectomy/facetectomy as indicated for neurogenic claudication or radiculopathy from stenosis or disc-osteophyte compression when correlative imaging is present and conservative care has failed, or when progressive neurologic deficit or cauda equina warning signs make delay unsafe. A CO-197 prior-authorization denial in the face of progressive motor loss is contrary to the specialty standard and supports retroactive authorization.",
    statutoryLanguage:
      "Lumbar decompression is medically indicated when clinically correlated imaging demonstrates stenosis or compressive pathology and the patient has either failed a reasonable course of nonoperative care or presents with progressive neurologic deficit, including cauda equina features, for which delay would risk irreversible harm.",
    outcome: "Specialty-society criteria support lumbar decompression and retroactive auth in progressive deficit.",
  },
  {
    corpusKey: "cms-ncd-220-2-mri",
    sourceKind: "commissioner_ruling",
    title: "CMS NCD 220.2 — Magnetic Resonance Imaging",
    citation: "CMS NCD 220.2 (MRI)",
    jurisdiction: "US-CMS",
    sourceUrl: "https://www.cms.gov/medicare-coverage-database/view/ncd.aspx?NCDId=164",
    icd10Codes: ["M25.561", "S83.241A", "M23.221", "M17.11"],
    cptCodes: ["73721"],
    carcCodes: ["CO-50", "CO-16", "CO-197"],
    winningArgument:
      "CMS NCD 220.2 covers MRI when the study is reasonable and necessary to diagnose or manage a covered illness. Acute mechanical locking, suspected meniscal tear, or occult fracture after an inadequate radiograph is a covered indication. A CO-16 denial for 'missing information' is cured by submitting the examining physician's mechanism-of-injury note and the negative or inconclusive radiograph; it is not a medical-necessity denial.",
    statutoryLanguage:
      "Magnetic resonance imaging is covered when it is reasonable and necessary for the diagnosis or treatment of illness or injury or to improve the functioning of a malformed body member, subject to the indications and limitations in NCD 220.2. MRI is not excluded merely because a prior radiograph was omitted if the clinical presentation independently supports the study.",
    outcome: "MRI of the lower extremity joint is covered when clinically indicated under NCD 220.2.",
  },
  {
    corpusKey: "fla-stat-641-31-imr",
    sourceKind: "commissioner_ruling",
    title: "Florida HMO Subscriber Assistance / Adverse Determination Review",
    citation: "Fla. Stat. § 641.31 / § 408.7056",
    jurisdiction: "FL-AHCA",
    sourceUrl: "https://www.flsenate.gov/Laws/Statutes/2024/641.31",
    icd10Codes: ["M17.11", "M51.16", "M25.561"],
    cptCodes: ["27447", "63047", "73721"],
    carcCodes: ["CO-50", "CO-197", "CO-16"],
    winningArgument:
      "Florida HMO subscribers may contest an adverse medical-necessity determination through the Agency for Health Care Administration subscriber-assistance and independent-review pathways. Reviewers apply prevailing professional standards. Documented failure of conservative orthopedic care plus objective imaging is routinely treated as meeting medical necessity for arthroplasty and decompression.",
    statutoryLanguage:
      "A health maintenance organization must have a grievance process for adverse determinations, and subscribers may seek further review of a denial of services as not medically necessary under the subscriber assistance program. Independent review applies professionally recognized standards of care. Fla. Stat. §§ 641.31, 408.7056.",
    outcome: "Florida AHCA independent review applies professional standards, not silent internal screens.",
  },
];
