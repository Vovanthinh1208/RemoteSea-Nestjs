import { Prisma } from "@prisma/client";
import type { PrismaService } from "@/core/database/prisma.service";
import {
  EXPORT_BYTE_LIMIT,
  EXPORT_ROW_LIMIT,
  ExportTooLargeError,
} from "./personal-data-contract";

const PAGE_SIZE = 100;
const page = (cursor?: string) => ({
  take: PAGE_SIZE,
  orderBy: { id: "asc" as const },
  ...(cursor && { cursor: { id: cursor }, skip: 1 }),
});
class Budget {
  rows = 0;
  bytes = 0;
  add(value: unknown, rows = 1) {
    this.rows += rows;
    this.bytes += Buffer.byteLength(JSON.stringify(value));
    if (this.rows > EXPORT_ROW_LIMIT || this.bytes > EXPORT_BYTE_LIMIT)
      throw new ExportTooLargeError(
        "Export exceeds the synchronous archive limit",
      );
  }
}
async function allPages<T extends { id: string }>(
  budget: Budget,
  read: (cursor?: string) => Promise<T[]>,
) {
  const result: T[] = [];
  let cursor: string | undefined;
  for (;;) {
    const rows = await read(cursor);
    budget.add(rows, rows.length);
    result.push(...rows);
    if (rows.length < PAGE_SIZE) return result;
    cursor = rows[rows.length - 1]!.id;
  }
}
const withoutId = <T extends { id: string }>({ id: _id, ...fields }: T) =>
  fields;

