# ClaimHero

## Autonomous Medical & Health Insurance Appeal Sentinel

> **Upload a denial. ClaimHero pulls the insurer's own clinical policy bulletins via Firecrawl, writes an indisputable cited brief, and dispatches it via AgentMail before the ERISA clock expires — three steps, one deadline.**

ClaimHero empowers patients, healthcare providers, and clinical advocates to overturn wrongful health insurance claim denials before statutory deadlines expire. It extracts clinical denial codes, retrieves the insurer's active Clinical Policy Bulletins (CPBs) with full visual screenshot proof, evaluates criteria across a deterministic four-pillar rubric, and synthesizes cited, court-ready appeal dossiers for human review and autonomous dispatch.

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

To evaluate the complete end-to-end pipeline without uploading personal health records:

1. Open the [Production Deployment](https://kindhearted-elephant-992.convex.site) and sign in.
2. Click **Ingest Denial** (or press `Cmd+K` / `Ctrl+K`) and choose **Try demo case (synthetic)**.
3. Select a synthetic HIPAA Safe Harbor evaluation fixture:
   - **Cigna Global — Knee Arthroscopy & Meniscectomy**: $6,400 | CPT 29881 | CARC CO-50 (Medical Necessity)
   - **GeoBlue Worldwide — Lumbar Decompression**: $18,200 | CPT 63047 | CARC CO-197 (Pre-Authorization)
   - **Aetna International — Diagnostic Knee MRI**: $2,850 | CPT 73721 | CARC CO-16 (Prior Records Required)
4. The application transitions directly into the **Case Workspace**, driving through the linear 3-step appellate spine:
   - **Step 1: Evidence & CPB** — Review real insurer policy bulletins scraped via Firecrawl, visual proof screenshot exhibits, and the deterministic 4-pillar overturn likelihood score.
   - **Step 2: Appeal Brief** — Inspect the grounded legal brief strictly citing stored policy clauses; test real-time CRDT multi-user editing with live presence (`Share` button).
   - **Step 3: Payer Dispatch** — Transmit the packet via AgentMail with one click. For medical necessity denials (`CO-50`), review the contextual Physician Peer-to-Peer tele-script.
5. Track the statutory stakes at all times: the case header monitors the active **ERISA §502(c) statutory liability exposure ($110/day)** alongside a slide-out **Audit Trail** drawer proving real-time pipeline execution.

*Synthetic cases are strictly isolated from real portfolio analytics and can be purged at any time via the "Clear demo data" button.*

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
│ Header: [Case Context] • [$110/day ERISA §502(c) Liability Clock] • [Slide-out Audit Trail] │
├───────────────────────────────┬───────────────────────────────┬─────────────────────────────┤
│ Step 1: Evidence & CPB        │ Step 2: Appeal Brief          │ Step 3: Payer Dispatch      │
│ • Firecrawl Live Policy Crawl │ • Grounded Synthesis (OpenAI) │ • AgentMail Two-Way Gateway │
│ • Visual Screenshot Exhibits  │ • Verifiable Clause Citations │ • Inbound Webhook Triage    │
│ • Neutral Benchmarks (PubMed) │ • Yjs CRDT Real-Time Collab   │ • Contextual P2P Script     │
│ • 4-Pillar Overturn Score     │ • Formal PDF Dossier Export   │ • Auto-Pilot 1-Hour SLA     │
└───────────────────────────────┴───────────────────────────────┴─────────────────────────────┘
```

---

## The Four Sponsor Pillars — Full Architectural Depth

### 1. Convex — Central System of Record & Reactive Backend Engine
Convex serves as the core persistence, real-time subscription, compute, and orchestration layer:
- **Reactive State & Live Subscriptions**: Claims, clinical evidence, appeal versions, audit timelines, and communication threads update reactively across the entire UI without manual polling (`convex/schema.ts`).
- **Durable Workflow Engine**: Multi-step pipeline execution (`@convex-dev/workflow`) powers reliable, idempotent background orchestration across crawls, scoring, and drafting (`convex/actions/sentinelPipeline.ts`).
- **Vector Search Engine**: 1536-dimensional vector search on the `precedents` table powers semantic precedent retrieval against past won appeals (`convex/clinicalEvidences.ts`).
- **Transactional Consistency**: Atomic mutations govern claim creation, evidence persistence, status transitions, and cascading purges to eliminate orphan records.
- **Crons & Scheduled Actions**: Automated crons sweep statutory 180-day ERISA deadlines, track pending payer replies, and run the Sentinel Auto-Pilot 1-Hour SLA (`convex/crons.ts`).
- **File Storage**: Native Convex storage securely hosts uploaded denial documents and compiled appeal PDF dossiers.
- **Live Presence & CRDT Collaboration**: The `@convex-dev/presence` component tracks live teammates per appeal room while a Yjs operation log (`appealYjsUpdates`) merges concurrent brief edits keystroke-by-keystroke (`convex/claimCollaborators.ts`, `convex/appealYjs.ts`).
- **Portfolio Analytics via Aggregate**: The `@convex-dev/aggregate` component computes real-time portfolio recovery statistics, payer overturn percentages, and aggregate financial yields.
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
- **Adversarial Insurer Adjudicator**: Evaluates counter-moves (partial settlements, RFI demands, denials upheld) to prove complete closed-loop autonomous communication in end-to-end demonstrations.

### 4. OpenAI — Multi-Modal Clinical Intake & Grounded Synthesis
OpenAI powers clinical reasoning while operating within strict anti-hallucination boundaries:
- **Vision OCR Denial Parser**: Extracts structured CPT/HCPCS, ICD-10, CARC/RARC codes, disputed amounts, and payer contact info from raw denial documents (`convex/actions/opticalParser.ts`).
- **Grounded Brief Synthesis**: Synthesizes formal appeals using strictly human-confirmed clinical facts and stored policy clauses; fabricated policy text is prohibited by schema contracts (`convex/actions/appealSynthesizer.ts`).
- **P2P Defense Studio & Live Copilot**: Generates physician tele-scripts with trap-question counterarguments, real-time pushback cards, and live speech-to-text call summarization (`convex/actions/p2pLiveCopilot.ts`).
- **Sentinel Case Copilot**: Grounded assistant powered by `@convex-dev/agent` with 6 dedicated inspection tools to query active claims, evidence clauses, and statutory audit trails on demand (`convex/actions/sentinelAgent.ts`).

---

## Convex Component Architecture

ClaimHero leverages 9 first-party and partner Convex components configured in [`convex/convex.config.ts`](./convex/convex.config.ts):

| Component | Package | Role in ClaimHero |
| :--- | :--- | :--- |
| **Auth** | `@convex-dev/auth` | User authentication via password, username, and Google OAuth |
| **AgentMail** | `@agentmail/convex` | Isolated transactional email dispatch and message management |
| **Firecrawl** | `@firecrawl/firecrawl-convex` | Dedicated component for web crawling and policy ingestion |
| **Workflow** | `@convex-dev/workflow` | Durable, step-based execution for long-running appeal pipelines |
| **Agent** | `@convex-dev/agent` | Component-backed agentic reasoning and case copilot tool coordination |
| **Aggregate** | `@convex-dev/aggregate` | High-performance reactive portfolio statistics and recovery metrics |
| **Rate Limiter** | `@convex-dev/rate-limiter` | Token bucket rate limiting for external model and crawler APIs |
| **Presence** | `@convex-dev/presence` | Live teammate tracking per appeal room (online status, editing activity) |
| **Static Hosting** | `@convex-dev/static-hosting` | Edge-hosted frontend distribution on `convex.site` |

---

## Trust, Privacy & Legal Architecture

- **HIPAA Safe Harbor Redaction Gate**: Mandatory server-side pre-submission de-identification (`redactBeforeLLM`) strips 18 direct identifiers (patient names, MRNs, SSNs, phone numbers, emails, addresses, dates of birth) across all textual prompt payloads, vector query embeddings, and Sentinel Copilot dialogs before dispatch to third-party LLM APIs (45 CFR § 164.514(b)(2)).
- **Multimodal Intake Architecture**: Binary PDF and image uploads bypass pre-OCR text redaction because optical recognition and layout classification precede entity discovery. In enterprise production environments with live health records, a signed HIPAA Business Associate Agreement (BAA) with OpenAI is required; evaluation deployments strictly use synthetic Safe Harbor fixtures.
- **Server-Side Authorization**: Every Convex query and mutation enforces strict document ownership (`claim.userId === authUser._id`) to prevent unauthorized cross-tenant data access (`convex/lib/auth.ts`).
- **Deterministic 4-Pillar Scoring**: Overturn probability is computed using an explainable mathematical formula (0–100 scale: 35% CPB Alignment, 25% Step-Therapy, 20% ERISA, 20% Precedents), never an opaque hallucinated number (`convex/actions/precedentMatcher.ts`).
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

ClaimHero is backed by **835 automated tests** across 51 test suites (verified via `npm run test`):

```bash
npm run typecheck       # Strict TypeScript typechecking (0 errors)
npm run lint            # ESLint static code analysis (0 warnings)
npm run test            # Comprehensive Vitest test suite (835 tests)
npm run test:coverage   # Code coverage report (~81.4% lines)
npm run build           # Production bundle compilation
npm run verify          # Full automated local verification gate
```

Test suites cover the master durable workflow pipeline, Convex authorization and ownership isolation, case collaboration invites with editor/viewer roles, Yjs CRDT transport (clocks, seeds, snapshots, purges) and cursor-merge primitives, OpenAI structured outputs and embeddings, Firecrawl policy selection, AgentMail component integration and webhook signatures, ERISA deadline calculations, appeal versioning, redaction, storage cleanup, prompt-injection defenses, P2P workflows, and synthetic demo isolation.

---

## Project Structure

```text
ClaimHero/
├── convex/
│   ├── schema.ts              # 20 domain tables, relational indexes, vector index
│   ├── convex.config.ts       # 9 Convex components configuration
│   ├── claims.ts              # Claim lifecycle, deadlines, analytics
│   ├── claimCollaborators.ts  # Case sharing invites with editor/viewer roles
│   ├── appealYjs.ts           # Yjs CRDT op-log transport (sync, push, snapshots)
│   ├── presence.ts            # Live teammate presence per appeal room
│   ├── clinicalEvidences.ts   # Evidence persistence and vector retrieval
│   ├── appeals.ts             # Versioned briefs and escalation
│   ├── emails.ts              # Threads, messages, and routing
│   ├── auditLogs.ts           # Case audit trail & statutory timeline
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
| **2. Creativity & Usefulness** | Practical domain innovation | Unifies policy discovery, visual proof, statutory ERISA penalties, and physician P2P defense into one linear 3-step workflow. |
| **3. Convex Depth** | Queries, mutations, crons, auth, components | Employs 9 Convex components, 20 domain tables, 1536-d vector indexes, durable workflows, scheduled crons, live presence, and a Yjs CRDT collaboration log. |
| **4. Sponsor Stack** | Active production work across sponsors | OpenAI extracts & synthesizes, Firecrawl discovers & screenshots CPBs, AgentMail handles bidirectional dispatch. |
| **5. Live URL** | Hosted on `convex.site` | Fully deployed and accessible on Convex Static Hosting. |
| **6. Video Demo** | Under 3 minutes, clicking through product | Concise walkthrough demonstrating ingestion, evidence discovery, scoring, brief drafting, and dispatch along the 3-step spine. |

---

## Responsible Use

ClaimHero is an appellate preparation and case coordination platform. It is not medical advice, legal advice, insurance advice, or a guarantee of payment. Users must verify clinical facts, review source policies, confirm recipient destinations, and make their own independent decisions before transmitting an appeal or acting on clinical or legal information.

---

## License

[MIT](./LICENSE)
