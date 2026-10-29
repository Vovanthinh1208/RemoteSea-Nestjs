import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import nodemailer, { type Transporter } from "nodemailer";
import type { EnvConfig } from "@/core/config/env.validation";
import type { JobWithRelations } from "@/common/types/job-with-relations.type";
import { escapeHtml } from "@/common/utils/escape-html";
import { CircuitBreaker } from "@/common/utils/circuit-breaker";

const SMTP_TIMEOUT_MS = 10_000;
const BREAKER_FAILURE_THRESHOLD = 5;
const BREAKER_COOLDOWN_MS = 30_000;
const DEFAULT_FROM = "RemoteSEA <noreply@remotesea.io>";

const toPlainText = (html: string): string =>
  html
    .replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, "$2 ($1)")
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\s*\/(p|li|div|h[1-6])\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const safeHeader = (value: string): string =>
  value.replace(/[\p{Cc}\p{Zl}\p{Zp}]+/gu, " ").trim();

const wrapHtml = (title: string, content: string): string =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head><body style="margin:0;background:#f4f6f8;color:#17212b;font-family:Arial,sans-serif"><div style="max-width:600px;margin:32px auto;padding:32px;background:#fff;border-radius:12px"><p style="margin:0 0 24px;color:#087f8c;font-size:20px;font-weight:bold">RemoteSEA</p>${content}<p style="margin-top:32px;color:#65717d;font-size:13px">RemoteSEA — remote work, worldwide.</p></div></body></html>`;

export type EmailAttachment = {
  filename: string;
  content: string;
  contentType: string;
};

// Interview e-mails print times in UTC with an explicit label — participants
// are frequently in different countries, and the attached .ics (PB61) carries
// the exact instant for each calendar app to localize.
const formatUtc = (date: Date): string =>
  `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;

export type InterviewEmailDetails = {
  title: string;
  jobTitle: string;
  companyName: string;
  durationMinutes: number;
  platform: string | null;
  meetingUrl: string | null;
};

