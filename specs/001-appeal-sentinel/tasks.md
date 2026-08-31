# Tasks: Autonomous Medical Appeal Sentinel

**Input**: Design documents from `/specs/001-appeal-sentinel/`  
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`  

---

## Phase 1: Setup & Environment Initialization

**Purpose**: Initialize project repositories, build configurations, and styling design tokens.

- [X] T001 Initialize Vite React TypeScript project and configure dependencies (`convex`, `openai`, `@mendable/firecrawl-js`, `lucide-react`, `clsx`, `tailwind-merge`, `@radix-ui/react-dialog`, `@radix-ui/react-tabs`, `@radix-ui/react-tooltip`, `@radix-ui/react-dropdown-menu`, `canvas-confetti`) in `package.json`
- [X] T002 Configure Tailwind CSS with Precision Medical Dark-Mode theme tokens (`#0b0f17` canvas, `#00e5ff` cyan, `#10b981` emerald, `#f43f5e` crimson, `#f59e0b` amber) in `tailwind.config.js` and `src/index.css`
- [X] T003 [P] Configure TypeScript compiler options for strict end-to-end type safety in `tsconfig.json` and `tsconfig.node.json`
- [X] T004 [P] Configure Vite build settings, server proxy, and path aliases in `vite.config.ts`
- [X] T005 [P] Create environment variable configuration template and constants in `.env.example` and `src/lib/constants.ts`

---

## Phase 2: Foundational Infrastructure (Blocking Prerequisites)

**Purpose**: Core Convex database schema, unified OpenAI client, type definitions, and application layout shell.

- [X] T006 Define complete Convex database schema with tables (`patients`, `claims`, `clinicalEvidences`, `appeals`, `emailThreads`, `emailMessages`, `appealAuditLogs`) and relational indexes in `convex/schema.ts`
- [X] T007 Implement OpenAI client wrapper supporting `OPENAI_API_KEY`, `OPENAI_MODEL` (`gpt-5.4-nano`), and `OPENAI_BASE_URL` with structured output helpers in `convex/lib/openai.ts`
- [X] T008 [P] Implement core domain TypeScript interfaces and type definitions in `src/types/index.ts`
- [X] T009 [P] Implement UI styling utilities, badge helpers, and currency/date formatters in `src/lib/utils.ts`
- [X] T010 [P] Implement audit logging mutations and query helpers in `convex/auditLogs.ts`
- [X] T011 Setup React application root with `ConvexProvider` and base shell layout in `src/main.tsx` and `src/components/layout/Shell.tsx`
- [X] T012 [P] Implement Top Navigation Header with live statistics and ingestion trigger button in `src/components/layout/Header.tsx`
- [X] T013 [P] Implement Sidebar Navigation with status filtering in `src/components/layout/Sidebar.tsx`

**Checkpoint**: Foundational database schema and UI shell ready. User story implementation can proceed.

---

## Phase 3: User Story 1 - Denial Document Ingestion & Optical Extraction (Priority: P1) - MVP

**Goal**: Ingest real denial letters/EOBs via direct upload, text paste, or email, extract metadata using `gpt-5.4-nano` Vision/Structured Outputs, and create reactive claim cases.

**Independent Test**: Upload a real denial letter PDF or paste raw text and verify that a new claim is created in the dashboard with extracted CPT codes, denial reason codes, denied amounts, and patient liability.

- [X] T014 [P] [US1] Implement patient & claim creation and query mutations in `convex/claims.ts`
- [X] T015 [US1] Implement optical extraction action using `gpt-5.4-nano` with `DenialExtractionResult` schema in `convex/actions/opticalParser.ts`
- [X] T016 [P] [US1] Implement real-time claim subscription hook in `src/hooks/useClaims.ts`
- [X] T017 [P] [US1] Implement Live Case Ingestion Radar feed showing incoming claim status in `src/components/radar/CaseRadar.tsx`
- [X] T018 [US1] Implement Drag-and-Drop Denial Upload, Text Parser, & Email Forwarding modal in `src/components/radar/IngestionModal.tsx`
- [X] T019 [US1] Integrate IngestionModal with Convex File Storage and `opticalParser` action in `src/App.tsx`