export function collectPersonalData(prisma: PrismaService, userId: string) {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      const [snapshot] = await tx.$queryRaw<
        { at: Date }[]
      >`SELECT transaction_timestamp() AS at`;
      const budget = new Budget();
      const account = await tx.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          name: true,
          phone: true,
          image: true,
          role: true,
          language: true,
          region: true,
          currencyDisplay: true,
          emailVerified: true,
          isPaused: true,
          pausedAt: true,
          bannedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      if (!account) return null;
      budget.add(account);
      const talent = await tx.talentProfile.findUnique({
        where: { userId },
        select: {
          id: true,
          slug: true,
          headline: true,
          bio: true,
          location: true,
          country: true,
          timezone: true,
          yearsExperience: true,
          level: true,
          resumeUrl: true,
          portfolioUrl: true,
          githubUrl: true,
          linkedinUrl: true,
          isOpenToWork: true,
          visibility: true,
          desiredSalaryMin: true,
          desiredSalaryMax: true,
          currency: true,
          primaryRole: true,
          rightToWork: true,
          noticePeriod: true,
          employmentTypes: true,
          timezoneOverlap: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      const employer = await tx.employerProfile.findUnique({
        where: { userId },
        select: {
          companyName: true,
          slug: true,
          logoUrl: true,
          websiteUrl: true,
          description: true,
          industry: true,
          size: true,
          founded: true,
          hqCountry: true,
          hqCity: true,
          hqAddress: true,
          benefits: true,
          linkedinUrl: true,
          facebookUrl: true,
          videoUrl: true,
          coverImageUrl: true,
          isVerified: true,
          verifiedAt: true,
          suspendedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      budget.add({ talent, employer });
      const workExperiences = talent
        ? await allPages(budget, (cursor) =>
            tx.workExperience.findMany({
              ...page(cursor),
              where: { talent: { userId } },
              select: {
                id: true,
                company: true,
                title: true,
                location: true,
                startDate: true,
                endDate: true,
                description: true,
                createdAt: true,
                updatedAt: true,
              },
            }),
          )
        : [];
      const highlights = talent
        ? await allPages(budget, (cursor) =>
            tx.profileHighlight.findMany({
              ...page(cursor),
              where: { talent: { userId } },
              select: {
                id: true,
                type: true,
                title: true,
                subtitle: true,
                description: true,
                tag: true,
                url: true,
                startYear: true,
                endYear: true,
                createdAt: true,
                updatedAt: true,
              },
            }),
          )
        : [];
      const skills: { skill: { name: string }; yearsExp: number | null }[] = [];
      if (talent) {
        let cursor: string | undefined;
        for (;;) {
          const batch = await tx.talentSkill.findMany({
            where: { talent: { userId } },
            take: PAGE_SIZE,
            orderBy: { skillId: "asc" },
            ...(cursor && {
              cursor: {
                talentId_skillId: { talentId: talent.id, skillId: cursor },
              },
              skip: 1,
            }),
            select: {
              skillId: true,
              yearsExp: true,
              skill: { select: { name: true } },
            },
          });
          budget.add(batch, batch.length);
          skills.push(...batch.map(({ skillId: _skillId, ...item }) => item));
          if (batch.length < PAGE_SIZE) break;
          cursor = batch[batch.length - 1]!.skillId;
        }
      }
      const applications = talent
        ? await allPages(budget, (cursor) =>
            tx.application.findMany({
              ...page(cursor),
              where: { talent: { userId } },
              select: {
                id: true,
                status: true,
                coverLetter: true,
                resumeUrl: true,
                contactPhone: true,
                appliedAt: true,
                updatedAt: true,
                viewedAt: true,
                rejectionReason: true,
                offerSalary: true,
                offerBenefits: true,
                offerStartDate: true,
                offerDeclineReason: true,
                job: {
                  select: {
                    title: true,
                    slug: true,
                    employer: { select: { companyName: true } },
                  },
                },
              },
            }),
          )
        : [];
      const statusEvents = talent
        ? await allPages(budget, (cursor) =>
            tx.applicationStatusEvent.findMany({
              ...page(cursor),
              where: { application: { talent: { userId } } },
              select: {
                id: true,
                applicationId: true,
                status: true,
                createdAt: true,
              },
            }),
          )
        : [];
      const eventsByApplication = new Map<string, typeof statusEvents>();
      for (const event of statusEvents) {
        const group = eventsByApplication.get(event.applicationId) ?? [];
        group.push(event);
        eventsByApplication.set(event.applicationId, group);
      }
      const messages = await allPages(budget, (cursor) =>
        tx.message.findMany({
          ...page(cursor),
          where: {
            senderId: userId,
            application: {
              OR: [
                { talent: { userId } },
                ...(account.role === "EMPLOYER"
                  ? [
                      {
                        job: {
                          employer: {
                            suspendedAt: null,
                            members: {
                              some: {
                                userId,
                                role: {
                                  in: [
                                    "OWNER",
                                    "RECRUITER",
                                    "HIRING_MANAGER",
                                  ] as (
                                    "OWNER" | "RECRUITER" | "HIRING_MANAGER"
                                  )[],
                                },
                              },
                            },
                          },
                        },
                      },
                    ]
                  : []),
              ],
            },
          },
          select: {
            id: true,
            applicationId: true,
            body: true,
            createdAt: true,
            application: {
              select: {
                job: {
                  select: {
                    title: true,
                    employer: { select: { companyName: true } },
                  },
                },
              },
            },
          },
        }),
      );
      const jobAlerts = await allPages(budget, (cursor) =>
        tx.jobAlert.findMany({
          ...page(cursor),
          where: { userId },
          select: {
            id: true,
            name: true,
            keywords: true,
            jobType: true,
            level: true,
            salaryMin: true,
            country: true,
            timezone: true,
            frequency: true,
            isActive: true,
            lastSentAt: true,
            createdAt: true,
            updatedAt: true,
            categories: { select: { category: { select: { name: true } } } },
          },
        }),
      );
      const jobs = employer
        ? await allPages(budget, (cursor) =>
            tx.job.findMany({
              ...page(cursor),
              where: { employer: { userId } },
              select: {
                id: true,
                title: true,
                slug: true,
                status: true,
                createdAt: true,
                publishedAt: true,
              },
            }),
          )
        : [];
      const notificationPreference = await tx.notificationPreference.findUnique(
        {
          where: { userId },
          select: {
            applicationUpdates: true,
            employerMessages: true,
            weeklyDigest: true,
            instantMatchAlerts: true,
            productNews: true,
            tipsAndResources: true,
            browserPush: true,
            updatedAt: true,
          },
        },
      );
      budget.add(notificationPreference);
      const chronology = (a: { createdAt: Date }, b: { createdAt: Date }) =>
        a.createdAt.getTime() - b.createdAt.getTime();
      return {
        ...account,
        exportSnapshotAt: snapshot!.at,
        talent: talent
          ? {
              ...talent,
              skills,
              workExperiences: workExperiences.map(withoutId),
              profileHighlights: highlights.map(withoutId),
              applications: applications.map((application) => ({
                ...application,
                statusEvents: (eventsByApplication.get(application.id) ?? [])
                  .sort(chronology)
                  .map(({ status, createdAt }) => ({ status, createdAt })),
              })),
            }
          : null,
        employer: employer ? { ...employer, jobs: jobs.map(withoutId) } : null,
        jobAlerts: jobAlerts.map(withoutId),
        messages: messages.sort(chronology).map(withoutId),
        notificationPreference,
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      timeout: 20_000,
      maxWait: 5_000,
    },
  );
}
