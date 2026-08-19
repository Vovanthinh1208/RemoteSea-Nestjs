import type { Prisma, ScorecardRecommendation } from "@prisma/client";

// Deliberately no `application` back-reference here (unlike Review's
// reviewListItemSelect, which is public and needs a display label) — a
// scorecard is only ever listed nested under an already-guarded
// applications/:id/scorecards route, so the caller already has the
// application context. `authorId` is exposed alongside the nested `author`
// object so the frontend can cheaply check "did *I* already submit" against
// the current user id without a string match on name.
export const scorecardListItemSelect = {
  id: true,
  authorId: true,
  author: { select: { name: true } },
  recommendation: true,
  note: true,
  createdAt: true,
} satisfies Prisma.InterviewScorecardSelect;

export type ScorecardListItem = Prisma.InterviewScorecardGetPayload<{
  select: typeof scorecardListItemSelect;
}>;

export type CreateScorecardInput = {
  applicationId: string;
  authorId: string;
  recommendation: ScorecardRecommendation;
  note?: string;
};
