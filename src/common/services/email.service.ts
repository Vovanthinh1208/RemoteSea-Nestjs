import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Resend } from "resend";
import type { EnvConfig } from "@/core/config/env.validation";
import type { JobWithRelations } from "@/common/types/job-with-relations.type";
import { escapeHtml } from "@/common/utils/escape-html";

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

@Injectable()
export class EmailService {
  private readonly resend: Resend;
  private readonly from: string;
  private readonly appUrl: string;
  private readonly enabled: boolean;

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
