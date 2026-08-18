import type { Prisma } from "@prisma/client";

export const messageSelect = {
  id: true,
  senderId: true,
  body: true,
  createdAt: true,
} satisfies Prisma.MessageSelect;

export type MessageListItem = Prisma.MessageGetPayload<{
  select: typeof messageSelect;
}>;

export type CreateMessageInput = {
  applicationId: string;
  senderId: string;
  body: string;
};

// Structural shape both ownership guards' loaded resources satisfy — the
// employer side reuses employer/guards/application-ownership.guard.ts's
// ApplicationWithJobOwner as-is, the talent side loads it fresh via
// findApplicationForTalentOwnership below. No shared base class needed.
// Includes display names (not just ids) so `list()` can hand back thread
// header context "for free" alongside the messages — this row is already
// loaded for the ownership check either way, so this adds zero queries and
// lets the frontend skip fetching a whole separate applicant/application
// list just to render two lines of header text.
export type ApplicationParties = {
  id: string;
  talent: { userId: string; user: { name: string | null } };
  job: {
    title: string;
    employer: { userId: string; companyName: string };
  };
};

export type ThreadWithHeader = {
  messages: MessageListItem[];
  jobTitle: string;
  employerName: string;
  talentName: string | null;
};
