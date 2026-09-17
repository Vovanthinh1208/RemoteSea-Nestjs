import { CommentsService } from "./comments.service";
import type { CommentsRepository } from "./comments.repository";

const makeService = (repoOverrides: Partial<CommentsRepository> = {}) => {
  const repository = {
    findAllForApplication: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    ...repoOverrides,
  } as unknown as CommentsRepository;
  return { service: new CommentsService(repository), repository };
};

describe("CommentsService.list", () => {
  it("wraps the repository's rows in a { comments } envelope", async () => {
    const comments = [
      { id: "c1", authorId: "u1", author: { name: "Jane" }, body: "Hi" },
    ];
    const { service } = makeService({
      findAllForApplication: jest.fn().mockResolvedValue(comments),
    });

    const result = await service.list("app-1");

    expect(result).toEqual({ comments });
  });
});

describe("CommentsService.create", () => {
  it("passes the applicationId, authorId, and trimmed body straight through — no eligibility gate", async () => {
    const { service, repository } = makeService();

    await service.create("app-1", "user-1", { body: "Let's shortlist them." });

    expect(repository.create).toHaveBeenCalledWith({
      applicationId: "app-1",
      authorId: "user-1",
      body: "Let's shortlist them.",
    });
  });
});
