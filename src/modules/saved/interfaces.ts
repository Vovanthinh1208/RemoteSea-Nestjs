import type { SavedJob } from "@prisma/client";
import type { JobWithRelations } from "@/common/types/job-with-relations.type";

export type SavedJobWithJob = SavedJob & { job: JobWithRelations };

export type ToggleSavedResult = { saved: boolean };