**Checkpoint**: User Story 1 functional — users can upload real denial documents and see parsed claims appear in real time.

---

## Phase 4: User Story 2 - Clinical Policy Bulletin (CPB) Evidence Crawling & Precedent Matching (Priority: P2)

**Goal**: Crawl insurer CPBs live via Firecrawl (with clinical guideline fallback) and use `gpt-5.4-nano` to cross-examine criteria and compute Overturn Probability Score.

**Independent Test**: Trigger policy analysis on an ingested claim; verify that matching insurer policy clauses and clinical citations are displayed in a side-by-side policy matrix alongside an Overturn Probability Score.

- [X] T020 [P] [US2] Implement evidence persistence queries and mutations in `convex/clinicalEvidences.ts`
- [X] T021 [US2] Implement Firecrawl scraper action with resilient clinical guideline fallback in `convex/actions/policyCrawler.ts`
- [X] T022 [US2] Implement clinical precedent evaluation and Overturn Probability scoring action using `gpt-5.4-nano` in `convex/actions/precedentMatcher.ts`
- [X] T023 [P] [US2] Implement side-by-side Denial vs Insurer CPB inspector in `src/components/evidence/EvidenceMatrix.tsx`
- [X] T024 [P] [US2] Implement CPB Clause & Medical Criteria Viewer with highlighted contradictions in `src/components/evidence/PolicyViewer.tsx`
- [X] T025 [US2] Implement Precedent Feed displaying historical winning cases in `src/components/evidence/PrecedentFeed.tsx`

**Checkpoint**: User Stories 1 and 2 functional — claims now have automated clinical policy evidence and win scoring.

---

## Phase 5: User Story 3 - Cited Appeal Brief Synthesis & Collaborative Appeal Studio (Priority: P3)

**Goal**: Synthesize multi-page medical appeal briefs citing ERISA 29 CFR § 2560.503-1 and CPB clauses using `gpt-5.4-nano`, and provide a real-time collaborative Appeal Studio.

**Independent Test**: Open an assembled appeal brief in the studio, insert an additional clinical study reference or physician note, and verify that the formatted document updates in real time with intact legal citations.

- [X] T026 [P] [US3] Implement appeal brief queries and draft auto-save mutations in `convex/appeals.ts`
- [X] T027 [US3] Implement cited appeal brief generation action using `gpt-5.4-nano` in `convex/actions/appealSynthesizer.ts`
- [X] T028 [P] [US3] Implement live studio state management hook in `src/hooks/useAppealStudio.ts`
- [X] T029 [US3] Implement Collaborative Live Appeal Studio document editor in `src/components/studio/AppealStudio.tsx`
- [X] T030 [P] [US3] Implement Citation & Evidence Footnote Sidebar in `src/components/studio/CitationSidebar.tsx`
- [X] T031 [US3] Implement PDF Dossier Preview & Export Drawer in `src/components/studio/ExportDrawer.tsx`

**Checkpoint**: User Stories 1, 2, and 3 functional — complete appeal dossier generation and live editing enabled.

---

## Phase 6: User Story 4 - Statutory Deadline Countdown & Autonomous Dispatch Engine (Priority: P4)

**Goal**: Track ERISA/state statutory appeal deadlines with countdown alarms and autonomously transmit appeal dossiers via AgentMail with complete audit logs.

**Independent Test**: Finalize an appeal brief, confirm dispatch, verify transmission to payer grievance address, check active countdown dial, and inspect the audit trail.

