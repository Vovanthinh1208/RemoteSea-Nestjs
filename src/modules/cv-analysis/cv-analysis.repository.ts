import { Injectable } from "@nestjs/common";
import { PrismaService } from "@/core/database/prisma.service";
import {
  cvAnalysisSelect,
  type CreateCvAnalysisInput,
  type CvAnalysis,
  type CvAnalysisSource,
} from "./interfaces";

@Injectable()
export class CvAnalysisRepository {
  constructor(private readonly prisma: PrismaService) {}

  async claimRegeneration(
    applicationId: string,
    windowMs: number,
  ): Promise<boolean> {
    // A single compare-and-set in PostgreSQL: two instances cannot both pay
    // for a regeneration. Use the database clock, including across restarts.
    const claimed = await this.prisma.$queryRaw<{ id: string }[]>`
      UPDATE applications
      SET "cvAnalysisRegeneratedAt" = CURRENT_TIMESTAMP
      WHERE id = ${applicationId}
        AND ("cvAnalysisRegeneratedAt" IS NULL OR
          "cvAnalysisRegeneratedAt" <= CURRENT_TIMESTAMP - ${windowMs} * INTERVAL '1 millisecond')
      RETURNING id
    `;
    return claimed.length === 1;
  }

  findByApplicationId(applicationId: string): Promise<CvAnalysis | null> {
    return this.prisma.cvAnalysis.findUnique({
      where: { applicationId },
      select: cvAnalysisSelect,
    });
  }

  findSourceForApplication(applicationId: string): Promise<CvAnalysisSource> {
    return this.prisma.application.findUnique({
      where: { id: applicationId },
      select: {
        resumeUrl: true,
        job: {
          select: {
            title: true,
            description: true,
            requirements: true,
            level: true,
          },
        },
      },
    });
  }

  // Upsert, not create — a concurrent second request for the same
  // still-uncached application (two employer tabs opening the workspace at
  // once) would otherwise hit the applicationId unique constraint. Whichever
  // write loses just returns the winner's row instead of a 500 — `update: {}`
  // is deliberate here: both writes are equally fresh first-time analyses,
  // so there's no reason to prefer the second over the first.
  create(input: CreateCvAnalysisInput): Promise<CvAnalysis> {
    return this.prisma.cvAnalysis.upsert({
      where: { applicationId: input.applicationId },
      create: input,
      update: {},
      select: cvAnalysisSelect,
    });
  }

  // A real overwrite (unlike create's intentionally-inert `update: {}`) —
  // backs CvAnalysisService.regenerate, the explicit "run this again" action
  // a recruiter can take on an analysis that already exists (e.g. one
  // generated before a prompt change added a new field, or one they simply
  // want a second opinion on). Still keyed on applicationId, so it's the
  // same row, not a new history entry.
  replace(input: CreateCvAnalysisInput): Promise<CvAnalysis> {
    const { applicationId, ...data } = input;
    return this.prisma.cvAnalysis.upsert({
      where: { applicationId },
      create: input,
      update: data,
      select: cvAnalysisSelect,
    });
  }
}
