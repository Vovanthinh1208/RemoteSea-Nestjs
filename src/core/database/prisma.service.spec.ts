import { Logger } from "@nestjs/common";
import { PrismaService } from "./prisma.service";

jest.mock("@prisma/client", () => ({
  PrismaClient: class {
    callbacks = new Map<string, (event: unknown) => void>();
    $on(event: string, callback: (event: unknown) => void) {
      this.callbacks.set(event, callback);
    }
    async $connect() {}
  },
}));

it("does not log Prisma error/warning payloads containing personal data", async () => {
  const error = jest
    .spyOn(Logger.prototype, "error")
    .mockImplementation(() => {});
  const warn = jest
    .spyOn(Logger.prototype, "warn")
    .mockImplementation(() => {});
  try {
    const service = new PrismaService(
      {
        get: (key: string) =>
          ({
            DATABASE_URL: "postgresql://test@localhost/test",
            NODE_ENV: "test",
          })[key],
      } as never,
      { recordDbQuery: jest.fn() } as never,
    );
    await service.onModuleInit();
    const callbacks = (
      service as unknown as { callbacks: Map<string, (event: unknown) => void> }
    ).callbacks;
    callbacks.get("error")!({
      message: "user@example.test PASSWORD_SECRET postgresql://secret",
    });
    callbacks.get("warn")!({ message: "Nguyễn Tên Riêng REFRESH_SECRET" });
    expect(error).toHaveBeenCalledWith("Database operation failed");
    expect(warn).toHaveBeenCalledWith("Database client warning");
    expect(
      JSON.stringify([...error.mock.calls, ...warn.mock.calls]),
    ).not.toMatch(/SECRET|user@example|Nguyễn/);
  } finally {
    jest.restoreAllMocks();
  }
});
