# ClaimHero

## Evidence-Grounded Appeal Preparation Workspace for Denial Teams

> **Your insurer denied a claim you paid for. ClaimHero finds the policy they're hiding behind, cites the clause, and drafts the appeal before the clock runs out — three steps, one human approval.**

<p align="center">
  <a href="https://kindhearted-elephant-992.convex.site"><strong>Open Live Application</strong></a>
  &nbsp; · &nbsp;
  <a href="https://www.youtube.com/watch?v=wLW_ZL093a8"><strong>Watch 3-Minute Demo Video</strong></a>
  &nbsp; · &nbsp;
  <a href="./hackathon.md"><strong>Read Evidence-Based Build Log</strong></a>
</p>

Built for the **Convex All Gas Hackathon** (August 25 – September 22, 2026) using **Convex**, **Firecrawl**, **AgentMail**, and **OpenAI**.

---

ClaimHero is an evidence-grounded appeal preparation workspace that starts with
patients and families, then scales to teams. A denial is not just a letter to
answer once; it creates a case that must be understood, researched, explained,
reviewed, dispatched, and followed until the payer commits to an outcome.

The Case Radar gives a team one live portfolio view of those cases. The Case
Workspace gives each denial a repeatable, source-linked path from intake to
appeal. This makes ClaimHero useful for the next denial that arrives, and the
one after that, without requiring staff to rebuild the evidence trail from
scratch.

1. **Upload the denial.** Real PDF and image intake is supported. Synthetic demo fixtures are also available so a judge can test the complete workflow without uploading personal health information.
2. **ClaimHero pulls the insurer's active policy bulletins via Firecrawl** and lifts the exact clause the denial turned on. Each extracted clause explicitly surfaces its extraction engine provenance (`Firecrawl • HH:mm` native structured extraction vs. `OpenAI • HH:mm` structured fallback) alongside visual proof screenshot exhibits.
3. **You review a cited brief**, one click away from the clause it cites, then approve dispatch from an AgentMail inbox across **two dispatch paths**: transmit directly to the **official production payer reviewer email**, or dispatch to a **typed-in email** (such as your personal inbox) to inspect the packet in your mail client and test replying. Claims under the ERISA §502(c) clock show the exposure as they age; you never send without approving.

### Evidence Coverage & Precedent Match Score (Dossier Audit)

ClaimHero computes an explainable 0–100 **Evidence Coverage & Precedent Match Score** (`appealReadinessScore` / `evidenceCoverageScore`) to audit evidentiary completeness and statutory compliance before an appeal is submitted.

The audit evaluates four objective statutory pillars with strict evidentiary decoupling:

- **CPB and Indication Alignment** (Max: 35 points): Verifies patient record facts against published insurer clinical policy bulletins.
- **Objective Clinical Documentation & Step-Therapy** (Max: 25 points): Audits diagnostic imaging, physical exam findings, and prior conservative therapy trials.
- **ERISA § 2560.503-1 Procedural Standing** (Max: 20 points): Substantiates plan administrator disclosure omissions, summary plan description (SPD) defects, and adverse determination notice non-compliance.
- **Precedent Match & Legal Parity** (Max: 20 points): Evaluates relevance, factual overlap, and appellate outcomes of retrieved state IMR and judicial external review precedents.

To prevent artificial score inflation, Pillar 4 evaluates retrieved precedents across a multi-factor calibration matrix rather than raw evidence counts:
- **Vector Pipeline Handoff**: Step 2's retrieved vector precedents (`vectorPrecedents`) are passed directly into the Step 3 scoring engine (`computeOverturnScoreInternal` -> `calculateDeterministicRubric`).
- **Decoupled Scoring Integrity**: Pillar 4 (Precedent Strength) and Pillar 3 (ERISA Standing) are decoupled from generic CPB presence and evidence counts (`hasCpb || evidencesCount >= 2`). In the absence of retrieved legal precedents, Pillar 4 remains at a baseline floor (4/20) rather than inflating to 19/20, capping claims without precedent support at moderate bands (~76/100) instead of reaching an artificial ~96/100.
- **Multi-Factor Precedent Parity**: Precedent scores require favorable appellate outcomes (overturn/remand/settlement), high vector/hybrid cosine similarity (threshold ≥ 0.82), exact CARC denial code overlap (+4 pts), and CPT procedure code overlap (+3 pts).
- **Adverse Parity Detection**: Automatically penalizes cases where external reviews upheld denials on comparable clinical facts (-6 pt penalty), surfacing cautionary parity warnings to the appellate team.

#### Evidentiary Integrity & Provisional Review Gating (`review_provisional`)

To prevent failure paths from quietly degrading into unearned "ready_for_review" status:
- **Statutory Fallback Isolation**: When live policy crawling is blocked or times out, the pipeline inserts a statutory baseline notice (`29 CFR § 2560.503-1`). The scoring engine isolates this fallback (`isStatutoryBaselineEvidence`), preventing statutory boilerplate from falsely inflating CPB or clinical documentation pillars.
- **Score Withholding & Capping**: Under degraded evidentiary paths (missing CPB or unavailable precedent index), the score status is flagged as `provisional_capped` with score strictly capped at 40 max and risk posture assigned to `complex_litigation`, accompanied by specific degradation warnings.
- **Durable Review Checkpoint**: Durable workflows checkpoint claims with degraded evidence into `review_provisional` rather than advancing directly to `ready_for_review`.
- **Mandatory Review Gate**: Outbound dispatch actions (`approveAppeal`, `dispatchAppealPacket`) enforce a strict gate that refuses unacknowledged provisional claims. An advocate must explicitly review the evidentiary posture and provide an evidentiary acknowledgment (`acknowledgeEvidentiaryDegradation`) before the claim can be promoted to `ready_for_review` and dispatched.

> **Regulatory Compliance Disclaimer:** The Evidence Coverage & Precedent Match Score is an evidentiary completeness and procedural compliance audit evaluating documentation against published clinical guidelines and ERISA 29 CFR § 2560.503-1 standards. It functions as a pre-filing quality checklist and does not constitute an actuarial legal prediction or guarantee of payer approval.

### How a Case Spends Its Life

```text
denial letter
  ->  in-browser digital PDF extraction (pdf.js) or local OCR (tesseract.js) with zero PHI egress (optional AWS Textract server fallback)
  ->  patient identifiers vaulted in Convex DB; text de-identified via redactBeforeLLM (client & server defense-in-depth)
  ->  insurer's CPB and the exact clause it cites (Firecrawl)
  ->  Evidence Coverage & Precedent Match Score, grounded in policy, clinical, statutory, and precedent evidence
  ->  cited brief, with every claim bound to its clause
  ->  human approval gate
  ->  packet sent via AgentMail; insurer reply routed back in
```

