import type { Prisma } from "@prisma/client";

// Same reasoning as ScorecardListItem: no `application` back-reference —
// this is only ever listed nested under an already-guarded
// applications/:id/comments route. authorId alongside the nested `author`
// object lets the frontend tell "is this my own comment" without a string
// match on name.
export const commentListItemSelect = {
  id: true,
  authorId: true,
  author: { select: { name: true } },
  body: true,
  createdAt: true,
} satisfies Prisma.ApplicationCommentSelect;

export type CommentListItem = Prisma.ApplicationCommentGetPayload<{
  select: typeof commentListItemSelect;
}>;

export type CreateCommentInput = {
  applicationId: string;
  authorId: string;
  body: string;
};
