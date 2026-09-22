import { describe, it, expect } from "vitest";
import { parseEmailReply } from "../convex/lib/emailQuoteParser";

describe("emailQuoteParser", () => {
  it("strips Gmail Vietnamese attribution header and quoted text (user screenshot scenario)", () => {
    const rawText = `What's the name of the patient?

Vào Th 3, 22 thg 9, 2026 lúc 19:54 ClaimHero Appeals Desk <claimhero-sender@agentmail.to> đã viết:

> ClaimHero Appeals Desk
> Appeal Addendum
> GeoBlue - Claim #CLM-6104-GEO-5743
> Claim reference CLM-6104-GEO-5743
> Patient Marcus Sterling
> Date of service July 4, 2026
> Procedure codes 63047`;

    const res = parseEmailReply(rawText);
    expect(res.cleanedText).toBe("What's the name of the patient?");
    expect(res.hasQuotedContent).toBe(true);
    expect(res.quotedText).toContain("Vào Th 3, 22 thg 9, 2026 lúc 19:54 ClaimHero Appeals Desk");
    expect(res.quotedText).toContain("> Patient Marcus Sterling");
  });

  it("strips Gmail English attribution header and quoted text", () => {
    const rawText = `Please provide the operative notes for this procedure.

On Tue, Sep 22, 2026 at 7:54 PM ClaimHero Appeals Desk <claimhero-sender@agentmail.to> wrote:

> Initial Appeal Brief
> CPT 63047`;

    const res = parseEmailReply(rawText);
    expect(res.cleanedText).toBe("Please provide the operative notes for this procedure.");
    expect(res.hasQuotedContent).toBe(true);
    expect(res.quotedText).toContain("On Tue, Sep 22, 2026 at 7:54 PM");
  });

  it("handles multiline wrapped attribution headers across 2 lines", () => {
    const rawText = `We received your inquiry.

On Tue, Sep 22, 2026, 7:54 PM ClaimHero Appeals Desk
<claimhero-sender@agentmail.to> wrote:
> Quoted content here`;

    const res = parseEmailReply(rawText);
    expect(res.cleanedText).toBe("We received your inquiry.");
    expect(res.hasQuotedContent).toBe(true);
    expect(res.quotedText).toContain("On Tue, Sep 22, 2026");
  });

  it("strips Outlook style -----Original Message----- dividers", () => {
    const rawText = `The claim is currently under review with our medical director.

-----Original Message-----
From: ClaimHero Appeals Desk <claimhero-sender@agentmail.to>
Sent: Tuesday, September 22, 2026 7:54 PM
To: Medical Review Board <appeals@geoblue.com>
Subject: Re: [ClaimHero #CLM-6104-GEO-5743]

Original appeal contents...`;

    const res = parseEmailReply(rawText);
    expect(res.cleanedText).toBe("The claim is currently under review with our medical director.");
    expect(res.hasQuotedContent).toBe(true);
    expect(res.quotedText).toContain("-----Original Message-----");
    expect(res.quotedText).toContain("From: ClaimHero Appeals Desk");
  });

  it("strips Outlook underscore line separators", () => {
    const rawText = `Please submit the prior authorization reference number.

________________________________
From: ClaimHero Appeals Desk
Sent: Tuesday, September 22, 2026
To: Reviewer

Previous email details...`;

    const res = parseEmailReply(rawText);
    expect(res.cleanedText).toBe("Please submit the prior authorization reference number.");
    expect(res.hasQuotedContent).toBe(true);
    expect(res.quotedText).toContain("________________________________");
  });

  it("strips blockquote lines starting with > without attribution", () => {
    const rawText = `Approved for reprocessing.

> ClaimHero Appeals Desk
> Appeal Brief
> Ref #12345`;

    const res = parseEmailReply(rawText);
    expect(res.cleanedText).toBe("Approved for reprocessing.");
    expect(res.hasQuotedContent).toBe(true);
    expect(res.quotedText).toContain("> ClaimHero Appeals Desk");
  });

  it("strips HTML quote containers like gmail_quote", () => {
    const rawHtml = `<p>What is the member ID?</p><div class="gmail_quote"><div>On Sep 22, 2026... wrote:</div><blockquote>Quoted text</blockquote></div>`;
    const rawText = "What is the member ID?\n\nOn Sep 22, 2026... wrote:\n> Quoted text";

    const res = parseEmailReply(rawText, rawHtml);
    expect(res.cleanedText).toBe("What is the member ID?");
    expect(res.hasQuotedContent).toBe(true);
    expect(res.cleanedHtml).toBe("<p>What is the member ID?</p>");
    expect(res.quotedHtml).toContain('<div class="gmail_quote">');
  });

  it("handles bottom-posting where quotes are at top and reply is at bottom", () => {
    const rawText = `> Can you confirm the patient identity?
> Claim reference CLM-1234

Yes, the patient is Marcus Sterling.`;

    const res = parseEmailReply(rawText);
    expect(res.cleanedText).toBe("Yes, the patient is Marcus Sterling.");
    expect(res.hasQuotedContent).toBe(true);
    expect(res.quotedText).toContain("> Can you confirm the patient identity?");
  });

  it("fail-safe: preserves full text if stripping would leave an empty string", () => {
    const onlyQuotes = `> Quoted message forwarded without any top text`;

    const res = parseEmailReply(onlyQuotes);
    expect(res.cleanedText).toBe("> Quoted message forwarded without any top text");
  });

  it("returns unchanged text when no quotes are present", () => {
    const cleanMessage = "Hello, we are processing your appeal. Thank you.";

    const res = parseEmailReply(cleanMessage);
    expect(res.cleanedText).toBe(cleanMessage);
    expect(res.hasQuotedContent).toBe(false);
    expect(res.quotedText).toBeUndefined();
  });

  it("prevents false positive DENIAL_UPHELD when question precedes quoted denial text", async () => {
    const { detectAdversaryCountermove, buildCounterRebuttalFallback } = await import(
      "../convex/lib/adversaryNegotiation"
    );

    const rawReplyWithQuotedDenial = `What's the name of the patient?

Vào Th 3, 22 thg 9, 2026 lúc 19:54 ClaimHero Appeals Desk <claimhero-sender@agentmail.to> đã viết:

> ClaimHero Appeals Desk
> Appeal Addendum
> GeoBlue - Claim #CLM-6104-GEO-5743
> Patient Marcus Sterling
> The adverse determination was upheld per plan exclusion. Appeal is denied.`;

    // Without parsing, unstripped text matches adverse countermove (POLICY_CONFLICT_CITATION or DENIAL_UPHELD)
    const unstrippedDetermination = detectAdversaryCountermove(rawReplyWithQuotedDenial);
    expect(["POLICY_CONFLICT_CITATION", "DENIAL_UPHELD"]).toContain(unstrippedDetermination);

    // With parsing, cleaned text accurately classifies as GENERAL_INQUIRY
    const parsed = parseEmailReply(rawReplyWithQuotedDenial);
    const cleanedDetermination = detectAdversaryCountermove(parsed.cleanedText);
    expect(cleanedDetermination).toBe("GENERAL_INQUIRY");

    // Rebuttal fallback for GENERAL_INQUIRY provides patient info rather than aggressive IRO escalation
    const fallback = buildCounterRebuttalFallback({
      claimNumber: "CLM-6104-GEO-5743",
      determination: cleanedDetermination,
      patientName: "Marcus Sterling",
    });
    expect(fallback).toContain("patient on record is Marcus Sterling");
    expect(fallback).not.toContain("Independent External Review (IRO)");
  });

  it("does NOT falsely strip clinical prose starting with 'On ... wrote:' when not an email header", () => {
    const clinicalProse = `Hello,
On the medical record, Dr. Smith wrote:
Patient has persistent lumbar radiculopathy unresponsive to physical therapy.
Please re-evaluate.`;

    const res = parseEmailReply(clinicalProse);
    expect(res.cleanedText).toBe(clinicalProse.trim());
    expect(res.hasQuotedContent).toBe(false);
    expect(res.quotedText).toBeUndefined();
  });

  it("does NOT falsely strip clinical lab results using greater-than comparisons", () => {
    const labResults = `The patient lab results:
> 100 mg/dL
> 50 ng/mL
Normal range is 10-20.`;

    const res = parseEmailReply(labResults);
    expect(res.cleanedText).toBe(labResults.trim());
    expect(res.hasQuotedContent).toBe(false);
    expect(res.quotedText).toBeUndefined();
  });

  it("parses borderless Spanish Outlook headers", () => {
    const spanishEmail = `Favor de enviar el expediente médico actualizado.

De: Revisor Médico <revisor@geoblue.com>
Enviado el: martes, 22 de septiembre de 2026 10:30
Para: ClaimHero Appeals Desk <claimhero-sender@agentmail.to>
Asunto: RE: Recurso Formal CLM-6104`;

    const res = parseEmailReply(spanishEmail);
    expect(res.cleanedText).toBe("Favor de enviar el expediente médico actualizado.");
    expect(res.hasQuotedContent).toBe(true);
    expect(res.quotedText).toContain("De: Revisor Médico");
    expect(res.quotedText).toContain("Asunto: RE: Recurso Formal CLM-6104");
  });
});

