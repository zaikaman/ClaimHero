# Quickstart: ClaimHero (Autonomous Medical Appeal Sentinel)

**Feature**: `001-appeal-sentinel`  
**Date**: 2026-08-26  
**Status**: Completed & Production-Ready  

---

## 1. Prerequisites & Environment Setup

### Required Tools
- Node.js 20+ / npm 10+
- Git

### Environment Variables
Configure the following in `.env.local` for the Vite frontend and Convex backend:

```env
# 1. Convex Backend Deployment
CONVEX_DEPLOYMENT=dev:groovy-hippopotamus-924
VITE_CONVEX_URL=https://groovy-hippopotamus-924.convex.cloud

# 2. OpenAI AI Client (3 Core Variables)
OPENAI_API_KEY=sk-proj-your-openai-api-key
OPENAI_MODEL=gpt-5-nano
OPENAI_BASE_URL=https://api.openai.com/v1

# 3. Firecrawl (Insurer Policy Crawler)
FIRECRAWL_API_KEY=fc-your-firecrawl-api-key

# 4. AgentMail (Shared App Inboxes & Dispatches)
AGENTMAIL_API_KEY=am_your_agentmail_api_key
# Create these two inboxes once in AgentMail. Claims are routed by claim number in Convex.
AGENTMAIL_SENDER_INBOX_ID=your_sender_inbox_id
AGENTMAIL_SENDER_EMAIL=claimhero-sender@agentmail.to
AGENTMAIL_ADJUDICATOR_INBOX_ID=your_adjudicator_inbox_id
AGENTMAIL_ADJUDICATOR_EMAIL=claimhero-adjudicator@agentmail.to
```

---

## 2. Installation & Running Locally

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Launch Convex Development Server
In your first terminal:
```bash
npx convex dev
```

### Step 3: Launch Vite React Frontend
In your second terminal:
```bash
npm run dev
```
Open your browser at `http://localhost:5173`.

---

## 3. End-to-End Real Data Workflow

1. **Ingest Denial Document**: Click **"+ Ingest Denial Document"** (use 1-Click Judge Sample Presets, upload real PDF/Image, or paste raw EOB text). `gpt-5-nano` extracts clinical codes into Convex DB.
2. **Inspect Clinical Policy Evidence**: Switch to the **Evidence Matrix** tab, click **"Crawl Insurer CPB"** (Firecrawl) and **"Calculate Win Score"** to cross-examine insurer policies and compute the Overturn Probability Score.
3. **Collaborative Appeal Studio**: Open the **Appeal Studio**, click **"Synthesize Brief"** to generate a comprehensive multi-page ERISA legal brief citing 29 CFR § 2560.503-1, insert physician notes, and preview the export dossier.
4. **Autonomous AgentMail Dispatch**: Switch to the **AgentMail Inbox** tab or click **"Proceed to Dispatch"**. The brief is sent from the shared sender inbox to the shared AI-adjudicator inbox, while each claim keeps its own Convex correspondence thread. Configure one AgentMail `message.received` webhook on the shared sender inbox at the public `/agentmail-webhook` endpoint to receive external replies. The default `agentmail.to` addresses work without a custom domain.
5. **Portfolio Recovery Analytics**: View the **Portfolio Analytics** dashboard to track total disputed pipeline, recovered funds, overturn rates, and insurer accountability metrics.
6. **Immutable Audit Trail**: Inspect the **Case Audit Log** to view every chronological event recorded cryptographically in Convex.

---

## 4. Verification & Continuous Validation

Run the complete verification pipeline at any time:
```bash
npm run verify
```
This runs in sequence:
- `npm run typecheck` (`tsc --noEmit`)
- `npm run lint` (`eslint src convex`)
- `npm run test` (`vitest run tests`)
- `npm run build` (`vite build`)
