import { Injectable, Logger } from "@nestjs/common";
import { PDFParse } from "pdf-parse";
import { MAX_RESUME_BYTES, MAX_RESUME_TEXT_CHARS } from "./constants";
import { BadRequestApiException } from "@/common/exceptions/api.exception";
import { ErrorCode } from "@/common/exceptions/error-codes";

@Injectable()
export class ResumeExtractionService {
  private readonly logger = new Logger(ResumeExtractionService.name);

  async extractText(resumeUrl: string): Promise<string> {
    const buffer = await this.download(resumeUrl);
    return this.parse(buffer, resumeUrl);
  }

  private async download(resumeUrl: string): Promise<Buffer> {
    let response: Response;
    try {
      response = await fetch(resumeUrl, {
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      this.logger.warn(`Failed to fetch resume ${resumeUrl}`, error);
      throw new BadRequestApiException(
        "Couldn't download this applicant's CV. Please try again shortly.",
        ErrorCode.CV_ANALYSIS_FAILED,
      );
    }
    if (!response.ok) {
      throw new BadRequestApiException(
        "Couldn't download this applicant's CV. Please try again shortly.",
        ErrorCode.CV_ANALYSIS_FAILED,
      );
    }

    const contentLength = response.headers.get("content-length");
    if (contentLength && Number(contentLength) > MAX_RESUME_BYTES) {
      throw new BadRequestApiException(
        "This CV is too large to analyze.",
        ErrorCode.CV_ANALYSIS_FAILED,
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_RESUME_BYTES) {
      throw new BadRequestApiException(
        "This CV is too large to analyze.",
        ErrorCode.CV_ANALYSIS_FAILED,
      );
    }
    return Buffer.from(arrayBuffer);
  }

  private async parse(buffer: Buffer, resumeUrl: string): Promise<string> {
    const parser = new PDFParse({ data: buffer });
    try {
      const { text } = await parser.getText();
      const trimmed = text.trim();
      if (!trimmed) {
        throw new BadRequestApiException(
          "Couldn't read any text from this CV — it may be a scanned image rather than a text PDF.",
          ErrorCode.CV_ANALYSIS_FAILED,
        );
      }
      return trimmed.slice(0, MAX_RESUME_TEXT_CHARS);
    } catch (error) {
      if (error instanceof BadRequestApiException) throw error;
      this.logger.warn(`Failed to parse resume PDF ${resumeUrl}`, error);
      throw new BadRequestApiException(
        "Couldn't read this CV — the file may not be a valid PDF.",
        ErrorCode.CV_ANALYSIS_FAILED,
      );
    } finally {
      await parser.destroy();
    }
  }
}
