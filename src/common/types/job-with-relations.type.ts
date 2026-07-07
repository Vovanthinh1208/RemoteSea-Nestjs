import type { Job, EmployerProfile, Skill, Category } from "@prisma/client";

export type JobWithRelations = Job & {
  employer: Pick<EmployerProfile, "companyName" | "logoUrl" | "slug">;
  skills: Array<{ skill: Skill; isRequired: boolean }>;
  categories: Array<{ category: Category }>;
};
