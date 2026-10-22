/**
 * Distant lightning as a small state machine: idle (waiting a random time),
 * flash (one or two quick pulses) and decay (the last pulse fading out). It
 * only produces a level from 0 to 1; whoever owns the lights decides what that
 * level does. Driven by delta time, with no timers of its own.
 */

export type LightningPhase = "idle" | "flash" | "decay";

export interface LightningOptions {
  /** Seconds between events, inclusive range. */
  minGap?: number;
  maxGap?: number;
  /** Chance that an event is a strong one. */
  strongChance?: number;
  random?: () => number;
}

interface Pulse {
  start: number;
  peak: number;
  fall: number;
}

const RISE = 0.025;

export class Lightning {
  public phase: LightningPhase = "idle";
  /** Peak level of every event so far (for tests and tuning). */
  public readonly history: number[] = [];

  private readonly minGap: number;
  private readonly maxGap: number;
  private readonly strongChance: number;
  private readonly random: () => number;
  private wait = 0;
  private clock = 0;
  private pulses: Pulse[] = [];
  private end = 0;

  constructor(options: LightningOptions = {}) {
    this.minGap = options.minGap ?? 12;
    this.maxGap = options.maxGap ?? 30;
    this.strongChance = options.strongChance ?? 0.15;
    this.random = options.random ?? Math.random;
    this.reset();
  }

  /** Back to idle with a fresh wait; the level is 0 again at once. */
  public reset(): void {
    this.phase = "idle";
    this.pulses = [];
    this.clock = 0;
    // The first one comes a little sooner than the usual gap.
    this.wait = this.gap() * 0.5;
  }

  /** Advances by `dt` seconds and returns the flash level (0 to 1). */
  public update(dt: number): number {
    // A long stall (a hidden tab) must not play out a whole event at once.
    const step = Math.min(Math.max(dt, 0), 0.25);

    if (this.phase === "idle") {
      this.wait -= step;

      if (this.wait <= 0) {
        this.begin();
      }

      return 0;
    }

    this.clock += step;

    if (this.clock >= this.end) {
      this.phase = "idle";
      this.pulses = [];
      this.wait = this.gap();

      return 0;
    }

    let level = 0;

    for (const pulse of this.pulses) {
      const t = this.clock - pulse.start;

      if (t < 0) {
        continue;
      }

      const value =
        t < RISE
          ? (t / RISE) * pulse.peak
          : pulse.peak * Math.exp(-(t - RISE) / pulse.fall);

      level = Math.max(level, value);
    }

    const last = this.pulses[this.pulses.length - 1];

    this.phase = this.clock >= last.start + RISE ? "decay" : "flash";

    return Math.min(level, 1);
  }

  private gap(): number {
    return this.minGap + this.random() * (this.maxGap - this.minGap);
  }

  private begin(): void {
    const strong = this.random() < this.strongChance;
    const peak = strong
      ? 0.85 + this.random() * 0.15
      : 0.4 + this.random() * 0.3;
    const pulses: Pulse[] = [
      { start: 0, peak, fall: 0.07 + this.random() * 0.05 },
    ];

    if (this.random() < 0.6) {
      pulses.push({
        start: 0.12 + this.random() * 0.16,
        peak: peak * (0.5 + this.random() * 0.5),
        fall: 0.09 + this.random() * 0.08,
      });
    }

    const last = pulses[pulses.length - 1];

    this.pulses = pulses;
    this.clock = 0;
    this.end = last.start + RISE + last.fall * 6;
    this.phase = "flash";
    this.history.push(peak);
  }
}
