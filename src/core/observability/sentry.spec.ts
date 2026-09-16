import * as Sentry from "@sentry/node";
import { flushSentry, initSentry, reportException } from "./sentry";

jest.mock("@sentry/node", () => ({
  init: jest.fn(),
  isInitialized: jest.fn(),
  captureException: jest.fn(),
  flush: jest.fn(),
}));

describe("initSentry", () => {
  afterEach(() => jest.clearAllMocks());

  it("does nothing when no DSN is configured", () => {
    initSentry(undefined);
    expect(Sentry.init).not.toHaveBeenCalled();
  });

  it("initializes Sentry with the given DSN, with tracing off", () => {
    initSentry("https://example@sentry.io/1");
    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: "https://example@sentry.io/1",
        tracesSampleRate: 0,
      }),
    );
  });
});

describe("reportException", () => {
  afterEach(() => jest.clearAllMocks());

  it("is a no-op when Sentry was never initialized", () => {
    (Sentry.isInitialized as jest.Mock).mockReturnValue(false);
    reportException(new Error("boom"));
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it("forwards to Sentry.captureException once initialized", () => {
    (Sentry.isInitialized as jest.Mock).mockReturnValue(true);
    const error = new Error("boom");
    reportException(error);
    expect(Sentry.captureException).toHaveBeenCalledWith(error);
  });
});

describe("flushSentry", () => {
  afterEach(() => jest.clearAllMocks());

  it("resolves immediately without calling Sentry.flush when never initialized", async () => {
    (Sentry.isInitialized as jest.Mock).mockReturnValue(false);
    await flushSentry(2_000);
    expect(Sentry.flush).not.toHaveBeenCalled();
  });

  it("calls Sentry.flush with the given timeout once initialized", async () => {
    (Sentry.isInitialized as jest.Mock).mockReturnValue(true);
    (Sentry.flush as jest.Mock).mockResolvedValue(true);
    await flushSentry(2_000);
    expect(Sentry.flush).toHaveBeenCalledWith(2_000);
  });

  it("swallows a rejected flush instead of throwing", async () => {
    (Sentry.isInitialized as jest.Mock).mockReturnValue(true);
    (Sentry.flush as jest.Mock).mockRejectedValue(new Error("network down"));
    await expect(flushSentry(2_000)).resolves.toBeUndefined();
  });
});
