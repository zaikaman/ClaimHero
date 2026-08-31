import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getSharedAgentMailboxes,
  getIntakeAgentMailbox,
  sendAgentMailMessage,
  getAgentMailMessage,
  downloadAgentMailAttachment,
} from "../convex/lib/agentMail";
import {
  normalizeAgentMailWebhook,
  extractEmailAddress,
  computeSvixSignature,
  verifySvixWebhook,
  base64ToUint8Array,
  uint8ArrayToBase64,
  timingSafeEqual,
} from "../convex/lib/agentMailWebhook";
import {
  formatAppealEmail,
  formatCorrespondenceEmail,
} from "../convex/lib/appealEmail";
import {
  isAiAdjudicatorAddress,
  buildAiAdjudicatorAddress,
  formatCorrespondenceTranscript,
} from "../convex/lib/aiAdjudicator";

describe("convex/lib/agentMail Unit Tests", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("throws error when AgentMail environment variables are missing", () => {
    delete process.env.AGENTMAIL_API_KEY;
    delete process.env.AGENTMAIL_SENDER_INBOX_ID;

    expect(() => getSharedAgentMailboxes()).toThrow("Shared AgentMail is not configured");
    expect(() => getIntakeAgentMailbox()).toThrow("AgentMail intake is not configured");
  });

  it("returns shared and intake agent mailboxes when properly configured", () => {
    process.env.AGENTMAIL_SENDER_INBOX_ID = "inbox_sender_1";
    process.env.AGENTMAIL_SENDER_EMAIL = "sender@claimhero.agentmail.to";
    process.env.AGENTMAIL_ADJUDICATOR_INBOX_ID = "inbox_adj_1";
    process.env.AGENTMAIL_ADJUDICATOR_EMAIL = "adjudicator@claimhero.agentmail.to";
    process.env.AGENTMAIL_INTAKE_INBOX_ID = "inbox_intake_1";
    process.env.AGENTMAIL_INTAKE_EMAIL = "Intake@ClaimHero.AgentMail.to";

    const shared = getSharedAgentMailboxes();
    expect(shared.senderInboxId).toBe("inbox_sender_1");
    expect(shared.senderEmail).toBe("sender@claimhero.agentmail.to");
    expect(shared.adjudicatorInboxId).toBe("inbox_adj_1");
    expect(shared.adjudicatorEmail).toBe("adjudicator@claimhero.agentmail.to");

    const intake = getIntakeAgentMailbox();
    expect(intake.inboxId).toBe("inbox_intake_1");
    expect(intake.email).toBe("intake@claimhero.agentmail.to");
  });

  it("sends AgentMail message and returns messageId", async () => {
    process.env.AGENTMAIL_API_KEY = "test_key_123";

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(JSON.stringify({ message_id: "msg_sent_99" })),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await sendAgentMailMessage({
      inboxId: "inbox_1",
      to: "payer@example.com",
      subject: "Formal Appeal CLM-123",
      text: "Plain text appeal",
      html: "<p>HTML appeal</p>",
    });

    expect(result.messageId).toBe("msg_sent_99");
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.agentmail.to/v0/inboxes/inbox_1/messages/send",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test_key_123",
        }),
      })
    );
  });

  it("handles send error responses gracefully", async () => {
    process.env.AGENTMAIL_API_KEY = "test_key_123";

    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: () => Promise.resolve(JSON.stringify({ error: "Invalid recipient" })),
    });
    vi.stubGlobal("fetch", mockFetch);

    await expect(
      sendAgentMailMessage({
        inboxId: "inbox_1",
        to: "invalid-email",
        subject: "Test",
        text: "Test",
        html: "<p>Test</p>",
      })
    ).rejects.toThrow("AgentMail message delivery failed (400)");
  });

  it("retrieves an AgentMail message", async () => {
    process.env.AGENTMAIL_API_KEY = "test_key_123";

    const mockMessage = { id: "msg_123", subject: "Re: Appeal", from: "payer@example.com" };
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(JSON.stringify(mockMessage)),
    });
    vi.stubGlobal("fetch", mockFetch);

    const message = await getAgentMailMessage("inbox_1", "msg_123");
    expect(message.subject).toBe("Re: Appeal");
  });

  it("downloads an AgentMail attachment with direct bytes or via downloadUrl", async () => {
    process.env.AGENTMAIL_API_KEY = "test_key_123";

    // Direct download case (non-JSON binary)
    const mockBinary = new ArrayBuffer(8);
    const mockFetchBinary = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "application/pdf" }),
      arrayBuffer: () => Promise.resolve(mockBinary),
      text: () => Promise.resolve(""),
    });
    vi.stubGlobal("fetch", mockFetchBinary);

    const directResult = await downloadAgentMailAttachment({
      inboxId: "inbox_1",
      messageId: "msg_1",
      attachmentId: "att_1",
    });
    expect(directResult.contentType).toBe("application/pdf");
    expect(directResult.bytes.byteLength).toBe(8);

    // JSON metadata download_url redirect case
    const mockFetchJson = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        json: () => Promise.resolve({ download_url: "https://storage.agentmail.to/att_file.pdf", content_type: "application/pdf" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ "content-type": "application/pdf" }),
        arrayBuffer: () => Promise.resolve(mockBinary),
      });
    vi.stubGlobal("fetch", mockFetchJson);

    const redirectResult = await downloadAgentMailAttachment({
      inboxId: "inbox_1",
      messageId: "msg_1",
      attachmentId: "att_1",
    });
    expect(redirectResult.contentType).toBe("application/pdf");
  });

  it("handles getAgentMailMessage and downloadAgentMailAttachment failures", async () => {
    process.env.AGENTMAIL_API_KEY = "test_key_123";

    // Failure on getAgentMailMessage
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: () => Promise.resolve("Not found"),
    }));

    await expect(getAgentMailMessage("inbox_1", "missing_msg")).rejects.toThrow("AgentMail message retrieval failed (404)");

    // Failure on downloadAgentMailAttachment
    await expect(downloadAgentMailAttachment({
      inboxId: "inbox_1",
      messageId: "msg_1",
      attachmentId: "missing_att",
    })).rejects.toThrow("AgentMail attachment retrieval failed (404)");
  });

  it("throws when sending with unconfigured API key or missing response field", async () => {
    delete process.env.AGENTMAIL_API_KEY;

    await expect(
      sendAgentMailMessage({
        inboxId: "inbox_1",
        to: "payer@example.com",
        subject: "Test",
        text: "Test",
        html: "<p>Test</p>",
      })
    ).rejects.toThrow("AgentMail is not configured. Set AGENTMAIL_API_KEY before sending email.");

    process.env.AGENTMAIL_API_KEY = "test_key_123";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(JSON.stringify({ unexpected_data: "none" })),
    }));

    const result = await sendAgentMailMessage({
      inboxId: "inbox_1",
      to: "payer@example.com",
      subject: "Test",
      text: "Test",
      html: "<p>Test</p>",
    });
    expect(result.messageId).toBeUndefined();
  });
});

