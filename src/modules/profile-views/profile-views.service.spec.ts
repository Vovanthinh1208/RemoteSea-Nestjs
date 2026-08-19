import { ProfileViewsService } from "./profile-views.service";
import type { ProfileViewsRepository } from "./profile-views.repository";
import type { AuthenticatedUser } from "@/common/interfaces/authenticated-user.interface";

const makeService = (repoOverrides: Partial<ProfileViewsRepository> = {}) => {
  const repository = {
    recordView: jest.fn().mockResolvedValue(undefined),
    getAnalytics: jest
      .fn()
      .mockResolvedValue({ totalViews: 0, uniqueViewers: 0 }),
    ...repoOverrides,
  } as unknown as ProfileViewsRepository;
  return {
    service: new ProfileViewsService(repository),
    repository,
  };
};

const employerViewer: AuthenticatedUser = {
  id: "employer-1",
  role: "EMPLOYER",
} as AuthenticatedUser;

describe("ProfileViewsService.recordView", () => {
  it("records a view when an Employer views a Talent profile", async () => {
    const { service, repository } = makeService();

    await service.recordView(employerViewer, "talent-1");

    expect(repository.recordView).toHaveBeenCalledWith(
      "employer-1",
      "talent-1",
    );
  });

  it("does not record a view for an anonymous (unauthenticated) request", async () => {
    const { service, repository } = makeService();

    await service.recordView(null, "talent-1");

    expect(repository.recordView).not.toHaveBeenCalled();
  });

  it("does not count a Talent viewing their own profile", async () => {
    // A talent's own account is role TALENT, never EMPLOYER — the role
    // check alone excludes it regardless of whether the profile being
    // viewed is their own or someone else's; a Talent is never a valid
    // viewer for this feature at all (see the spec's own wording, "valid
    // Employer → Talent views" — a Talent-to-Talent view is out of scope
    // by the same rule, not a separate carve-out).
    const talentViewer: AuthenticatedUser = {
      id: "talent-user-1",
      role: "TALENT",
    } as AuthenticatedUser;
    const { service, repository } = makeService();

    await service.recordView(talentViewer, "talent-profile-1");

    expect(repository.recordView).not.toHaveBeenCalled();
  });

  it("does not count any other role viewing a Talent profile", async () => {
    const adminViewer: AuthenticatedUser = {
      id: "admin-1",
      role: "ADMIN",
    } as AuthenticatedUser;
    const { service, repository } = makeService();

    await service.recordView(adminViewer, "talent-1");

    expect(repository.recordView).not.toHaveBeenCalled();
  });
});

describe("ProfileViewsService.getAnalytics", () => {
  it("returns the aggregate analytics for the given talent", async () => {
    const { service, repository } = makeService({
      getAnalytics: jest
        .fn()
        .mockResolvedValue({ totalViews: 128, uniqueViewers: 47 }),
    });

    const result = await service.getAnalytics("talent-1");

    expect(repository.getAnalytics).toHaveBeenCalledWith("talent-1");
    expect(result).toEqual({ totalViews: 128, uniqueViewers: 47 });
  });
});
