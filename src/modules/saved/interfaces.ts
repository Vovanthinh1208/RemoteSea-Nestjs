import type { SavedJob } from "@prisma/client";
import type { JobListItem } from "@/common/types/job-list-item.type";

export type SavedJobWithJob = SavedJob & { job: JobListItem };

export type ToggleSavedResult = { saved: boolean };
