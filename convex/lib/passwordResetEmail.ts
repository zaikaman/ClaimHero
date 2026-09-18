import { escapeHtml, stripHtmlTags } from "./appealEmail";

export interface PasswordResetEmailContext {
  email: string;
  code: string;
  token: string;
  appSiteUrl?: string;
  expirationMinutes?: number;
}

export interface FormattedPasswordResetEmail {
  subject: string;
  text: string;
  html: string;
}

function resolveResetUrl(rawSiteUrl?: string, token?: string): string | undefined {
  const base = (rawSiteUrl || process.env.SITE_URL || "").trim().replace(/\/$/, "");
  if (!base || !token) return undefined;
  try {
    const url = new URL(base);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    url.searchParams.set("resetToken", token);
    return url.toString();
  } catch {
    return undefined;
  }
}

/**
 * Formats an executive, premium light-mode email for ClaimHero account password reset.
 * Designed for maximum readability and native visual harmony in Gmail, Apple Mail, and Outlook.
 * Dispatched exclusively via the authenticated claimhero-sender AgentMail gateway.
 */
export function formatPasswordResetEmail(
  context: PasswordResetEmailContext
): FormattedPasswordResetEmail {
  const cleanTextEmail = stripHtmlTags(context.email).replace(/[\r\n\s]+/g, "");
  const safeEmail = escapeHtml(cleanTextEmail);
  const safeCode = escapeHtml(stripHtmlTags(context.code).replace(/[^0-9]/g, ""));
  const expirationMinutes = context.expirationMinutes ?? 15;
  const resetUrl = resolveResetUrl(context.appSiteUrl, context.token);

  const subject = `[ClaimHero Security] Password Reset Code: ${safeCode}`;

  const text = [
    `ClaimHero Security - Account Recovery`,
    ``,
    `Hello,`,
    ``,
    `A request was received to reset the password for your ClaimHero account (${cleanTextEmail}).`,
    ``,
    `Your verification code is: ${safeCode}`,
    `This code will expire in ${expirationMinutes} minutes.`,
    ``,
    resetUrl ? `Direct reset link:\n${resetUrl}\n` : ``,
    `If you did not initiate this request, you can safely ignore this email. Your password will remain unchanged and your account remains secure.`,
    ``,
    `ClaimHero Sentinel Security Operations`,
  ].filter(Boolean).join("\n");

  const formattedCodeSpaced = safeCode.split("").join(" ");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>ClaimHero Password Reset</title>
</head>
<body style="margin:0;padding:0;background-color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;-webkit-font-smoothing:antialiased;">
  <center style="width:100%;table-layout:fixed;background-color:#f8fafc;">
    <table role="presentation" aria-hidden="true" width="100%" border="0" cellspacing="0" cellpadding="0" align="center" style="width:100% !important;max-width:100%;margin:0 auto;border-collapse:collapse;background-color:#f8fafc;">
      <tr>
        <td align="center" style="padding:40px 16px;text-align:center;background-color:#f8fafc;vertical-align:top;">
          <div style="max-width:540px;margin:0 auto;text-align:left;">
            <table role="presentation" aria-hidden="true" width="100%" border="0" cellspacing="0" cellpadding="0" align="center" style="width:100%;max-width:540px;margin:0 auto;border-collapse:collapse;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px -2px rgba(15,23,42,0.06);text-align:left;">
              
              <!-- Header Bar -->
              <tr>
                <td style="padding:24px 32px;border-bottom:1px solid #f1f5f9;background-color:#ffffff;text-align:left;">
                  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
                    <tr>
                      <td align="left" style="vertical-align:middle;text-align:left;">
                        <div style="font-size:19px;font-weight:700;letter-spacing:-0.02em;color:#0f172a;display:inline-block;">
                          Claim<span style="color:#0284c7;">Hero</span>
                        </div>
                      </td>
                      <td align="right" style="vertical-align:middle;text-align:right;">
                        <span style="font-size:10px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;text-transform:uppercase;letter-spacing:0.08em;background-color:#f1f5f9;color:#475569;padding:4px 10px;border-radius:9999px;border:1px solid #e2e8f0;font-weight:700;">
                          Security Sentinel
                        </span>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Main Body -->
              <tr>
                <td style="padding:32px 32px 28px 32px;text-align:left;">
                  <h1 style="margin:0 0 12px 0;font-size:22px;font-weight:700;color:#0f172a;letter-spacing:-0.02em;line-height:1.3;text-align:left;">
                    Reset Account Password
                  </h1>
                  <p style="margin:0 0 24px 0;font-size:14px;line-height:1.6;color:#475569;text-align:left;">
                    A password reset request was initiated for your advocate account associated with <strong style="color:#0f172a;font-weight:600;">${safeEmail}</strong>. Enter the verification code below in your ClaimHero login window.
                  </p>

                  <!-- Verification Code Card -->
                  <div style="margin:24px 0;padding:24px 20px;background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;text-align:center;">
                    <div style="font-size:11px;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;text-transform:uppercase;letter-spacing:0.12em;color:#64748b;margin-bottom:8px;font-weight:700;text-align:center;">
                      One-Time Verification Code
                    </div>
                    <div style="font-size:36px;font-weight:800;letter-spacing:0.25em;color:#0f172a;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;padding:6px 0;line-height:1.1;text-align:center;">
                      ${formattedCodeSpaced}
                    </div>
                    <div style="font-size:12px;color:#64748b;margin-top:8px;text-align:center;">
                      Expires in <strong style="color:#334155;">${expirationMinutes} minutes</strong>
                    </div>
                  </div>

                  ${resetUrl ? `
                  <!-- Direct Reset CTA -->
                  <div style="margin:28px 0 20px 0;text-align:center;">
                    <p style="margin:0 0 14px 0;font-size:13px;color:#64748b;text-align:center;">
                      Or click below to open the secure recovery window directly:
                    </p>
                    <a href="${escapeHtml(resetUrl)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background-color:#0284c7;color:#ffffff;font-size:13px;font-weight:600;text-decoration:none;padding:12px 28px;border-radius:8px;letter-spacing:0.01em;box-shadow:0 1px 3px 0 rgba(0,0,0,0.1),0 1px 2px 0 rgba(0,0,0,0.06);">
                      Reset Password Directly
                    </a>
                  </div>
                  ` : ""}

                  <!-- Security Notice -->
                  <div style="margin-top:28px;padding:14px 16px;background-color:#f8fafc;border:1px solid #e2e8f0;border-left:3px solid #0284c7;border-radius:6px;text-align:left;">
                    <p style="margin:0;font-size:12px;line-height:1.6;color:#475569;text-align:left;">
                      <strong style="color:#0f172a;">Security Notice:</strong> If you did not request this password recovery, please ignore this email. No changes will be made to your account credentials without this code. ClaimHero support will never ask for your password or verification code.
                    </p>
                  </div>
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td style="padding:20px 32px;background-color:#f8fafc;border-top:1px solid #f1f5f9;text-align:center;">
                  <p style="margin:0;font-size:11px;color:#94a3b8;line-height:1.5;text-align:center;">
                    ClaimHero AI Appeal Sentinel &bull; Precision Healthcare Denial Intelligence
                  </p>
                </td>
              </tr>

            </table>
          </div>
        </td>
      </tr>
    </table>
  </center>
</body>
</html>`;

  return { subject, text, html };
}
