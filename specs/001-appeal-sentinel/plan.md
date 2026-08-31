# Implementation Plan: Autonomous Medical Appeal Sentinel

**Branch**: `main` | **Date**: 2026-08-26 | **Spec**: [specs/001-appeal-sentinel/spec.md](file:///d:/ClaimHero/specs/001-appeal-sentinel/spec.md)  
**Input**: Feature specification from `/specs/001-appeal-sentinel/spec.md`

---

## Summary

Build **ClaimHero**, an autonomous medical and health insurance appeal sentinel that levels the healthcare reimbursement playing field for patients and providers. The system ingests medical claim denial letters and Explanation of Benefits (EOB) documents via direct file upload (PDF/Image), pasted text, or dedicated claim email inboxes (AgentMail). It parses clinical codes and disputed amounts using OpenAI Vision and Structured JSON powered by `gpt-5.4-nano`, crawls insurer Clinical Policy Bulletins (CPBs) live using Firecrawl, cross-matches precedents and calculates win probability via clinical reasoning, and synthesizes legally airtight, ERISA-cited appeal briefs within an interactive, real-time collaborative Appeal Studio. All data, crons, and live subscriptions are managed reactively via Convex with zero mock or fake data.

---

## Technical Context

- **Language/Version**: TypeScript 5.x, Node.js 20+
- **Primary Dependencies**: 
  - Backend: `convex` (Reactive DB, Actions, Crons, File Storage)
  - Intelligence: `openai` (Structured JSON outputs, Vision parsing, `gpt-5.4-nano` reasoning engine)
  - External Data & Scraping: `@mendable/firecrawl-js` / Firecrawl REST API (Insurer CPB & clinical guidelines scraper)
  - Email Communications: AgentMail REST API (Autonomous dedicated claim inboxes and outbound transmission)
  - Frontend: `react`, `react-dom`, `vite`, `tailwindcss`, `lucide-react`, `clsx`, `tailwind-merge`, `@radix-ui/react-*`
- **Storage**: Convex reactive database + Convex File Storage (for denial PDF attachments and generated appeal dossiers)
- **Testing & Quality**: Vitest (`npm test`), ESLint (`npm run lint`), TypeScript strict check (`npm run typecheck`), `npm run verify`
- **Target Platform**: Modern Desktop/Tablet Web Browsers, hosted via Convex static hosting (`convex.site`)
- **Project Type**: Full-stack Reactive Web Application (Unified Convex Backend + React TypeScript Frontend)
- **Performance Goals**: Sub-50ms reactive UI state updates, Sub-200ms query reads, <1.2s First Contentful Paint.
- **Constraints**: 
  - Zero mock or placeholder code in production pathways; all data derived from real user inputs and live API integrations.
  - Strict HIPAA-conscious data handling and sanitization.
  - Unified OpenAI client configured via 3 explicit environment variables (`OPENAI_API_KEY`, `OPENAI_MODEL=gpt-5.4-nano`, `OPENAI_BASE_URL`).
  - Resilient fallbacks for external crawling and email delivery.
- **Scale/Scope**: 5 prioritized user journeys (Ingestion & Parsing, Evidence Crawling & Precedent Matching, Appeal Brief Synthesis in Studio, Statutory Deadline Countdown & Dispatch, Real-Time Case Analytics & Audit Timeline).

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle / Standard | Status | Compliance Evidence |
|---|---|---|
| **I. Code Quality & Strict Type Safety** | PASS | 100% TypeScript coverage with end-to-end Convex validators (`v.string()`, `v.id()`, etc.), OpenAI structured JSON schemas, and zero mock/placeholder implementations. |
| **II. Rigorous Testing Standards** | PASS | Multi-tier testing hierarchy defined in `data-model.md` and `contracts/`, including automated Vitest unit tests and `npm run verify` CI script. |
| **III. UX Consistency & "Precision Medical Dark-Mode"** | PASS | Design tokens codified (`#0b0f17` canvas, `#00e5ff` cyan, `#10b981` emerald, `#f43f5e` crimson, `#f59e0b` amber) with zero-latency reactive Convex subscriptions (`useQuery`). |
| **IV. High-Throughput & Low-Latency Performance** | PASS | Decoupled non-blocking asynchronous actions for Firecrawl and `gpt-5.4-nano`, sub-50ms reactive mutations, and optimized relational indexing. |
| **V. Security, Data Privacy & HIPAA Guardrails** | PASS | File storage isolation, encrypted credential management via env variables, and immutable audit logging (`appealAuditLogs`). |
| **VI. Development Workflow & Governance** | PASS | Single-branch workflow on `main`, continuous build logging in `hackathon.md`, and Vietnamese communication / English technical assets rule enforcement. |

---

## Project Structure

### Documentation (this feature)

```text
specs/001-appeal-sentinel/
├── spec.md              # Feature specification
├── plan.md              # Implementation plan (this file)
├── research.md          # Technology decisions and architectural analysis
├── data-model.md        # Reactive schema, relational indexes, and vector configurations
├── quickstart.md        # Local development setup & test execution guide
├── contracts/
│   ├── convex-api.md    # API signatures for queries, mutations, and actions
│   └── llm-schemas.md   # OpenAI Structured Outputs schemas for clinical extraction & briefs
└── tasks.md             # Actionable dependency-ordered implementation tasks
```

### Source Code Organization

```text
convex/
├── schema.ts                    # 7-table Convex reactive database schema
├── lib/
│   └── openai.ts                # Unified OpenAI client wrapper (gpt-5.4-nano, 3 env vars)
├── claims.ts                    # Queries & mutations for claims intake & status management
├── clinicalEvidences.ts         # Queries & mutations for CPB evidence & precedent citations
├── appeals.ts                   # Queries & mutations for multi-section appeal brief drafts
├── emails.ts                    # Queries & mutations for AgentMail inbox correspondence
├── auditLogs.ts                 # Queries & mutations for immutable case audit trail
├── actions/
│   ├── opticalParser.ts         # OpenAI Vision & EOB metadata extraction action
│   ├── policyCrawler.ts         # Firecrawl CPB / FDA / PubMed evidence ingestion action
│   ├── precedentMatcher.ts      # Clinical reasoning and Overturn Probability scoring action
│   ├── appealSynthesizer.ts     # OpenAI cited medical & ERISA appeal brief generator action
│   └── mailDispatcher.ts        # AgentMail outbound dossier transmission action
├── crons.ts                     # Scheduled statutory deadline alarms (ERISA / DOI countdowns)
└── http.ts                      # Convex HTTP action webhook endpoints (AgentMail inbound)

src/
├── components/
│   ├── layout/
│   │   ├── Header.tsx           # Top navigation bar with live real-time pipeline metrics
│   │   ├── Sidebar.tsx          # Case navigator with statutory status filters
│   │   └── Shell.tsx            # Main application shell with medical dark-mode styling
│   ├── radar/
│   │   ├── CaseRadar.tsx        # Real-time claim feed with optical parsing status
│   │   └── IngestionModal.tsx   # Direct file upload, text paste, & email forwarding modal
│   ├── evidence/
│   │   ├── EvidenceMatrix.tsx   # Side-by-side Denial vs Insurer CPB inspector
│   │   ├── PolicyViewer.tsx     # Highlighted CPB clauses with medical necessity criteria
│   │   └── PrecedentFeed.tsx    # Matching overturned case templates with similarity score
│   ├── studio/
│   │   ├── AppealStudio.tsx     # Collaborative document editor with live preview
│   │   ├── CitationSidebar.tsx  # Dynamic legal/medical footnote and CPB clause inserter
│   │   └── ExportDrawer.tsx     # PDF preview & dispatch approval modal
│   ├── communications/
│   │   ├── AgentMailDrawer.tsx  # Dedicated claim inbox feed (outbound & inbound replies)
│   │   └── AuditTimeline.tsx    # Chronological case audit trail
│   └── analytics/
│       └── AnalyticsMetrics.tsx # Portfolio financial metrics and statutory alarm charts
├── hooks/
│   ├── useClaims.ts             # Reactive claim subscriptions & filters
│   ├── useAppealStudio.ts       # Studio state management & auto-save
│   └── useDeadlineAlarm.ts      # Real-time countdown & statutory alert calculation
├── lib/
│   ├── utils.ts                 # Formatting, class merging, currency, date helpers
│   ├── constants.ts             # Insurer names, denial codes, ERISA statutory rules
│   ├── openai.ts                # OpenAI client initialization helper (using 3 env vars)
│   └── theme.ts                 # Precision Medical Dark-Mode color tokens
├── types/
│   └── index.ts                 # TypeScript domain interfaces
├── App.tsx                      # Root reactive application component
├── main.tsx                     # React application entry point with ConvexProvider
└── index.css                    # Tailwind CSS + Precision Medical Dark-Mode custom utilities
```

---

## Complexity Tracking

*No unjustified complexity violations identified. Architecture uses standard Convex idioms and direct API client orchestration.*

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| None | N/A | N/A |
