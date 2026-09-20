import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateFormalAppealPdf, ensureAppealPdfStored } from "../convex/lib/pdfGenerator";
import * as pdfGenerator from "../convex/lib/pdfGenerator";
import * as agentMailLib from "../convex/lib/agentMail";
import * as openaiLib from "../convex/lib/openai";
import * as authLib from "../convex/lib/auth";
import * as emailsModule from "../convex/emails";
import { rateLimiter } from "../convex/lib/rateLimiter";
import { api, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { dispatchAppealPacket } from "../convex/actions/mailDispatcher";
import { processInboundClaimReply } from "../convex/actions/agentMail";

describe("Formal PDF Appeal Packet Attachments (Outbound & Inbound)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AGENTMAIL_API_KEY = "test_agentmail_key";
    process.env.AGENTMAIL_SENDER_INBOX_ID = "inbox_sender";
    process.env.AGENTMAIL_SENDER_EMAIL = "claimhero-sender@agentmail.to";
  });

  describe("PDF Generation Engine (convex/lib/pdfGenerator)", () => {
    it("compiles a valid standards-compliant PDF 1.4 binary buffer", () => {
      const buffer = generateFormalAppealPdf({
        claimNumber: "CH-89210",
        patientName: "Jane Doe",
        memberId: "MEM-9921",
        insurancePayer: "Aetna Life Insurance",
        serviceDate: "2026-08-15",
        deniedAmount: 18500,
        denialReason: "CO-50 - Not Medically Necessary",
        appealMarkdown: [
          "# Formal Appeal Brief",
          "This is a formal statutory appeal for Claim #CH-89210.",
          "## Clinical Necessity",
          "- Patient underwent emergency surgical arthroplasty after severe trauma.",
          "- Peer-reviewed AAOS guidelines mandate immediate operative intervention.",
          "### Legal Grounds",
          "Under ERISA 29 U.S.C. § 1133 and 29 C.F.R. § 2560.503-1, full and fair review is required.",
        ].join("\n"),
        providerName: "Memorial Regional Hospital",
        cptCodes: ["27447"],
        icd10Codes: ["M17.11"],
      });

      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBeGreaterThan(500);

      const pdfText = buffer.toString("binary");
      expect(pdfText.startsWith("%PDF-1.4")).toBe(true);
      expect(pdfText).toContain("/Type /Catalog");
      expect(pdfText).toContain("/Type /Pages");
      expect(pdfText).toContain("/Type /Font");
      expect(pdfText).toContain("/Helvetica");
      expect(pdfText).toContain("/Helvetica-Bold");
      expect(pdfText).toContain("CH-89210");
      expect(pdfText).toContain("Aetna Life Insurance");
      expect(pdfText).toContain("MEM-9921");
      expect(pdfText).toContain("27447");
      expect(pdfText).toContain("ERISA");
      expect(pdfText).toContain("%%EOF");
    });

    it("handles multi-page overflow and generates footers on all pages", () => {
      const longMarkdown = Array.from({ length: 80 }, (_, i) => `Paragraph line ${i + 1}: Substantive clinical discussion demonstrating medical necessity.`).join("\n\n");
      const buffer = generateFormalAppealPdf({
        claimNumber: "CH-MULTI",
        patientName: "John Smith",
        insurancePayer: "UnitedHealthcare",
        deniedAmount: 45000,
        appealMarkdown: longMarkdown,
      });

      const pdfText = buffer.toString("binary");
      expect(pdfText).toContain("/Type /Page");
      expect(pdfText).toContain("Page 1 of");
      expect(pdfText).toContain("%%EOF");
    });

    it("correctly advances vertical coordinates for multiline headings without overlapping following bullets", () => {
      const buffer = generateFormalAppealPdf({
        claimNumber: "CH-HEADING-TEST",
        patientName: "Jane Doe",
        insurancePayer: "Aetna",
        appealMarkdown: [
          "## Evidentiary Exhibits & Proof of Policy on Date of Service",
          "### Exhibit B: Proof of Policy on Date of Service - Clinical Policy for Laminectomy and Prior Authorization Requirements",
          "- Verified full-page visual capture recorded on 2026-09-05",
          "- Clinical coverage clause: Medical Necessity Criteria Sec. 1",
        ].join("\n"),
      });

      const pdfText = buffer.toString("binary");
      expect(pdfText).toContain("Exhibit B: Proof of Policy on Date of Service - Clinical Policy for");
      expect(pdfText).toContain("Laminectomy and Prior Authorization Requirements");
      expect(pdfText).toContain("- Verified full-page visual capture recorded on 2026-09-05");

      // Extract y coordinates for the second line of heading and the following bullet line
      const line2Regex = /45\s+([0-9.]+)\s+Td\s*\n\((Laminectomy and Prior Authorization Requirements)\)\s*Tj/;
      const bulletRegex = /53\s+([0-9.]+)\s+Td\s*\n\((- Verified full-page visual capture recorded on 2026-09-05)\)\s*Tj/;

      const line2Match = pdfText.match(line2Regex);
      const bulletMatch = pdfText.match(bulletRegex);

      expect(line2Match).toBeTruthy();
      expect(bulletMatch).toBeTruthy();

      const line2Y = parseFloat(line2Match![1]);
      const bulletY = parseFloat(bulletMatch![1]);

      // Bullet baseline MUST be positioned cleanly below heading line 2
      // Prior to the fix, line2Y - bulletY was only 4 pt, rendering the bullet directly on top of line 2.
      // With the fix, line2Y - bulletY is 18 pt (lineHeight 13 + marginBottom 5).
      expect(line2Y - bulletY).toBe(18);
    });

    it("ensureAppealPdfStored: reuses existing storage blob if available", async () => {
      const mockStorageBlob = new Blob([Buffer.from("%PDF-1.4 existing pdf content %%EOF")], { type: "application/pdf" });
      const mockCtx: any = {
        storage: {
          get: vi.fn().mockResolvedValue(mockStorageBlob),
          store: vi.fn(),
        },
        runMutation: vi.fn(),
      };

      const mockClaim: any = {
        _id: "claim_1",
        claimNumber: "CH-1234",
        patientName: "John Smith",
      };

      const mockAppeal: any = {
        _id: "appeal_1",
        pdfExportStorageId: "storage_existing_pdf",
        fullAppealMarkdown: "# Brief",
      };

      const res = await ensureAppealPdfStored(mockCtx, mockClaim, mockAppeal);
      expect(res.storageId).toBe("storage_existing_pdf");
      expect(mockCtx.storage.get).toHaveBeenCalledWith("storage_existing_pdf");
      expect(mockCtx.storage.store).not.toHaveBeenCalled();
    });

    it("ensureAppealPdfStored: generates, stores, and patches appeal when storageId is missing", async () => {
      const mockCtx: any = {
        storage: {
          get: vi.fn().mockResolvedValue(null),
          store: vi.fn().mockResolvedValue("storage_new_pdf"),
        },
        runMutation: vi.fn().mockResolvedValue(null),
      };

      const mockClaim: any = {
        _id: "claim_2",
        claimNumber: "CH-5678",
        patientName: "Alice Walker",
        insurancePayer: "Cigna",
        deniedAmount: 12000,
        denialReasonCode: "CO-16",
        denialReasonDescription: "Missing clinical notes",
      };

      const mockAppeal: any = {
        _id: "appeal_2",
        fullAppealMarkdown: "# Clinical Brief for Cigna",
      };

      const res = await ensureAppealPdfStored(mockCtx, mockClaim, mockAppeal);
      expect(res.storageId).toBe("storage_new_pdf");
      expect(mockCtx.storage.store).toHaveBeenCalled();
      expect(mockCtx.runMutation).toHaveBeenCalledWith(
        internal.appeals.updatePdfStorageIdInternal,
        {
          appealId: "appeal_2",
          pdfExportStorageId: "storage_new_pdf",
        }
      );
    });

    it("renders Case Adjudication table cleanly as a styled PDF grid with Date of Birth and clean citations", () => {
      const markdown = [
        "# Appeal of Adverse Benefit Determination",
        "**Claim reference:** #CLM-8942-CIG-3917",
        "",
        "### Case Adjudication & Dispute Summary",
        "",
        "| Parameter | Case Record Detail |",
        "| :--- | :--- |",
        "| **Patient / Member** | Eleanor Vance |",
        "| **Date of Birth** | April 14, 1968 |",
        "| **Member ID** | CIG-982341-01 |",
        "| **Claim Reference** | #CLM-8942-CIG-3917 |",
        "| **Date of Service** | June 12, 2026 |",
        "| **Procedure Code(s)** | 29881 |",
        "| **Diagnosis Code(s)** | M23.22 |",
        "| **Denial Code & Rationale** | CO-50 - Service denied as not medically necessary |",
        "| **Disputed Charges** | $6,400 |",
        "",
        "**Claim details**",
        "- Patient/member: Eleanor Vance",
        "- Member ID: CIG-982341-01",
        "- Date of birth: April 14, 1968",
        "- Date of service: June 12, 2026",
        "",
        "Dear Appeals and Grievances Team,",
        "",
        "I request reconsideration of the adverse benefit determination for Claim #CLM-8942-CIG-3917.",
        "",
        "## Supporting documentation for review",
        "- **Knee Surgery Guidelines** - Prior Authorization ([Official source](https://www.evicore.com/sites/default/files/clinical-guidelines/2026-04/Cigna_CMM-312%20Knee%20Surg%20Arthro%20Open%20Proc_V2.0.2025_Eff03.07.2026_upd04.14.2026.pdf)): Documented failure of conservative management.",
      ].join("\n");

      const buffer = generateFormalAppealPdf({
        claimNumber: "CLM-8942-CIG-3917",
        patientName: "Eleanor Vance",
        memberId: "CIG-982341-01",
        dateOfBirth: "1968-04-14",
        insurancePayer: "CIGNA GLOBAL HEALTH BENEFITS",
        serviceDate: "06/12/2026",
        deniedAmount: 6400,
        denialReason: "CO-50 - Service denied as not medically necessary",
        appealMarkdown: markdown,
        providerName: "Dr. Robert Langston, MD",
        cptCodes: ["29881"],
        icd10Codes: ["M23.22"],
      });

      const pdfText = buffer.toString("binary");
      expect(pdfText).toContain("April 14, 1968");
      expect(pdfText).toContain("CIG-982341-01");
      expect(pdfText).toContain("Case Adjudication & Dispute Summary");
      expect(pdfText).toContain("Patient / Member");
      expect(pdfText).toContain("Disputed Charges");
      expect(pdfText).not.toContain("/ :--- / :--- /");
      expect(pdfText).not.toContain("/ Parameter / Case Record Detail /");
      expect(pdfText).toContain("evicore.com");
      expect(pdfText).not.toContain("Cigna_CMM-312%20Knee%20Surg%20Arthro%20Open%20Proc_V2.0.2025_Eff03.07.2026_upd04.14.2026.pdf");
    });

    it("formats raw storage URLs cleanly and compiles full multi-section appeal into a balanced 4-page dossier without orphan pages", () => {
      const fullEleanorBrief = [
        "# Appeal of Adverse Benefit Determination",
        "**Claim reference:** #CLM-8942-CIG-9781",
        "",
        "### Case Adjudication & Dispute Summary",
        "",
        "| Parameter | Case Record Detail |",
        "| :--- | :--- |",
        "| **Patient / Member** | Eleanor Vance |",
        "| **Date of Birth** | April 14, 1968 |",
        "| **Member ID** | CIG-982341-01 |",
        "| **Claim Reference** | #CLM-8942-CIG-9781 |",
        "| **Date of Service** | June 12, 2026 |",
        "| **Procedure Code(s)** | 29881 |",
        "| **Diagnosis Code(s)** | M23.22 |",
        "| **Denial Code & Rationale** | CO-50 - Service denied as not medically necessary |",
        "| **Disputed Charges** | $6,400 |",
        "",
        "Dear Appeals and Grievances Team,",
        "",
        "I request reconsideration of the adverse benefit determination for Claim #CLM-8942-CIG-9781, relating to the service provided on June 12, 2026. The denial notice cites CO-50 — These are non-covered services because this is not deemed a medical necessity by the payer. Please review the submitted clinical records and applicable plan criteria and reprocess the claim if benefits are payable under the plan.",
        "",
        "## Clinical basis for reconsideration",
        "",
        "The following clinical summary and documented patient-specific findings are submitted in support of this reconsideration request:",
        "",
        "Symptoms and functional impact:",
        "> Patient exhibits persistent right knee medial joint line pain (7/10 VAS) with painful catching and true mechanical locking episodes during ambulation, severely impairing weight-bearing activities of daily living.",
        "",
        "Examination findings:",
        "> Distinct right medial joint line tenderness, positive McMurray test reproducing painful medial clicking, mild reactive effusion, and painful extension block at 5 degrees.",
        "",
        "Imaging and diagnostic findings:",
        "> High-resolution MRI of the right knee (05/10/2026) confirms a complex posterior horn medial meniscus tear extending to the inferior articular surface with localized parameniscal cyst formation.",
        "",
        "Treatment history and response:",
        "> Completed 8 consecutive weeks of formal outpatient physical therapy (2x/weekly, Feb-Apr 2026) with zero symptomatic relief, 3-month trial of oral meloxicam 15mg daily, and one image-guided intra-articular steroid injection (03/20/2026) yielding only 4 days of transient relief.",
        "",
        "Other documented facts:",
        "> Dr. Robert Langston, MD certified that non-operative modalities have failed and arthroscopic partial medial meniscectomy (CPT 29881) is medically necessary under Cigna Medical Coverage Policy 0066 to resolve mechanical locking and prevent chondral degradation.",
        "",
        "Additional clinical information supplied for review (treating clinician consultation note and attestation):",
        "> PATIENT: Eleanor Vance | DOB: 04/14/1968 | DOS: 06/12/2026",
        "> TREATING PHYSICIAN CLINICAL ATTESTATION & CONSERVATIVE THERAPY RECORD:",
        "> Patient Eleanor Vance is a 58-year-old female presenting with symptomatic right medial meniscus complex tear (ICD-10 M23.22) with recurrent mechanical knee locking, painful catching, and severe medial joint line tenderness.",
        "> CONSERVATIVE THERAPY MODALITIES COMPLETED & FAILED:",
        "> 1. Supervised Physical Therapy: Completed 8 consecutive weeks of formal outpatient physical therapy (2 sessions/week from 02/03/2026 through 04/07/2026 at Sunstate Rehabilitation; 16 total sessions completed). Therapy discharge summary demonstrates zero improvement in mechanical catching symptoms.",
        "> 2. Pharmacotherapy: 3-month trial of prescription Meloxicam (15 mg PO daily) with inadequate analgesic relief.",
        "> 3. Intra-articular Injections: Image-guided right knee corticosteroid injection (Triamcinolone 40 mg on 03/20/2026) yielding only 4 days of transient partial relief.",
        "",
        "CLINICAL NECESSITY DETERMINATION:",
        "Under Cigna Medical Coverage Policy 0066 (Knee Arthroscopy and Open Procedures), the patient has completed and failed all non-operative conservative management. Arthroscopic partial meniscectomy (CPT 29881) is medically necessary to resolve mechanical joint locking and prevent secondary articular cartilage damage.",
        "Attending Orthopedic Surgeon: Dr. Robert Langston, MD, FAAOS (Metropolitan Surgical Hospital)",
        "",
        "## Supporting documentation for review",
        "The following policy materials are identified as review references. They should be evaluated together with the patient-specific clinical records:",
        "- CIGNA Guidelines for Arthroscopic Surgery in Degenerative Knee Conditions - Medical Necessity Criteria Sec. 2 (Official source: https://pmc.ncbi.nlm.nih.gov/articles/PMC8673957): Failure of conservative management for a reasonable duration, typically at least 6 weeks.",
        "- CIGNA Guidelines for Arthroscopic Surgery in Degenerative Knee Conditions - Medical Necessity Criteria Sec. 1 (Official source: https://pmc.ncbi.nlm.nih.gov/articles/PMC8673957): Diagnosis of degenerative meniscal tear confirmed by clinical examination and imaging studies.",
        "- CIGNA Guidelines for Arthroscopic Surgery in Degenerative Knee Conditions - Prior Authorization (Official source: https://pmc.ncbi.nlm.nih.gov/articles/PMC8673957): Prior authorization is required for arthroscopy in cases of degenerative meniscal tear.",
        "- CIGNA Guidelines for Arthroscopic Surgery in Degenerative Knee Conditions - Contraindications (Official source: https://pmc.ncbi.nlm.nih.gov/articles/PMC8673957): Patients with concomitant severe osteoarthritis.",
        "- AAOS Guidelines on Knee Arthroscopy - 2: (Official source: https://pmc.ncbi.nlm.nih.gov/articles/PMC8673957): Arthroscopic partial meniscectomy can be used for the treatment of meniscal tears.",
        "",
        "## Evidentiary Exhibits & Proof of Policy on Date of Service",
        "Pursuant to ERISA 29 C.F.R. Sec. 2560.503-1(h)(2)(iii), claimant incorporates visual archive exhibits captured at the time of clinical verification to preserve active clinical policy bulletin metadata and document provenance against retrospective modifications:",
        "",
        "### Exhibit A: Proof of Policy on Date of Service - CIGNA Guidelines for Arthroscopic Surgery in Degenerative Knee Conditions",
        "- Verified policy bulletin visual capture recorded on 2026-09-19 (Source: https://pmc.ncbi.nlm.nih.gov/articles/PMC8673957/)",
        "- Document provenance: Preserves active clinical policy bulletin metadata (Document ID, effective date, and review history) on Date of Service against retrospective alterations.",
        "- Visual Proof Archive URL: https://peaceful-sparrow-520.convex.cloud/api/storage/4f529fb2-6f64-4544-bf46-43df382a401c",
        "",
        "## Review requested",
        "Please:",
        "1. Reconsider and reprocess Claim #CLM-8942-CIG-9781 under the applicable plan terms. If benefits are payable, please issue payment according to the plan and applicable provider agreement for the covered amount.",
        "2. If the denial is upheld, provide the specific clinical rationale, plan provision, criteria applied, and documents relied upon.",
        "3. Confirm receipt of this appeal and identify the applicable decision timeframe and any further review or external-review instructions.",
        "",
        "## Enclosures & Accompanying Clinical Documentation",
        "The following objective medical records and documentation are attached and incorporated by reference in support of this appeal:",
        "1. Pre-operative clinical consultation report and treating clinician attestation (DOS: June 12, 2026, Treating Provider: Dr. Robert Langston, MD)",
        "2. Diagnostic radiology and imaging reports confirming clinical meniscal/structural derangement",
        "3. Provider-directed conservative management records (including physical therapy progress logs and medication history)",
        "4. Original Explanation of Benefits (EOB) / Adverse Benefit Determination notice for Claim #CLM-8942-CIG-9781",
        "5. Date-of-service clinical policy bulletin visual archive exhibits",
        "",
        "Please process this appeal under the plan's claims and appeals procedure and the instructions in the denial notice.",
        "Thank you for your review. Please reference Claim #CLM-8942-CIG-9781 in any response.",
        "",
        "Sincerely,",
        "Jordan Lee",
        "Appeals Coordinator",
        "jordan.lee@orthoclinic.org",
        "(555) 234-8901",
        "Treating provider listed in the claim: Dr. Robert Langston, MD",
      ].join("\n");

      const buffer = generateFormalAppealPdf({
        claimNumber: "CLM-8942-CIG-9781",
        patientName: "Eleanor Vance",
        memberId: "CIG-982341-01",
        dateOfBirth: "1968-04-14",
        insurancePayer: "CIGNA GLOBAL HEALTH BENEFITS",
        serviceDate: "06/12/2026",
        deniedAmount: 6400,
        denialReason: "CO-50 - Service denied as not medically necessary",
        appealMarkdown: fullEleanorBrief,
        providerName: "Dr. Robert Langston, MD",
        cptCodes: ["29881"],
        icd10Codes: ["M23.22"],
      });

      const pdfText = buffer.toString("binary");
      expect(pdfText).toContain("Page 1 of 4");
      expect(pdfText).toContain("Page 4 of 4");
      expect(pdfText).not.toContain("Page 5 of");
      expect(pdfText).toContain("api/storage/4f529fb2...");
      expect(pdfText).not.toContain("-bf46-43df382a401c");
      expect(pdfText).toContain("PHYSICIAN & ADVOCATE ATTESTATION STATEMENT");
    });
  });

  describe("Outbound PDF Dossier Dispatch (convex/actions/mailDispatcher)", () => {
    it("attaches compiled PDF brief to outgoing AgentMail message and records attachment in db", async () => {
      vi.spyOn(rateLimiter, "limit").mockResolvedValue({ ok: true } as any);

      vi.spyOn(authLib, "requireClaimOwnerAction").mockResolvedValue({
        claim: {
          _id: "claim_outbound" as any,
          claimNumber: "CH-7788",
          patientName: "Robert Green",
          status: "ready_for_review",
          patient: { insurancePayer: "Blue Cross Blue Shield", name: "Robert Green" },
          deniedAmount: 25000,
          payerContact: { officialAppealsEmail: "appeals@bcbs.com" },
        } as any,
        userId: "user_test" as Id<"users">,
      });

      const mockPdfBuffer = Buffer.from("%PDF-1.4 mock pdf content %%EOF");
      vi.spyOn(pdfGenerator, "ensureAppealPdfStored").mockResolvedValue({
        storageId: "storage_pdf_brief" as any,
        buffer: mockPdfBuffer,
        filename: "Formal-Appeal-Packet-CH-7788.pdf",
      });

      const mockSend = vi.spyOn(agentMailLib, "sendAgentMailMessage").mockResolvedValue({
        messageId: "msg_outbound_123",
        threadId: "thread_agentmail_1",
      });

      const mockCtx: any = {
        runQuery: vi.fn().mockResolvedValue({
          _id: "appeal_outbound",
          claimId: "claim_outbound",
          isHumanApproved: true,
          fullAppealMarkdown: "# Outbound Brief",
          pdfExportStorageId: "storage_pdf_brief",
        }),
        runMutation: vi.fn().mockImplementation((fn: any) => {
          if (fn === internal.emails.getOrCreateThreadInternal) return "thread_db_1";
          return null;
        }),
        storage: {
          get: vi.fn(),
          store: vi.fn(),
        },
      };

      const receipt = await (dispatchAppealPacket as any)._handler(mockCtx, {
        claimId: "claim_outbound",
        dispatchMode: "official_payer",
        recipientEmail: "appeals@bcbs.com",
      });

      expect(receipt.status).toBe("delivered");
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          attachments: [
            {
              filename: "Formal-Appeal-Packet-CH-7788.pdf",
              content: mockPdfBuffer.toString("base64"),
              contentType: "application/pdf",
            },
          ],
        })
      );

      // Verify outbound message was recorded with attachments metadata
      expect(mockCtx.runMutation).toHaveBeenCalledWith(
        internal.emails.insertMessageInternal,
        expect.objectContaining({
          hasAttachments: true,
          attachments: [
            {
              storageId: "storage_pdf_brief",
              filename: "Formal-Appeal-Packet-CH-7788.pdf",
              contentType: "application/pdf",
              size: mockPdfBuffer.byteLength,
            },
          ],
        })
      );
    });
  });

  describe("Inbound PDF Attachment Storage & Parsing (convex/actions/agentMail)", () => {
    it("downloads inbound PDF attachments, saves to Convex Storage, and quarantines binary without raw-PHI LLM egress when Textract is unconfigured", async () => {
      delete process.env.AWS_ACCESS_KEY_ID;
      delete process.env.AWS_SECRET_ACCESS_KEY;
      const mockPdfBytes = Buffer.from("%PDF-1.4 Inbound Explanation of Benefits (EOB) Overturn %%EOF");

      vi.spyOn(agentMailLib, "getAgentMailMessage").mockResolvedValue({
        message_id: "msg_inbound_eob",
        inbox_id: "inbox_payer",
        from: "appeals-reviewer@aetna.com",
        to: ["claimhero-sender@agentmail.to"],
        subject: "Determination regarding Claim #CH-9900",
        text: "Please find attached formal Explanation of Benefits.",
        attachments: [
          {
            attachment_id: "att_eob_1",
            filename: "Explanation-of-Benefits-CH-9900.pdf",
            content_type: "application/pdf",
            size: mockPdfBytes.byteLength,
          },
        ],
      });

      vi.spyOn(agentMailLib, "downloadAgentMailAttachment").mockResolvedValue({
        buffer: mockPdfBytes,
        contentType: "application/pdf",
        filename: "Explanation-of-Benefits-CH-9900.pdf",
        size: mockPdfBytes.byteLength,
      });

      const mockStructuredCompletion = vi.spyOn(openaiLib, "createStructuredCompletion").mockResolvedValue({
        determination: "OVERTURNED_APPROVED",
        clinicalRationale: "Review of operative notes confirmed medical necessity; adverse determination overturned.",
        missingRecordsRequested: [],
        authorizedSettlementAmount: 32000,
        reviewerName: "Dr. Evelyn Vance, MD",
        shouldAutoReply: false,
        suggestedAutoReplyAddendum: "",
      });

      const mockCtx: any = {
        runQuery: vi.fn().mockImplementation((fn: any, args: any) => {
          if (args && "agentMailMessageId" in args) return false;
          return {
            _id: "claim_inbound_eob",
            claimNumber: "CH-9900",
            patientName: "David Miller",
            insurancePayer: "Aetna",
            deniedAmount: 32000,
          };
        }),
        runMutation: vi.fn().mockImplementation((fn: any) => {
          if (fn === internal.emails.getOrCreateThreadInternal) return "thread_inbound_1";
          if (fn === internal.emails.insertInboundMessageInternal) return { messageId: "msg_db_inbound_1", isNew: true };
          return null;
        }),
        storage: {
          store: vi.fn().mockResolvedValue("storage_inbound_eob_pdf"),
        },
      };

      await (processInboundClaimReply as any)._handler(mockCtx, {
        inboxId: "inbox_payer",
        messageId: "msg_inbound_eob",
        eventId: "evt_inbound_1",
      });

      // Assert attachment was downloaded
      expect(agentMailLib.downloadAgentMailAttachment).toHaveBeenCalledWith(
        expect.objectContaining({
          inboxId: "inbox_payer",
          messageId: "msg_inbound_eob",
          attachmentId: "att_eob_1",
        })
      );

      // Assert attachment was stored in Convex Storage
      expect(mockCtx.storage.store).toHaveBeenCalled();

      // Fail-hard HIPAA gate: raw PDF bytes must NEVER be forwarded to the LLM.
      // The attachment is quarantined in storage with a human-review note instead.
      expect(mockStructuredCompletion).toHaveBeenCalledOnce();
      const completionArgs = mockStructuredCompletion.mock.calls[0][0] as {
        userPrompt: string;
        fileInputs?: unknown;
      };
      expect(completionArgs.fileInputs).toBeUndefined();
      expect("fileInputs" in completionArgs).toBe(false);
      expect(completionArgs.userPrompt).toContain("stored but not OCR'd");

      // Assert stored message analysis was updated with attachments and authorized settlement amount
      expect(mockCtx.runMutation).toHaveBeenCalledWith(
        internal.emails.updateMessageAnalysisInternal,
        expect.objectContaining({
          detectedDetermination: "OVERTURNED_APPROVED",
          settlementAmount: 32000,
          attachments: [
            expect.objectContaining({
              storageId: "storage_inbound_eob_pdf",
              filename: "Explanation-of-Benefits-CH-9900.pdf",
              contentType: "application/pdf",
              size: mockPdfBytes.byteLength,
              ocrStatus: "needs_client_ocr",
            }),
          ],
        })
      );

      // Assert claim was updated to won with settlement details
      expect(mockCtx.runMutation).toHaveBeenCalledWith(
        internal.claims.updateStatusInternal,
        expect.objectContaining({
          claimId: "claim_inbound_eob",
          status: "won",
        })
      );

      // Assert audit log event was recorded
      expect(mockCtx.runMutation).toHaveBeenCalledWith(
        internal.auditLogs.logEventInternal,
        expect.objectContaining({
          claimId: "claim_inbound_eob",
          eventType: "inbound_attachment_processed",
        })
      );
    });

    it("quarantines inbound PDF attachments without raw-PHI LLM egress when Textract extraction fails", async () => {
      process.env.AWS_ACCESS_KEY_ID = "MOCK_KEY";
      process.env.AWS_SECRET_ACCESS_KEY = "MOCK_SECRET";
      try {
        const mockPdfBytes = Buffer.from("%PDF-1.4 Inbound EOB with failing OCR %%EOF");
        const libTextract = await import("../convex/lib/textract");
        vi.spyOn(libTextract, "extractDocumentWithTextract").mockRejectedValue(
          new Error("Textract ThrottlingException")
        );

        vi.spyOn(agentMailLib, "getAgentMailMessage").mockResolvedValue({
          message_id: "msg_inbound_eob_fail",
          inbox_id: "inbox_payer",
          from: "appeals-reviewer@aetna.com",
          to: ["claimhero-sender@agentmail.to"],
          subject: "Determination regarding Claim #CH-9901",
          text: "Please find attached formal Explanation of Benefits.",
          attachments: [
            {
              attachment_id: "att_eob_fail",
              filename: "Explanation-of-Benefits-CH-9901.pdf",
              content_type: "application/pdf",
              size: mockPdfBytes.byteLength,
            },
          ],
        });

        vi.spyOn(agentMailLib, "downloadAgentMailAttachment").mockResolvedValue({
          buffer: mockPdfBytes,
          contentType: "application/pdf",
          filename: "Explanation-of-Benefits-CH-9901.pdf",
          size: mockPdfBytes.byteLength,
        });

        const mockStructuredCompletion = vi.spyOn(openaiLib, "createStructuredCompletion").mockResolvedValue({
          determination: "GENERAL_INQUIRY",
          clinicalRationale: "Inbound correspondence received and recorded.",
          missingRecordsRequested: [],
          shouldAutoReply: true,
          suggestedAutoReplyAddendum: "Counter-rebuttal draft.",
        });

        const mockCtx: any = {
          runQuery: vi.fn().mockImplementation((fn: any, args: any) => {
            if (args && "agentMailMessageId" in args) return false;
            return {
              _id: "claim_inbound_eob_fail",
              claimNumber: "CH-9901",
              patientName: "David Miller",
              insurancePayer: "Aetna",
              deniedAmount: 32000,
            };
          }),
          runMutation: vi.fn().mockImplementation((fn: any) => {
            if (fn === internal.emails.getOrCreateThreadInternal) return "thread_inbound_fail";
            if (fn === internal.emails.insertInboundMessageInternal) return { messageId: "msg_db_fail", isNew: true };
            return null;
          }),
          storage: {
            store: vi.fn().mockResolvedValue("storage_inbound_eob_pdf_fail"),
          },
        };

        await (processInboundClaimReply as any)._handler(mockCtx, {
          inboxId: "inbox_payer",
          messageId: "msg_inbound_eob_fail",
          eventId: "evt_inbound_fail",
        });

        // Attachment preserved in storage, but raw bytes never reach the LLM.
        expect(mockCtx.storage.store).toHaveBeenCalled();
        expect(mockStructuredCompletion).toHaveBeenCalledOnce();
        const completionArgs = mockStructuredCompletion.mock.calls[0][0] as {
          userPrompt: string;
          fileInputs?: unknown;
        };
        expect(completionArgs.fileInputs).toBeUndefined();
        expect("fileInputs" in completionArgs).toBe(false);
        expect(completionArgs.userPrompt).toContain("stored but not OCR'd");
      } finally {
        delete process.env.AWS_ACCESS_KEY_ID;
        delete process.env.AWS_SECRET_ACCESS_KEY;
      }
    });
  });

  describe("Thread Query Signed URL Resolution (convex/emails)", () => {
    it("getThreadWithMessages resolves signed storage URLs for attached files", async () => {
      const mockCtx: any = {
        db: {
          get: vi.fn().mockImplementation((id: string) => {
            if (id === "thread_with_att") {
              return { _id: "thread_with_att", claimId: "claim_att_1" };
            }
            if (id === "claim_att_1") {
              return { _id: "claim_att_1", userId: "user_test" };
            }
            return null;
          }),
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                collect: vi.fn().mockResolvedValue([
                  {
                    _id: "msg_1",
                    threadId: "thread_with_att",
                    hasAttachments: true,
                    attachments: [
                      {
                        storageId: "storage_pdf_1",
                        filename: "Formal-Appeal-CH-1122.pdf",
                        contentType: "application/pdf",
                        size: 20480,
                      },
                    ],
                  },
                ]),
              }),
            }),
          }),
        },
        storage: {
          getUrl: vi.fn().mockResolvedValue("https://signed.storage.convex.cloud/storage_pdf_1"),
        },
      };

      vi.spyOn(authLib, "getClaimIfAuthorized").mockResolvedValue({
        _id: "claim_att_1" as any,
        userId: "user_test" as any,
      } as any);

      const result = await (emailsModule.getThreadWithMessages as any)._handler(mockCtx, {
        threadId: "thread_with_att",
      });

      expect(result).not.toBeNull();
      expect(result.messages.length).toBe(1);
      expect(result.messages[0].attachments[0].url).toBe("https://signed.storage.convex.cloud/storage_pdf_1");
      expect(mockCtx.storage.getUrl).toHaveBeenCalledWith("storage_pdf_1");
    });
  });
});
