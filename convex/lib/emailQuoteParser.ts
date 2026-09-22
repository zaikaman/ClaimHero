/**
 * Industrial-Strength Email Reply & Quoted Content Parser
 *
 * Strips quoted history and attribution headers appended by major email clients
 * (Gmail, Outlook/Exchange, Apple Mail, Thunderbird, Yahoo, ProtonMail)
 * across multiple languages (English, Vietnamese, French, Spanish, German, etc.)
 * so inbound emails can be cleanly analyzed by clinical LLMs without poisoning
 * adjudication with historical appeal briefs or old adverse determinations.
 */

export interface ParsedEmailReply {
  cleanedText: string;
  quotedText?: string;
  cleanedHtml?: string;
  quotedHtml?: string;
  hasQuotedContent: boolean;
}

// Single-line or combined multiline attribution regexes across languages
// Requires either an explicit email address in angle brackets OR a date/time indicator
// (e.g. 2026, 7:54 PM, 19:54, dates with slashes/dashes/months) to prevent medical narrative
// sentences like "On the medical record, Dr. Smith wrote: ..." from being falsely classified as email headers.
const DATE_TIME_INDICATOR_REGEX =
  /(?:<[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}>|@|\b20\d{2}\b|\d{1,2}:\d{2}|\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|thg\s+\d+|janv|févr|mars|avr|mai|juin|juil|août|sept|oct|nov|déc|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre|Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\b)/i;

const ATTRIBUTION_SINGLE_LINE_REGEX =
  /^(?:On|Vào|Le|El|En|Am|Il|Op|Em)\s+.+(?:wrote|đã\s+viết|a\s+écrit|escribió|schrieb|ha\s+scritto|schreef|escreveu):?\s*$/i;

const ATTRIBUTION_GENERIC_EMAIL_REGEX =
  /^.+<[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}>\s*(?:wrote|đã\s+viết|a\s+écrit|escribió|schrieb|ha\s+scritto|schreef|escreveu):?\s*$/i;

const ATTRIBUTION_STARTERS_REGEX =
  /^(?:On|Vào|Le|El|En|Am|Il|Op|Em)\s+/i;

const ATTRIBUTION_ENDERS_REGEX =
  /(?:wrote|đã\s+viết|a\s+écrit|escribió|schrieb|ha\s+scritto|schreef|escreveu):?\s*$/i;

