# ClaimHero

## Turn an insurance denial into a cited appeal before the deadline

ClaimHero is a source-grounded appeal workspace for patients, family advocates,
and denial coordinators.

It takes a denial letter, finds the insurer's own policy, identifies missing
evidence, drafts a cited appeal, and keeps the case moving until a human
approves the final transmission.

<p align="center">
  <a href="https://kindhearted-elephant-992.convex.site"><strong>Open the live app</strong></a>
  &nbsp; · &nbsp;
  <a href="https://www.youtube.com/watch?v=wLW_ZL093a8"><strong>Watch the 3-minute demo</strong></a>
  &nbsp; · &nbsp;
  <a href="./hackathon.md"><strong>Read the build log</strong></a>
</p>

Built for the **Convex All Gas Hackathon** with **Convex**, **Firecrawl**,
**OpenAI**, and **AgentMail**.

## The problem

An insurance denial is not just a letter. It is a time-sensitive research and
coordination problem:

- What exactly was denied?
- Which insurer policy clause governs the decision?
- What clinical or procedural evidence is missing?
- Who should receive the appeal, and by when?
- What happens when the payer replies or asks for more records?

ClaimHero turns those questions into one traceable workflow. The product is
designed for a real case that arrived in someone's mailbox yesterday, while
remaining safe to evaluate with synthetic demo cases.

## Try it in 60 seconds