/**
 * Shared SMTP transport for all email call sites. SMTP is optional in local
 * and automated test environments; once MAIL_HOST is configured, sends use
 * Nodemailer and provider failures are surfaced to the business caller.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly transporter: Transporter | null;
  private readonly from: string;
  private readonly appUrl: string;
  private readonly breaker = new CircuitBreaker(
    BREAKER_FAILURE_THRESHOLD,
    BREAKER_COOLDOWN_MS,
  );

  constructor(private readonly config: ConfigService<EnvConfig, true>) {
    this.from = this.config.get("MAIL_FROM", { infer: true }) ?? DEFAULT_FROM;
    this.appUrl = new URL(
      this.config.get("FRONTEND_URL", { infer: true }),
    ).origin;

    const host = this.config.get("MAIL_HOST", { infer: true });
    if (!host) {
      this.transporter = null;
      return;
    }

    const port = this.config.get("MAIL_PORT", { infer: true });
    const configuredSecure = this.config.get("MAIL_SECURE", { infer: true });
    const secure = configuredSecure ?? port === 465;
    const user = this.config.get("MAIL_USER", { infer: true });
    const password = this.config.get("MAIL_PASSWORD", { infer: true });

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      // Port 587 is SMTP submission: require STARTTLS instead of silently
      // falling back to a clear-text connection when the server misbehaves.
      ...(port === 587 && !secure ? { requireTLS: true } : {}),
      ...(user && password ? { auth: { user, pass: password } } : {}),
      connectionTimeout: SMTP_TIMEOUT_MS,
      greetingTimeout: SMTP_TIMEOUT_MS,
      socketTimeout: SMTP_TIMEOUT_MS,
      tls: { minVersion: "TLSv1.2" },
    });
  }

  /** Test connectivity and credentials without sending a message. */
  async verifyConnection(): Promise<void> {
    if (!this.transporter) {
      throw new Error("SMTP is not configured (MAIL_HOST is missing)");
    }
    await this.transporter.verify();
  }

  private async send(
    to: string,
    subject: string,
    content: string,
    attachments?: EmailAttachment[],
  ): Promise<void> {
    if (!this.transporter) return;

    // Do not allow an invalid or header-injection recipient through to SMTP.
    if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(to)) {
      throw new Error("Invalid email recipient");
    }

    if (this.breaker.isOpen()) {
      this.logger.warn("Skipping email because the SMTP circuit is open");
      return;
    }

    const safeSubject = safeHeader(subject);
    const html = wrapHtml(safeSubject, content);
    try {
      await this.transporter.sendMail({
        from: this.from,
        to,
        subject: safeSubject,
        html,
        text: toPlainText(content),
        ...(attachments?.length && { attachments }),
      });
      this.breaker.onSuccess();
    } catch (error) {
      this.breaker.onFailure();
      // Do not include recipient, message body, token, or SMTP credentials.
      const safeError =
        error && typeof error === "object"
          ? (error as { code?: unknown; command?: unknown }).code
          : undefined;
      const code =
        typeof safeError === "string" && /^[A-Z0-9_-]{1,32}$/i.test(safeError)
          ? safeError
          : "unknown";
      this.logger.error(`SMTP email delivery failed (code: ${code})`);
      throw error;
    }
  }

  private buildFrontendUrl(
    path: string,
    query?: Record<string, string>,
  ): string {
    const url = new URL(path, `${this.appUrl}/`);
    for (const [key, value] of Object.entries(query ?? {})) {
      url.searchParams.set(key, value);
    }
    return url.toString();
  }

  async sendWelcomeEmail(to: string, name: string): Promise<void> {
    await this.send(
      to,
      "Welcome to RemoteSEA",
      `<p>Hi ${escapeHtml(name)},</p><p>Welcome to RemoteSEA! Start exploring remote jobs at <a href="${escapeHtml(this.appUrl)}">${escapeHtml(this.appUrl)}</a>.</p>`,
    );
  }

  async sendPasswordResetEmail(to: string, token: string): Promise<void> {
    const resetUrl = this.buildFrontendUrl("/reset-password", { token });
    await this.send(
      to,
      "Reset your RemoteSEA password",
      `<p>Use the link below to choose a new password. It expires in 15 minutes and can only be used once.</p><p><a href="${escapeHtml(resetUrl)}">Reset password</a></p>`,
    );
  }

  async sendTwoFactorDisabledEmail(to: string, name: string): Promise<void> {
    await this.send(
      to,
      "Two-factor authentication disabled",
      `<p>Hi ${escapeHtml(name)},</p><p>Two-factor authentication was disabled for your RemoteSEA account. If you did not make this change, reset your password and contact support.</p>`,
    );
  }

  // PB32: the OTP itself, entered on the employer dashboard — no link.
  async sendEmployerVerificationEmail(
    to: string,
    companyName: string,
    code: string,
  ): Promise<void> {
    await this.send(
      to,
      "Your RemoteSEA company verification code",
      `<p>Use this code to confirm that ${escapeHtml(companyName)} controls this address. It expires in 15 minutes.</p><p style="font-size:24px;font-weight:bold;letter-spacing:4px">${escapeHtml(code)}</p><p>If you didn't request this, you can ignore this email.</p>`,
    );
  }

  async sendTeamInvitationEmail(
    to: string,
    companyName: string,
    role: string,
    token: string,
  ): Promise<void> {
    const acceptUrl = this.buildFrontendUrl(
      `/team/invitations/${encodeURIComponent(token)}`,
    );
    await this.send(
      to,
      `You've been invited to join ${safeHeader(companyName)} on RemoteSEA`,
      `<p>You've been invited to join <strong>${escapeHtml(companyName)}</strong> as ${escapeHtml(role)}. Click the link below to accept. This link expires in 7 days.</p><p><a href="${escapeHtml(acceptUrl)}">Accept invitation</a></p>`,
    );
  }

  async sendTalentVerificationEmail(to: string, token: string): Promise<void> {
    const verifyUrl = this.buildFrontendUrl("/talent/verify", { token });
    await this.send(
      to,
      "Verify your email",
      `<p>Confirm you control this address by clicking the link below. This link expires in 24 hours.</p><p><a href="${escapeHtml(verifyUrl)}">Verify email</a></p>`,
    );
  }

  async sendJobLiveEmail(
    to: string,
    jobTitle: string,
    jobSlug: string,
  ): Promise<void> {
    const jobUrl = this.buildFrontendUrl(
      `/jobs/${encodeURIComponent(jobSlug)}`,
    );
    await this.send(
      to,
      "Your job is live",
      `<p>Your listing "${escapeHtml(jobTitle)}" is now live: <a href="${escapeHtml(jobUrl)}">${escapeHtml(jobUrl)}</a></p>`,
    );
  }

  async sendJobRejectedEmail(
    to: string,
    jobTitle: string,
    note: string,
  ): Promise<void> {
    await this.send(
      to,
      "Changes needed for your listing",
      `<p>Your listing "${escapeHtml(jobTitle)}" needs changes before it can go live.</p><p>${escapeHtml(note)}</p>`,
    );
  }

  async sendJobExpiredEmail(to: string, jobTitle: string): Promise<void> {
    await this.send(
      to,
      "Your job listing has expired",
      `<p>Your listing "${escapeHtml(jobTitle)}" reached the end of its display period and is no longer visible to candidates. Applications already received are unchanged.</p>`,
    );
  }

  async sendJobSubmittedEmail(to: string, jobTitle: string): Promise<void> {
    await this.send(
      to,
      "Payment received — job under review",
      `<p>We received payment for "${escapeHtml(jobTitle)}". It's now under review and will go live once approved.</p>`,
    );
  }

  async sendApplicationReceivedEmail(
    to: string,
    jobTitle: string,
    talentName: string,
  ): Promise<void> {
    await this.send(
      to,
      `New application: ${safeHeader(talentName)}`,
      `<p>${escapeHtml(talentName)} applied to "${escapeHtml(jobTitle)}". Log in to review the application.</p>`,
    );
  }

  async sendApplicationStatusChangedEmail(
    to: string,
    talentName: string,
    jobTitle: string,
    statusLabel: string,
    // PB58 BR2: optional feedback the employer chose to share on rejection.
    feedback?: string,
  ): Promise<void> {
    const feedbackHtml = feedback
      ? `<p>Feedback from the employer:</p><blockquote style="margin:0;padding:8px 12px;border-left:3px solid #d0d7de">${escapeHtml(feedback)}</blockquote>`
      : "";
    await this.send(
      to,
      `Your application for ${safeHeader(jobTitle)} is now ${safeHeader(statusLabel)}`,
      `<p>Hi ${escapeHtml(talentName)},</p><p>Your application for "${escapeHtml(jobTitle)}" is now <strong>${escapeHtml(statusLabel)}</strong>. Log in to see the full timeline.</p>${feedbackHtml}`,
    );
  }

  // PB60 AC5: the talent is told which times were proposed.
  async sendInterviewProposedEmail(
    to: string,
    talentName: string,
    details: InterviewEmailDetails,
    proposedSlots: Date[],
    applicationId: string,
  ): Promise<void> {
    const slots = proposedSlots
      .map((slot) => `<li>${escapeHtml(formatUtc(slot))}</li>`)
      .join("");
    await this.send(
      to,
      `${safeHeader(details.companyName)} proposed interview times`,
      `<p>Hi ${escapeHtml(talentName)},</p><p>${escapeHtml(details.companyName)} proposed times for "${escapeHtml(details.title)}" (${details.durationMinutes} min) for "${escapeHtml(details.jobTitle)}"${details.platform ? ` on ${escapeHtml(details.platform)}` : ""}:</p><ul>${slots}</ul><p><a href="${this.buildFrontendUrl(`/applications/${applicationId}/interview`)}">Choose a time</a></p>`,
    );
  }

  // PB61 AC4: confirmation with the calendar file, sent to each participant.
  async sendInterviewConfirmedEmail(
    to: string,
    recipientName: string,
    details: InterviewEmailDetails,
    confirmedSlot: Date,
    ics: string,
  ): Promise<void> {
    await this.send(
      to,
      `Interview confirmed: ${safeHeader(details.title)}`,
      `<p>Hi ${escapeHtml(recipientName)},</p><p>The interview "${escapeHtml(details.title)}" for "${escapeHtml(details.jobTitle)}" at ${escapeHtml(details.companyName)} is confirmed for <strong>${escapeHtml(formatUtc(confirmedSlot))}</strong> (${details.durationMinutes} min).</p>${details.meetingUrl ? `<p>Meeting link: <a href="${escapeHtml(details.meetingUrl)}">${escapeHtml(details.meetingUrl)}</a></p>` : ""}<p>The attached calendar.ics adds it to Google Calendar, Outlook or Apple Calendar.</p>`,
      [
        {
          filename: "calendar.ics",
          content: ics,
          contentType: "text/calendar; charset=utf-8; method=PUBLISH",
        },
      ],
    );
  }

  // PB62 AC4: cancellation notice including the employer's reason.
  async sendInterviewCancelledEmail(
    to: string,
    talentName: string,
    details: InterviewEmailDetails,
    reason: string,
  ): Promise<void> {
    await this.send(
      to,
      `Interview cancelled: ${safeHeader(details.title)}`,
      `<p>Hi ${escapeHtml(talentName)},</p><p>${escapeHtml(details.companyName)} cancelled the interview "${escapeHtml(details.title)}" for "${escapeHtml(details.jobTitle)}".</p><p>Reason:</p><blockquote style="margin:0;padding:8px 12px;border-left:3px solid #d0d7de">${escapeHtml(reason)}</blockquote>`,
    );
  }

  // PB68 AC6: the other party is e-mailed about a new message.
  async sendNewMessageEmail(
    to: string,
    recipientName: string,
    senderLabel: string,
    jobTitle: string,
    preview: string,
    applicationId: string,
  ): Promise<void> {
    await this.send(
      to,
      `New message from ${safeHeader(senderLabel)} about ${safeHeader(jobTitle)}`,
      `<p>Hi ${escapeHtml(recipientName)},</p><p>${escapeHtml(senderLabel)} sent you a message about "${escapeHtml(jobTitle)}":</p><blockquote style="margin:0;padding:8px 12px;border-left:3px solid #d0d7de">${escapeHtml(preview)}</blockquote><p><a href="${this.buildFrontendUrl(`/applications/${applicationId}/messages`)}">Reply</a></p>`,
    );
  }

  async sendJobInvitationEmail(
    to: string,
    talentName: string,
    jobTitle: string,
    companyName: string,
  ): Promise<void> {
    await this.send(
      to,
      `${safeHeader(companyName)} invited you to apply`,
      `<p>Hi ${escapeHtml(talentName)},</p><p>${escapeHtml(companyName)} invited you to apply for "${escapeHtml(jobTitle)}". Log in to view the invitation.</p>`,
    );
  }

  async sendBacklogReminderEmail(
    to: string,
    items: { candidateName: string; jobTitle: string; daysStuck: number }[],
  ): Promise<void> {
    const rows = items
      .map(
        (item) =>
          `<li>${escapeHtml(item.candidateName)} — "${escapeHtml(item.jobTitle)}" (${item.daysStuck}d awaiting your response)</li>`,
      )
      .join("");
    await this.send(
      to,
      `${items.length} application${items.length === 1 ? "" : "s"} awaiting your response`,
      `<p>These candidates have been waiting a while — take a look when you can:</p><ul>${rows}</ul>`,
    );
  }

  async sendJobAlertEmail(to: string, jobs: JobWithRelations[]): Promise<void> {
    const rows = jobs
      .map((job) => {
        const jobUrl = this.buildFrontendUrl(
          `/jobs/${encodeURIComponent(job.slug)}`,
        );
        return `<li><a href="${escapeHtml(jobUrl)}">${escapeHtml(job.title)}</a></li>`;
      })
      .join("");
    await this.send(
      to,
      `${jobs.length} new jobs matching your alert`,
      `<ul>${rows}</ul>`,
    );
  }
}
