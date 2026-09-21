import { Injectable, Logger } from "@nestjs/common";
import { JobModerationRepository } from "./job-moderation.repository";
import {
  parseJobModerationResponse,
  type JobModerationFlagResult,
} from "./job-moderation-response.parser";
import { JOB_MODERATION_MAX_TOKENS } from "./constants";
import type { JobModerationFlag, JobModerationSource } from "./interfaces";
import { AiService } from "@/modules/ai/ai.service";
import { SingleFlight } from "@/common/utils/single-flight.util";
import {
  NotFoundApiException,
  ServiceUnavailableApiException,
} from "@/common/exceptions/api.exception";
import { ErrorCode } from "@/common/exceptions/error-codes";

const SYSTEM_PROMPT =
  "You are a trust & safety assistant helping a job board's moderators spot scam or low-quality " +
  "job postings before they go live. You give an ADVISORY opinion only — a human moderator always " +
  "makes the final approve/reject decision, so favor honest uncertainty over confident overreach. " +
  "Base every claim strictly on the posting text provided — never invent facts about the company. " +
  "Common red flags worth watching for: upfront payment or 'starter kit' requests, requests to move " +
  "communication off-platform immediately, implausible pay for the stated role/seniority, vague or " +
  "generic company descriptions, urgency/pressure language, and requests for sensitive personal or " +
  "financial information before any interview. Respond with ONLY a single JSON object, no prose " +
  'outside it, matching exactly: {"riskLevel": "LOW" | "MEDIUM" | "HIGH", "reasons": string[] ' +
  '(max 5, short and specific — omit entirely, i.e. [], if riskLevel is "LOW" and nothing stood ' +
  'out), "summary": "1-2 sentence overall assessment for the moderator"}.';

@Injectable()
export class JobModerationService {
  private readonly logger = new Logger(JobModerationService.name);
  private readonly singleFlight = new SingleFlight<JobModerationFlag>();

  constructor(
    private readonly jobModerationRepository: JobModerationRepository,
    private readonly aiService: AiService,
  ) {}

  // Advisory-only: nothing in this class writes to Job.status or otherwise
  // touches JobsService.approveForReview/rejectForReview. This only ever
  // produces a signal for a human moderator to read — see AdminService,
  // whose reviewJob (the actual approve/reject path) never calls this.
  async getOrCreate(jobId: string): Promise<JobModerationFlag> {
    const existing = await this.jobModerationRepository.findByJobId(jobId);
    if (existing) return existing;

    return this.singleFlight.run(jobId, () => this.generate(jobId));
  }

  // Explicit "run this again" action (e.g. AiRiskFlag's Re-check button) —
  // unlike getOrCreate, never short-circuits on an existing row. Same
  // SingleFlight key as getOrCreate: a regenerate racing a concurrent
  // getOrCreate for the same job collapses into one in-flight AI call
  // rather than paying for two.
  async regenerate(jobId: string): Promise<JobModerationFlag> {
    return this.singleFlight.run(jobId, () =>
      this.generate(jobId, { overwrite: true }),
    );
  }

  private async generate(
    jobId: string,
    opts?: { overwrite?: boolean },
  ): Promise<JobModerationFlag> {
    if (!this.aiService.isConfigured) {
      throw new ServiceUnavailableApiException(
        "AI risk check is not configured.",
        ErrorCode.JOB_MODERATION_UNAVAILABLE,
      );
    }

    const source = await this.jobModerationRepository.findSourceForJob(jobId);
    if (!source) {
      throw new NotFoundApiException("Job not found", ErrorCode.JOB_NOT_FOUND);
    }

    const { model, ...flag } = await this.analyze(source);
    const input = { jobId, model, ...flag };

    return opts?.overwrite
      ? this.jobModerationRepository.replace(input)
      : this.jobModerationRepository.create(input);
  }

  private async analyze(
    job: NonNullable<JobModerationSource>,
  ): Promise<JobModerationFlagResult & { model: string }> {
    const salary =
      job.salaryMin || job.salaryMax
        ? `${job.currency} ${job.salaryMin ?? "?"}–${job.salaryMax ?? "?"}/month`
        : "Not disclosed";

    const prompt = [
      `Company: ${job.employer.companyName}`,
      `Job title: ${job.title}`,
      `Remote: ${job.isRemote ? "Yes" : "No"}${job.country ? ` (${job.country})` : ""}`,
      `Salary: ${salary}`,
      `Description:\n${job.description}`,
      job.requirements ? `Requirements:\n${job.requirements}` : null,
    ]
      .filter(Boolean)
      .join("\n\n");

    const { text, model } = await this.aiService.complete({
      maxTokens: JOB_MODERATION_MAX_TOKENS,
      system: SYSTEM_PROMPT,
      prompt,
    });

    const parsed = parseJobModerationResponse(text);
    if (!parsed) {
      // Not logging `raw: text` — a PENDING_REVIEW job's exact wording isn't
      // public yet, and a near-miss parse failure could still contain
      // paraphrased text from it. Same reasoning as
      // CvAnalysisService.analyze's own failure-path log.
      this.logger.error("Failed to parse job moderation response", {
        length: text.length,
      });
      throw new ServiceUnavailableApiException(
        "AI risk check returned an unexpected response. Please try again.",
        ErrorCode.JOB_MODERATION_FAILED,
      );
    }
    return { ...parsed, model };
  }
}
