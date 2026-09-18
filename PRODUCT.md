# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Primary Audience (Dual-Focus)**:
  - **Self-Advocate Patients & Families**: Individuals who received unexpected health insurance claim denials or high-dollar out-of-pocket Explanation of Benefits (EOB) notices, needing fast, legally sound, and accessible medical necessity appeals.
  - **Patient Advocates & Practice Billing Coordinators**: Healthcare advocates, medical clinic staff, and Revenue Cycle Management (RCM) specialists handling high-volume denial management, ERISA compliance, and payer dispute escalations.

## Product Purpose

ClaimHero is an evidence-grounded appeal preparation workspace for denial teams that transforms opaque denial letters into evidence-backed, cited appeal dossiers. It helps denial teams prepare defensible appeals by extracting denial parameters, cross-referencing insurer Clinical Policy Bulletins (CPBs) and medical guidelines, tracking statutory deadlines, and organizing end-to-end payer correspondence.

## Positioning

Unlike generic AI document tools or manual template appeals, ClaimHero connects:
1. **Real-time Clinical Policy Bulletin (CPB) crawling** to find contradictions between an insurer's published medical necessity guidelines and their denial reason.
2. **Statutory ERISA (29 CFR § 2560.503-1) regulatory citations and strict countdown alarms**.
3. **Review-gated two-way payer communication** via dedicated AgentMail claim inboxes with inbound determination detection.
4. **Sub-50ms reactive Convex data layer** syncing cases, evidence matrix, live studio edits, and portfolio analytics in real time.

## Operating Context

- Web-first responsive application deployed on Convex static hosting.
- High-stress, adversarial environment where patients and coordinators fight strict statutory timelines (ERISA 180-day federal window, state 30-day external review clocks).
- Workflows involve ingesting multi-page EOB denial letters, reviewing side-by-side clinical evidence matrices, editing appeal briefs in a collaborative live studio, and tracking real-time status updates via dedicated claim inboxes.

## Capabilities and Constraints

- **Reactive Backend**: Convex Cloud database with real-time queries, atomic mutations, crons for statutory deadline sweeps, and vector search.
- **In-Browser OCR & Optional Textract Enhancement**: Denial documents (PDF/images) are extracted locally in the browser (pdf.js text layer for digital PDFs, tesseract.js for scans) with zero keys and zero PHI egress, then de-identified client-side and server-side via `redactBeforeLLM`. AWS Textract under HIPAA BAA is an optional server-side enhancement for high-accuracy tables/key-values when credentials are configured. OpenAI `gpt-5.4-nano` Structured Outputs process de-identified text only via the mandatory server-side `redactBeforeLLM` gate, extracting CPT codes, ICD-10 codes, CARC/RARC denial reason codes (e.g., CO-50), and disputed dollar amounts with zero raw PHI or binary images transmitted to external models.
- **Evidence Crawling & Discovery**: Firecrawl for live scraping and indexing of payer CPBs, recursive policy directory discovery via the `/v1/map` endpoint, and PubMed clinical guidelines.
- **Review-Gated Dispatch**: AgentMail integration providing dedicated email addresses per claim for verified transmission and webhook ingestion (`/agentmail-webhook`), with mandatory human review before dispatch.
- **Delivery Evidence Report**: Contemporaneous ERISA Delivery Evidence Report combining AgentMail message IDs (RFC 5322), Amazon SES delivery receipts, live DNS MX server resolution, and NIST SHA-256 Convex storage fingerprints into verifiable electronic service records under 28 U.S.C. § 1746 and Fed. R. Evid. 902(11).
- **Data Privacy & Compliance**: Built with HIPAA security guardrails, strict TypeScript validation across the stack, and validation gates where unsupported claims are rejected or marked for review.

## Brand Commitments

- **Name**: ClaimHero (Evidence-Grounded Appeal Preparation Workspace for Denial Teams).
- **Aesthetic Identity**: Precision Medical Dark-Mode theme (`#0b0f17` obsidian canvas, `#00e5ff` clinical cyan, `#10b981` victory emerald, `#f43f5e` denial crimson, `#f59e0b` deadline amber).
- **Voice & Tone**: Authoritative, clinically rigorous, legally precise, yet empowering and fiercely protective of patient rights.

## Evidence on Hand

- Verified domain models and regulatory rules in `src/lib/constants.ts` (ERISA regulations, CARC/RARC code sets, CPT procedure codes).
- Comprehensive automated test suite in `tests/` (verified via `npm run test`, detailed in `README.md`).
- Production-grade schema in `convex/schema.ts` supporting patients, claims, clinical evidences, appeals, email threads, and audit logs.
- Formal specifications in `specs/001-appeal-sentinel/` and hackathon build log in `hackathon.md`.

## Product Principles

1. **Every Denial Is Reversible with Evidence**: Ground every appeal in exact insurer policy clauses, peer-reviewed medical guidelines, and statutory rights.
2. **Never Miss a Statutory Clock**: Treat appeal deadlines as non-negotiable legal triggers with persistent alarms and automated escalations.
3. **Full Real-Time Transparency**: Every ingestion, clinical analysis, brief edit, and payer transmission is reactively reflected across the UI and logged immutably.
4. **Radical Type Safety & Real Data**: Zero mock placeholders; all extractions, syntheses, and communications use production-ready typed contracts.

## Accessibility & Inclusion

- WCAG 2.1 AA compliant contrast ratios across all clinical charts, matrix cards, and dark-mode data displays.
- Full keyboard navigation and screen-reader accessibility on interactive Radix UI dialogs, tabs, and drawers.
- Plain-language summaries accompanying dense medical necessity clauses and ERISA statutory text for self-advocating patients.
