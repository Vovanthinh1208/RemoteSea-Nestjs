import { requestContext } from "./request-context";

describe("requestContext", () => {
  it("returns undefined outside of a run() call", () => {
    expect(requestContext.getRequestId()).toBeUndefined();
  });

  it("returns the request id inside run()", () => {
    requestContext.run({ requestId: "req-1" }, () => {
      expect(requestContext.getRequestId()).toBe("req-1");
    });
  });

  it("propagates across an await inside the callback", async () => {
    await requestContext.run({ requestId: "req-2" }, async () => {
      await Promise.resolve();
      expect(requestContext.getRequestId()).toBe("req-2");
    });
  });

  it("keeps concurrent runs isolated from each other", async () => {
    const results: string[] = [];

    const first = requestContext.run({ requestId: "req-a" }, async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      results.push(requestContext.getRequestId()!);
    });
    const second = requestContext.run({ requestId: "req-b" }, async () => {
      results.push(requestContext.getRequestId()!);
    });

    await Promise.all([first, second]);
    expect(results.sort()).toEqual(["req-a", "req-b"]);
  });

  it("clears back to undefined once run() has returned", () => {
    requestContext.run({ requestId: "req-3" }, () => {});
    expect(requestContext.getRequestId()).toBeUndefined();
  });
});
