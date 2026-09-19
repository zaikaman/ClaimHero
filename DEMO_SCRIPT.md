# ClaimHero Demo Script

**Target runtime:** 2 minutes 55 seconds

**Primary demo path:** Google sign-in → Case Radar → Ingest Denial → Confirm Case Context & Records → live Sentinel Pipeline → Evidence & CPB → Appeal Brief → Payer Dispatch.

## Recording preparation

- Use a Google account created for the demo and click **Continue with Google**.
- Switch the interface toggle from **Simple** to **Details on** so judges can see CPT, CPB, ERISA, and pipeline terminology.
- In the intake modal, use the **Try demo case (synthetic)** tab and choose one of the three fixtures. These synthetic cases still run live extraction, crawling, and scoring; do not use real patient data.
- Stop at the human approval gate unless you are using a controlled test recipient. The button is **Approve & Transmit to Official Gateway**.
- Keep the anonymous seeded workspace as the fallback: **Explore as Anonymous Advocate** → an existing synthetic case.

## 0:00–0:25 — Start with the human problem

**On screen:** Begin on the ClaimHero landing page, then briefly show a synthetic denial notice or the login surface.

**Voiceover:**

“Yesterday, a family received a denial for an important procedure. The insurer says it was not medically necessary. Now they need the rule, the missing evidence, the right destination, and the deadline — all in one place. That is what ClaimHero is built for.”

## 0:25–0:38 — Sign in and frame the product

**On screen:** ClaimHero login page. Click **Continue with Google**, land on **Case Radar**, then switch the toggle from **Simple** to **Details on**.

**Voiceover:**

“ClaimHero works in two modes. Simple keeps the language clear for patients and families; Details puts the codes, policy, and ERISA context in front of advocates and denial teams. I’m switching to Details for this demo.”

## 0:38–0:58 — Start a controlled live case

**On screen:** On Case Radar, click **Ingest Denial**. In the modal, open **Try demo case (synthetic)** and select one of the three demo presets.

**Voiceover:**

“For a repeatable demo, I’ll choose a synthetic preset. It is safe to show, but the extraction, policy crawl, scoring, and drafting are live.”

## 0:58–1:18 — Confirm the facts

**On screen:** Review **Confirm Case Context & Records**. Show the extracted case facts and clinical context, then click **Save Context & Open Workspace**.

**Voiceover:**

“I check the extracted facts and clinical context, confirm they come from the records, and continue.”

## 1:18–1:48 — Watch the live pipeline

**On screen:** After saving, the modal closes and the app opens **Evidence & CPB**. Show the **Live agent activity** card as events arrive.

**Voiceover:**

“The Sentinel Pipeline is now running. The live feed shows policy search, scoring, past cases, and brief drafting as they happen. Firecrawl finds the policy, OpenAI helps extract and draft, and Convex keeps the case updated.”

## 1:48–2:13 — Evidence & CPB

**On screen:** Stay on **1. Evidence & CPB**. Show the denial language, insurer policy clause, clinical evidence, missing proof, citations, and readiness score.

**Voiceover:**

“Here I can see exactly why the claim was denied, which part of the insurer’s policy applies, what the records support, and what is still missing. The score is just a readiness check; it does not predict the result.”

## 2:13–2:38 — Appeal Brief

**On screen:** Click **2. Appeal Brief**. Show the generated brief, **Markdown source**, formatted preview, and citation sidebar.

**Voiceover:**

“Next is the **Appeal Brief**. It is editable, versioned, and sourced. I can inspect the Markdown, preview the letter, and review citations before anything goes out.”

## 2:38–2:50 — Payer Dispatch and the human gate

**On screen:** Click **3. Payer Dispatch**. Show **Payer Communications Inbox**, recipient, exhibits, delivery channel, and **Human Review Mandatory**.

**Voiceover:**

“Finally, **Payer Dispatch** shows the recipient, exhibits, delivery channel, and the **Human Review Mandatory** gate. The advocate reviews everything before **Approve & Transmit to Official Gateway**.”

## 2:50–2:58 — Show the system around the letter

**On screen:** Open **Audit Trail** or **History** and briefly show the deadline clock, pipeline history, and case events.

**Voiceover:**

“The letter is only one part of the case. The deadline, source trail, pipeline history, and tamper-proof log stay attached to it.”

## 2:58–3:00 — Close

**On screen:** Return to Case Radar with the case status visible.

**Voiceover:**

“ClaimHero turns a denial into a live, reviewable appeal workflow.”
