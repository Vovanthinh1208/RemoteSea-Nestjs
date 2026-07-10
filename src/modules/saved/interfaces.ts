import type { SavedJob } from "@prisma/client";
import type { PublicJobWithRelations } from "@/common/types/job-with-relations.type";

export type SavedJobWithJob = SavedJob & { job: PublicJobWithRelations };

export type ToggleSavedResult = { saved: boolean };
