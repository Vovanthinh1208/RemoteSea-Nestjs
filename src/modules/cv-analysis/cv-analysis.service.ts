import { Injectable, Logger } from "@nestjs/common";
import { CvAnalysisRepository } from "./cv-analysis.repository";
import { ResumeExtractionService } from "./resume-extraction.service";
import {
  parseCvAnalysisResponse,
  type CvAnalysisResult,
} from "./cv-analysis-response.parser";
import { CV_ANALYSIS_MAX_TOKENS } from "./constants";
import type { CvAnalysis } from "./interfaces";
import { AiService } from "@/modules/ai/ai.service";
import { SingleFlight } from "@/common/utils/single-flight.util";
import {
  BadRequestApiException,
  ServiceUnavailableApiException,
} from "@/common/exceptions/api.exception";
import { ErrorCode } from "@/common/exceptions/error-codes";

type AnalysisJob = {
  title: string;
  description: string;
  requirements: string | null;
  level: string;
};

@Injectable()
export class CvAnalysisService {
  private readonly logger = new Logger(CvAnalysisService.name);
  private readonly singleFlight = new SingleFlight<CvAnalysis>();

  constructor(
    private readonly cvAnalysisRepository: CvAnalysisRepository,
    private readonly resumeExtractionService: ResumeExtractionService,
    private readonly aiService: AiService,
  ) {}

  async getOrCreate(applicationId: string): Promise<CvAnalysis> {
    const existing =
      await this.cvAnalysisRepository.findByApplicationId(applicationId);
    if (existing) return existing;

    return this.singleFlight.run(applicationId, () =>
      this.generate(applicationId),
    );
  }

  // Explicit "run this again" action (e.g. CvAnalysisCard's Regenerate
  // button) — unlike getOrCreate, never short-circuits on an existing row.
  // Same SingleFlight key as getOrCreate: a regenerate racing a concurrent
  // getOrCreate for the same application collapses into one in-flight AI
  // call rather than paying for two.
  async regenerate(applicationId: string): Promise<CvAnalysis> {
    return this.singleFlight.run(applicationId, () =>
      this.generate(applicationId, { overwrite: true }),
    );
  }

  private async generate(
    applicationId: string,
    opts?: { overwrite?: boolean },
  ): Promise<CvAnalysis> {
    if (!this.aiService.isConfigured) {
      throw new ServiceUnavailableApiException(
        "CV analysis is not configured.",
        ErrorCode.CV_ANALYSIS_UNAVAILABLE,
      );
    }

    const source =
      await this.cvAnalysisRepository.findSourceForApplication(applicationId);
    if (!source?.resumeUrl) {
      throw new BadRequestApiException(
        "This applicant hasn't uploaded a CV.",
        ErrorCode.CV_ANALYSIS_NO_RESUME,
      );
    }

    const resumeText = await this.resumeExtractionService.extractText(
      source.resumeUrl,
    );
    const { model, ...analysis } = await this.analyze(resumeText, source.job);
    const input = { applicationId, model, ...analysis };

    return opts?.overwrite
      ? this.cvAnalysisRepository.replace(input)
      : this.cvAnalysisRepository.create(input);
  }

  private async analyze(
    resumeText: string,
    job: AnalysisJob,
  ): Promise<CvAnalysisResult & { model: string }> {
    const prompt = [
      `Job title: ${job.title}`,
      `Seniority level: ${job.level}`,
      `Job description:\n${job.description}`,
      job.requirements ? `Requirements:\n${job.requirements}` : null,
      `\nCandidate resume:\n${resumeText}`,
    ]
      .filter(Boolean)
      .join("\n\n");

    const { text, model } = await this.aiService.complete({
      maxTokens: CV_ANALYSIS_MAX_TOKENS,
      system:
        "You are a recruiting assistant helping an employer quickly assess a candidate's resume against a specific job. " +
        "This is decision support only, not a hiring decision — the recruiter always makes the final call. " +
        "Base every claim strictly on the resume and job text provided — never invent experience, skills, credentials, or employment history the resume doesn't state. " +
        "Never factor in or mention protected/sensitive characteristics (age, gender, race, marital/family status, nationality, disability, religion) even if inferable from the resume — evaluate qualifications only. " +
        "If the resume doesn't give you enough to judge a specific point, say so explicitly rather than guessing. " +
        "Respond with ONLY a single JSON object, no prose outside it, matching exactly: " +
        '{"fitScore": number 0-100, "summary": "2-3 sentence objective summary", "strengths": string[] (max 4, specific to this job), "gaps": string[] (max 4, specific to this job), "suggestedQuestions": string[] (max 3, interview questions probing the biggest gaps/unknowns), ' +
        '"recommendation": "PROCEED" | "REVIEW" | "REJECT" (REVIEW when evidence is genuinely mixed or insufficient — never guess toward PROCEED or REJECT), "recommendationReason": "one sentence, the single biggest factor behind that recommendation"}.',
      prompt,
    });

    const parsed = parseCvAnalysisResponse(text);
    if (!parsed) {
      // Not logging `raw: text` here — unlike a truly opaque provider error,
      // this text is model output *derived from the candidate's resume* (the
      // parse failure could be a near-miss, e.g. valid JSON with one field
      // out of shape, still containing paraphrased resume content), so it's
      // exactly the "raw AI response containing sensitive data" this
      // feature's logging is required to avoid. The length is enough to
      // distinguish "empty response" from "malformed JSON" from "wrong
      // shape" during triage without persisting any of the content itself.
      this.logger.error("Failed to parse CV analysis response", {
        length: text.length,
      });
      throw new ServiceUnavailableApiException(
        "CV analysis returned an unexpected response. Please try again.",
        ErrorCode.CV_ANALYSIS_FAILED,
      );
    }
    return { ...parsed, model };
  }
}
