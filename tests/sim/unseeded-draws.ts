import { vi } from "vitest";

/**
 * Watch for unseeded draws while a sim runs.
 *
 * Hard rule 1 (docs/IMMERSION_SPEC.md): anything that touches gravity, AI
 * decisions or ball motion must derive from the run's `rngSeed`, or the run
 * stops being reproducible from the seed it recorded.
 *
 * Why a source watch rather than comparing two runs: an unseeded draw only
 * shows up when it happens to flip a marginal outcome. The KAMI'S WRATH jitter
 * that motivated this was drawn every frame the power-up was live, and it still
 * needed a ball stuck on the drains-vs-cap boundary to change a number — so a
 * run could pass twice with different luck and still look reproducible. A run
 * that never touches an unseeded source is reproducible by construction.
 *
 * `Math.random` is left working (the wrapper calls through); only the calls are
 * recorded, so installing this cannot change what the sim measures.
 *
 * Coverage is whatever the grid exercises: a code path the bots never reach is
 * a path this watch cannot vouch for.
 */
export type UnseededDrawWatch = {
  /** How many unseeded draws have happened since the watch was installed. */
  count: () => number;
  /** Stacks of the first few draws, so a failure names the offending call. */
  samples: () => string[];
  /** Remove the spy. Call before reading the counts. */
  stop: () => void;
};

export function watchForUnseededDraws(): UnseededDrawWatch {
  const real = Math.random;
  const samples: string[] = [];
  let calls = 0;

  const spy = vi.spyOn(Math, "random").mockImplementation(() => {
    calls += 1;
    // Only the first few: a failing sim can draw thousands of times, and the
    // first stack already names the caller.
    if (samples.length < 3) {
      samples.push(new Error("unseeded draw").stack ?? "unknown");
    }
    return real();
  });

  return {
    count: () => calls,
    samples: () => [...samples],
    stop: () => {
      spy.mockRestore();
    },
  };
}

/**
 * The plain-object shape to assert against. Kept separate from the watch so a
 * failure prints a readable diff (count + the stack that caused it) rather than
 * a pair of closures.
 */
export function unseededDrawReport(watch: UnseededDrawWatch): unknown {
  watch.stop();
  const calls = watch.count();
  return calls === 0 ? { calls } : { calls, samples: watch.samples() };
}
