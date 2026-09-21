import type { Prisma } from "@prisma/client";

export const cvAnalysisSelect = {
  id: true,
  fitScore: true,
  summary: true,
  strengths: true,
  gaps: true,
  suggestedQuestions: true,
  recommendation: true,
  recommendationReason: true,
  model: true,
  createdAt: true,
} satisfies Prisma.CvAnalysisSelect;

export type CvAnalysis = Prisma.CvAnalysisGetPayload<{
  select: typeof cvAnalysisSelect;
}>;

export type CreateCvAnalysisInput = {
  applicationId: string;
  fitScore: number;
  summary: string;
  strengths: string[];
  gaps: string[];
  suggestedQuestions: string[];
  recommendation: NonNullable<CvAnalysis["recommendation"]>;
  recommendationReason: string;
  model: string;
};

export type CvAnalysisSource = {
  resumeUrl: string | null;
  job: {
    title: string;
    description: string;
    requirements: string | null;
    level: string;
  };
} | null;
