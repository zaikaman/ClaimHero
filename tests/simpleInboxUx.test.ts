import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import { SimpleInboxView } from "../src/components/communications/SimpleInboxView";
import { Claim, EmailMessage } from "../src/types";

const mockClaim: Claim = {
  _id: "claim_test_inbox_1",
  patientId: "patient_101",
  patient: {
    _id: "patient_101",
    name: "Eleanor Vance",
    insurancePayer: "Cigna Global Health",
    email: "eleanor@example.com",
    memberId: "CIG-998822-11",
    createdAt: 1773300000000,
  },
  claimNumber: "CLM-9921-CIG-4412",
  serviceDate: "2026-08-12",
  providerName: "Pacific Surgical Institute",
  deniedAmount: 6400,
  patientOwedAmount: 6400,
  cptCodes: ["29881"],
  icd10Codes: ["M23.22"],
  denialReasonCode: "CO-50",
  denialReasonDescription: "These are non-covered services because this is not deemed a medical necessity.",
  status: "ready_for_review",
  statutoryDeadline: Date.now() + 120 * 24 * 3600 * 1000,
  daysRemaining: 120,
  overturnProbabilityScore: 92,
  assignedAgentEmail: "sentinel-agent@claimhero.dev",
  createdAt: 1773300000000,
  updatedAt: 1773300000000,
};

const mockMessages: EmailMessage[] = [
  {
    _id: "msg_outbound_1",
    threadId: "thread_1",
    claimId: "claim_test_inbox_1",
    direction: "outbound",
    sender: "claimhero-sender@agentmail.to",
    recipient: "grievances@cigna.com",
    subject: "Appeal of Adverse Benefit Determination - Eleanor Vance #CLM-9921-CIG-4412",
    bodyHtml: "<p>Formal appeal brief attached.</p>",
    bodyText: "Dear Appeals Coordinator,\n\nPlease find attached the formal cited ERISA appeal memorandum for Eleanor Vance regarding denial #CLM-9921-CIG-4412.",
    hasAttachments: true,
    attachments: [
      {
        storageId: "st_att_1",
        filename: "ERISA_Appeal_Packet_Eleanor_Vance.pdf",
        contentType: "application/pdf",
        size: 142000,
        url: "https://example.com/brief.pdf",
      },
    ],
    receivedAt: 1773310000000,
  },
  {
    _id: "msg_inbound_1",
    threadId: "thread_1",
    claimId: "claim_test_inbox_1",
    direction: "inbound",
    sender: "grievances@cigna.com",
    recipient: "claimhero-sender@agentmail.to",
    subject: "RE: Appeal of Adverse Benefit Determination - Eleanor Vance #CLM-9921-CIG-4412",
    bodyHtml: "<p>We require additional physical therapy notes.</p>",
    bodyText: "We have received your appeal. Prior to Level 1 review, please provide treating physician notes showing 6 weeks of conservative physical therapy.",
    hasAttachments: false,
    detectedDetermination: "ADDITIONAL_RECORDS_REQUIRED",
    clinicalRationale: "Cigna acknowledges the appeal but demands physical therapy progress notes before overturning.",
    missingRecordsRequested: ["Treating physician physical therapy records (6 weeks)"],
    receivedAt: 1773320000000,
  },
];

