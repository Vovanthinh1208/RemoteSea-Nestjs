import { ViewCountBuffer } from "./view-count.buffer";
import type { JobsRepository } from "./jobs.repository";

const makeBuffer = () => {
  const incrementViewCounts = jest.fn().mockResolvedValue(undefined);
  const buffer = new ViewCountBuffer({
    incrementViewCounts,
  } as unknown as JobsRepository);
  return { buffer, incrementViewCounts };
};

describe("ViewCountBuffer", () => {
  it("coalesces repeated views into one batched call", async () => {
    const { buffer, incrementViewCounts } = makeBuffer();

    buffer.record("job-1");
    buffer.record("job-1");
    buffer.record("job-1");
    buffer.record("job-2");
    await buffer.flush();

    expect(incrementViewCounts).toHaveBeenCalledTimes(1);
    expect(incrementViewCounts).toHaveBeenCalledWith(
      new Map([
        ["job-1", 3],
        ["job-2", 1],
      ]),
    );
    await buffer.onModuleDestroy();
  });

  it("flushing an empty buffer issues no writes", async () => {
    const { buffer, incrementViewCounts } = makeBuffer();

    await buffer.flush();

    expect(incrementViewCounts).not.toHaveBeenCalled();
    await buffer.onModuleDestroy();
  });

  it("starts a fresh window after each flush", async () => {
    const { buffer, incrementViewCounts } = makeBuffer();

    buffer.record("job-1");
    await buffer.flush();
    buffer.record("job-1");
    await buffer.flush();

    expect(incrementViewCounts).toHaveBeenNthCalledWith(
      1,
      new Map([["job-1", 1]]),
    );
    expect(incrementViewCounts).toHaveBeenNthCalledWith(
      2,
      new Map([["job-1", 1]]),
    );
    await buffer.onModuleDestroy();
  });

  it("drops the whole window's counts when the batch write fails", async () => {
    const incrementViewCounts = jest
      .fn()
      .mockRejectedValueOnce(new Error("db down"))
      .mockResolvedValue(undefined);
    const buffer = new ViewCountBuffer({
      incrementViewCounts,
    } as unknown as JobsRepository);

    buffer.record("job-1");
    buffer.record("job-2");
    await buffer.flush();

    expect(incrementViewCounts).toHaveBeenCalledTimes(1);

    // The failed window's counts are dropped (same policy as the old
    // per-view fire-and-forget), so nothing carries over to the next flush.
    buffer.record("job-3");
    await buffer.flush();
    expect(incrementViewCounts).toHaveBeenCalledTimes(2);
    expect(incrementViewCounts).toHaveBeenNthCalledWith(
      2,
      new Map([["job-3", 1]]),
    );
    await buffer.onModuleDestroy();
  });

  it("flushes pending counts on shutdown", async () => {
    const { buffer, incrementViewCounts } = makeBuffer();

    buffer.record("job-1");
    await buffer.onModuleDestroy();

    expect(incrementViewCounts).toHaveBeenCalledWith(new Map([["job-1", 1]]));
  });
});
