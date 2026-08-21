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

  private async generate(applicationId: string): Promise<CvAnalysis> {
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

    return this.cvAnalysisRepository.create({
      applicationId,
      model,
      ...analysis,
    });
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
        "Base every claim strictly on the resume and job text provided — never invent experience, skills, or credentials the resume doesn't state. " +
        "Respond with ONLY a single JSON object, no prose outside it, matching exactly: " +
        '{"fitScore": number 0-100, "summary": "2-3 sentence objective summary", "strengths": string[] (max 4, specific to this job), "gaps": string[] (max 4, specific to this job), "suggestedQuestions": string[] (max 3, interview questions probing the biggest gaps/unknowns)}.',
      prompt,
    });

    const parsed = parseCvAnalysisResponse(text);
    if (!parsed) {
      this.logger.error("Failed to parse CV analysis response", { raw: text });
      throw new ServiceUnavailableApiException(
        "CV analysis returned an unexpected response. Please try again.",
        ErrorCode.CV_ANALYSIS_FAILED,
      );
    }
    return { ...parsed, model };
  }
}
