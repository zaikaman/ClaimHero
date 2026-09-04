# ClaimHero

## Turn an insurance denial into an evidence-backed appeal

ClaimHero helps patients, families, providers, and advocates respond to health-insurance denials before the deadline runs out. It reads the denial, checks the payer's current medical-necessity policy, shows the evidence for and against an appeal, and prepares a cited packet for human review.

> **A denial is not the end of the story. It is a deadline, an argument, and a set of sources that can be checked.**

<p align="center">
  <a href="https://kindhearted-elephant-992.convex.site"><strong>Open the live app</strong></a>
  &nbsp; · &nbsp;
  <a href="https://www.youtube.com/watch?v=wLW_ZL093a8"><strong>Watch the 3-minute demo</strong></a>
  &nbsp; · &nbsp;
  <a href="./hackathon.md"><strong>Read the build log</strong></a>
</p>

ClaimHero was built for the **Convex All Gas Hackathon** using Convex, OpenAI, Firecrawl, and AgentMail.

## The product in one case

The fastest way to understand ClaimHero is to run one denial all the way through the system:

1. Ingest a denial notice as a PDF, image, or pasted text.
2. Extract the payer, procedure, denial reason, amount, and appeal deadline with OpenAI Vision and Structured Outputs.
3. Find the payer's current Clinical Policy Bulletin and relevant neutral clinical authorities with Firecrawl.
4. Compare the denial against the exact policy clauses in the Evidence Matrix.
5. Calculate an explainable, deterministic overturn score from the evidence.
6. Generate a cited appeal brief using only the extracted facts and stored sources.
7. Review the message, choose a verified destination, and approve the send.
8. Track the deadline, delivery, reply, and next action in a live Convex case timeline.

The judge-facing demo uses synthetic HIPAA-safe fixtures as inputs, but the pipeline is live: extraction, crawling, scoring, synthesis, persistence, and email dispatch are real. Synthetic input is clearly labeled; it is not presented as a real patient's case.

## Try the demo

