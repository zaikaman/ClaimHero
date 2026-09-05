# ClaimHero

## Autonomous Medical & Health Insurance Appeal Sentinel

ClaimHero empowers patients, healthcare providers, and clinical advocates to overturn wrongful health insurance claim denials before statutory deadlines expire. It extracts clinical denial codes, retrieves the insurer's active Clinical Policy Bulletins (CPBs) with full visual proof, evaluates criteria across a deterministic four-pillar rubric, and synthesizes cited, court-ready appeal dossiers for human review and autonomous dispatch.

> A denial is not the end of the story. It is an argument, a deadline, and an evidence trail waiting to be audited.

<p align="center">
  <a href="https://kindhearted-elephant-992.convex.site"><strong>Open Live Application</strong></a>
  &nbsp; · &nbsp;
  <a href="https://www.youtube.com/watch?v=wLW_ZL093a8"><strong>Watch 3-Minute Demo Video</strong></a>
  &nbsp; · &nbsp;
  <a href="./hackathon.md"><strong>Read Evidence-Based Build Log</strong></a>
</p>

Built for the **Convex All Gas Hackathon** (August 25 – September 22, 2026) using **Convex**, **Firecrawl**, **AgentMail**, and **OpenAI**.

---

## 60-Second Judge Quickstart

To evaluate the end-to-end pipeline without uploading personal health records:

