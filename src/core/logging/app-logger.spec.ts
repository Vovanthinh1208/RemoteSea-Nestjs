import { ConsoleLogger } from "@nestjs/common";
import { AppLogger } from "./app-logger";
import { requestContext } from "./request-context";

describe("AppLogger", () => {
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(ConsoleLogger.prototype, "log").mockImplementation();
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it("passes the message through unchanged outside of a request context", () => {
    new AppLogger().log("plain message");
    expect(logSpy).toHaveBeenCalledWith("plain message");
  });

  it("prefixes the message with the active request id", () => {
    requestContext.run({ requestId: "req-1" }, () => {
      new AppLogger().log("something happened");
    });
    expect(logSpy).toHaveBeenCalledWith("[req-1] something happened");
  });

  it("leaves a non-string message untouched (e.g. an object or Error)", () => {
    const payload = { foo: "bar" };
    requestContext.run({ requestId: "req-1" }, () => {
      new AppLogger().log(payload);
    });
    expect(logSpy).toHaveBeenCalledWith(payload);
  });

  it("forwards the context param unchanged alongside the prefixed message", () => {
    requestContext.run({ requestId: "req-2" }, () => {
      new AppLogger().log("hello", "SomeService");
    });
    expect(logSpy).toHaveBeenCalledWith("[req-2] hello", "SomeService");
  });
});
