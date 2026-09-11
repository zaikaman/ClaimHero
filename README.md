# ClaimHero

## Autonomous Medical & Health Insurance Appeal Sentinel

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

ClaimHero is a daily operations workspace for the people who keep denied-care
appeals moving: patients, nurses, case managers, patient advocates, billing
teams, and payer-relations staff. A denial is not just a letter to answer once;
it creates a case that must be triaged, researched, explained, reviewed,
dispatched, and followed until the payer commits to an outcome.

The Case Radar gives a team one live portfolio view of those cases. The Case
Workspace gives each denial a repeatable, source-linked path from intake to
appeal. This makes ClaimHero useful for the next denial that arrives, and the
one after that, without requiring staff to rebuild the evidence trail from
scratch.

1. **Upload the denial.** Real PDF and image intake is supported. Synthetic demo fixtures are also available so a judge can test the complete workflow without uploading personal health information.
2. **ClaimHero pulls the insurer's active policy bulletins via Firecrawl** and lifts the exact clause the denial turned on.
3. **You review a cited brief**, one click away from the clause it cites, then approve dispatch from an AgentMail inbox. Claims under the ERISA §502(c) clock show the exposure as they age; you never send without approving.

### How a Case Spends Its Life

```text
denial letter
  ─▶  scanned, OCR'd, CARC code pulled (OpenAI vision)
  ─▶  insurer's CPB and the exact clause it cites (Firecrawl)
  ─▶  overturn likelihood, deterministic, no black box (4-pillar)
  ─▶  cited brief, with every claim bound to its clause
  ─▶  human approval gate
  ─▶  packet sent via AgentMail; insurer reply routed back in
```

### Try It in 60 Seconds

To evaluate the complete end-to-end pipeline without uploading personal health records:

1. Open the [Production Deployment](https://kindhearted-elephant-992.convex.site) and sign in.
2. Click **Ingest Denial** (or press `Cmd+K` / `Ctrl+K`) and choose **Try demo case**.
3. Select an evaluation fixture:
   - **Cigna Global — Knee Arthroscopy & Meniscectomy**: $6,400 | CPT 29881 | CARC CO-50 (Medical Necessity)
   - **GeoBlue Worldwide — Lumbar Decompression**: $18,200 | CPT 63047 | CARC CO-197 (Pre-Authorization)
   - **Aetna International — Diagnostic Knee MRI**: $2,850 | CPT 73721 | CARC CO-16 (Prior Records Required)
4. The application transitions directly into the **Case Workspace**, driving through the linear 3-step appellate spine:
   - **Step 1: Evidence & CPB** — Review real insurer policy bulletins scraped via Firecrawl, visual proof screenshot exhibits, and the deterministic 4-pillar overturn likelihood score.
   - **Step 2: Appeal Brief** — Inspect the grounded legal brief strictly citing stored policy clauses; test real-time CRDT multi-user editing with live presence (`Share` button).
   - **Step 3: Payer Dispatch** — Transmit the packet via AgentMail with one click. For medical necessity denials (`CO-50`), review the contextual Physician Peer-to-Peer tele-script.
5. Track the statutory stakes at all times: the case header monitors the active **ERISA §502(c) statutory liability exposure ($110/day)** alongside a slide-out **Audit Trail** drawer proving real-time pipeline execution.

*The demo cases are a privacy-preserving evaluation harness, not a substitute for the product workflow. They use the same intake, evidence, drafting, collaboration, deadline, audit, and dispatch path as a real case, are visibly marked as synthetic, are isolated from portfolio analytics, and can be purged at any time via the "Clear demo data" button.*

### Why this is an everyday app

ClaimHero is designed for recurring operational use, not only for a one-time
consumer emergency:

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
- **Multimodal Intake Architecture**: Binary PDF and image uploads bypass pre-OCR text redaction because optical recognition and layout classification precede entity discovery. In enterprise production environments with live health records, a signed HIPAA Business Associate Agreement (BAA) with OpenAI is required; evaluation deployments strictly use de-identified Safe Harbor fixtures.
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
npm run test            # Comprehensive Vitest test suite (835 tests across 51 suites)
npm run test:coverage   # Code coverage report (~81.3% lines)
npm run build           # Production bundle compilation
npm run verify          # Full automated local verification gate
```

Test suites cover the master durable workflow pipeline, Convex authorization and ownership isolation, case collaboration invites with editor/viewer roles, Yjs CRDT transport (clocks, seeds, snapshots, purges) and cursor-merge primitives, OpenAI structured outputs and embeddings, Firecrawl policy selection, AgentMail component integration and webhook signatures, ERISA deadline calculations, appeal versioning, redaction, storage cleanup, prompt-injection defenses, P2P workflows, and demo data isolation.

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

- **Everyday Apps**: If you got this in your mailbox today, this is the sequence you would want to see. No HIPAA-relevant front-end hurdles, no advocacy-degree onboarding. Fictional fixtures are for the evaluation; the exact same screen serves real cases once credentials are wired.
- **Creativity & Usefulness**: One linear path to a defensible cited appeal; the hard part (which clause actually governs the denial) is solved by reading the issuer's own policy, not an opinion of it.
- **Convex Depth**: 9 components, 20 tables, vector search on prior wins, crons for the ERISA clock, durable workflows, real-time collab on briefs, and authentication with human approval gates on every outbound send. The stack is documented in [`PRODUCT.md`](./PRODUCT.md) and [`convex/convex.config.ts`](./convex/convex.config.ts); this README is the public face.
- **Sponsor Stack**: Firecrawl finds the policy and screenshots the page as evidence; AgentMail does the two-way dispatch with a Svix-verified webhook and a closed-loop demo inbox; OpenAI extracts the codes and synthesizes the brief inside a redaction gate and a schema that prohibits fabricating policy text.

---

## Responsible Use

ClaimHero is an appellate preparation and case coordination platform. It is not medical advice, legal advice, insurance advice, or a guarantee of payment. Users must verify clinical facts, review source policies, confirm recipient destinations, and make their own independent decisions before transmitting an appeal or acting on clinical or legal information.

---

## License

[MIT](./LICENSE)
