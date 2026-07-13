import type { ExecutionContext } from "@nestjs/common";
import type { UserRole } from "@prisma/client";
import {
  OWNED_RESOURCE_REQUEST_KEY,
  OwnershipGuardBase,
} from "./ownership.guard";
import {
  ForbiddenApiException,
  NotFoundApiException,
} from "@/common/exceptions/api.exception";

type Resource = { id: string; ownerId: string };

class TestGuard extends OwnershipGuardBase<Resource> {
  protected readonly bypassRoles: UserRole[];
  protected readonly notFoundOnMismatch: boolean;

  constructor(
    private readonly resource: Resource | null,
    options: { bypassRoles?: UserRole[]; notFoundOnMismatch?: boolean } = {},
  ) {
    super();
    this.bypassRoles = options.bypassRoles ?? [];
    this.notFoundOnMismatch = options.notFoundOnMismatch ?? false;
  }

  protected loadResource(): Promise<Resource | null> {
    return Promise.resolve(this.resource);
  }

  protected getOwnerUserId(resource: Resource): string {
    return resource.ownerId;
  }
}

const makeContext = (
  user: { id: string; role: UserRole },
  params: Record<string, string> = { id: "resource-1" },
): { context: ExecutionContext; request: Record<string, unknown> } => {
  const request: Record<string, unknown> = { user, params };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { context, request };
};

describe("OwnershipGuardBase", () => {
  it("allows the owner and attaches the resource to the request", async () => {
    const guard = new TestGuard({ id: "resource-1", ownerId: "user-1" });
    const { context, request } = makeContext({ id: "user-1", role: "TALENT" });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request[OWNED_RESOURCE_REQUEST_KEY]).toEqual({
      id: "resource-1",
      ownerId: "user-1",
    });
  });

  it("forbids a non-owner with no bypass role", async () => {
    const guard = new TestGuard({ id: "resource-1", ownerId: "user-1" });
    const { context } = makeContext({ id: "user-2", role: "TALENT" });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ForbiddenApiException,
    );
  });

  it("allows a non-owner whose role is in bypassRoles", async () => {
    const guard = new TestGuard(
      { id: "resource-1", ownerId: "user-1" },
      { bypassRoles: ["ADMIN"] },
    );
    const { context } = makeContext({ id: "user-2", role: "ADMIN" });

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it("throws NotFoundApiException when the resource doesn't exist", async () => {
    const guard = new TestGuard(null);
    const { context } = makeContext({ id: "user-1", role: "TALENT" });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      NotFoundApiException,
    );
  });

  it("throws NotFoundApiException instead of Forbidden when notFoundOnMismatch is set", async () => {
    const guard = new TestGuard(
      { id: "resource-1", ownerId: "user-1" },
      { notFoundOnMismatch: true },
    );
    const { context } = makeContext({ id: "user-2", role: "TALENT" });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      NotFoundApiException,
    );
  });
});
