import type { Prisma } from "@prisma/client";
import type { ApplicationParties } from "@/common/interfaces/application-parties.interface";

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

// Re-exported so existing imports of `ApplicationParties` from this module
// keep working — the type itself now lives in the shared interface, since
// interviews/interfaces.ts needs the exact same shape (plus `status`).
export type { ApplicationParties };

export type ThreadWithHeader = {
  messages: MessageListItem[];
  jobTitle: string;
  employerName: string;
  talentName: string | null;
};
