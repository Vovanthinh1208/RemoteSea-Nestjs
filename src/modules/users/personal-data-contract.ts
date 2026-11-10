import { z } from "zod";

export const EXPORT_SCHEMA_VERSION = "2.0";
export const EXPORT_ROW_LIMIT = 10_000;
export const EXPORT_BYTE_LIMIT = 8 * 1024 * 1024;
export class ExportTooLargeError extends Error {}
export class ExportRenderError extends Error {}
const text = z.string().nullable().optional();
const date = z.string().datetime().nullable().optional();
const numeric = z.number().nullable().optional();
const flag = z.boolean().optional();

// A second, independent allowlist at the serialization boundary. New database
// columns cannot become downloadable merely because a model grows a field.
export const personalDataAccountSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: text,
  phone: text,
  image: text,
  role: z.enum(["TALENT", "EMPLOYER", "ADMIN"]).optional(),
  language: text,
  region: text,
  currencyDisplay: text,
  emailVerified: flag,
  isPaused: flag,
  pausedAt: date,
  bannedAt: date,
  createdAt: date,
  updatedAt: date,
  talent: z
    .object({
      id: z.string().optional(),
      slug: text,
      headline: text,
      bio: text,
      location: text,
      country: text,
      timezone: text,
      yearsExperience: numeric,
      level: text,
      resumeUrl: text,
      portfolioUrl: text,
      githubUrl: text,
      linkedinUrl: text,
      isOpenToWork: flag,
      visibility: text,
      desiredSalaryMin: numeric,
      desiredSalaryMax: numeric,
      currency: text,
      primaryRole: text,
      rightToWork: text,
      noticePeriod: text,
      employmentTypes: z.array(z.string()).optional(),
      timezoneOverlap: z.array(z.string()).optional(),
      createdAt: date,
      updatedAt: date,
      skills: z
        .array(
          z.object({
            yearsExp: numeric,
            skill: z.object({ name: z.string() }),
          }),
        )
        .optional(),
      workExperiences: z
        .array(
          z.object({
            company: z.string(),
            title: z.string(),
            location: text,
            startDate: date,
            endDate: date,
            description: text,
            createdAt: date,
            updatedAt: date,
          }),
        )
        .optional(),
      profileHighlights: z
        .array(
          z.object({
            type: z.string(),
            title: z.string(),
            subtitle: text,
            description: text,
            tag: text,
            url: text,
            startYear: numeric,
            endYear: numeric,
            createdAt: date,
            updatedAt: date,
          }),
        )
        .optional(),
      applications: z
        .array(
          z.object({
            id: z.string(),
            status: z.string(),
            coverLetter: text,
            resumeUrl: text,
            contactPhone: text,
            appliedAt: date,
            updatedAt: date,
            viewedAt: date,
            rejectionReason: text,
            offerSalary: text,
            offerBenefits: text,
            offerStartDate: date,
            offerDeclineReason: text,
            job: z.object({
              title: z.string(),
              slug: text,
              employer: z.object({ companyName: z.string() }),
            }),
            statusEvents: z
              .array(z.object({ status: z.string(), createdAt: date }))
              .optional(),
          }),
        )
        .optional(),
    })
    .nullable()
    .optional(),
  employer: z
    .object({
      companyName: z.string(),
      slug: text,
      logoUrl: text,
      websiteUrl: text,
      description: text,
      industry: text,
      size: text,
      founded: numeric,
      hqCountry: text,
      hqCity: text,
      hqAddress: text,
      benefits: z.array(z.string()).optional(),
      linkedinUrl: text,
      facebookUrl: text,
      videoUrl: text,
      coverImageUrl: text,
      isVerified: flag,
      verifiedAt: date,
      suspendedAt: date,
      createdAt: date,
      updatedAt: date,
      jobs: z
        .array(
          z.object({
            title: z.string(),
            slug: text,
            status: z.string(),
            createdAt: date,
            publishedAt: date,
          }),
        )
        .optional(),
    })
    .nullable()
    .optional(),
  notificationPreference: z
    .object({
      applicationUpdates: flag,
      employerMessages: flag,
      weeklyDigest: flag,
      instantMatchAlerts: flag,
      productNews: flag,
      tipsAndResources: flag,
      browserPush: flag,
      updatedAt: date,
    })
    .nullable()
    .optional(),
  jobAlerts: z
    .array(
      z.object({
        name: z.string().optional(),
        keywords: text,
        jobType: text,
        level: text,
        salaryMin: numeric,
        country: text,
        timezone: text,
        frequency: text,
        isActive: flag,
        lastSentAt: date,
        createdAt: date,
        updatedAt: date,
        categories: z
          .array(z.object({ category: z.object({ name: z.string() }) }))
          .optional(),
      }),
    )
    .optional(),
  messages: z
    .array(
      z.object({
        applicationId: z.string(),
        body: z.string(),
        createdAt: z.string().datetime(),
        application: z
          .object({
            job: z.object({
              title: z.string(),
              employer: z.object({ companyName: z.string() }),
            }),
          })
          .optional(),
      }),
    )
    .optional(),
});

export type ExportAccountData = z.infer<typeof personalDataAccountSchema>;
export type ExportLocale = "en" | "vi";
export interface PersonalDataExportPayload {
  exportedAt: string;
  account: ExportAccountData;
  metadata?: {
    referenceId: string;
    schemaVersion: string;
    timeZone: string;
    consistency: string;
    messageScope: string;
    exclusions: string[];
  };
}