const DIVIDER_REGEXES = [
  /^-{3,}\s*(?:Original Message|Message d'origine|Ursprüngliche Nachricht|Mensaje original)\s*-{3,}/i,
  /^-{3,}\s*Forwarded (?:message|Message)\s*-{3,}/i,
  /^_{10,}\s*$/, // Outlook underline separator
  /^-{10,}\s*$/, // Plain hyphen divider
];

const OUTLOOK_HEADER_START_REGEX =
  /^(?:From|De|Von)\s*:\s*.+/i;

const OUTLOOK_HEADER_FOLLOW_REGEX =
  /^(?:Sent|Date|To|Subject|Envoyé|À|Objet|Gesendet|An|Betreff|Para|Fecha|Enviado(?:\s+el)?|Asunto)\s*:\s*.+/i;

const HTML_QUOTE_PATTERNS = [
  /<div\s+[^>]*class=["'][^"']*\bgmail_quote\b[^"']*["'][^>]*>/i,
  /<blockquote\s+[^>]*class=["'][^"']*\bgmail_quote\b[^"']*["'][^>]*>/i,
  /<blockquote\s+[^>]*type=["']cite["'][^>]*>/i,
  /<div\s+[^>]*id=["']divRplyFwdMsg["'][^>]*>/i,
  /<div\s+[^>]*id=["']appendonsend["'][^>]*>/i,
  /<div\s+[^>]*class=["'][^"']*\byahoo_quoted\b[^"']*["'][^>]*>/i,
  /<blockquote\s+[^>]*class=["'][^"']*\bios-mail-quote\b[^"']*["'][^>]*>/i,
  /<hr\s+[^>]*style=["'][^"']*width:\s*98%[^"']*["'][^>]*>/i,
];

/**
 * Checks if a line or small group of lookahead lines forms a reply attribution line.
 * Handles client-side word wrapping where the date, sender, or "wrote:" wraps to lines 2 or 3.
 */
function matchAttributionHeader(lines: string[], startIndex: number): { matched: boolean; lineCount: number } {
  const line1 = lines[startIndex].trim();
  if (!line1) return { matched: false, lineCount: 0 };

  // 1. Generic email attribution with bracketed email address: always safe
  if (ATTRIBUTION_GENERIC_EMAIL_REGEX.test(line1)) {
    return { matched: true, lineCount: 1 };
  }

  // 2. Single-line attribution: must have starter + ender AND date/time or email indicator
  if (ATTRIBUTION_SINGLE_LINE_REGEX.test(line1) && DATE_TIME_INDICATOR_REGEX.test(line1)) {
    return { matched: true, lineCount: 1 };
  }

  // 3. Multiline wrapped attribution (up to 3 lines)
  if (ATTRIBUTION_STARTERS_REGEX.test(line1)) {
    // Try 2 lines
    if (startIndex + 1 < lines.length) {
      const line2 = lines[startIndex + 1].trim();
      const combined2 = `${line1} ${line2}`;
      if (
        ATTRIBUTION_ENDERS_REGEX.test(combined2) &&
        (ATTRIBUTION_GENERIC_EMAIL_REGEX.test(combined2) ||
          (ATTRIBUTION_SINGLE_LINE_REGEX.test(combined2) && DATE_TIME_INDICATOR_REGEX.test(combined2)))
      ) {
        return { matched: true, lineCount: 2 };
      }
    }
    // Try 3 lines
    if (startIndex + 2 < lines.length) {
      const line2 = lines[startIndex + 1].trim();
      const line3 = lines[startIndex + 2].trim();
      const combined3 = `${line1} ${line2} ${line3}`;
      if (
        ATTRIBUTION_ENDERS_REGEX.test(combined3) &&
        (ATTRIBUTION_GENERIC_EMAIL_REGEX.test(combined3) ||
          (ATTRIBUTION_SINGLE_LINE_REGEX.test(combined3) && DATE_TIME_INDICATOR_REGEX.test(combined3)))
      ) {
        return { matched: true, lineCount: 3 };
      }
    }
  }

  return { matched: false, lineCount: 0 };
}

/**
 * Checks if a line starts an Outlook/Exchange header block (From: ... Sent: ...).
 */
function matchOutlookHeaderBlock(lines: string[], startIndex: number): boolean {
  const line = lines[startIndex].trim();
  if (!OUTLOOK_HEADER_START_REGEX.test(line)) return false;

  // Check lookahead for Sent:, Date:, To:, or Subject: within next 3 lines
  for (let j = startIndex + 1; j < Math.min(lines.length, startIndex + 4); j++) {
    const nextLine = lines[j].trim();
    if (OUTLOOK_HEADER_FOLLOW_REGEX.test(nextLine)) {
      return true;
    }
  }
  return false;
}

/**
 * Parses an email body and cleanly separates the actual sender's new message
 * from quoted historical email threads.
 */
export function parseEmailReply(rawText: string, rawHtml?: string): ParsedEmailReply {
  const normalizedText = (rawText || "").replace(/\r\n/g, "\n");
  const lines = normalizedText.split("\n");

  // Handle bottom-posting (quotes at the top, reply at the bottom)
  let initialQuoteEndIndex = -1;
  let hasLeadingQuote = false;
  if (lines.length > 0 && /^\s*>/.test(lines[0])) {
    hasLeadingQuote = true;
    for (let i = 0; i < lines.length; i++) {
      if (/^\s*>/.test(lines[i]) || !lines[i].trim()) {
        initialQuoteEndIndex = i;
      } else {
        break;
      }
    }
  }

  if (hasLeadingQuote && initialQuoteEndIndex >= 0 && initialQuoteEndIndex < lines.length - 1) {
    const bottomReply = lines.slice(initialQuoteEndIndex + 1).join("\n").trim();
    const topQuoted = lines.slice(0, initialQuoteEndIndex + 1).join("\n").trim();
    if (bottomReply.length > 0) {
      return {
        cleanedText: bottomReply,
        quotedText: topQuoted,
        cleanedHtml: rawHtml,
        hasQuotedContent: true,
      };
    }
  }

  // Standard top-posting: find the first line where quoting or attribution starts
  let quoteStartIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    // Check for attribution header (e.g., "On ... wrote:", "Vào ... đã viết:")
    const attribution = matchAttributionHeader(lines, i);
    if (attribution.matched) {
      quoteStartIndex = i;
      break;
    }

    // Check for divider lines (e.g., "-----Original Message-----", "________________________________")
    if (DIVIDER_REGEXES.some((rx) => rx.test(trimmed))) {
      quoteStartIndex = i;
      break;
    }

    // Check for Outlook header blocks (From: ... Sent: ...)
    if (matchOutlookHeaderBlock(lines, i)) {
      quoteStartIndex = i;
      break;
    }

    // Check for blockquote lines ('> ...') without preceding attribution header:
    // In genuine email replies, a trailing blockquote continues to the end of the email.
    // Ensure that at least 2 lines are quoted, the last non-empty line is a quote,
    // and the vast majority of remaining lines are quoted (>= 70%),
    // preventing clinical lab comparisons (e.g., "> 100 mg/dL \n Normal range is 10-20") from being falsely stripped.
    if (/^\s*>/.test(lines[i])) {
      const remainingLines = lines.slice(i).filter((l) => l.trim().length > 0);
      const quotedCount = remainingLines.filter((l) => /^\s*>/.test(l)).length;
      const lastLineIsQuoted = remainingLines.length > 0 && /^\s*>/.test(remainingLines[remainingLines.length - 1]);
      if (
        quotedCount >= Math.min(2, remainingLines.length) &&
        lastLineIsQuoted &&
        quotedCount / remainingLines.length >= 0.7
      ) {
        quoteStartIndex = i;
        break;
      }
    }
  }

  // If a quote split point was detected:
  if (quoteStartIndex >= 0) {
    const cleaned = lines.slice(0, quoteStartIndex).join("\n").trim();
    const quoted = lines.slice(quoteStartIndex).join("\n").trim();

    // Critical Fail-Safe: If stripping would leave an empty string, preserve full text
    if (cleaned.length > 0) {
      // Split HTML if provided
      let cleanedHtml: string | undefined = undefined;
      let quotedHtml: string | undefined = undefined;

      if (rawHtml) {
        for (const pattern of HTML_QUOTE_PATTERNS) {
          const match = rawHtml.match(pattern);
          if (match && match.index !== undefined) {
            cleanedHtml = rawHtml.slice(0, match.index).trim();
            quotedHtml = rawHtml.slice(match.index).trim();
            break;
          }
        }
      }

      return {
        cleanedText: cleaned,
        quotedText: quoted.length > 0 ? quoted : undefined,
        cleanedHtml: cleanedHtml || rawHtml,
        quotedHtml,
        hasQuotedContent: true,
      };
    }
  }

  // Also check HTML patterns if plaintext didn't trigger
  if (rawHtml) {
    for (const pattern of HTML_QUOTE_PATTERNS) {
      const match = rawHtml.match(pattern);
      if (match && match.index !== undefined) {
        const cleanedHtml = rawHtml.slice(0, match.index).trim();
        const quotedHtml = rawHtml.slice(match.index).trim();
        return {
          cleanedText: normalizedText.trim(),
          cleanedHtml,
          quotedHtml,
          hasQuotedContent: true,
        };
      }
    }
  }

  return {
    cleanedText: normalizedText.trim(),
    cleanedHtml: rawHtml,
    hasQuotedContent: false,
  };
}