### Real cases and demo cases use the same pipeline

ClaimHero supports real denial PDFs, images, and denial text. The production path performs the same storage upload, structured extraction, policy research, precedent retrieval, scoring, drafting, collaboration, audit, and AgentMail operations used by the demo fixtures.

Demo cases are only a privacy-safe shortcut for judges who do not want to upload a health record.

### Try It in 60 Seconds

To evaluate the complete end-to-end pipeline without uploading personal health records:

1. Open the [Production Deployment](https://kindhearted-elephant-992.convex.site) and click **"Explore as Anonymous Advocate"** on `/login` (or sign in via Google) to enter instantly with zero credentials required.
2. The workspace immediately opens pre-seeded with 3 live-pipeline-fidelity evaluation cases captured directly from authentic pipeline runs:
   - **Eleanor Vance (Cigna Global — Knee Meniscectomy)**: $6,400 | CPT 29881 | CO-50 (Medical Necessity) — Status `ready_for_review` (96/100 score). Pre-populated with 10 clinical evidence items (Carelon joint surgery guidelines, ERISA 29 CFR § 2560.503-1 statutory requirements, winning hybrid vector precedents), full 4-page synthesized brief, and 4-phase P2P script. Left un-dispatched with zero emails so you can test the **Approve & Dispatch Appeal** flow yourself.
   - **Marcus Sterling (GeoBlue Worldwide — Lumbar Decompression)**: $18,200 | CPT 63047 | CO-197 (Pre-Authorization) — Status `drafting` (94/100 score). Pre-populated with 6 clinical evidence items, emergency motor paralysis brief, and neurosurgical P2P defense script under Carelon SURG.00011.
   - **Michael Patel (Aetna International — Diagnostic Knee MRI)**: $2,850 | CPT 73721 | CO-16 (Prior Records Required) — Status `won` (91/100 score). Demonstrates full financial resolution ($2,850 recovered, $0 member balance) and authentic multi-paragraph healthcare correspondence between appeals specialist Taylor Reed and Aetna International Medical Director Marcus Vance, MD, FAAOS overturning the adverse determination in full with EFT remittance advice.
3. You can also click **Ingest Denial** (or press `Cmd+K` / `Ctrl+K`) to upload your own denial documents or select template presets.
4. The application transitions directly into the **Case Workspace**, driving through the linear 3-step appellate spine:
   - **Step 1: Evidence & CPB** — Review real insurer policy bulletins scraped via Firecrawl with extraction engine provenance badges (`Firecrawl • 12:04` native zero-hop extraction vs. `OpenAI • 12:04` fallback), visual proof screenshot exhibits, and the precedent-grounded 4-pillar Statutory Appeal Readiness Score, shown as a transparent 0–100 audit checklist.
   - **Step 2: Appeal Brief** — Inspect the grounded legal brief strictly citing stored policy clauses; test real-time CRDT multi-user editing with live presence (`Share` button).
   - **Step 3: Payer Dispatch** — Transmit the packet via AgentMail with one click. Select from two dispatch destinations:
     - **Official Insurer Gateway (Production)**: Dispatches directly to the verified public grievance and appeals intake email of the payer.
     - **Typed-In Email (Interactive Verification)**: Delivers the full cited brief and exhibits to a typed-in email address (such as your personal or reviewer inbox) so you can review the dossier and reply from your mail client to trigger the live inbound webhook.
     For medical necessity denials (`CO-50`), review the contextual Physician Peer-to-Peer tele-script.
5. Track the statutory stakes at all times: the case header monitors the active **ERISA §502(c) statutory liability exposure ($110/day)** alongside a dual-mode slide-out **Case Audit & Workflow Observability** drawer proving real-time pipeline execution milestones (step-by-step latency, run history, and milestone stages) and the cryptographic SHA-256 Merkle audit chain.

*The demo cases are a privacy-preserving evaluation harness, not a substitute for the product workflow. They use the same intake, evidence, drafting, collaboration, deadline, audit, and dispatch path as a real case, are visibly marked as synthetic, are isolated from portfolio analytics, and can be purged at any time via the "Clear demo data" button.*

### Why this is an everyday app

Start with the family who got the letter yesterday:

Your knee arthroscopy was denied — $6,400 (CPT 29881, CO-50). You upload a
photo or PDF, ClaimHero explains in plain English what happened and what to do
by when (including the 180-day ERISA appeal clock), pulls the insurer's own
policy clause behind the denial, and drafts a cited appeal. You review and
approve exactly what gets sent — no billing expertise required.

The same workspace scales to team triage second:

- A nurse or case manager can turn a denial into a structured case, see the
  governing policy clause, and hand a cited brief to the next reviewer.
- A billing or appeals team can triage a portfolio, share a brief, monitor
  statutory deadlines, and keep payer correspondence attached to the right
  claim.
- A patient advocate can review the evidence, correct the draft, and approve
  exactly what leaves the organization.
- A team can return to the same workspace when the payer requests records,
  changes its position, or misses a response deadline.

The demo fixtures make that recurring workflow easy and safe to evaluate. They
do not define the target user or imply that ClaimHero is limited to fictional
cases.

### Everyday Language vs. Expert Details Architecture (Dual-Mode Interface)

Healthcare denial letters and appellate procedures are deliberately obscured by insurer acronyms, billing codes, and procedural hurdles. For patients and families, this creates immediate confusion and despair; for advocates, nurses, and billing teams, precise statutory codes are non-negotiable.

ClaimHero resolves this dilemma with a built-in **Everyday Language vs. Expert Details** dual-mode architecture:

- **Everyday Language (Default / Patient-Friendly on First-Run)**:
  - **Workspace Header (1 Sentence + 1 Date + Mode Toggle)**: Distills each claim into three primary anchors:
    1. **1 Sentence (What happened)**: Plain-English summary (e.g., *"Sarah's knee arthroscopy was denied ($6,400) by Cigna — they say it was not medically necessary."*).
    2. **1 Date (What to do by when)**: Clear statutory timeline (e.g., *"Appeal deadline: Jan 14, 2027 (120 days left)"*).
    3. **Mode Toggle**: Instant switch between everyday language and specialist detail.
  - **Simple Evidence Workspace (`SimpleEvidenceView.tsx`)**: An evidence-grounded review view designed for clarity and fast comprehension:
    1. **Hero Verdict Card**: Prominent case strength score (`90/100` • `Strong case`) with an instant plain-language explanation of why the denial can be overturned.
    2. **3 Key Proof Points**: Curated proof cards highlighting the insurer's policy exception clause, treating physician clinical documentation, and federal ERISA rights or similar appeal win rates, with 1-click inspection.
    3. **Progressive Disclosure**: Detailed 4-pillar scoring rubrics, full document lists, and forensic policy clauses remain accessible on demand.
    4. **Direct Workflow Action**: A single clear primary action guiding the user directly into appeal letter review.
  - **Simple Appeal Studio (`SimpleStudioView.tsx`)**: A document-first reading and editing experience designed for confident review:
    1. **Document-First Presentation**: Displays a beautifully formatted executive appeal letter (`AppealBriefRenderer`) ready for reading, without raw Markdown syntax (`#`, `**`) or visual clutter.
    2. **Seamless Read vs. Edit Modes**: Instant switch between reading the rendered brief and inline editing with real-time auto-saving.
    3. **Curated Proof Summary**: Surfaces the 3 core evidentiary pillars woven into the letter (insurer policy exceptions, clinical records, ERISA statutory rights) in a collapsible reference card.
    4. **Focused Document Controls**: Document-level actions (`Rewrite`, `Save/Print`, `Share`) remain cleanly separated in the document header, while workflow progression is anchored in the primary bottom action bar.
  - **Simple Communication Workspace (`SimpleInboxView.tsx`)**: A conversational, reassuring dispatch and message experience:
    1. **Clear Dispatch Choice**: Direct selection between transmitting to the verified carrier intake address (official production path) or sending an interactive test copy to personal email to inspect the packet and test two-way replying.
    2. **Human Review Gate**: Transparent confirmation that nothing is ever transmitted without human authorization, with 1-click access to print or review the brief first.
    3. **Conversational Correspondence Timeline**: Clean message stream distinguishing patient submissions from insurer replies, featuring clear determination badges, clinical explanations, and attachment previews.
    4. **AI Suggested Response Card**: When an insurer requests additional records or extends a settlement offer, ClaimHero prepares a recommended response for 1-click review, editing, and approval.
  - **Dual-Audience Case Radar**: Organizes claims into two dedicated views:
    - **"My Cases"**: A calm, focused list of personal and family claims with plain-language status badges and 1-click review triggers.
    - **"For Teams & Advocates"**: A professional triage dashboard with portfolio-wide financial recovery metrics, CPT/CARC code distributions, and one-click CSV/JSON audit exports.
  - **Intuitive Terminology Across All 28 UI Surfaces**: Complex CARC codes are translated into plain-language causes (e.g., *"Coverage rules require trying other treatments first"*), statutory postures are expressed as clear next steps, and navigation uses intuitive milestones (*"1. Your proof • 2. Your letter • 3. Send & track"*).
  - **Everyday Consumer Vocabulary**: Everyday Language mode uses intuitive terms in place of healthcare billing acronyms (`PLAIN_FIRST_RUN` in `src/lib/plainCopy.ts`). An insurer Clinical Policy Bulletin (CPB) appears as **"Insurer's own rule"**, a CARC denial code as **"Why they said no"**, and the cited legal brief as **"Your letter"**. The landing hero, badges, CTAs, and primary navigation use clear concepts (*"My Cases • Why it was denied • Your letter • Insurer replies • Money recovered"*).
  - **Adaptive Telemetry & Badging**: In Everyday Language mode, complex search signals (RRF fusion scores, BM25 lexical ranks) are presented as plain-English relevance indicators, and research feeds show clear clinical status. In Expert Details mode, full algorithmic metrics and model provenance are displayed on demand.
- **Expert Details (On-Demand Clinical & Legal Precision)**:
  - An instant toggle in the persistent header, sidebar, or case settings reveals the complete technical apparatus: full CPT/HCPCS procedure codes, ICD-10 diagnostic codes, CARC/RARC remark codes, ERISA §502(c) $110/day statutory liability exposure timers, ERISA 29 CFR § 2560.503-1 statutory disclosure citations, exact Clinical Policy Bulletin (CPB) clause numbers, and cryptographic SHA-256 Merkle block fingerprints.
  - **Horizontal 4-Pillar Diagnostic Ribbon**: Displays the complete 4-pillar readiness breakdown (Policy Alignment, Medical Records, ERISA Statutory, Precedent Strength) in an efficient 1-row diagnostic strip with progress meters, point allocations, and hover rationales directly above the dual-pane inspector.
  - **Forensic Payer Gateway & Inbound Adjudication Console**: Displays the complete carrier coordinate matrix (verified appeals fax lines, statutory P.O. Box addresses, EDI Payer IDs, delivery channel verification), RFC 5322 headers, Amazon SES delivery receipts, and in-browser WebAssembly OCR triggers for raw incoming attachments.
  - Appeals teams, clinical staff, and attorneys retain the exact forensic citations needed for administrative law judges and external reviews.
- **Global Zero-Friction Synchronization**:
  - Managed via `useDetailMode` and stored in `localStorage` with resilient in-memory fallback for sandboxed or private browsing environments.
  - Broadcasts immediate `claimhero:detail-mode` custom events across decoupled React components and listens to `storage` events for seamless multi-tab synchronization with zero layout shift.

---

## Product Architecture: Two Surfaces, One Spine

ClaimHero organizes its capabilities into two clean surfaces designed for extreme clarity and operational velocity:

```text
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│ 1. CASE RADAR (Portfolio Triage List)                                                       │
│ Reactive triage dashboard with ERISA countdown alarms, disputed balances, & 1-click Ingest  │
└──────────────────────────────────────────────┬──────────────────────────────────────────────┘
                                               │
                                               v (Select Case)
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│ 2. CASE WORKSPACE (3-Step Guided Appellate Stepper)                                         │
│ Header: [Case Context] • [$110/day ERISA Clock] • [Merkle Audit Chain] • [Sensory Feedback] │
├───────────────────────────────┬───────────────────────────────┬─────────────────────────────┤
│ Step 1: Evidence & CPB        │ Step 2: Appeal Brief          │ Step 3: Payer Dispatch      │
│ • Firecrawl Live Policy Crawl │ • Grounded Synthesis (OpenAI) │ • AgentMail Two-Way Gateway │
│ • Policy Drift Sentinel (CPB) │ • Verifiable Clause Citations │ • 3 Modes: Payer/Self/AI    │
│ • Directory Discovery (/map)  │ • Yjs CRDT Real-Time Collab   │ • Verified Payer Routing    │
│ • Visual Screenshot Exhibits  │ • Live Teammate Presence/RBAC │ • ERISA Proof of Delivery   │
│ • Multi-Source Scan (PubMed)  │ • Formal PDF Dossier Export   │ • Inbound Webhook Triage    │
│ • 4-Pillar Readiness Score    │ • Sentinel Copilot (10 Tools) │ • Mandatory Human Gate      │
└───────────────────────────────┴───────────────────────────────┴─────────────────────────────┘
```

---

## The Four Sponsor Pillars — Full Architectural Depth

### 1. Convex — Central System of Record & Reactive Backend Engine
Convex serves as the core persistence, real-time subscription, compute, and orchestration layer:
- **Reactive State & Live Subscriptions**: Claims, clinical evidence, policy drift reports, appeal versions, audit timelines, and communication threads update reactively across the entire UI without manual polling (`convex/schema.ts`, `convex/policyDrift.ts`).
- **Durable Workflow Engine**: Multi-step pipeline execution (`@convex-dev/workflow`) powers reliable, idempotent background orchestration across crawls, scoring, and drafting (`convex/actions/sentinelPipeline.ts`).
- **Hybrid Precedent Search Engine with Reciprocal Rank Fusion (RRF)**: Combines 1536-dimensional OpenAI vector embeddings (`text-embedding-3-small`) on the `precedents` table with Convex native BM25 full-text search, CPT/CARC code boosting, and Reciprocal Rank Fusion (RRF) across a curated corpus of winning briefs, state insurance commissioner rulings, and federal court precedents (`convex/actions/precedentArchive.ts`, `convex/precedents.ts`, `convex/lib/embeddings.ts`).
- **Native BM25 Full-Text Search Engine**: Convex native `.searchIndex("search_claims")` indexes unified `searchContent` (clinical denial terms, CARC codes, CPT/ICD-10 codes, patient names, and claim numbers) across the entire portfolio. Directly wired into the global command palette (`CommandDialog.tsx`, `Cmd+K` / `Ctrl+K`) with debounced reactive querying (`api.claims.search`) for real-time lexical discovery.
- **Transactional Consistency, Cryptographic Merkle Chain & 1-Click Sealing**: Atomic mutations govern claim creation, evidence persistence, status transitions, and cascading purges to eliminate orphan records. Implements a tamper-evident rolling SHA-256 Merkle audit chain (`currentHash = sha256(previousHash + eventType + claimId + timestamp + details)`) under ERISA 29 CFR § 2560.503-1, with a 1-click database chain sealer (`sealClaimAuditChain`), interactive "Cryptographic Proof of Case Integrity" badge, and sub-10ms verification benchmark (`convex/auditLogs.ts`, `src/lib/auditCrypto.ts`).
- **Crons & Scheduled Actions**: Automated crons sweep statutory 180-day ERISA deadlines, sync incoming AgentMail webhooks, and purge orphaned storage uploads without executing unapproved autonomous dispatches (`convex/crons.ts`).
- **File Storage & Cryptographic Storage Metadata**: Native Convex storage securely hosts uploaded denial documents and compiled appeal PDF dossiers. In addition, the system queries the internal `_storage.sha256` metadata table to extract NIST-compliant SHA-256 file fingerprints for contemporaneous delivery evidence reports (`convex/serviceCertificate.ts`).
- **Live Presence & CRDT Collaboration**: The `@convex-dev/presence` component tracks live teammates per appeal room while a Yjs operation log (`appealYjsUpdates`) merges concurrent brief edits keystroke-by-keystroke without merge conflicts (`convex/claimCollaborators.ts`, `convex/appealYjs.ts`).
- **Case Collaborators & Role-Based Access Control (RBAC)**: The `claimCollaborators` table manages secure case sharing via invite codes, distinct `editor` and `viewer` permissions, and automated access revocation (`convex/claimCollaborators.ts`).
- **Token-Bucket Rate Limiting**: The `@convex-dev/rate-limiter` component protects external OpenAI LLM/embedding inference and Firecrawl web crawling endpoints against quota exhaustion, burst traffic, and runaway execution (`convex/lib/rateLimiter.ts`).
- **Authentication & Multi-Tenant Data Isolation**: The `@convex-dev/auth` component manages session state, password credentials, and Google OAuth. Server-side authorization helpers (`getAuthUserId`, `requireClaimOwner`) enforce document-level row security across all 23 domain tables (`convex/auth.ts`, `convex/lib/auth.ts`).
- **Anonymous Authentication & Live-Fidelity Evaluation Seeder**: Implements `@convex-dev/auth/providers/anonymous` for frictionless 1-click evaluator access without third-party account requirements. Automatically provisions an anonymous advocate session and transactionally seeds 3 authentic cases captured from live pipeline runs, spanning active drafting, human-gated review with dispatch CTA, and full professional email resolution with zero pre-seeded emails on un-dispatched cases (`convex/auth.ts`, `convex/users.ts`, `convex/demoSeeder.ts`).
- **Portfolio Analytics via Aggregate**: The `@convex-dev/aggregate` component computes real-time portfolio recovery statistics, resolution rates, Statutory Appeal Readiness Score distributions, and aggregate financial yields.
- **Workflow Observability & Sub-Second Pipeline Activity Telemetry**: Granular progress telemetry table `pipelineActivities` tracks real-time stage transitions (OCR extraction, Firecrawl crawling, precedent scoring, brief drafting), streaming live execution milestones to the frontend without polling (`convex/pipelineActivities.ts`). Exposed directly to judges and advocates in the Audit Drawer via an interactive `PipelineTimeline` console featuring stage duration breakdowns, live ticking execution timers, execution run selectors, and filterable telemetry logs (`src/components/communications/PipelineTimeline.tsx`).
- **HTTP Routing & Svix Webhooks**: Authenticated endpoints handle inbound AgentMail and Firecrawl webhooks with Svix signature verification (`convex/http.ts`).

### 2. Firecrawl — Real-Time Policy Discovery & Visual Proof Archiving
Firecrawl actively crawls, scrapes, and verifies insurer Clinical Policy Bulletins (CPBs):
- **Policy Drift Sentinel (Retroactive CPB Alteration Detector)**: Leverages Firecrawl to crawl live payer policies with cache-bypassing scans, comparing the live document against the cryptographically hashed snapshot (`policySnapshots`) captured at the date of denial. Automatically detects post-hoc additions of step-therapy hurdles, tightened documentation thresholds, or experimental exclusions, and synthesizes an evidence-grounded Clinical Policy Discrepancy & Governing Criteria Notice across 6 distinct plan frameworks (`erisa_self_funded`, `erisa_insured`, `medicare_advantage` under CMS 42 CFR § 422.101/CMS-4201-F, `medicaid_mco`, `aca_individual`, `general_administrative`) with formal 30-day administrative record demand clocks (29 U.S.C. § 1024(b)(4) & § 1132(c)(1)) and tiered appellate postures (`convex/actions/policyDriftSentinel.ts`, `convex/lib/policyDriftNotice.ts`, `convex/policyDrift.ts`).
- **Insurer Policy Directory Discovery (`firecrawl.map` / `/v1/map`)**: Leverages Firecrawl's top-tier domain mapping engine to discover and map an insurer's entire Clinical Policy Bulletin directory structure in seconds (e.g., Aetna CPBs, Cigna Coverage Policies, Carelon Musculoskeletal Guidelines, UHC Medical Policies). Filters by clinical specialty (Orthopedics, Oncology, Cardiology, Spine, Neurology), extracts bulletin reference codes (`CPB 0736`, `0512`), and persists discovered bulletins directly to Convex (`discoveredPolicies` table) for immediate one-click evidence citation.
- **Autonomous Insurer Intake & Grievance Gateway Discovery (`firecrawl.search`)**: When a denial letter is ingested from an unlisted, regional, or international payer, Firecrawl searches payer web endpoints and official domains (`/v1/search`) to autonomously identify official online appeal intake portals, appellate faxes, statutory P.O. boxes, and public appeals emails, writing verified coordinates directly into the claim record (`convex/actions/payerContactResolver.ts`).
- **Multi-Source Concurrent Clinical Research Workstation**: The 6-channel Clinical Research Console (`ClinicalResearchConsole.tsx`) executes a 3-pipeline concurrent scan across Insurer CPBs, PubMed clinical trials (via literature search), and FDA DailyMed prescribing information/device approvals, collecting peer-reviewed clinical rationale in parallel (`convex/actions/policyCrawler.ts`).
- **Live Search & Scrape Engine**: Queries live payer portals across Aetna, Cigna, UnitedHealthcare, Carelon, and Blue Cross Blue Shield (`convex/actions/policyCrawler.ts`).
- **Visual Proof Screenshot Extraction**: Captures full-page screenshots of active policy pages alongside extracted markdown, establishing indisputable visual evidence in the appeal docket (`convex/actions/policyCrawler.ts`).
- **Large Manual Windowing & Guideline Modal Dismissal**: Handles dense 150KB+ insurer guidelines (e.g., Carelon Musculoskeletal and Spine Clinical Guidelines) with focused windowing around CPT and diagnosis codes, automatically dismissing disclaimer banners to capture clean evidence.
- **Neutral Authority Benchmarking**: Retrieves comparative clinical evidence from CMS National Coverage Determinations (NCDs), NASS, AAOS, and PubMed to counter arbitrary payer denials.
- **SSRF Link-Local Protection & Public Domain Sanitization**: Strict URL validation and SSRF filtering (`isAccessDeniedDocument`, `sanitizePublicPolicyUrl`) guard against private network traversal, malicious redirect loops, or non-policy endpoints during automated and custom URL crawls.

### 3. AgentMail — Two-Way Programmatic Communications & Mandatory Human Review Gate
AgentMail provides two-way programmatic email infrastructure for appellate dispatch:
- **Two Appellate Dispatch Destinations (Official Payer Reviewer or Typed-In Email Verification)**:
  ClaimHero is engineered for live operations while supporting immediate, verifiable testing across two distinct dispatch targets:
  1. **Official Insurer Reviewer (Production Gateway)**: Dispatches the formal appeal brief directly to the payer's verified grievance and appeals intake address (e.g., Molina Healthcare, GeoBlue Worldwide, BCBS Global Core) with delivery confirmation and audit trail.
  2. **Typed-In Email / Reviewer Gateway (Interactive Test)**: Enables advocates or reviewers to enter a specific destination address (e.g., their personal inbox or external testing address). ClaimHero transmits the complete, formatted cited brief and exhibits directly via the AgentMail REST API. Replying directly from that email client triggers ClaimHero's live Svix webhook to verify two-way thread matching and counter-rebuttal drafting in real time.
- **Dedicated Outbound Sender**: Routes outbound appellate packets through the verified sender mailbox (`claimhero-sender@agentmail.to`).
- **Why shared inboxes (AgentMail free-tier constraint):** AgentMail free tier caps at 3 inboxes per account, so per-claim inboxes would `403` on claim 4 — ClaimHero reuses the shared sender inbox and routes by claim number/thread ID.
- **Svix HMAC-SHA256 Verification**: Cryptographically validates inbound webhook signatures at `/agentmail/webhook` (`convex/actions/agentMailWebhook.ts`).
- **4-Step Inbound Routing Hierarchy**: Automatically correlates replies to active claims via AgentMail Thread ID, subject regex (`[ClaimHero #...]`), recipient matching, and bounded content parsing.
- **Mandatory Human Review Gate & AI Draft Preparation**: Enforces the safer medical/legal standard: *AI may prepare, classify, cite, and recommend. A human must approve every clinical assertion, legal assertion, recipient, and outbound message.* When an insurer responds requesting additional records (`ADDITIONAL_RECORDS_REQUIRED`) or maintaining a denial, ClaimHero synthesizes a cited rebuttal draft and alerts the case manager, but strictly requires human review and sign-off before transmission, preventing unauthorized or unverified external communications (`convex/actions/agentMail.ts`, `src/components/communications/AgentMailDrawer.tsx`).
- **Printable ERISA Delivery Evidence Report**: In the AgentMail Drawer / Case Communications view, a 1-click modal generates a 1-page contemporaneous Delivery Evidence Report combining the live AgentMail message ID (RFC 5322), Amazon SES delivery receipt (`250 2.0.0 OK`), precise UTC/local timestamps, recipient server MX records (via live Node.js DNS resolution), and the immutable NIST SHA-256 attachment fingerprint from Convex storage (`convex/serviceCertificate.ts`, `convex/actions/serviceCertificateResolver.ts`). Helps resolve payer disputes where insurers assert non-receipt within the 180-day window, establishing contemporaneous electronic delivery verification under ERISA 29 U.S.C. § 1133, 29 C.F.R. § 2560.503-1, 28 U.S.C. § 1746, and Fed. R. Evid. 902(11) with single-click `@media print` 8.5" x 11" formatting.
- **Verified Appellate Transmission Gateway**: Resolves the payer's verified intake destination and transmits directly via AgentMail with delivery confirmation, audit trail, and printable docket for your records (`src/components/communications/AgentMailDrawer.tsx`).
- **Review-Gated Inbound Adjudication & Decision Classification**: Automatically parses inbound payer replies to classify outcomes into 4 structured statuses: full overturn/settlement, partial settlement offer, Request for Information (RFI / `ADDITIONAL_RECORDS_REQUIRED`), or denial upheld, reactively updating the claim lifecycle, recalculating financial impact, and staging drafts for human review.

### 4. OpenAI & In-Browser Optical Intake — Zero-BAA Client OCR, Optional Textract & Grounded Synthesis
OpenAI powers clinical reasoning while operating within strict anti-hallucination boundaries:
- **Model Architecture & Strict Structured Contracts**: Every long-form generation runs through the `@convex-dev/agent` component (`convex/lib/agentDraft.ts`) on `gpt-5.4-nano`, enforcing the same JSON schema contract with up to two semantic retries carrying a corrective JSON instruction, so unsupported claims are rejected or marked for review with PHI-safe error masking. The provider is never called directly from a request path that could bypass these contracts.
- **In-Browser OCR & Optional AWS Textract Gate**: Digital PDFs are parsed via `pdf.js` `getTextContent()` (100% accuracy, zero keys, covering ~80% of denials) and scans/photos via `tesseract.js` in WebAssembly/Web Workers. PHI never leaves the user's device for OCR. Text is de-identified client-side via `redactBeforeLLM`, with server-side `redactBeforeLLM` in `convex/lib/openai.ts:228-229` as defense-in-depth. AWS Textract is an optional server-side enhancement for advanced tables/key-values when credentials are configured (`convex/actions/opticalParser.ts`, `convex/lib/textract.ts`). Inbound email attachments without Textract are flagged with `needs_client_ocr` and can be extracted locally with 1-click in the drawer. OpenAI receives zero binary images and zero direct PHI.
- **Grounded Legal Brief Synthesis & Anti-Hallucination Contracts**: Synthesizes formal ERISA legal memorandums using strictly human-confirmed clinical facts and stored policy clauses; fabricated policy text is prohibited by schema contracts (`convex/actions/appealSynthesizer.ts`). Statutory notices, policy citations, the payment request, and the final assembly stay deterministic, so the model can only contribute the two prose sections it is asked for.
- **Tuned for US Healthcare Appeals**: Optimized for denial letters, Explanations of Benefits (EOB), and medical records under US healthcare frameworks (ERISA 29 U.S.C. § 1133, ACA 45 C.F.R. § 147.136, and CMS NCD/LCD guidelines) for precise statutory citation.
- **P2P Defense Playbook & Live Copilot**: Generates structured 4-phase clinical defense playbooks (Statutory Opening, Policy Citations, Trap Counters, Written Determination Demand), 1-page clipboard pocket sheets, real-time voice speech-to-text with rapid counter-strikes, and an interactive AI reviewer simulation for practicing oral arguments before the call (`convex/actions/p2pLiveCopilot.ts`, `src/components/p2p/`).
- **Sentinel Case Copilot (10 Dedicated Tools)**: Grounded assistant powered by `@convex-dev/agent` with 10 registered tools to query active claim details, search claims across the portfolio, retrieve clinical evidence clauses, inspect appeal briefs, fetch P2P defense scripts, review statutory audit trails, perform hybrid precedent search (1536-d vectors + BM25), execute live Firecrawl web searches, scrape external policy URLs on demand, and trigger the multi-source evidence crawler for the active claim (`convex/actions/sentinelAgent.ts`), complete with a 1-click 'Insert into Brief' studio action. The copilot has exactly one implementation: the agent component owns the tool loop, the message history, and the token deltas, and there is no parallel hand-rolled tool dispatcher.
- **Real Token Streaming on Both Surfaces**: Chat turns stream word-level deltas into the agent thread (`saveStreamDeltas`), which `useUIMessages` re-hydrates reactively alongside live tool-call state (`convex/sentinelAgentQueries.ts`, `src/hooks/useSentinelChat.ts`). Long-form drafting streams the same way: the Studio opens a drafting thread first (`convex/draftStreams.ts`), the synthesis action reports progress into it, and the Appeal Studio and P2P Defense Studio render the incoming prose sections live while the model is still writing (`src/components/common/LiveDraftStream.tsx`). Reloading or navigating away never strands the work: the deterministic document is still persisted server-side and the assembled brief replaces the preview when generation completes.
- **Pre-Submission HIPAA Safe Harbor Redaction Gate**: Mandatory server-side de-identification (`redactBeforeLLM`) strips 18 direct identifiers (patient names, MRNs, SSNs, phone numbers, emails, addresses, dates of birth) across all textual prompt payloads, vector query embeddings, and Sentinel Copilot dialogs before dispatch to third-party LLM APIs (45 CFR § 164.514(b)(2)).

---

## Judge Evidence Matrix

| Judge-visible result | Implementation | Source |
| :--- | :--- | :--- |
| **1-Click Anonymous Evaluation & Live Pre-Seeded Cases** | Convex Auth anonymous provider + atomic transactional seeder with live pipeline fidelity | [`convex/auth.ts`](./convex/auth.ts), [`convex/demoSeeder.ts`](./convex/demoSeeder.ts), [`src/components/auth/AuthPage.tsx`](./src/components/auth/AuthPage.tsx) |
| **Real denial extraction** | In-browser OCR (pdf.js / tesseract.js) + Convex Storage + optional Textract + OpenAI redacted structured extraction | [`src/lib/clientOcr.ts`](./src/lib/clientOcr.ts), [`convex/actions/opticalParser.ts`](./convex/actions/opticalParser.ts) |
| **Current payer policy** | Firecrawl native structured extraction with OpenAI fallback provenance | [`convex/actions/policyCrawler.ts`](./convex/actions/policyCrawler.ts), [`convex/clinicalEvidences.ts`](./convex/clinicalEvidences.ts), [`src/components/evidence/PolicyViewer.tsx`](./src/components/evidence/PolicyViewer.tsx) |
| **Precedent-grounded Readiness** | Decoupled 4-pillar readiness rubric with vector handoff, multi-factor parity (CARC/CPT/similarity), and adverse precedent penalties | [`convex/actions/precedentMatcher.ts`](./convex/actions/precedentMatcher.ts), [`convex/actions/precedentArchive.ts`](./convex/actions/precedentArchive.ts) |
| **Cited appeal brief** | Agent-component streaming synthesis over stored evidence | [`convex/actions/appealSynthesizer.ts`](./convex/actions/appealSynthesizer.ts), [`convex/lib/agentDraft.ts`](./convex/lib/agentDraft.ts) |
| **Everyday vs Expert Mode** | Dual-mode language architecture with reactive sync across 28 surfaces | [`src/hooks/useDetailMode.ts`](./src/hooks/useDetailMode.ts), [`src/lib/plainCopy.ts`](./src/lib/plainCopy.ts) |
| **Human approval** | Claim-scoped mutation authorization before dispatch | [`convex/claims.ts`](./convex/claims.ts), [`convex/lib/auth.ts`](./convex/lib/auth.ts) |
| **Two-way correspondence** | AgentMail 2-mode dispatch (Official payer or typed-in email), webhook routing, and reactive threads | [`convex/actions/mailDispatcher.ts`](./convex/actions/mailDispatcher.ts), [`convex/http.ts`](./convex/http.ts) |
| **Collaboration** | Yjs operation log plus Convex presence | [`convex/appealYjs.ts`](./convex/appealYjs.ts), [`convex/presence.ts`](./convex/presence.ts) |
| **Deadline tracking** | Convex crons and durable workflows | [`convex/crons.ts`](./convex/crons.ts), [`convex/workflows.ts`](./convex/workflows.ts) |
| **Workflow observability & telemetry trace** | Reactive `pipelineActivities` streaming + interactive stage timeline in Audit Drawer | [`convex/pipelineActivities.ts`](./convex/pipelineActivities.ts), [`src/components/communications/PipelineTimeline.tsx`](./src/components/communications/PipelineTimeline.tsx) |

---

## Convex Component Architecture

ClaimHero leverages 9 first-party and partner Convex components configured in [`convex/convex.config.ts`](./convex/convex.config.ts):

| Component | Package | Role in ClaimHero |
| :--- | :--- | :--- |
| **Auth** | `@convex-dev/auth` | User authentication via Anonymous mode (`authAnonymous`), Google OAuth, username, and password credentials |
| **AgentMail** | `@agentmail/convex` | Isolated transactional email dispatch and message management |
| **Firecrawl** | `@firecrawl/firecrawl-convex` | Dedicated component for web crawling, modal terms handling, and zero-hop native structured policy criteria extraction |
| **Workflow** | `@convex-dev/workflow` | Durable, step-based execution for long-running appeal pipelines |
| **Agent** | `@convex-dev/agent` | Component-backed agentic reasoning, copilot tool coordination, and durable token streaming for chat and long-form drafting |
| **Aggregate** | `@convex-dev/aggregate` | High-performance reactive portfolio statistics and recovery metrics |
| **Rate Limiter** | `@convex-dev/rate-limiter` | Token bucket rate limiting for external model and crawler APIs |
| **Presence** | `@convex-dev/presence` | Live teammate tracking per appeal room (online status, editing activity) |
| **Static Hosting** | `@convex-dev/static-hosting` | Edge-hosted frontend distribution on `convex.site` |

---

## Trust, Privacy & Legal Architecture

- **HIPAA Safe Harbor Redaction Gate**: Mandatory server-side pre-submission de-identification (`redactBeforeLLM`) strips 18 direct identifiers (patient names, MRNs, SSNs, phone numbers, emails, addresses, dates of birth) across all textual prompt payloads, vector query embeddings, and Sentinel Copilot dialogs before dispatch to third-party LLM APIs (45 CFR § 164.514(b)(2)).
- **In-Browser OCR & Zero-PHI LLM Bridge (Optional AWS Textract)**: Binary PDF and image uploads are parsed client-side in the browser via `pdf.js` `getTextContent()` (100% accuracy, zero keys for digital PDFs) and `tesseract.js` in WebAssembly (for scanned documents and photos). Direct patient identifiers are safely vaulted in the private Convex database, and extracted text is sanitized via `redactBeforeLLM()` before dispatch to OpenAI. OpenAI receives zero binary images and zero direct PHI, while the appellate generator safely re-hydrates authentic patient data for outbound payer letters. When AWS Textract credentials are configured in Convex, Textract is used as an optional server-side enhancement for advanced tables and key-value pairs (`convex/lib/textract.ts`). Inbound payer attachments that cannot be OCR'd on the server are stored in Convex Storage, flagged with `needs_client_ocr`, and extracted locally via 1-click in the drawer.
- **Server-Side Authorization**: Every Convex query and mutation enforces strict document ownership (`claim.userId === authUser._id`) to prevent unauthorized cross-tenant data access (`convex/lib/auth.ts`).
- **4-Pillar Evidence Coverage & Appeal Readiness Rubric (Dossier Audit)**: The 0–100 Evidence Coverage and Appeal Readiness Score (`appealReadinessScore` / `evidenceCoverageScore`) is computed using a decoupled, explainable evidence rubric (35 pts CPB Alignment, 25 pts Objective Clinical Documentation, 20 pts ERISA Procedural Protections, 20 pts Precedent Match). The pipeline passes retrieved vector precedents directly into the rubric, enforcing multi-factor precedent parity (favorable outcome, vector similarity ≥ 0.82, CARC/CPT overlap, and adverse precedent penalties) while preventing score inflation when precedents are absent. It functions as an evidentiary completeness checklist rather than an uncalibrated win probability (`convex/actions/precedentMatcher.ts`, `convex/workflows.ts`).
- **Mandatory Human Review Gate**: In a high-stakes healthcare and ERISA appellate workflow (29 U.S.C. § 1133), unreviewed autonomous outbound transmissions represent an unacceptable regulatory, clinical, and malpractice liability. ClaimHero enforces a strict architectural boundary: *AI may prepare, classify, cite, and recommend. A human must approve every clinical assertion, legal assertion, recipient, and outbound message.* Outbound emails, rebuttals, and appeal packets strictly require explicit manual human confirmation before transmission and are never silently dispatched to external payers.

---

## Local Development

### Requirements

- Node.js 18+
- npm
- A Convex account
- OpenAI, Firecrawl, and AgentMail credentials for live integrations
- (Optional) AWS Textract credentials (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`) for server-side table extraction (in-browser OCR handles PDFs/scans with zero keys)

### Install and Run

```bash
git clone https://github.com/zaikaman/ClaimHero.git
cd ClaimHero
npm install

# Terminal 1: Start Convex backend services
npx convex dev

# Terminal 2: Start Vite development server
npm run dev
```

Copy variables from [`.env.example`](./.env.example). Store provider credentials in Convex deployment environment variables (`npx convex env set`). The AgentMail webhook routes are mounted at `/agentmail-webhook` (primary inbound dispatch) and `/agentmail/webhook` (component handler).

---

## Verification & Test Coverage

ClaimHero is backed by **1,118 automated tests** across 74 test suites (verified via `npm run test`):

```bash
npm run typecheck       # Strict TypeScript typechecking (0 errors)
npm run lint            # ESLint static code analysis (0 warnings)
npm run test            # Comprehensive Vitest test suite (1118 tests across 74 suites)
npm run test:coverage   # Code coverage report (~82.9% statement coverage)
npm run build           # Production bundle compilation
npm run verify          # Full automated local verification gate
```

Test suites cover in-browser zero-BAA OCR and client-side extraction (`pdf.js` digital text extraction and `tesseract.js` WebAssembly scan OCR), pre-transmission client-side Safe Harbor de-identification (`redactBeforeLLM`), optional AWS Textract server fallback, and inbound AgentMail attachment quarantine with one-click local extraction (`tests/clientOcrAndOptionalTextract.test.ts`, `tests/textract.test.ts`, `tests/formalPdfAttachments.test.ts`), Convex Auth anonymous authentication, atomic transactional demo case pre-seeding, and professional healthcare correspondence verification (`tests/anonymousAuthAndSeeder.test.ts`), persistent public landing-to-login transitions with flash-free ambient video retention (`tests/publicExperienceTransition.test.ts`), Everyday Language vs. Expert Details dictionaries, cross-component custom events, and sandboxed storage resilience (`tests/detailMode.test.ts`), Firecrawl native structured extraction and OpenAI fallback provenance chips (`tests/evidenceDossierUx.test.ts`), document-first appeal letter presentation, proof points breakdown, and focused studio navigation controls (`tests/appealStudioUx.test.ts`), simple communication timeline, dual dispatch routing, and smart rebuttal approvals (`tests/simpleInboxUx.test.ts`), real-time pipeline milestone telemetry streaming, multi-run latency tracking, and workflow observability timeline drawer integration (`tests/pipelineActivity.test.ts`, `tests/auditTrailDrawer.test.ts`), the master durable workflow pipeline, Convex authorization and ownership isolation, tamper-evident cryptographic Merkle audit chains (NIST SHA-256 rolling hash, ERISA 29 CFR § 2560.503-1 immutability, sub-10ms verification benchmark), Policy Drift Sentinel retroactive CPB alteration detection, ERISA Delivery Evidence Reports (live AgentMail message IDs, Amazon SES receipts, recipient MX resolution, NIST SHA-256 storage fingerprints, 180-day timeliness formulas), cryptographic SHA-256 fingerprinting, automated Clinical Policy Discrepancy & Governing Criteria Notice generation across multi-tier regulatory frameworks (ERISA, CMS Part C, Medicaid MCO), case collaboration invites with editor/viewer roles, Yjs CRDT transport (clocks, seeds, snapshots, purges) and cursor-merge primitives, OpenAI structured outputs on de-identified text (`redactBeforeLLM`), 1536-d embeddings, and semantic retries (`tests/openai.test.ts`), Firecrawl policy selection and `/v1/map` directory discovery, AgentMail component integration and webhook signatures, ERISA deadline calculations, appeal versioning, redaction, storage cleanup, prompt-injection defenses, P2P workflows, demo data isolation, decoupled 4-pillar appeal readiness scoring with multi-factor legal precedent matching and adverse precedent safeguards (`tests/actionsPrecedentsAndPipeline.test.ts`), and decoupled evidentiary degradation handling, statutory fallback score capping, durable provisional review checkpoints, and review gating (`tests/evidentiaryDegradationGating.test.ts`), and federal-engine DOI-reference mapping with state-specific Level 3 commissioner naming (`tests/stateRegulators.test.ts`, `tests/statutoryEscalation.test.ts`).

---

## Project Structure

```text
ClaimHero/
├── convex/
│   ├── schema.ts              # 23 domain tables, relational indexes, vector index
│   ├── convex.config.ts       # 9 Convex components configuration
│   ├── claims.ts              # Claim lifecycle, deadlines, analytics
│   ├── claimCollaborators.ts  # Case sharing invites with editor/viewer roles
│   ├── appealYjs.ts           # Yjs CRDT op-log transport (sync, push, snapshots)
│   ├── policyDrift.ts         # Policy Drift Sentinel queries, mutations, notices
│   ├── presence.ts            # Live teammate presence per appeal room
│   ├── clinicalEvidences.ts   # Evidence persistence and vector retrieval
│   ├── appeals.ts             # Versioned briefs and escalation
│   ├── emails.ts              # Threads, messages, and routing
│   ├── pipelineActivities.ts  # Real-time pipeline milestone telemetry
│   ├── auditLogs.ts           # Case audit trail & statutory timeline
│   ├── crons.ts               # Deadline and reconciliation schedules
│   ├── auth.ts / http.ts      # Auth and webhook routing
│   ├── lib/                   # Notice generators, auth helpers, crypto, rate limiting
│   └── actions/               # OpenAI, Firecrawl, AgentMail, Drift Sentinel pipelines
├── src/
│   ├── App.tsx                # Authenticated routing and application shell
│   ├── components/            # Radar, evidence, studio, P2P, communications
│   ├── hooks/                 # Reactive Convex subscriptions and workflows
│   └── lib/                   # Redaction, dossier, finance, and domain rules
├── tests/                     # Unit, integration, security, and workflow tests
├── .env.example               # Environment variable reference
├── BRIEF.md                   # Hackathon brief
├── PRODUCT.md                 # Product contract
└── hackathon.md               # Chronological build evidence
```

---

## Hackathon Submission

- **Live URL**: https://kindhearted-elephant-992.convex.site
- **Demo Video (Under 3 Min)**: https://www.youtube.com/watch?v=wLW_ZL093a8
- **GitHub Repository**: https://github.com/zaikaman/ClaimHero
- **Evidence-Based Build Log**: [`hackathon.md`](./hackathon.md)
- **Hackathon Brief**: [`BRIEF.md`](./BRIEF.md)

### Alignment with Official Judging Criteria (BRIEF.md §6)

- **Everyday Apps**: If you got this in your mailbox today, this is the sequence you would want to see. Built from the ground up with an **Everyday Language / Simple Mode** default so patients and families understand their denial, their rights, and their timeline without medical billing jargon, while providing an instant **Expert Details** toggle for advocates and clinical teams requiring formal ERISA citations and CPT/CARC codes. No HIPAA-relevant front-end hurdles, no advocacy-degree onboarding. Fictional fixtures are for the evaluation; the exact same screen serves real cases once credentials are wired.
- **Creativity & Usefulness**: One linear path to a defensible cited appeal; the hard part (which clause actually governs the denial) is solved by reading the issuer's own policy, not an opinion of it.
- **Convex Depth**: 9 components, 23 tables, native BM25 full-text search in global `Cmd+K` / `Ctrl+K` palette, vector search on prior wins, crons for the ERISA clock, durable workflows, real-time collab on briefs, and authentication with human approval gates on every outbound send. The stack is documented in [`PRODUCT.md`](./PRODUCT.md) and [`convex/convex.config.ts`](./convex/convex.config.ts); this README is the public face.
- **Sponsor Stack**: Firecrawl finds the policy, detects retroactive policy drift, and screenshots the page as evidence; AgentMail powers two-way appellate dispatch across two destinations (official production payer email or typed-in email verification) with Svix-verified webhooks; OpenAI extracts the codes and synthesizes the brief inside a redaction gate and a schema that prohibits fabricating policy text.

---

## Responsible Use

ClaimHero is an appellate preparation and case coordination platform. It is not medical advice, legal advice, insurance advice, or a guarantee of payment. Users must verify clinical facts, review source policies, confirm recipient destinations, and make their own independent decisions before transmitting an appeal or acting on clinical or legal information.

---

## License

[MIT](./LICENSE)
