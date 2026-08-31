# Feature Specification: Autonomous Medical Appeal Sentinel

**Feature Branch**: `main`  
**Created**: 2026-08-26  
**Status**: Ready for Implementation  
**Input**: User description: "ClaimHero — Autonomous Medical & Health Insurance Appeal Sentinel (IDEA.md)"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Denial Document Ingestion & Optical Metadata Extraction (Priority: P1)

A patient, family member, or medical practice administrator receives an insurance denial letter or Explanation of Benefits (EOB) PDF/Image. They upload the document directly through the web interface (or paste raw document text, or forward it to their dedicated claim email inbox). The system ingests the real document, extracts key case metadata (denial reason code, CPT procedure codes, ICD-10 diagnosis codes, disputed dollar amounts, dates of service, and payer identity) using OpenAI `gpt-5.4-nano` Vision and Structured JSON, and creates a real-time trackable appeal case in the Convex reactive database.

**Why this priority**: Ingestion and structured extraction are the foundational entry points for the entire recovery workflow. Without structured case parameters, no policy analysis or appeal generation can occur.

**Independent Test**: Upload a real denial letter PDF (or paste raw EOB text) and verify that a new case is immediately created in the Convex database displaying accurately extracted financial amounts, denial codes (e.g., CO-50), and patient/payer identifiers.

**Acceptance Scenarios**:

1. **Given** a patient with a denied medical procedure EOB PDF or text, **When** they upload the file to the portal, **Then** a new claim record is created in Convex with extracted CPT code (e.g. 27447), denial reason code (e.g. CO-50), denied amount, and patient liability.
2. **Given** an inbound email with an attached denial PDF sent to a dedicated claim inbox address, **When** the system receives the message, **Then** it automatically extracts the attachment, logs the sender, parses the claim details, and assigns an autonomous email thread for future payer correspondence.

---

### User Story 2 - Clinical Policy Bulletin Evidence Crawling & Precedent Matching (Priority: P2)

The system automatically cross-references the extracted denial codes and payer identity against insurer-published Clinical Policy Bulletins (CPBs) crawled live via Firecrawl, FDA drug/device indications, PubMed peer-reviewed clinical guidelines, and historical overturned claim precedents. It flags specific clauses where the insurer's denial contradicts its own published medical necessity guidelines and calculates a clinically reasoned Overturn Probability Score (0–100%).

**Why this priority**: Medical necessity disputes require rigorous clinical citations and precedent evidence to compel insurers to reverse denials during formal review.

**Independent Test**: Trigger evidence analysis on an ingested claim with a "not medically necessary" denial code; verify that matching insurer policy clauses and clinical citations are retrieved and displayed in a side-by-side policy matrix alongside an overturn probability score.

**Acceptance Scenarios**:

1. **Given** a claim denied by an insurer under code CO-50, **When** the evidence crawler executes, **Then** it crawls the insurer's policy criteria, matches the patient's conservative therapy history against qualifying criteria, and outputs an Overturn Probability Score.
2. **Given** a rare condition or off-label drug denial, **When** the evidence crawler runs, **Then** it indexes peer-reviewed clinical trial abstracts and FDA indications, linking relevant citation excerpts directly to the case dossier.

---

### User Story 3 - Cited Appeal Brief Synthesis & Collaborative Appeal Studio (Priority: P3)

The system synthesizes a comprehensive, legally cited multi-page medical appeal brief tailored to the specific denial level (Level 1 Internal Appeal, Level 2 Grievance, or Level 3 External Commissioner Review). The brief includes executive summaries, statutory ERISA citations (e.g., 29 CFR § 2560.503-1), detailed medical necessity arguments, and direct footnote backlinks to insurer policy clauses. Users can interactively edit, refine, and add physician notes in a collaborative live appeal studio with auto-saving.

**Why this priority**: The appeal brief is the core legal and clinical instrument submitted to the payer to demand claim reconsideration and payment.

**Independent Test**: Open an assembled appeal brief in the editor, insert an additional clinical study reference or physician note, and verify that the formatted document updates in real time with intact legal citations and export capabilities.

