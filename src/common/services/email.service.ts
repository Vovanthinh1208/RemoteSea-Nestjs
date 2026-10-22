import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Resend } from "resend";
import type { EnvConfig } from "@/core/config/env.validation";
import type { JobWithRelations } from "@/common/types/job-with-relations.type";
import { escapeHtml } from "@/common/utils/escape-html";
import { CircuitBreaker } from "@/common/utils/circuit-breaker";

/**
 * Ported from src/lib/email.ts. The original Next.js app renders React Email
 * (.tsx) templates via @react-email/render — those template components live
 * in the Next.js app under src/emails/ and were out of scope for the API
 * route migration. This service preserves every call site, payload, and
 * "no-op when RESEND_API_KEY is unset" behavior, but emails plain HTML
 * instead of the original branded templates. Port src/emails/*.tsx into this
 * service (or a shared package) to restore pixel-identical emails.
 */
const SEND_TIMEOUT_MS = 10_000;
// Opens after 5 consecutive failures (a real Resend outage, not one flaky
// send) and stays open for 30s before letting a single trial through. Without
// this, a degraded Resend turns every queued send — most visibly the alerts
// cron's chunks of up to SEND_CONCURRENCY sends — into a full SEND_TIMEOUT_MS
// wait each, instead of failing the rest of the batch fast once the outage is
// detected.
const BREAKER_FAILURE_THRESHOLD = 5;
const BREAKER_COOLDOWN_MS = 30_000;

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend: Resend;
  private readonly from: string;
  private readonly appUrl: string;
  private readonly enabled: boolean;
  private readonly breaker = new CircuitBreaker(
    BREAKER_FAILURE_THRESHOLD,
    BREAKER_COOLDOWN_MS,
  );

  constructor(private readonly config: ConfigService<EnvConfig, true>) {
    const apiKey = this.config.get("RESEND_API_KEY", { infer: true });
    this.enabled = Boolean(apiKey);
    // Resend's constructor throws synchronously on an empty key. Original
    // lib/email.ts only checked the key inside send(), never at module load,
    // so an unconfigured key must not prevent the app from booting.
    this.resend = new Resend(apiKey || "re_unconfigured");
    this.from =
      this.config.get("EMAIL_FROM", { infer: true }) ??
      "RemoteSEA <noreply@remotesea.io>";
    this.appUrl = this.config.get("FRONTEND_URL", { infer: true });
  }

  private async send(to: string, subject: string, html: string): Promise<void> {
    if (!this.enabled) return;

    if (this.breaker.isOpen()) {
      // Skip and log here rather than throw: callers already treat a thrown
      // send() failure as "log and drop" via runInBackground, so throwing
      // here would just reproduce that same outcome through a longer path.
      this.logger.warn(
        `Skipping email to ${to}: Resend appears to be down (circuit open)`,
      );
      return;
    }

    // The Resend SDK has no built-in request timeout, so a slow/hung upstream
    // call would otherwise block the caller (e.g. the alerts cron loop) indefinitely.
    let timer: ReturnType<typeof setTimeout>;
    try {
      await Promise.race([
        this.resend.emails.send({ from: this.from, to, subject, html }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("Email send timed out")),
            SEND_TIMEOUT_MS,
          );
        }),
      ]);
      this.breaker.onSuccess();
    } catch (error) {
      this.breaker.onFailure();
      throw error;
    } finally {
      clearTimeout(timer!);
    }
  }

  async sendWelcomeEmail(to: string, name: string): Promise<void> {
    await this.send(
      to,
      "Welcome to RemoteSEA",
      `<p>Hi ${escapeHtml(name)},</p><p>Welcome to RemoteSEA! Start exploring remote jobs at <a href="${this.appUrl}">${this.appUrl}</a>.</p>`,
    );
  }

  async sendPasswordResetEmail(to: string, token: string): Promise<void> {
    const resetUrl = `${this.appUrl}/reset-password?token=${token}`;
    await this.send(
      to,
      "Reset your RemoteSEA password",
      `<p>Reset your password by clicking <a href="${resetUrl}">here</a>. This link expires in 1 hour.</p>`,
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
    const verifyUrl = `${this.appUrl}/employer/verify?token=${token}`;
    await this.send(
      to,
      "Verify your company email",
      `<p>Confirm ${escapeHtml(companyName)} controls this address by clicking <a href="${verifyUrl}">here</a>. This link expires in 24 hours.</p>`,
    );
  }

  async sendTeamInvitationEmail(
    to: string,
    companyName: string,
    role: string,
    token: string,
  ): Promise<void> {
    const acceptUrl = `${this.appUrl}/team/invitations/${token}`;
    await this.send(
      to,
      `You've been invited to join ${companyName} on RemoteSEA`,
      `<p>You've been invited to join <strong>${escapeHtml(companyName)}</strong> as ${escapeHtml(role)}. Click <a href="${acceptUrl}">here</a> to accept. This link expires in 7 days.</p>`,
    );
  }

  async sendTalentVerificationEmail(to: string, token: string): Promise<void> {
    const verifyUrl = `${this.appUrl}/talent/verify?token=${token}`;
    await this.send(
      to,
      "Verify your email",
      `<p>Confirm you control this address by clicking <a href="${verifyUrl}">here</a>. This link expires in 1 hour.</p>`,
    );
  }

  async sendJobLiveEmail(
    to: string,
    jobTitle: string,
    jobSlug: string,
  ): Promise<void> {
    await this.send(
      to,
      "Your job is live",
      `<p>Your listing "${escapeHtml(jobTitle)}" is now live: <a href="${this.appUrl}/jobs/${jobSlug}">${this.appUrl}/jobs/${jobSlug}</a></p>`,
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
      `New application: ${talentName}`,
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
      `Your application for ${jobTitle} is now ${statusLabel}`,
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
      `${companyName} invited you to apply`,
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
      .map(
        (job) =>
          `<li><a href="${this.appUrl}/jobs/${job.slug}">${escapeHtml(job.title)}</a></li>`,
      )
      .join("");
    await this.send(
      to,
      `${jobs.length} new jobs matching your alert`,
      `<ul>${rows}</ul>`,
    );
  }
}
