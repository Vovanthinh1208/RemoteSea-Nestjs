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
    this.appUrl = this.config.get("FRONTEND_URL", { infer: true });

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

  async sendWelcomeEmail(to: string, name: string): Promise<void> {
    await this.send(
      to,
      "Welcome to RemoteSEA",
      `<p>Hi ${escapeHtml(name)},</p><p>Welcome to RemoteSEA! Start exploring remote jobs at <a href="${escapeHtml(this.appUrl)}">${escapeHtml(this.appUrl)}</a>.</p>`,
    );
  }

  async sendPasswordResetEmail(to: string, token: string): Promise<void> {
    const resetUrl = `${this.appUrl}/reset-password?token=${encodeURIComponent(token)}`;
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

  async sendEmployerVerificationEmail(
    to: string,
    companyName: string,
    token: string,
  ): Promise<void> {
    const verifyUrl = `${this.appUrl}/employer/verify?token=${encodeURIComponent(token)}`;
    await this.send(
      to,
      "Verify your company email",
      `<p>Confirm that ${escapeHtml(companyName)} controls this address by clicking the link below. This link expires in 24 hours.</p><p><a href="${escapeHtml(verifyUrl)}">Verify company email</a></p>`,
    );
  }

  async sendTeamInvitationEmail(
    to: string,
    companyName: string,
    role: string,
    token: string,
  ): Promise<void> {
    const acceptUrl = `${this.appUrl}/team/invitations/${encodeURIComponent(token)}`;
    await this.send(
      to,
      `You've been invited to join ${safeHeader(companyName)} on RemoteSEA`,
      `<p>You've been invited to join <strong>${escapeHtml(companyName)}</strong> as ${escapeHtml(role)}. Click the link below to accept. This link expires in 7 days.</p><p><a href="${escapeHtml(acceptUrl)}">Accept invitation</a></p>`,
    );
  }

  async sendTalentVerificationEmail(to: string, token: string): Promise<void> {
    const verifyUrl = `${this.appUrl}/talent/verify?token=${encodeURIComponent(token)}`;
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
    const jobUrl = `${this.appUrl}/jobs/${encodeURIComponent(jobSlug)}`;
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
  ): Promise<void> {
    await this.send(
      to,
      `Your application for ${safeHeader(jobTitle)} is now ${safeHeader(statusLabel)}`,
      `<p>Hi ${escapeHtml(talentName)},</p><p>Your application for "${escapeHtml(jobTitle)}" is now <strong>${escapeHtml(statusLabel)}</strong>. Log in to see the full timeline.</p>`,
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
        const jobUrl = `${this.appUrl}/jobs/${encodeURIComponent(job.slug)}`;
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