**Acceptance Scenarios**:

1. **Given** an analyzed claim with policy contradictions identified, **When** appeal synthesis is triggered, **Then** a structured 4-section appeal brief is generated containing: Statement of Denial, Statutory Rights Notice (ERISA/ACA), Clinical Justification with CPB Citations, and Formal Demand for Reimbursement.
2. **Given** an advocate reviewing an appeal draft, **When** they add custom clinical notes or modify argumentation in the studio, **Then** the updates are saved immediately and reflected in the downloadable and dispatchable appeal dossier.

---

### User Story 4 - Statutory Deadline Countdown & Autonomous Dispatch Engine (Priority: P4)

The system tracks statutory appeal deadlines (e.g., ERISA 180-day federal window, state 30-day external review clocks) with dynamic countdown indicators and urgency alarms. When the appeal brief is finalized, the system dispatches the complete appeal packet—including attached clinical evidence exhibits—directly to the insurer's grievance department via AgentMail, updating the case status to active review and recording a complete audit log entry.

**Why this priority**: Missing a statutory appeal window forfeits all recovery rights. Automated deadline tracking and verifiable transmission protect the patient's legal standing.

**Independent Test**: Finalize an appeal brief and trigger dispatch; verify that the appeal packet is transmitted, the deadline countdown reflects the active payer response clock, and an immutable entry is added to the case audit log.

**Acceptance Scenarios**:

1. **Given** an active claim with a known service denial date, **When** viewing the case radar, **Then** a prominent deadline dial displays exact days remaining before the statutory filing cutoff.
2. **Given** an approved appeal brief, **When** the user confirms dispatch, **Then** the formal dossier is sent to the designated payer grievance address, transmission confirmation is recorded, and the case transitions to "dispatched / under review".

---

### User Story 5 - Real-time Case Analytics, Win Probability Dashboard & Audit Timeline (Priority: P5)

The system aggregates all active cases across the healthcare practice or individual portfolio into a unified real-time dashboard displaying total disputed pipeline dollars, total recovered/overturned amounts, average win probability scores, and critical statutory deadline alarms (&lt;14 days remaining), backed by an immutable chronological case audit timeline.

**Why this priority**: Provides complete financial visibility and regulatory compliance tracking for healthcare advocates, patients, and billing coordinators.

**Independent Test**: Ingest and process multiple claims across different payers; verify that dashboard pipeline metrics and chronological audit logs update in real-time reactively.

**Acceptance Scenarios**:

1. **Given** multiple claims in varying stages of dispute, **When** navigating the dashboard, **Then** the header and radar metrics dynamically compute total disputed volume, recovered amounts, and critical alarms strictly from Convex database records.
2. **Given** any claim action (ingestion, policy crawl, studio edit, dispatch), **When** viewing the case audit log, **Then** an immutable timestamped event is rendered showing the actor, event type, and details.

---

### Edge Cases

