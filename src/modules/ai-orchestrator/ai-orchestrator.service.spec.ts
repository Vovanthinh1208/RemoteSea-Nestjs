import { AiOrchestratorService } from "./ai-orchestrator.service";
import { ServiceUnavailableException } from "@nestjs/common";

describe("AI orchestrator failure recovery", () => {
  afterEach(() => jest.restoreAllMocks());
  const user = {
    id: "talent",
    role: "TALENT",
    email: "test@example.test",
    name: "Test",
  } as const;
  const service = () =>
    new AiOrchestratorService(
      {
        get: (key: string) =>
          key === "AI_SERVICE_SECRET"
            ? "unit-test-only-secret"
            : "http://127.0.0.1:8544",
      } as never,
      {} as never,
    );
  it("maps an upstream 500 to an explicit dependency-unavailable response", async () => {
    jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response('{"detail":"Internal error"}', { status: 500 }),
      );
    await expect(
      service().proxyToOrchestrator(user, "GET", "/v1/orchestrator/chat"),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
  it("rejects a malformed successful upstream response", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValue(new Response("not JSON"));
    await expect(
      service().proxyToOrchestrator(user, "GET", "/v1/orchestrator/chat"),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
  it("preserves upstream data-isolation errors", async () => {
    jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response('{"detail":"Conversation not found"}', { status: 404 }),
      );
    await expect(
      service().proxyToOrchestrator(user, "GET", "/v1/orchestrator/chat/other"),
    ).rejects.toMatchObject({ status: 404 });
  });
});
