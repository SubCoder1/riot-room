/**
 * The dynamite breach of the Chemical Vault entrance, as a small state
 * machine: no drawing, no input, no world. The game asks it to do each step,
 * it says whether that step is allowed now (only in order, each only once)
 * and what happens as time passes.
 *
 *   idle -> planted -> igniting -> fuse -> blown
 *
 * - `plant()`: the charge is placed (once).
 * - `startIgnition()`: the lighter animation begins (only after planting, once).
 * - the animation ends after IGNITE_SECONDS: "ignited", and the fuse burns.
 * - the fuse ends after FUSE_SECONDS: "blown" (once, ever, until `reset`).
 *
 * Later steps of the mission can be added after "blown" without changing it.
 */

export type BreachPhase = "idle" | "planted" | "igniting" | "fuse" | "blown";

export type BreachEvent = "ignited" | "blown";

export const BREACH_TIMING = {
  /** The first-person lighter animation (s). */
  IGNITE_SECONDS: 2.8,
  /** From the spark in the wire to the blast: time to get clear (s). */
  FUSE_SECONDS: 6,
  /** How far through the animation the wire sparks (the fuse burns from there). */
  SPARK_AT: 0.42,
} as const;

/** What is left of the fuse once the animation ends (it burned from the spark). */
const FUSE_AFTER_ANIMATION =
  BREACH_TIMING.FUSE_SECONDS -
  BREACH_TIMING.IGNITE_SECONDS * (1 - BREACH_TIMING.SPARK_AT);

export class Breach {
  private current: BreachPhase = "idle";
  private elapsed = 0;

  public get phase(): BreachPhase {
    return this.current;
  }

  /** The charge is in place (or past that). */
  public get isPlanted(): boolean {
    return this.current !== "idle";
  }

  /** The lighter animation is playing: nothing else should interrupt the hands. */
  public get isIgniting(): boolean {
    return this.current === "igniting";
  }

  /** 0 to 1 through the lighter animation (0 outside it). */
  public get ignitionProgress(): number {
    return this.current === "igniting"
      ? Math.min(this.elapsed / BREACH_TIMING.IGNITE_SECONDS, 1)
      : 0;
  }

  /** Seconds left on the fuse (0 when it is not burning). */
  public get fuseLeft(): number {
    return this.current === "fuse"
      ? Math.max(FUSE_AFTER_ANIMATION - this.elapsed, 0)
      : 0;
  }

  /** Seconds since the spark (0 before it; the blast comes at FUSE_SECONDS). */
  public get sinceSpark(): number {
    const spark = BREACH_TIMING.IGNITE_SECONDS * BREACH_TIMING.SPARK_AT;

    if (this.current === "igniting") {
      return Math.max(this.elapsed - spark, 0);
    }

    return this.current === "fuse"
      ? BREACH_TIMING.IGNITE_SECONDS - spark + this.elapsed
      : 0;
  }

  /** Places the charge. False if it is already placed. */
  public plant(): boolean {
    if (this.current !== "idle") {
      return false;
    }

    this.current = "planted";
    this.elapsed = 0;

    return true;
  }

  /** Starts the lighter animation. False unless the charge is planted and not yet lit. */
  public startIgnition(): boolean {
    if (this.current !== "planted") {
      return false;
    }

    this.current = "igniting";
    this.elapsed = 0;

    return true;
  }

  /** Advances by `dt` seconds; returns what happened (in order). */
  public update(dt: number): BreachEvent[] {
    const events: BreachEvent[] = [];

    if (this.current !== "igniting" && this.current !== "fuse") {
      return events;
    }

    this.elapsed += Math.max(dt, 0);

    if (
      this.current === "igniting" &&
      this.elapsed >= BREACH_TIMING.IGNITE_SECONDS
    ) {
      // (Time carried over goes to the fuse: a long frame loses nothing.)
      this.elapsed -= BREACH_TIMING.IGNITE_SECONDS;
      this.current = "fuse";
      events.push("ignited");
    }

    if (this.current === "fuse" && this.elapsed >= FUSE_AFTER_ANIMATION) {
      this.current = "blown";
      this.elapsed = 0;
      events.push("blown");
    }

    return events;
  }

  /** The wire has been lit: from here the sequence cannot be stopped. */
  public get isCommitted(): boolean {
    return (
      this.current !== "igniting" ||
      this.ignitionProgress >= BREACH_TIMING.SPARK_AT
    );
  }

  /**
   * Stops the lighting before the wire is lit (the key was let go): back to
   * the start, nothing placed. False if it is not lighting or is past the
   * point of no return.
   */
  public cancel(): boolean {
    if (this.current !== "igniting" || this.isCommitted) {
      return false;
    }

    this.current = "idle";
    this.elapsed = 0;

    return true;
  }

  /** Back to the start (a new round). */
  public reset(): void {
    this.current = "idle";
    this.elapsed = 0;
  }
}
