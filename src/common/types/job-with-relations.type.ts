import type {
  Job,
  EmployerProfile,
  Skill,
  Category,
  Prisma,
} from "@prisma/client";

export type JobWithRelations = Job & {
  employer: Pick<EmployerProfile, "companyName" | "logoUrl" | "slug">;
  skills: Array<{ skill: Skill; isRequired: boolean }>;
  categories: Array<{ category: Category }>;
};

export const jobWithRelationsInclude = {
  employer: { select: { companyName: true, logoUrl: true, slug: true } },
  categories: { include: { category: true } },
  skills: { include: { skill: true } },
} satisfies Prisma.JobInclude;
