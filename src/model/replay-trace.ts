import { FRAME_RATE, type TableDef } from "@/definitions/game";

/** Milliseconds per fixed-timestep simulation tick. */
export const TICK_MS = 1000 / FRAME_RATE;

export type TraceSample = { t: number; x: number; y: number };

/** Decode the flat [tick, x, y, ...] triples stored in ReplayDigest.trace. */
export function parseTrace(trace: number[] | undefined): TraceSample[] {
  if (!trace || trace.length < 3) return [];
  const out: TraceSample[] = [];
  for (let i = 0; i + 2 < trace.length; i += 3) {
    out.push({ t: trace[i], x: trace[i + 1], y: trace[i + 2] });
  }
  return out;
}

/** Interpolated ball position at a tick (binary search over sorted samples). */
export function positionAt(samples: TraceSample[], tick: number): { x: number; y: number } | null {
  if (samples.length === 0) return null;
  if (tick <= samples[0].t) return samples[0];
  const last = samples[samples.length - 1];
  if (tick >= last.t) return last;
  let lo = 0;
  let hi = samples.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].t <= tick) lo = mid; else hi = mid;
  }
  const a = samples[lo];
  const b = samples[hi];
  const f = b.t === a.t ? 0 : (tick - a.t) / (b.t - a.t);
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
}

/** Visible playfield height: main table unless the trace dips into the underworld. */
export function traceViewHeight(table: TableDef, samples: TraceSample[]): number {
  const uw = table.underworld ?? table.height;
  const maxY = samples.reduce((m, s) => Math.max(m, s.y), 0);
  return maxY > uw ? table.height : uw;
}
