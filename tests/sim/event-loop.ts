/**
 * Let the vitest worker's event loop turn while a long sim is running.
 *
 * Why this exists: the worker's RPC channel uses birpc's hard-coded 60s deadline
 * and vitest offers no way to raise it — `createThreadsRpcOptions` /
 * `createForksRpcOptions` return only `{ post, on }`, and the `WorkerRpcOptions`
 * type doesn't even accept a `timeout` (vitest#8164). So the worker has to
 * answer `onTaskUpdate` within 60s or the call rejects as an unhandled error.
 *
 * These sims run their entire body without ever reaching the event loop: every
 * `await` resolves on a microtask, or on a *fake* timer that
 * `vi.advanceTimersByTime` fires synchronously. Node drains the microtask queue
 * before it runs any event loop phase, so an incoming RPC reply sits unread for
 * as long as the body runs. Cross 60s in a single test — a slower machine, a
 * busier one, more seeds — and the deadline fires: every test passes, and the
 * run still exits 1 with `Timeout calling "onTaskUpdate"`.
 *
 * Yielding between runs keeps the block down to a single run (~1s of physics),
 * which leaves the deadline a wide margin.
 *
 * The real timer is captured at module load, before `vi.useFakeTimers()` swaps
 * the globals, so this reaches the actual event loop rather than the fake clock.
 */
const realSetTimeout = globalThis.setTimeout;

/** Hand the event loop one turn, so any queued worker RPC reply is read. */
export function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => {
    realSetTimeout(resolve, 0);
  });
}
