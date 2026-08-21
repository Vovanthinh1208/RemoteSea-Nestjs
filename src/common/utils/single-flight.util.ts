/**
 * Collapses concurrent calls for the same key into one in-flight promise —
 * every caller for that key gets the same result (or the same rejection)
 * instead of each triggering its own copy of whatever `fn` does. Meant for
 * expensive, idempotent work with no in-request lock to fall back on (e.g.
 * CvAnalysisService.getOrCreate: two tabs opening the same uncached
 * applicant at once would otherwise fire two paid LLM calls before either
 * write lands). The eventual DB write should still use its own
 * concurrency-safe upsert — this only dedupes work *within* a single
 * process's lifetime, not across replicas.
 */
export class SingleFlight<T> {
  private readonly inFlight = new Map<string, Promise<T>>();

  async run(key: string, fn: () => Promise<T>): Promise<T> {
    const existing = this.inFlight.get(key);
    if (existing) return existing;

    const promise = fn().finally(() => {
      this.inFlight.delete(key);
    });
    this.inFlight.set(key, promise);
    return promise;
  }
}