- [X] T032 [P] [US4] Implement scheduled statutory deadline daily sweep cron in `convex/crons.ts`
- [X] T033 [US4] Implement AgentMail outbound dispatch action with attachment bundling in `convex/actions/mailDispatcher.ts`
- [X] T034 [P] [US4] Implement email thread and message query/mutation handlers in `convex/emails.ts`
- [X] T035 [US4] Implement Convex HTTP webhook endpoint for inbound AgentMail events in `convex/http.ts`
- [X] T036 [P] [US4] Implement Dynamic Statutory Deadline Countdown dial in `src/components/radar/DeadlineCountdown.tsx`
- [X] T037 [P] [US4] Implement Dedicated Claim Inbox & Message Drawer in `src/components/communications/AgentMailDrawer.tsx`
- [X] T038 [US4] Implement Chronological Case Audit Timeline in `src/components/communications/AuditTimeline.tsx`

**Checkpoint**: User Stories 1-4 functional — automated statutory countdowns, two-way email communications, and dispatch active.

---

## Phase 7: User Story 5 - Real-time Case Analytics, Win Probability Dashboard & Audit Timeline (Priority: P5)

**Goal**: Provide portfolio-wide financial recovery metrics, win likelihood distributions, statutory alarm aggregation, and immutable case audit tracking computed dynamically on Convex.

**Independent Test**: Ingest multiple claims and verify that the portfolio metrics, win score distribution, and audit trail update reactively with zero hardcoded numbers.

- [X] T039 [US5] Implement portfolio financial aggregation query and statutory deadline health metrics in `convex/claims.ts`
- [X] T040 [US5] Implement portfolio analytics panel with win likelihood distribution in `src/components/analytics/AnalyticsMetrics.tsx`
- [X] T041 [US5] Connect real-time analytics view into navigation sidebar and workspace in `src/App.tsx`

**Checkpoint**: All 5 user stories complete — application provides end-to-end real data workflow from ingestion to dispatch and analytics.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Automated validation, test suite, and final aesthetic refinement.

- [X] T042 [P] Implement end-to-end unit and domain integration test suite in `tests/claimhero.test.ts`
- [X] T043 [P] Perform static typechecking and lint validation across full codebase (`npm run verify`)
- [X] T044 Optimize responsive UI layout, dark-mode animations, and glassmorphism in `src/index.css` and `src/App.tsx`
- [X] T045 Verify live Firecrawl crawler and AgentMail webhook configuration in `.env.example`
- [X] T046 Validate complete setup and execution against `specs/001-appeal-sentinel/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — executes immediately.
- **Foundational (Phase 2)**: Depends on Phase 1 — BLOCKS all user stories.
- **User Story 1 (Phase 3 - P1 MVP)**: Depends on Phase 2 completion.
- **User Story 2 (Phase 4 - P2)**: Depends on Phase 3 completion (requires claim data from US1).
- **User Story 3 (Phase 5 - P3)**: Depends on Phase 4 completion (requires clinical evidence from US2).
- **User Story 4 (Phase 6 - P4)**: Depends on Phase 5 completion (requires appeal draft from US3).
- **User Story 5 (Phase 7 - P5)**: Aggregates real-time portfolio metrics across all preceding user stories.
- **Polish (Phase 8)**: Depends on all user stories being complete.

---

## Implementation Strategy

### MVP First (User Story 1 Only)
1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational Schema & Shell
3. Complete Phase 3: User Story 1 (Real Denial Ingestion & Extraction)
4. Validate User Story 1 independently with real file upload or text paste

### Incremental Feature Delivery
1. Add User Story 2 &rarr; Live CPB policy crawler & Overturn Probability score calculation
2. Add User Story 3 &rarr; Cited appeal brief synthesis & live collaborative studio
3. Add User Story 4 &rarr; Statutory deadline alarm cron & AgentMail dispatch
4. Add User Story 5 &rarr; Real-time portfolio analytics & audit timeline
5. Execute Polish & Testing &rarr; Verification via `npm run verify`
