import type { Job, EmployerProfile, Skill, Category } from "@prisma/client";

export type JobWithRelations = Job & {
  employer: Pick<EmployerProfile, "companyName" | "logoUrl" | "slug">;
  skills: Array<{ skill: Skill; isRequired: boolean }>;
  categories: Array<{ category: Category }>;
};

export type ApplicationWithJob = { job: JobWithRelations } & Record<string, unknown>;

export type PaginatedResponse<T> = {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
};