- **Illegible or Low-Quality Scanned PDFs**: When an uploaded denial letter contains degraded scans or unreadable text, the system flags uncertain fields for quick manual confirmation while extracting all legible sections.
- **Unpublished or Proprietary Insurer Guidelines**: If an insurer's specific policy bulletin is inaccessible, the system falls back to national standard-of-care guidelines (NCCN, FDA, PubMed clinical trials) and highlights the insurer's failure to disclose criteria under ERISA disclosure rules.
- **Expired Statutory Window**: If a claim is ingested after the standard 180-day ERISA internal deadline has passed, the system automatically alerts the user and suggests alternative avenues (e.g., State Insurance Commissioner external complaints, equitable tolling arguments).
- **Incomplete Patient Medical Records**: When key clinical history (e.g., conservative therapy duration) is missing from the denial, the appeal studio provides structured prompts to capture the missing details before dispatch.
- **Payer Transmission Failure or Bounce**: In the event of an email bounce or delivery failure, the system alerts the user immediately, logs the failure in the audit trail, and provides alternative submission instructions (e.g., printable PDF dossier with fax cover sheet).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST support real document ingestion via direct file upload (PDF/image), pasted document text, and dedicated inbound claim email forwarding addresses.
- **FR-002**: System MUST automatically extract and structure core denial metadata from real documents: claim ID, member ID, insurer name, denial reason codes (e.g., CO-50, CO-197), CPT/HCPCS procedure codes, ICD-10 diagnosis codes, denied dollar amount, and patient owed amount.
- **FR-003**: System MUST crawl and index insurer Clinical Policy Bulletins (CPBs) using Firecrawl to retrieve explicit medical necessity criteria matching the claim's procedure and diagnosis codes.
- **FR-004**: System MUST perform semantic precedent matching against historical overturned medical appeals and peer-reviewed clinical guidelines to locate winning arguments.
- **FR-005**: System MUST calculate an Overturn Probability Score (0–100%) and assign a confidence rating (High Confidence, Moderate, Complex Dispute) based on clinical alignment and policy contradictions.
- **FR-006**: System MUST generate a legally formatted, multi-section appeal brief incorporating statutory rights references (ERISA 29 CFR § 2560.503-1, Affordable Care Act internal claims guidelines) and direct insurer CPB citations.
- **FR-007**: System MUST provide an interactive Appeal Studio enabling real-time review, inline text editing, AI-assisted argumentation prompts, and document export.
- **FR-008**: System MUST compute and display statutory appeal deadlines with countdown indicators and urgency-based visual alerts.
- **FR-009**: System MUST support outbound transmission of finalized appeal dossiers with evidence attachments to payer appeals departments via AgentMail.
- **FR-010**: System MUST maintain an immutable, chronological audit trail recording every state change, analysis result, document edit, and transmission event.
- **FR-011**: System MUST calculate real-time aggregate financial metrics (Total Disputed Pipeline, Total Won, Critical Statutory Alarms) directly from the Convex reactive database.

### Key Entities

- **Patient**: Represents the insured individual (name, email, member ID, group number, insurance payer, state).
- **Claim**: The primary appeal case (patient ID, claim number, service dates, provider name, denied amount, patient owed amount, CPT codes, ICD-10 codes, denial reason code, status, statutory deadline, overturn probability score, assigned dedicated email).
- **ClinicalEvidence**: Evidentiary citations linked to a claim (source type: CPB, FDA label, PubMed, NCCN guideline; title, source URL, citation clause, extracted text, relevance score).
- **Appeal**: The synthesized appeal dossier (claim ID, version, appeal level, executive summary, medical necessity arguments, statutory citations, full appeal brief text, export file reference).
- **EmailThread & EmailMessage**: Communication records for a claim (claim ID, agent inbox address, payer address, subject, direction, body content, attachments, timestamps).
- **AppealAuditLog**: Immutable event record (claim ID, event type, timestamp, description, actor).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Ingestion and metadata extraction of real denial documents completes within 10 seconds of receipt with >95% accuracy on core fields.
- **SC-002**: Generation of a fully cited, multi-page appeal brief completes within 25 seconds of claim analysis.
- **SC-003**: Overturn probability score and clinical evidence citations maintain 100% traceability to verifiable insurer policy clauses or clinical literature.
- **SC-004**: 100% of claims with established denial dates display active statutory deadline countdowns with zero deadline calculation errors.
- **SC-005**: All user interactions, file uploads, and case status updates reflect across the interface in real time with sub-50ms reactive latency.

## Assumptions

- **Target Jurisdiction**: Initial release targets US health insurance claims subject to federal ERISA regulations, Affordable Care Act appeals rules, or standard state Department of Insurance external review frameworks.
- **Supported Payers**: System supports major national and regional commercial payers (e.g., UnitedHealthcare, Aetna, Cigna, Blue Cross Blue Shield, Humana) and Medicare Advantage plans with publicly accessible or standard clinical policy structures.
- **Document Formats**: Users provide denial letters and EOBs in PDF, PNG, JPG, JPEG, WEBP, or TXT formats.
- **Email Integration**: Dedicated claim inboxes handle standard SMTP email receipt and outbound dispatch with attachment bundling via AgentMail.