describe("SimpleInboxView UX & Communication Presentation", () => {
  it("renders a clean dispatch hero card when appeal has not yet been sent", () => {
    const markup = renderToStaticMarkup(
      React.createElement(SimpleInboxView, {
        claim: mockClaim,
        messages: [],
        isLoading: false,
        payerName: "Cigna Global Health",
        officialEmail: "grievances@cigna.com",
        customEmail: "",
        setCustomEmail: () => {},
        dispatchMode: "official_payer",
        setDispatchMode: () => {},
        effectiveRecipient: "grievances@cigna.com",
        canDispatch: true,
        isDispatching: false,
        onRunDispatch: async () => {},
        hasPriorTransmissions: false,
        isReadyForReview: true,
        isPatientUnspecified: false,
        hasSender: true,
        isSenderGatewayConfigured: true,
        isCustomEmailLoopback: false,
        activeAutoDraft: "",
        isSynthesizing: false,
        isSending: false,
        onApproveAndSendDraft: async () => {},
        onDismissDraft: async () => {},
        replyText: "",
        setReplyText: () => {},
        onSendReply: () => {},
        onOpenExportDrawer: () => {},
        onOpenCertificateModal: () => {},
        effectiveAppeal: {
          _id: "appeal_1" as any,
          claimId: "claim_test_inbox_1" as any,
          fullAppealMarkdown: "# Sample Brief",
          version: 1,
          status: "draft",
          createdAt: 1773300000000,
          updatedAt: 1773300000000,
        },
      })
    );

    // Assert clean hero title
    expect(markup).toContain("Send Your Appeal");
    expect(markup).toContain("Cigna Global Health");
    expect(markup).toContain("Official Carrier Intake");
    expect(markup).toContain("Send Test to My Email");
    expect(markup).toContain("Human Review Gate: You are in full control");
    expect(markup).toContain("Approve &amp; Send to Cigna Global Health");
    expect(markup).toContain("Back to Letter");
    expect(markup).toContain("Print Letter");
    expect(markup).toContain("No messages sent or received yet");
  });

  it("renders a delivered status card and conversational message history when transmissions exist", () => {
    const markup = renderToStaticMarkup(
      React.createElement(SimpleInboxView, {
        claim: { ...mockClaim, status: "under_review" },
        messages: mockMessages,
        isLoading: false,
        payerName: "Cigna Global Health",
        officialEmail: "grievances@cigna.com",
        customEmail: "",
        setCustomEmail: () => {},
        dispatchMode: "official_payer",
        setDispatchMode: () => {},
        effectiveRecipient: "grievances@cigna.com",
        canDispatch: true,
        isDispatching: false,
        onRunDispatch: async () => {},
        hasPriorTransmissions: true,
        isReadyForReview: true,
        isPatientUnspecified: false,
        hasSender: true,
        isSenderGatewayConfigured: true,
        isCustomEmailLoopback: false,
        activeAutoDraft: "",
        isSynthesizing: false,
        isSending: false,
        onApproveAndSendDraft: async () => {},
        onDismissDraft: async () => {},
        replyText: "",
        setReplyText: () => {},
        onSendReply: () => {},
        onOpenExportDrawer: () => {},
        onOpenCertificateModal: () => {},
        effectiveAppeal: {
          _id: "appeal_1" as any,
          claimId: "claim_test_inbox_1" as any,
          fullAppealMarkdown: "# Sample Brief",
          version: 1,
          status: "draft",
          createdAt: 1773300000000,
          updatedAt: 1773300000000,
        },
      })
    );

    // Assert delivered status card
    expect(markup).toContain("Appeal Packet Delivered to Cigna Global Health");
    expect(markup).toContain("Delivery Proof");
    expect(markup).toContain("Send Another Copy");

    // Assert message stream
    expect(markup).toContain("Letter &amp; Message History (2)");
    expect(markup).toContain("You sent");
    expect(markup).toContain("Cigna Global Health replied");
    expect(markup).toContain("More Records Demanded");
    expect(markup).toContain("Treating physician physical therapy records (6 weeks)");
    expect(markup).toContain("ERISA_Appeal_Packet_Eleanor_Vance.pdf");
  });

  it("renders the AI suggested response card when insurer requests additional documents", () => {
    const autoDraftText = "Under Cigna CPB #0244 Section III, patient has documented contraindications to extended physical therapy.";

    const markup = renderToStaticMarkup(
      React.createElement(SimpleInboxView, {
        claim: { ...mockClaim, status: "under_review" },
        messages: mockMessages,
        isLoading: false,
        payerName: "Cigna Global Health",
        officialEmail: "grievances@cigna.com",
        customEmail: "",
        setCustomEmail: () => {},
        dispatchMode: "official_payer",
        setDispatchMode: () => {},
        effectiveRecipient: "grievances@cigna.com",
        canDispatch: true,
        isDispatching: false,
        onRunDispatch: async () => {},
        hasPriorTransmissions: true,
        isReadyForReview: true,
        isPatientUnspecified: false,
        hasSender: true,
        isSenderGatewayConfigured: true,
        isCustomEmailLoopback: false,
        activeAutoDraft: autoDraftText,
        isSynthesizing: false,
        isSending: false,
        onApproveAndSendDraft: async () => {},
        onDismissDraft: async () => {},
        replyText: "",
        setReplyText: () => {},
        onSendReply: () => {},
        onOpenExportDrawer: () => {},
        onOpenCertificateModal: () => {},
        effectiveAppeal: {
          _id: "appeal_1" as any,
          claimId: "claim_test_inbox_1" as any,
          fullAppealMarkdown: "# Sample Brief",
          version: 1,
          status: "draft",
          createdAt: 1773300000000,
          updatedAt: 1773300000000,
        },
      })
    );

    // Assert suggested response card
    expect(markup).toContain("Suggested Response to Cigna Global Health");
    expect(markup).toContain("Approval Required");
    expect(markup).toContain(autoDraftText);
    expect(markup).toContain("Approve &amp; Send Response");
    expect(markup).toContain("Edit in Composer");
  });
});