Open the [production app](https://kindhearted-elephant-992.convex.site), sign in, and choose **Quick Ingest**. Select one of the synthetic fixtures:

- **GeoBlue Worldwide — Knee Arthroscopy & Meniscectomy**: $6,400, CPT 29881, CO-50
- **GeoBlue Worldwide — Lumbar Decompression**: $18,200, CPT 63047, CO-197
- **BCBS Global Core — Diagnostic Knee MRI**: $2,850, CPT 73721, CO-16

Then choose **Run Autonomous Pipeline** and follow the stepper:

`Evidence & CPB` → `Defense Suite` → `Payer Dispatch`

The important moment is not the score by itself. It is the chain behind it: the denial field, the payer clause, the clinical source, the rule result, and the exact citation in the draft.

For a communication-only proof, ClaimHero also supports a labeled evaluation inbox and a custom test recipient. The evaluation path is simulated and does not contact a real payer. Initial appeal dispatch is approval-gated; any configured auto-reply behavior is bounded by the stored case state and can be disabled.

## Why this matters

Insurance denials force people to do difficult research under pressure. The relevant rule may be buried in a long payer bulletin, the appeal window may be closing, and a generic letter may not address the reason for denial.

ClaimHero focuses the work into three questions:

1. **What exactly was denied?**
2. **What does the payer's own current policy require?**
3. **Can the user review and send a specific, source-linked response in time?**

ClaimHero is not a payer, law firm, clinician, or government service. It does not guarantee coverage, overturn a denial, or replace medical or legal advice. It is an evidence and workflow tool that keeps its sources, assumptions, uncertainty, and approvals visible.

## What ClaimHero does

### Evidence before persuasion

The Evidence Matrix puts the denial beside the payer's policy and related clinical sources. Firecrawl retrieves live pages and documents; the system filters irrelevant results, windows large documents around the relevant procedure, and stores the clauses used by the appeal.

### Grounded drafting

The Appeal Studio creates a versioned, editable brief with citations back to stored evidence. OpenAI helps extract and organize information, but the system does not allow the model to invent a policy paragraph or silently turn an unsupported claim into a fact.

### Explainable scoring

The overturn score is a deterministic four-pillar rubric. Each pillar has a visible reason and evidence trail. Weak or missing evidence lowers confidence instead of being hidden behind a fluent explanation.

### Deadline-aware case management

Convex scheduled functions sweep statutory deadlines and surface urgent cases. The case timeline records ingestion, evidence acquisition, scoring, drafting, approval, transmission, replies, and escalation as separate events.

### Human-controlled communication

AgentMail provides programmatic payer communication and inbound reply handling. ClaimHero keeps recipient provenance visible, supports official payer gateways where available, and requires review before a real appeal is sent. Replies are classified into outcomes such as approval, additional records required, or upheld denial, then reflected in the case in real time.

## The focused workflow, plus the defense suite

The core product is the denial-to-cited-appeal path. The surrounding tools make that appeal more useful in practice:

| Surface | Purpose |
| --- | --- |
| Case Radar | See every claim, status, deadline, payer, and amount in one reactive workspace. |
| Evidence Matrix | Inspect the denial beside live payer and clinical evidence. |
| Appeal Studio | Edit a versioned brief with source-linked citations and statutory rights notices. |
| P2P Defense Studio | Prepare a physician-facing peer-to-peer call script and rebuttal cards. |
| P2P Live Copilot | Support a live peer-to-peer call with speech input, prompts, and a post-call summary. |
| ERISA calculator | Estimate deadline-related and failure-to-disclose exposure with explicit assumptions. |
| Dossier binder | Export a structured, printable packet with exhibits and an evidence index. |
| Payer Communications | Review recipients, send approved messages, and follow the reply thread. |
| Portfolio Analytics | Track disputed amounts, deadlines, outcomes, and payer patterns. |

These surfaces share the same claim, evidence, appeal, communication, and audit records. They are not separate mock demonstrations.

## How the sponsor stack does real work

| Sponsor | In ClaimHero |
| --- | --- |
| **Convex** | The system of record and compute layer: authenticated queries, mutations, actions, scheduled functions, crons, file storage, indexes, vector search, HTTP routing, reactive subscriptions, and immutable audit records. |
| **OpenAI** | Vision and structured denial extraction, clinical intake, grounded appeal synthesis, embeddings for precedent retrieval, reply classification, and constrained copilot assistance. |
| **Firecrawl** | Live search and scraping of payer Clinical Policy Bulletins, CMS and specialty-society sources, PubMed/FDA research, relevance filtering, and large-document extraction. |
| **AgentMail** | Programmatic payer inboxes, signed inbound webhooks, threaded outbound appeals, delivery state, and structured reply handling. |

The important boundary is intentional: OpenAI extracts, retrieves, and drafts; deterministic application code controls ownership, evidence eligibility, score calculation, recipient selection, and send authorization.

## Architecture at a glance

```text
PDF / image / pasted denial / inbound email
                    |
                    v
       Convex Storage + authenticated case
                    |
                    v
       OpenAI Vision + Structured Extraction
                    |
                    v
     Firecrawl payer policy and clinical sources
                    |
                    v
       Convex evidence records and vector index
                    |
                    v
       Deterministic four-pillar evaluation
                    |
                    v
       OpenAI grounded appeal brief generation
                    |
                    v
      Human approval -> AgentMail transmission
                    |
                    v
      Signed reply webhook -> live case timeline
```

## Why Convex is central

ClaimHero is not a static AI wrapper with a hosted frontend. The application state lives in Convex and drives the interface reactively:

- Claims, patients, evidence, appeal versions, email threads, messages, settings, and audit events are persisted in Convex tables.
- User and claim ownership checks run at the data and action boundaries.
- Queries power live Case Radar, Evidence Matrix, Appeal Studio, communications, analytics, and audit views.
- Mutations make state transitions, draft saves, approvals, and audit events transactional.
- Actions isolate OpenAI, Firecrawl, and AgentMail side effects.
- Scheduled functions sweep deadlines, reconcile communication state, and run bounded follow-up work.
- Full-text and vector indexes support policy and precedent retrieval.
- Convex File Storage holds denial documents and generated exports with cleanup paths.

Relevant entry points include [`convex/schema.ts`](./convex/schema.ts), [`convex/claims.ts`](./convex/claims.ts), [`convex/actions/sentinelPipeline.ts`](./convex/actions/sentinelPipeline.ts), [`convex/actions/policyCrawler.ts`](./convex/actions/policyCrawler.ts), [`convex/actions/appealSynthesizer.ts`](./convex/actions/appealSynthesizer.ts), and [`convex/actions/mailDispatcher.ts`](./convex/actions/mailDispatcher.ts).

## Safety and privacy boundaries

ClaimHero handles sensitive subject matter, so safety is part of the product rather than a footnote:

- Demo fixtures are explicitly marked and isolated from portfolio analytics.
- Server-side ownership checks protect claims, evidence, communications, settings, and AI tool calls.
- Uploaded documents and outbound attachments have size and MIME-type limits.
- A deterministic redaction layer removes configured patient identifiers before external model calls.
- External links and payer destinations are validated before use.
- AgentMail webhooks require signature verification and idempotent message handling.
- Initial real transmission records the recipient, approval, payload, and thread state; bounded follow-up automation is separately tracked.
- Failed delivery does not look like a successful appeal.
- The app distinguishes evidence, model output, uncertainty, and user-confirmed facts.

For the full design constraints, see [`PRODUCT.md`](./PRODUCT.md), [`specs/001-appeal-sentinel/`](./specs/001-appeal-sentinel/), and the security-focused tests under [`tests/`](./tests/).

## Local development

### Requirements

- Node.js 18+
- npm
- A Convex account
- OpenAI, Firecrawl, and AgentMail credentials for live integrations

### Install and run

```bash
git clone https://github.com/zaikaman/ClaimHero.git
cd ClaimHero
npm install

# Terminal 1: start Convex and generate the local deployment
npx convex dev

# Terminal 2: start the Vite frontend
npm run dev
```

Copy the variable names from [`.env.example`](./.env.example). Keep provider credentials in Convex deployment environment variables; do not put secrets in `VITE_*` variables or commit `.env.local`.

For a full production-style configuration, set the Convex Auth, OpenAI, Firecrawl, and AgentMail variables described in `.env.example`. The AgentMail webhook route is `/agentmail/webhook` (with legacy compatibility preserved at `/agentmail-webhook`).

## Verification

```bash
npm run typecheck
npm run lint
npm run test
npm run test:coverage
npm run build

# Runs the complete local gate
npm run verify
```

The current repository verification record is **452/452 tests passing** across 31 suites, with strict typechecking, linting, coverage, and a production Vite build. The suites cover the master pipeline, Convex authorization and ownership isolation, OpenAI structured outputs and embeddings, Firecrawl policy selection, AgentMail component integration and webhook signatures, deadline calculations, appeal versioning, redaction, storage cleanup, prompt-injection defenses, P2P workflows, and demo isolation.

The build log records the command, commit, and affected files for each milestone: [`hackathon.md`](./hackathon.md).

## Project structure

```text
ClaimHero/
├── convex/
│   ├── schema.ts              # Tables, indexes, full-text and vector indexes
│   ├── claims.ts              # Claim lifecycle, deadlines, analytics
│   ├── clinicalEvidences.ts   # Evidence persistence and retrieval
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

## Hackathon submission

- **Live app:** https://kindhearted-elephant-992.convex.site
- **Demo video:** https://www.youtube.com/watch?v=wLW_ZL093a8
- **Repository:** https://github.com/zaikaman/ClaimHero
- **Build log:** [`hackathon.md`](./hackathon.md)
- **Hackathon brief:** [`BRIEF.md`](./BRIEF.md)

### How ClaimHero maps to the judging criteria

| Criterion | ClaimHero's answer |
| --- | --- |
| Everyday app | A patient, family member, provider, or advocate can use it when a denial and deadline are real. |
| Creativity and usefulness | It turns payer policy, clinical evidence, deadlines, and correspondence into one accountable workflow. |
| Convex depth | Convex owns the reactive case ledger, transactions, auth, storage, indexes, schedules, HTTP routes, and audit trail. |
| Sponsor stack | OpenAI extracts and drafts, Firecrawl finds live evidence, and AgentMail sends and receives the appeal thread. |
| Live URL | The judge-facing app is deployed on Convex Static Hosting. |
| Video demo | The demo follows one denial from intake to evidence to cited appeal and approved dispatch. |

## Responsible use

ClaimHero is a prototype for appeal preparation and case coordination. It is not medical advice, legal advice, insurance advice, or a guarantee of payment. Users must verify facts, review sources, confirm destinations, and make their own decisions before sending an appeal or acting on clinical or legal information.

## License

[MIT](./LICENSE)
