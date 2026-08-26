# Quickstart: ClaimHero (Autonomous Medical Appeal Sentinel)

**Feature**: `001-appeal-sentinel`  
**Date**: 2026-08-26  
**Status**: In Progress  

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

# 4. AgentMail (Autonomous Claim Inboxes & Dispatches)
AGENTMAIL_API_KEY=am_your_agentmail_api_key
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

## 3. Real Claim Ingestion & End-to-End Workflow

1. Open the ClaimHero dashboard at `http://localhost:5173`.
2. Click **"+ Ingest Denial Document"**.
3. Choose your ingestion method:
   - **Upload PDF / Image File**: Select a real insurance denial letter PDF or Explanation of Benefits image from your device.
   - **Paste Document Text**: Paste raw denial letter or EOB text directly into the text area.
   - **AgentMail Forwarding**: Forward denial emails directly to `intake@claimhero.agentmail.com`.
4. Click **"Run Optical Parser"** / **"Process Text with OpenAI"**.
5. Watch `gpt-5-nano` extract CPT codes (e.g. 27447), denial reason codes (e.g. CO-50), denied dollar amounts, and statutory ERISA appeal deadlines directly into Convex Cloud DB.
6. The created claim immediately appears in the real-time **Case Ingestion Radar Feed** with live statutory countdown tracking.

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
