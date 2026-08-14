import { Prisma } from "@prisma/client";
import type { ListTalentSearchDto } from "./dto/list-talent-search.dto";

/**
 * GET /talent (employer talent search). Mirrors jobs/job-search.util.ts's
 * buildJobWhere shape for the same additive-filters-in-an-AND-array reason.
 */
export function buildTalentSearchWhere(
  query: ListTalentSearchDto,
  includeGated: boolean,
): Prisma.TalentProfileWhereInput {
  const and: Prisma.TalentProfileWhereInput[] = [];

  if (query.q) {
    and.push({
      OR: [
        { headline: { contains: query.q, mode: "insensitive" } },
        { user: { name: { contains: query.q, mode: "insensitive" } } },
      ],
    });
  }
  if (query.skills?.length) {
    and.push({ skills: { some: { skillId: { in: query.skills } } } });
  }
  if (query.level?.length) {
    and.push({ level: { in: query.level } });
  }
  if (query.country?.length) {
    and.push({ country: { in: query.country } });
  }
  if (query.employmentTypes?.length) {
    and.push({ employmentTypes: { hasSome: query.employmentTypes } });
  }
  if (query.timezoneOverlap?.length) {
    and.push({ timezoneOverlap: { hasSome: query.timezoneOverlap } });
  }

  return {
    // Only candidates who opted into "Open to work" are ever searchable —
    // browsing someone who didn't ask to be found would defeat the point of
    // that toggle (see TalentService.search).
    isOpenToWork: true,
    // VERIFIED_EMPLOYERS profiles are included only for a caller whose own
    // employer profile is verified — same rule TalentService.getPublicProfile
    // already enforces for the single-profile route, applied here to the
    // whole result set instead of a single 404/not-404 decision.
    visibility: includeGated
      ? { in: ["PUBLIC", "VERIFIED_EMPLOYERS"] }
      : "PUBLIC",
    ...(and.length ? { AND: and } : {}),
  };
}