describe("convex/lib/agentMailWebhook & appealEmail Unit Tests", () => {
  it("normalizes agent mail webhook payloads accurately", () => {
    const rawPayload = {
      event_type: "message.received",
      event_id: "evt_123",
      message: {
        message_id: "msg_webhook_1",
        inbox_id: "inbox_test",
        from: "reviewer@molinahealthcare.com",
        to: ["appeal-8942@claimhero.agentmail.com"],
        subject: "Re: Formal Appeal Determination CLM-8942-MOL",
        text: "Claim determination upheld following second level medical review.",
        html: "<p>Claim determination upheld following second level medical review.</p>",
        attachments: [
          {
            attachment_id: "att_1",
            filename: "denial_letter.pdf",
            content_type: "application/pdf",
            size: 1024,
          },
        ],
      },
    };

    const normalized = normalizeAgentMailWebhook(rawPayload);
    expect(normalized).not.toBeNull();
    expect(normalized?.messageId).toBe("msg_webhook_1");
    expect(normalized?.from).toBe("reviewer@molinahealthcare.com");
    expect(normalized?.subject).toContain("CLM-8942-MOL");
    expect(normalized?.text).toContain("Claim determination upheld");
    expect(normalized?.attachments).toHaveLength(1);
    expect(normalized?.attachments[0].filename).toBe("denial_letter.pdf");

    // Legacy data envelope formats
    const legacyNestedData = {
      event: "message.received",
      event_id: "evt_legacy_1",
      data: {
        message: {
          message_id: "msg_legacy_1",
          inbox_id: "inbox_test",
          to: "appeal-8942@claimhero.agentmail.com",
          subject: "Legacy message format",
        },
      },
    };
    const normalizedLegacy = normalizeAgentMailWebhook(legacyNestedData);
    expect(normalizedLegacy?.messageId).toBe("msg_legacy_1");
    expect(normalizedLegacy?.recipients).toContain("appeal-8942@claimhero.agentmail.com");

    const flatData = {
      event: "message.received",
      event_id: "evt_flat_1",
      data: {
        message_id: "msg_flat_1",
        inbox_id: "inbox_test",
        from: { email: "sender@example.com" },
        to: ["appeal@claimhero.agentmail.com"],
      },
    };
    const normalizedFlat = normalizeAgentMailWebhook(flatData);
    expect(normalizedFlat?.messageId).toBe("msg_flat_1");
    expect(normalizedFlat?.from).toBe("sender@example.com");

    expect(normalizeAgentMailWebhook(null)).toBeNull();
    expect(normalizeAgentMailWebhook({})).toBeNull();
  });

  it("extracts email addresses properly from various formats", () => {
    expect(extractEmailAddress("John Doe <john.doe@molinahealthcare.com>")).toBe("john.doe@molinahealthcare.com");
    expect(extractEmailAddress("reviewer@cigna.com")).toBe("reviewer@cigna.com");
    expect(extractEmailAddress(undefined)).toBeUndefined();
  });

  it("formats appeal and correspondence emails with markdown, tables, and structured headers", () => {
    const markdown = `
## Level 2 Subheading

### Level 3 Section

# Substantive Section

| Item | Description |
|---|---|
| CPT 27447 | Total Knee Arthroplasty |

Multi-line paragraph 1
# Inline Heading directly below paragraph
Multi-line paragraph 2
> Inline Quote directly below paragraph
Multi-line paragraph 3
- Unseparated list item
Multi-line paragraph 4
---
Multi-line paragraph 5
| Table | Row |
|---|---|
| A | B |

> Important quote with [Good Link](https://molinahealthcare.com) and [Invalid Link](not-a-url)

- Item 1
- Item 2

Paragraph text with **bold** and *italic*.

---

1. Numbered 1
2. Numbered 2`;
    const context = {
      claimNumber: "CLM-8942-MOL",
      patientName: "Eleanor Vance",
      payer: "Molina Healthcare",
      serviceDate: "2026-06-12",
      cptCodes: ["27447"],
      deniedAmount: 24500,
      denialReason: "CO-50: Not medically necessary",
    };

    const appealEmail = formatAppealEmail(markdown, context);
    expect(appealEmail.html).toContain("Molina Healthcare");
    expect(appealEmail.html).toContain("CLM-8942-MOL");
    expect(appealEmail.html).toContain("$24,500");
    expect(appealEmail.html).toContain("<h1");
    expect(appealEmail.html).toContain("<h2");
    expect(appealEmail.html).toContain("<h3");
    expect(appealEmail.html).toContain("<table");
    expect(appealEmail.html).toContain("<th");
    expect(appealEmail.html).toContain("<td");
    expect(appealEmail.html).toContain("<blockquote");
    expect(appealEmail.html).toContain("<ul");
    expect(appealEmail.html).toContain("<ol");
    expect(appealEmail.text).toContain("Quote: Important quote");

    const correspondenceEmail = formatCorrespondenceEmail(markdown, context, "Custom Subject");
    expect(correspondenceEmail.html).toContain("Custom Subject");
  });

  it("handles aiAdjudicator helpers, addresses, and transcripts", () => {
    expect(isAiAdjudicatorAddress("molina-adjudication@claimhero.agentmail.com")).toBe(true);
    expect(isAiAdjudicatorAddress("Reviewer <adjudicator@molinahealthcare.com>")).toBe(true);
    expect(isAiAdjudicatorAddress("<adjudication-specialist@payer.com>")).toBe(true);
    expect(isAiAdjudicatorAddress("doctor@clinic.com")).toBe(false);
    expect(isAiAdjudicatorAddress(null)).toBe(false);

    expect(buildAiAdjudicatorAddress("Molina Healthcare")).toBe("molinahealthcare-adjudication@claimhero.agentmail.com");

    const transcript = formatCorrespondenceTranscript([
      { direction: "outbound", subject: "Initial Brief", bodyText: "Substantive clinical brief text." },
      { direction: "inbound", subject: "Review Decision", bodyText: "Adverse determination overturned." },
    ]);
    expect(transcript).toContain("APPELLANT (Authorized Representative)");
    expect(transcript).toContain("PAYER MEDICAL DIRECTOR");
  });

  describe("Svix Webhook Signature Cryptographic Verification", () => {
    const testSecret = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2gAqNLm";
    const testPayload = JSON.stringify({
      event_type: "message.received",
      event_id: "evt_9988",
      message: {
        message_id: "msg_9988",
        inbox_id: "inbox_claimhero_intake",
        to: ["claimhero-intake@agentmail.to"],
      },
    });

    it("converts between base64 and Uint8Array correctly and executes timingSafeEqual", () => {
      const original = "ClaimHero-Security-Test";
      const bytes = new TextEncoder().encode(original);
      const b64 = uint8ArrayToBase64(bytes);
      const roundtripBytes = base64ToUint8Array(b64);
      expect(new TextDecoder().decode(roundtripBytes)).toBe(original);

      expect(timingSafeEqual("signature123", "signature123")).toBe(true);
      expect(timingSafeEqual("signature123", "signature456")).toBe(false);
      expect(timingSafeEqual("short", "longer")).toBe(false);
    });

    it("verifies a valid Svix signature with whsec_ prefixed secret", async () => {
      const id = "msg_pld_1";
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const signature = await computeSvixSignature(id, timestamp, testPayload, testSecret);

      const result = await verifySvixWebhook({
        payload: testPayload,
        headers: {
          "svix-id": id,
          "svix-timestamp": timestamp,
          "svix-signature": `v1,${signature}`,
        },
        secret: testSecret,
      });

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("supports Headers object format with alternative webhook-* header names", async () => {
      const id = "msg_alt_1";
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const signature = await computeSvixSignature(id, timestamp, testPayload, testSecret);

      const headers = new Headers();
      headers.set("webhook-id", id);
      headers.set("webhook-timestamp", timestamp);
      headers.set("webhook-signature", `v1,${signature}`);

      const result = await verifySvixWebhook({
        payload: testPayload,
        headers,
        secret: testSecret,
      });

      expect(result.valid).toBe(true);
    });

    it("verifies with raw non-prefixed secret", async () => {
      const rawSecret = "supersecretkey123456789012345678";
      const id = "msg_raw_1";
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const signature = await computeSvixSignature(id, timestamp, testPayload, rawSecret);

      const result = await verifySvixWebhook({
        payload: testPayload,
        headers: {
          id,
          timestamp,
          signature: `v1,${signature}`,
        },
        secret: rawSecret,
      });

      expect(result.valid).toBe(true);
    });

    it("supports key rotation with multiple space-delimited signatures", async () => {
      const id = "msg_rot_1";
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const signature = await computeSvixSignature(id, timestamp, testPayload, testSecret);

      const result = await verifySvixWebhook({
        payload: testPayload,
        headers: {
          "svix-id": id,
          "svix-timestamp": timestamp,
          "svix-signature": `v1,old_stale_signature_123 v1,${signature} v2,other_sig`,
        },
        secret: testSecret,
      });

      expect(result.valid).toBe(true);
    });

    it("rejects when Svix headers are missing", async () => {
      const result = await verifySvixWebhook({
        payload: testPayload,
        headers: {},
        secret: testSecret,
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain("Missing required Svix signature headers");
    });

    it("rejects when secret is empty or missing", async () => {
      const result = await verifySvixWebhook({
        payload: testPayload,
        headers: {
          "svix-id": "id_1",
          "svix-timestamp": "1234567",
          "svix-signature": "v1,abc",
        },
        secret: "",
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain("Webhook secret is not configured");
    });

    it("rejects invalid or unparseable timestamp", async () => {
      const result = await verifySvixWebhook({
        payload: testPayload,
        headers: {
          "svix-id": "id_1",
          "svix-timestamp": "not-a-number",
          "svix-signature": "v1,abc",
        },
        secret: testSecret,
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain("Invalid timestamp header value");
    });

    it("rejects expired timestamps exceeding tolerance window", async () => {
      const id = "msg_exp_1";
      const oldTimestamp = (Math.floor(Date.now() / 1000) - 400).toString(); // 400s old > 300s
      const signature = await computeSvixSignature(id, oldTimestamp, testPayload, testSecret);

      const result = await verifySvixWebhook({
        payload: testPayload,
        headers: {
          "svix-id": id,
          "svix-timestamp": oldTimestamp,
          "svix-signature": `v1,${signature}`,
        },
        secret: testSecret,
        toleranceInSeconds: 300,
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain("outside allowed tolerance");
    });

    it("rejects future timestamps exceeding tolerance window", async () => {
      const id = "msg_fut_1";
      const futureTimestamp = (Math.floor(Date.now() / 1000) + 500).toString();
      const signature = await computeSvixSignature(id, futureTimestamp, testPayload, testSecret);

      const result = await verifySvixWebhook({
        payload: testPayload,
        headers: {
          "svix-id": id,
          "svix-timestamp": futureTimestamp,
          "svix-signature": `v1,${signature}`,
        },
        secret: testSecret,
        toleranceInSeconds: 300,
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain("outside allowed tolerance");
    });

    it("rejects tampered payloads and fraudulent signatures", async () => {
      const id = "msg_tamper_1";
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const signature = await computeSvixSignature(id, timestamp, testPayload, testSecret);

      const tamperedPayload = JSON.stringify({
        ...JSON.parse(testPayload),
        inbox_id: "inbox_attacker_controlled",
      });

      const result = await verifySvixWebhook({
        payload: tamperedPayload,
        headers: {
          "svix-id": id,
          "svix-timestamp": timestamp,
          "svix-signature": `v1,${signature}`,
        },
        secret: testSecret,
      });

      expect(result.valid).toBe(false);
      expect(result.error).toBe("Signature verification failed");
    });
  });

  describe("Inbound Claim Matching & Free-Tier Intake Inbox Routing", () => {
    it("correctly matches free-tier intake claims (userId: undefined) by claimNumber in subject or body", () => {
      const intakeClaim = {
        _id: "claim_free_tier_1",
        userId: undefined, // Free-tier intake unassigned claim
        claimNumber: "CLM-INTAKE-8849",
        assignedAgentEmail: "agent_general@claimhero.agentmail.to",
        agentMailInboxEmail: "claim_intake_8849@claimhero.agentmail.to",
        agentMailAdjudicatorEmail: "adj_intake_8849@claimhero.agentmail.to",
      };

      const claimsList = [intakeClaim];
      const subject = "Re: Final Determination - Case Ref CLM-INTAKE-8849 Overturned";
      const body = "Your claim denial has been reconsidered and approved.";

      const match = claimsList.find(
        (c) =>
          c.claimNumber &&
          (subject.includes(c.claimNumber) || body.includes(c.claimNumber))
      );

      expect(match).toBeDefined();
      expect(match?._id).toBe("claim_free_tier_1");
      expect(match?.userId).toBeUndefined();
    });

    it("correctly matches free-tier intake claims by recipient email address", () => {
      const intakeClaim = {
        _id: "claim_free_tier_2",
        userId: undefined,
        claimNumber: "CLM-FREE-1002",
        assignedAgentEmail: "assigned_rep@claimhero.agentmail.to",
        agentMailInboxEmail: "inbox_free_1002@claimhero.agentmail.to",
        agentMailAdjudicatorEmail: "adj_free_1002@claimhero.agentmail.to",
      };

      const recipient = "inbox_free_1002@claimhero.agentmail.to";
      const normalized = extractEmailAddress(recipient) || recipient.toLowerCase();

      const isMatch =
        intakeClaim.agentMailInboxEmail?.toLowerCase() === normalized ||
        intakeClaim.assignedAgentEmail?.toLowerCase() === normalized ||
        intakeClaim.agentMailAdjudicatorEmail?.toLowerCase() === normalized;

      expect(isMatch).toBe(true);
    });
  });
});
