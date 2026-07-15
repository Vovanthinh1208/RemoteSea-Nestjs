import { ViewCountBuffer } from "./view-count.buffer";
import type { JobsRepository } from "./jobs.repository";

const makeBuffer = () => {
  const incrementViewCountBy = jest.fn().mockResolvedValue(undefined);
  const buffer = new ViewCountBuffer({
    incrementViewCountBy,
  } as unknown as JobsRepository);
  return { buffer, incrementViewCountBy };
};

describe("ViewCountBuffer", () => {
  it("coalesces repeated views of the same job into one increment", async () => {
    const { buffer, incrementViewCountBy } = makeBuffer();

    buffer.record("job-1");
    buffer.record("job-1");
    buffer.record("job-1");
    buffer.record("job-2");
    await buffer.flush();

    expect(incrementViewCountBy).toHaveBeenCalledTimes(2);
    expect(incrementViewCountBy).toHaveBeenCalledWith("job-1", 3);
    expect(incrementViewCountBy).toHaveBeenCalledWith("job-2", 1);
    await buffer.onModuleDestroy();
  });

  it("flushing an empty buffer issues no writes", async () => {
    const { buffer, incrementViewCountBy } = makeBuffer();

    await buffer.flush();

    expect(incrementViewCountBy).not.toHaveBeenCalled();
    await buffer.onModuleDestroy();
  });

  it("starts a fresh window after each flush", async () => {
    const { buffer, incrementViewCountBy } = makeBuffer();

    buffer.record("job-1");
    await buffer.flush();
    buffer.record("job-1");
    await buffer.flush();

    expect(incrementViewCountBy).toHaveBeenNthCalledWith(1, "job-1", 1);
    expect(incrementViewCountBy).toHaveBeenNthCalledWith(2, "job-1", 1);
    await buffer.onModuleDestroy();
  });

  it("keeps flushing other jobs when one write fails, and drops the failed count", async () => {
    const incrementViewCountBy = jest
      .fn()
      .mockRejectedValueOnce(new Error("db down"))
      .mockResolvedValue(undefined);
    const buffer = new ViewCountBuffer({
      incrementViewCountBy,
    } as unknown as JobsRepository);

    buffer.record("job-1");
    buffer.record("job-2");
    await buffer.flush();

    expect(incrementViewCountBy).toHaveBeenCalledTimes(2);

    // The failed job-1 count is dropped (same policy as the old per-view
    // fire-and-forget), so a later flush writes nothing for it.
    await buffer.flush();
    expect(incrementViewCountBy).toHaveBeenCalledTimes(2);
    await buffer.onModuleDestroy();
  });

  it("flushes pending counts on shutdown", async () => {
    const { buffer, incrementViewCountBy } = makeBuffer();

    buffer.record("job-1");
    await buffer.onModuleDestroy();

    expect(incrementViewCountBy).toHaveBeenCalledWith("job-1", 1);
  });
});