1. Open the [live app](https://kindhearted-elephant-992.convex.site).
2. Choose **Explore as Anonymous Advocate**.
3. Open the **Eleanor Vance** case.
4. Follow **Your proof → Your letter → Send & track**.
5. Inspect the citations, evidence score, audit trail, and approval-gated
   dispatch screen.

The seeded cases are synthetic and visibly labelled. They exercise the same
case, evidence, drafting, deadline, audit, and AgentMail surfaces used by real
cases. To try the intake path, choose **Ingest Denial** and upload a PDF/image
or paste denial text.

## The core user journey

```text
Denial letter
    ↓
Extract facts and deadline
    ↓
Find and archive the insurer's current policy
    ↓
Compare policy requirements with clinical evidence
    ↓
Retrieve relevant precedents and calculate evidence coverage
    ↓
Draft an editable, cited appeal
    ↓
Human review and approval
    ↓
Send through AgentMail and track payer replies
```

### 1. Your proof

Upload a denial, paste its text, or open a demo case. ClaimHero extracts the
procedure, denial reason, amount at stake, relevant codes, and appeal deadline.
Digital PDFs are parsed in the browser; scanned documents can use local OCR.

The evidence workspace shows the denial language, the insurer's policy clause,
supporting documentation, missing proof, and disagreements between sources.

### 2. Your letter

ClaimHero drafts an editable appeal from stored case facts and inspectable
citations. Every important claim is tied back to a policy, clinical, statutory,
or precedent source instead of being presented as unsupported model output.

### 3. Send & track

An advocate chooses the recipient, reviews the letter and exhibits, and
explicitly approves transmission. AgentMail sends the packet through a verified
payer route or a typed-in test address. Replies are routed back to the same
case, and delivery evidence, deadlines, and follow-up drafts remain together.

**AI may prepare, classify, cite, and recommend. A human approves every
outbound message.**

## Evidence coverage, not outcome prediction

ClaimHero's 0–100 **Evidence Coverage & Precedent Match Score** is a readiness
checklist, not a prediction that an appeal will win. It evaluates four separate
pillars:

| Pillar | Weight | What it checks |
| --- | ---: | --- |
| CPB and indication alignment | 35 | Whether the case facts satisfy the insurer's published clinical policy |
| Clinical documentation and step therapy | 25 | Imaging, examination findings, and prior treatment evidence |
| ERISA procedural standing | 20 | Disclosure, notice, and appeal-process requirements |
| Precedent match and legal parity | 20 | Similarity, procedure/denial-code overlap, and outcome strength |

The score is intentionally conservative. Retrieved precedents flow directly
from the vector search into the scoring engine; absent precedents cannot be
replaced by a generic evidence count. If live policy or precedent evidence is
unavailable, the case becomes `provisional_capped`, is capped at 40, and must be
explicitly acknowledged by a human before dispatch.

## Why this is more than an AI letter generator

ClaimHero is a reactive case system, not a prompt wrapped in a form:

- **Case Radar** gives advocates a live portfolio view of deadlines, evidence,
  financial impact, and appeal status.
- **Evidence Workspace** preserves source clauses, screenshots, research, and
  missing-evidence explanations.
- **Appeal Studio** renders and edits the cited brief while saving versions.
- **Communications** keeps AgentMail threads, payer replies, attachments, and
  human-approved follow-ups on the claim.
- **Audit and deadline surfaces** record lifecycle events, anchor statutory filing
  clocks strictly to adverse determination dates rather than intake timestamps,
  enforce dual-clock statutory timing (ERISA 180-day internal appeal, ACA 45 CFR § 147.136 4-month external review, and state 30-day expedited clocks across CA/TX/NY),
  and drive sub-second reactive countdown alarms without artificial zero-clamping.
- **Simple Mode / Expert Details** lets a patient start in everyday language
  while an advocate can reveal CPT, CARC, ERISA, source, and audit details.

## Convex is the system of record

Convex is used for the data model, authorization, realtime UI, background work,
storage, search, scheduling, collaboration, and AI-agent state.

| Convex capability | Role in ClaimHero |
| --- | --- |
| Reactive queries and mutations | Live claims, evidence, appeals, audit events, drift reports, and messages |
| Durable workflows | Multi-step crawling, evidence extraction, scoring, drafting, and review checkpoints |
| Auth and document-level authorization | User ownership, claim collaborators, editor/viewer roles, and tenant isolation |
| Native full-text search | Portfolio search and command palette discovery |
| Vector search | Precedent retrieval using OpenAI embeddings on the `precedents` table |
| File storage | Denial documents, attachments, and compiled appeal dossiers |
| Crons and scheduled functions | Deadline sweeps, mailbox reconciliation, drift checks, and storage cleanup |
| Presence and collaboration | Live teammates and Yjs-based appeal editing transport |
| Aggregate | Reactive portfolio recovery and resolution statistics |
| Rate limiter | Protection for model and crawler calls |
| HTTP actions | Signed AgentMail and Firecrawl webhook handling |

The app configures nine components in [`convex/convex.config.ts`](./convex/convex.config.ts):
Auth, AgentMail, Firecrawl, Workflow, Agent, Aggregate, Rate Limiter, Presence,
and Static Hosting.

## Sponsor integrations do real work

### Firecrawl: policy discovery and evidence collection

Firecrawl maps insurer domains, finds clinical policy bulletins, scrapes the
relevant pages, and captures source material for inspection. It also supports
policy drift checks, payer intake-route discovery, and supplementary research
across clinical sources. The result is persisted in Convex rather than shown as
an ephemeral chatbot answer.

Key implementation: [`convex/actions/policyCrawler.ts`](./convex/actions/policyCrawler.ts),
[`convex/actions/payerContactResolver.ts`](./convex/actions/payerContactResolver.ts),
and [`convex/actions/policyDriftSentinel.ts`](./convex/actions/policyDriftSentinel.ts).

### OpenAI: structured extraction, retrieval, and drafting

OpenAI extracts structured facts from de-identified text, embeds precedent
queries, and drafts the prose portions of the appeal through the
`@convex-dev/agent` component. Deterministic code owns statutory notices,
citations, score calculations, and final assembly so the model cannot invent a
policy clause and quietly pass it off as source material.

Key implementation: [`convex/actions/appealSynthesizer.ts`](./convex/actions/appealSynthesizer.ts),
[`convex/lib/agentDraft.ts`](./convex/lib/agentDraft.ts), and
[`convex/lib/openai.ts`](./convex/lib/openai.ts).

### AgentMail: two-way correspondence, not a fake send button

AgentMail sends approved appeal packets, records delivery identifiers, receives
payer replies through signed webhooks, and routes those replies back to the
correct claim. Responses can be classified as an overturn/settlement, partial
settlement, request for additional records, or upheld denial; follow-up drafts
still require human approval.

Key implementation: [`convex/actions/mailDispatcher.ts`](./convex/actions/mailDispatcher.ts),
[`convex/actions/agentMail.ts`](./convex/actions/agentMail.ts), and
[`convex/http.ts`](./convex/http.ts).

## Judge's evidence map

| What to verify | Where to look |
| --- | --- |
| Authenticated case ownership and collaborator roles | [`convex/lib/auth.ts`](./convex/lib/auth.ts), [`convex/claimCollaborators.ts`](./convex/claimCollaborators.ts) |
| Claim lifecycle, deadlines, and portfolio data | [`convex/claims.ts`](./convex/claims.ts), [`convex/crons.ts`](./convex/crons.ts), [`convex/lib/dateUtils.ts`](./convex/lib/dateUtils.ts), [`src/hooks/useDeadlineAlarm.ts`](./src/hooks/useDeadlineAlarm.ts) |
| Schema, indexes, and vector search | [`convex/schema.ts`](./convex/schema.ts), [`convex/precedents.ts`](./convex/precedents.ts) |
| Durable pipeline and review checkpoints | [`convex/workflows.ts`](./convex/workflows.ts), [`convex/actions/sentinelPipeline.ts`](./convex/actions/sentinelPipeline.ts) |
| Explainable readiness scoring | [`convex/actions/precedentMatcher.ts`](./convex/actions/precedentMatcher.ts) |
| Cited appeal generation | [`convex/actions/appealSynthesizer.ts`](./convex/actions/appealSynthesizer.ts) |
| Two-way email and signed webhooks | [`convex/actions/mailDispatcher.ts`](./convex/actions/mailDispatcher.ts), [`convex/http.ts`](./convex/http.ts) |
| Live pipeline observability | [`convex/pipelineActivities.ts`](./convex/pipelineActivities.ts), [`src/components/communications/PipelineTimeline.tsx`](./src/components/communications/PipelineTimeline.tsx) |
| Realtime collaboration and presence | [`convex/appealYjs.ts`](./convex/appealYjs.ts), [`convex/presence.ts`](./convex/presence.ts) |
| Client OCR and PHI-safe intake | [`src/lib/clientOcr.ts`](./src/lib/clientOcr.ts), [`convex/actions/opticalParser.ts`](./convex/actions/opticalParser.ts) |

## Trust and responsible use

- Synthetic demo cases are visibly labelled and contain no real patient data.
- Digital PDF and image OCR run in the browser when possible, avoiding an
  unnecessary server round trip for raw documents.
- Text sent to third-party model providers passes through client/server
  redaction that removes direct identifiers.
- Human review is required before a clinical or legal assertion, recipient, or
  outbound message is transmitted.
- The score is an evidentiary completeness checklist, not medical advice, legal
  advice, a payment guarantee, or a calibrated approval probability.
- Statutory filing clocks anchor strictly to adverse determination dates rather than
  intake timestamps, never fabricate federal windows when unstated, and accurately preserve overdue days without artificial zero-clamping.

ClaimHero is intended to help people prepare and coordinate an appeal. Users
must verify clinical facts, policy sources, recipient destinations, and final
communications themselves.

## Local development

### Requirements

- Node.js 18+
- npm
- A Convex account
- OpenAI, Firecrawl, and AgentMail credentials for live integrations
- Optional AWS Textract credentials for advanced server-side table extraction

### Install and run

```bash
git clone https://github.com/zaikaman/ClaimHero.git
cd ClaimHero
npm install
```

Copy variables from [`.env.example`](./.env.example). Store provider secrets in
the Convex deployment with `npx convex env set`.

Start the backend and frontend in separate terminals:

```bash
# Terminal 1
npx convex dev

# Terminal 2
npm run dev
```

### Verification

```bash
npm run typecheck       # Strict TypeScript checks
npm run lint            # ESLint
npm run test            # Vitest suite
npm run test:coverage   # Coverage report
npm run build           # Production bundle
npm run verify          # Full local verification gate
```

The repository includes 1,274 automated tests across 81 suites, covering the
Convex workflows, authorization boundaries, OCR/redaction, vault-tokenized
PHI-safe LLM boundaries, Firecrawl and AgentMail integrations, precedent
scoring, honest degradation floor gating (preventing unearned statutory baseline score inflation and hardcoded code match forcing), honest workflow crawl failure halting without fake boilerplate ERISA filler, precision policy drift heuristics without false-positive step-therapy triggers, live crawler outage error handling preventing clean masking, adverse determination letter denial date anchoring, evidentiary and statutory matcher grounding, safe auto-reply addendum generation gating (prohibiting ungrounded clinical necessity assertions and phantom diagnostics), canonical 4-pillar appeal readiness vs un-capped evidence coverage validation (with complete replacement of stale outcome-predictive overturn probability scores across demo fixtures, portfolio aggregations, and action contracts), audit chains, denial-anchored statutory deadlines, dual-clock statutory timing (ERISA 180-day internal appeals, ACA 45 CFR § 147.136 4-month external reviews, and state 30-day expedited clocks across CA/TX/NY),
collaboration, provisional evidence gating, secondary dispatch review boundaries, payer reply keyword classification and settlement provenance tracking, post-resolution adverse action reopening, out-of-network balance billing No Surprises Act protections, 2024 DOL inflation-adjusted penalty calculations ($164/day under 29 CFR § 2575.502c-1) with state prompt-pay interest and dynamic Lodestar fees, non-fabricated financial defaults and truthful statutory document demand placeholders (29 CFR § 2560.503-1(h)(2)(iii)), non-negative [0, 1] cosine similarity clamping and normalized precedent scores, mandatory same-specialty reviewer credential citations (29 CFR § 2560.503-1(h)(3)(ii)–(iii)) and ERISA § 514(a) preemption enforcement in Level 3 briefs, advanced workflow status preservation and graceful pipeline timeout handling, HIPAA Safe Harbor export masking shields, transactional password recovery via AgentMail gateway with rate-limited OTP token buckets, anti-enumeration security, truthful recipient resolution across communication inboxes and quick follow-up composers (reflecting typed-in test destinations over production fallbacks), executive clinical light-mode responsive email templates with bulletproof client centering, anti-squatting account takeover defense across password and OAuth registrations, 300-second strict timestamp freshness and raw-byte Svix webhook verification, storage IDOR prevention across claim attachments, appeals, evidence, and messages with indexed table lookups, viewer bearer URL suppression, and compound-indexed collaborator grant access.

## Project structure

```text
ClaimHero/
├── convex/
│   ├── schema.ts              # Domain tables, indexes, and vector search
│   ├── convex.config.ts       # Convex component configuration
│   ├── claims.ts              # Claim lifecycle, deadlines, analytics
│   ├── appeals.ts             # Versioned appeal briefs and escalation
│   ├── clinicalEvidences.ts   # Evidence persistence and retrieval
│   ├── emails.ts              # Threads, messages, and routing
│   ├── auditLogs.ts           # Audit trail and statutory timeline
│   ├── workflows.ts           # Durable pipeline orchestration
│   ├── crons.ts               # Deadline and reconciliation schedules
│   ├── lib/                   # Auth, redaction, crypto, agents, rate limits
│   └── actions/               # OpenAI, Firecrawl, AgentMail, and pipeline work
├── src/                       # React application and reactive hooks
├── tests/                     # Unit, integration, security, and workflow tests
├── PRODUCT.md                 # Product contract and behavior
├── BRIEF.md                   # Hackathon brief
└── hackathon.md               # Chronological build evidence
```

## Submission links

- **Live app:** https://kindhearted-elephant-992.convex.site
- **Demo video:** https://www.youtube.com/watch?v=wLW_ZL093a8
- **Repository:** https://github.com/zaikaman/ClaimHero
- **Build log:** [`hackathon.md`](./hackathon.md)
- **Product contract:** [`PRODUCT.md`](./PRODUCT.md)
- **Hackathon brief:** [`BRIEF.md`](./BRIEF.md)

## License

[MIT](./LICENSE)