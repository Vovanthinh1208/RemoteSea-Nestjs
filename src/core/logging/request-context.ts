import { AsyncLocalStorage } from "async_hooks";

type RequestContextStore = { requestId: string };

const storage = new AsyncLocalStorage<RequestContextStore>();

/**
 * Propagates the current request's id through the async call chain (Node's
 * AsyncLocalStorage follows awaits/promise chains automatically) without a
 * request-scoped provider — those force Nest to re-resolve an entire DI
 * subtree per request, which this app deliberately avoids elsewhere for
 * throughput. Populated once, in requestIdMiddleware; read by AppLogger so
 * every log line written during a request — not just the access-log summary
 * — carries the id that ties it back to that request.
 */
export const requestContext = {
  run: <T>(store: RequestContextStore, callback: () => T): T =>
    storage.run(store, callback),
  getRequestId: (): string | undefined => storage.getStore()?.requestId,
};