1. Open the [Production Deployment](https://kindhearted-elephant-992.convex.site) and sign in.
2. Click **Quick Ingest** (or press `Cmd+K` / `Ctrl+K`) and select **Try demo case (synthetic)**.
3. Choose one of the synthetic HIPAA Safe Harbor evaluation fixtures:
   - **GeoBlue Worldwide — Knee Arthroscopy & Meniscectomy**: $6,400 | CPT 29881 | CARC CO-50 (Medical Necessity)
   - **GeoBlue Worldwide — Lumbar Decompression**: $18,200 | CPT 63047 | CARC CO-197 (Pre-Authorization)
   - **BCBS Global Core — Diagnostic Knee MRI**: $2,850 | CPT 73721 | CARC CO-16 (Prior Records Required)
4. Select **Run Autonomous Pipeline** and track the real-time stepper:
   `Evidence & CPB` -> `Defense Suite` -> `Payer Dispatch`
5. Inspect the output: indexed insurer clauses, visual screenshot archives, deterministic four-pillar overturn score, cited appeal brief, physician peer-to-peer call script, and two-way AgentMail thread.

*Synthetic cases are strictly isolated from real portfolio analytics and can be purged at any time via the "Clear demo data" button.*

---

## Architecture at a Glance

```text
Denial Notice (PDF / Image / EOB Text)
               |
               v
  Convex Storage + Case Ledger (convex/claims.ts)
               |
               v
  OpenAI Vision + Structured Extraction (opticalParser.ts)
  [Extracts CPT, ICD-10, CARC/RARC, Amounts, Deadlines, Payer]
               |
               v
  Firecrawl Live Search & Scrape (policyCrawler.ts)
  [Payer CPBs, Visual Proof Screenshots, Carelon/NASS/CMS Manuals]
               |
               v
  Convex Vector Archive & Deterministic 4-Pillar Scoring (precedentMatcher.ts)
  [35% CPB Alignment + 25% Step-Therapy + 20% ERISA + 20% Precedents]
               |
               v
  OpenAI Grounded Appeal Synthesis (appealSynthesizer.ts)
  [Strictly cites stored evidence; zero fabricated clauses]
               |
               v
  Court-Ready Formal PDF Dossier Generation (pdfService.ts)
               |
               v
  Human Approval Gate -> AgentMail Autonomous Transmission (mailDispatcher.ts)
               |
               v
  Two-Way Payer Webhook (Svix HMAC) -> Sentinel Auto-Pilot 1-Hour SLA
```

---

## The Four Sponsor Pillars — Full Architectural Depth

### 1. Convex — Central System of Record & Reactive Backend Engine
Convex serves as the core persistence, real-time subscription, compute, and orchestration layer:
- **Reactive State & Live Subscriptions**: Claims, clinical evidence, appeal versions, audit timelines, and communication threads update reactively across the entire UI without manual polling (`convex/schema.ts`).
- **Vector Search Engine**: 1536-dimensional vector search on the `precedents` table powers semantic precedent retrieval against past won appeals (`convex/clinicalEvidences.ts`).
- **Transactional Consistency**: Atomic mutations govern claim creation, evidence persistence, status transitions, and cascading purges to eliminate orphan records.
- **Crons & Scheduled Actions**: Automated crons sweep statutory 180-day ERISA deadlines, track pending payer replies, and run the Sentinel Auto-Pilot 1-Hour SLA (`convex/crons.ts`).
- **File Storage**: Native Convex storage securely hosts uploaded denial documents and compiled appeal PDF dossiers.
- **HTTP Routing & Svix Webhooks**: Authenticated endpoints handle inbound AgentMail and Firecrawl webhooks (`convex/http.ts`).

### 2. Firecrawl — Real-Time Policy Discovery & Visual Proof Archiving
Firecrawl actively crawls, scrapes, and verifies insurer Clinical Policy Bulletins (CPBs):
- **Live Search & Scrape Engine**: Queries live payer portals across Aetna, Cigna, UnitedHealthcare, Carelon, and Blue Cross Blue Shield (`convex/actions/policyCrawler.ts`).
- **Visual Proof Screenshot Extraction**: Captures full-page screenshots of active policy pages alongside extracted markdown, establishing indisputable visual evidence in the appeal docket (`convex/actions/policyCrawler.ts`).
- **Large Manual Windowing**: Handles dense 150KB+ insurer guidelines (e.g., Carelon Musculoskeletal and Spine Clinical Guidelines) with focused windowing around CPT and diagnosis codes.
- **Neutral Authority Benchmarking**: Retrieves comparative clinical evidence from CMS National Coverage Determinations (NCDs), NASS, AAOS, and PubMed to counter arbitrary payer denials.

### 3. AgentMail — Autonomous Programmatic Communications & Auto-Pilot
AgentMail provides two-way programmatic email infrastructure for appellate dispatch:
- **Dedicated Inboxes**: Routes outbound packets through `claimhero-sender@agentmail.to` and evaluation traffic through `claimhero-adjudicator@agentmail.to`.
- **Svix HMAC-SHA256 Verification**: Cryptographically validates inbound webhook signatures at `/agentmail/webhook` (`convex/actions/agentMailWebhook.ts`).
- **4-Step Inbound Routing Hierarchy**: Automatically correlates replies to active claims via AgentMail Thread ID, subject regex (`[ClaimHero #...]`), recipient matching, and bounded content parsing.
- **Sentinel Auto-Pilot 1-Hour SLA**: When an insurer responds requesting additional records (`ADDITIONAL_RECORDS_REQUIRED`), ClaimHero autonomously synthesizes the required rebuttal addendum and dispatches it within 1 hour if unreviewed, protecting the statutory ERISA appeal clock (`convex/actions/mailDispatcher.ts`).
- **Adversary Negotiation Engine**: Classifies incoming partial settlement offers, evaluates counter-settlement thresholds, and drafts structured payment dispute rebuttals (`convex/actions/adversaryNegotiator.ts`).

### 4. OpenAI — Multi-Modal Clinical Intake & Grounded Synthesis
OpenAI powers clinical reasoning while operating within strict anti-hallucination boundaries:
- **Vision OCR Denial Parser**: Extracts structured CPT/HCPCS, ICD-10, CARC/RARC codes, disputed amounts, and payer contact info from raw denial documents (`convex/actions/opticalParser.ts`).
- **Grounded Brief Synthesis**: Synthesizes formal appeals using strictly human-confirmed clinical facts and stored policy clauses; fabricated policy text is prohibited by schema contracts (`convex/actions/appealSynthesizer.ts`).
- **P2P Defense Studio & Live Copilot**: Generates physician tele-scripts with trap-question counterarguments, real-time pushback cards, and live speech-to-text call summarization (`convex/actions/p2pLiveCopilot.ts`).
- **10-Tool Sentinel AI Assistant**: Conversational copilot equipped with 10 database-backed tools to inspect claims, evidence, statutory deadlines, and precedent archives on the fly (`convex/actions/sentinelChatbot.ts`).

---

## Convex Component Architecture

ClaimHero leverages 8 first-party and partner Convex components configured in [`convex/convex.config.ts`](./convex/convex.config.ts):

| Component | Package | Role in ClaimHero |
| :--- | :--- | :--- |
| **Auth** | `@convex-dev/auth` | User authentication via password, username, and Google OAuth |
| **AgentMail** | `@agentmail/convex` | Isolated transactional email dispatch and message management |
| **Firecrawl** | `@firecrawl/firecrawl-convex` | Dedicated component for web crawling and policy ingestion |
| **Workflow** | `@convex-dev/workflow` | Durable, step-based execution for long-running appeal pipelines |
| **Agent** | `@convex-dev/agent` | Component-backed agentic reasoning and tool coordination |
| **Aggregate** | `@convex-dev/aggregate` | High-performance reactive portfolio statistics and metrics |
| **Rate Limiter** | `@convex-dev/rate-limiter` | Token bucket rate limiting for external model and crawler APIs |
| **Static Hosting** | `@convex-dev/static-hosting` | Edge-hosted frontend distribution on `convex.site` |

---

## Defense Suite & Advanced Capabilities

| Surface | Technical Implementation | Purpose |
| :--- | :--- | :--- |
| **Case Radar** | `src/components/radar/CaseRadar.tsx` | Reactive portfolio dashboard with ERISA urgency countdowns, payer filters, and CSV/JSON data export. |
| **Evidence Matrix** | `src/components/evidence/EvidenceMatrix.tsx` | Side-by-side comparison of denial codes against active CPB clauses with category filtering (Payer / CMS / PubMed). |
| **Visual Proof Archive** | `src/components/evidence/VisualProofArchive.tsx` | High-resolution full-page screenshots of payer bulletins captured via Firecrawl to prevent policy gaslighting. |
| **Appeal Studio** | `src/components/studio/AppealStudio.tsx` | Versioned appellate brief editor with clause-level citations, statutory rights notices, and attestation signatures. |
| **Formal PDF Dossier** | `src/lib/pdfService.ts` | Court-ready PDF dossier compiler with indexed clinical exhibits, statutory cover sheets, and print layouts. |
| **P2P Defense Studio** | `src/components/p2p/P2PDefenseStudio.tsx` | Tele-scripts and tactical counter-argument cards tailored for physician-to-medical-director phone calls. |
| **P2P Live Copilot** | `src/components/p2p/P2PLiveCopilot.tsx` | Live call assistant with real-time speech transcription, dynamic objection counters, and call recap generation. |
| **ERISA Calculator** | `src/lib/erisaCalculator.ts` | Calculates 29 U.S.C. § 1132(c) statutory penalties ($110/day) for payer failure to disclose plan documents. |
| **Adversary Engine** | `convex/actions/adversaryNegotiator.ts` | Analyzes partial settlement offers and drafts counter-demands based on prevailing clinical standards. |

---

## Safety, Privacy & HIPAA Compliance

- **HIPAA Safe Harbor Redaction**: Multi-stage client and server redaction strips 18 direct identifiers (names, MRNs, SSNs, phone numbers, facility names) before external API calls (`src/lib/redaction.ts`).
- **Server-Side Authorization**: Every Convex query and mutation enforces document ownership (`claim.userId === authUser._id`) to prevent unauthorized cross-tenant data access (`convex/lib/auth.ts`).
- **Deterministic 4-Pillar Scoring**: Overturn probability is computed using an explainable mathematical formula (0–100 scale), never an opaque hallucinated number (`convex/actions/precedentMatcher.ts`).
- **Human Approval Gate**: Real outbound email transmission strictly requires manual human confirmation; unreviewed messages are never silently sent to external payers.

---

## Local Development

### Requirements

- Node.js 18+
- npm
- A Convex account
- OpenAI, Firecrawl, and AgentMail credentials for live integrations

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
 
ClaimHero is backed by **540 automated tests** across 37 test suites:

```bash
npm run typecheck       # Strict TypeScript typechecking
npm run lint            # ESLint static code analysis
npm run test            # Comprehensive Vitest test suite (540 tests)
npm run test:coverage   # Code coverage report
npm run build           # Production bundle compilation
npm run verify          # Full automated local verification gate
```

Test suites cover the master pipeline, Convex authorization and ownership isolation, OpenAI structured outputs and embeddings, Firecrawl policy selection, AgentMail component integration and webhook signatures, deadline calculations, appeal versioning, redaction, storage cleanup, prompt-injection defenses, P2P workflows, durable workflows, and demo isolation.

---

## Project Structure

```text
ClaimHero/
├── convex/
│   ├── schema.ts              # 10 domain tables, relational indexes, vector index
│   ├── convex.config.ts       # 8 Convex components configuration
│   ├── claims.ts              # Claim lifecycle, deadlines, analytics
│   ├── clinicalEvidences.ts   # Evidence persistence and vector retrieval
│   ├── appeals.ts             # Versioned briefs and escalation
│   ├── emails.ts              # Threads, messages, and routing
│   ├── auditLogs.ts           # Immutable case timeline
│   ├── crons.ts               # Deadline and reconciliation schedules
│   ├── auth.ts / http.ts      # Auth and webhook routing
│   └── actions/               # OpenAI, Firecrawl, AgentMail pipelines
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

| Criterion | Evaluation Requirement | ClaimHero Implementation |
| :--- | :--- | :--- |
| **1. Everyday Apps** | Real-world utility over developer toys | Solves a $1.5B/year health insurance denial crisis for everyday patients and clinical advocates. |
| **2. Creativity & Usefulness** | Practical domain innovation | Unifies policy discovery, visual proof, statutory ERISA penalties, and physician P2P defense into one workflow. |
| **3. Convex Depth** | Queries, mutations, crons, auth, components | Employs 8 Convex components, 10 domain tables, 1536-d vector indexes, durable workflows, and scheduled crons. |
| **4. Sponsor Stack** | Active production work across sponsors | OpenAI extracts & synthesizes, Firecrawl discovers & screenshots CPBs, AgentMail handles bidirectional dispatch. |
| **5. Live URL** | Hosted on `convex.site` | Fully deployed and accessible on Convex Static Hosting. |
| **6. Video Demo** | Under 3 minutes, clicking through product | Concise walkthrough demonstrating ingestion, evidence discovery, scoring, brief drafting, and dispatch. |

---

## Responsible Use

ClaimHero is an appellate preparation and case coordination platform. It is not medical advice, legal advice, insurance advice, or a guarantee of payment. Users must verify clinical facts, review source policies, confirm recipient destinations, and make their own independent decisions before transmitting an appeal or acting on clinical or legal information.

---

## License

[MIT](./LICENSE)
