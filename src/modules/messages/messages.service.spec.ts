import { MessagesService } from "./messages.service";
import type { MessagesRepository } from "./messages.repository";
import type { ApplicationParties } from "./interfaces";

const notificationsService = {
  create: jest.fn().mockResolvedValue(undefined),
};

const makeService = (repoOverrides: Partial<MessagesRepository> = {}) => {
  const repo = { ...repoOverrides } as unknown as MessagesRepository;
  return {
    service: new MessagesService(repo, notificationsService as never),
    repo,
  };
};

const parties: ApplicationParties = {
  id: "app-1",
  talent: { userId: "talent-user-1", user: { name: "Talent One" } },
  job: {
    title: "Backend Engineer",
    employerId: "company-1",
    employer: { userId: "employer-user-1", companyName: "Acme Inc" },
  },
};

beforeEach(() => {
  notificationsService.create.mockClear();
});

describe("MessagesService.list", () => {
  it("bundles the thread with header context, at zero extra queries", async () => {
    const listForApplication = jest.fn().mockResolvedValue([{ id: "m1" }]);
    const { service } = makeService({ listForApplication });

    const result = await service.list(parties);

    expect(listForApplication).toHaveBeenCalledWith("app-1");
    expect(result).toEqual({
      messages: [{ id: "m1" }],
      jobTitle: "Backend Engineer",
      employerName: "Acme Inc",
      talentName: "Talent One",
    });
  });
});

describe("MessagesService.send", () => {
  it("notifies the employer when the talent sends the message", async () => {
    const create = jest
      .fn()
      .mockResolvedValue({ id: "m1", senderId: "talent-user-1", body: "hi" });
    const { service } = makeService({ create });

    await service.send(parties, "talent-user-1", { body: "hi" });

    expect(create).toHaveBeenCalledWith({
      applicationId: "app-1",
      senderId: "talent-user-1",
      body: "hi",
    });
    expect(notificationsService.create).toHaveBeenCalledWith({
      userId: "employer-user-1",
      type: "MESSAGE_RECEIVED",
      title: "New message about Backend Engineer",
      body: "hi",
      link: "/applications/app-1/messages",
    });
  });

  it("notifies the talent when the employer sends the message", async () => {
    const create = jest.fn().mockResolvedValue({
      id: "m2",
      senderId: "employer-user-1",
      body: "Thanks for applying!",
    });
    const { service } = makeService({ create });

    await service.send(parties, "employer-user-1", {
      body: "Thanks for applying!",
    });

    expect(notificationsService.create).toHaveBeenCalledWith({
      userId: "talent-user-1",
      type: "MESSAGE_RECEIVED",
      title: "New message about Backend Engineer",
      body: "Thanks for applying!",
      link: "/applications/app-1/messages",
    });
  });

  it("truncates a long message body for the notification preview", async () => {
    const longBody = "a".repeat(150);
    const create = jest.fn().mockResolvedValue({
      id: "m3",
      senderId: "talent-user-1",
      body: longBody,
    });
    const { service } = makeService({ create });

    await service.send(parties, "talent-user-1", { body: longBody });

    const notified = notificationsService.create.mock.calls[0][0];
    expect(notified.body).toBe(`${"a".repeat(100)}…`);
  });
});
