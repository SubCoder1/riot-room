/**
 * The local player's own health, bottom-left: the HP as a large white number and a bar
 * of seven rectangular segments. It is the
 * only place anyone's health is shown.
 *
 * It only reads the health it is given (the combatant's, which damage already
 * updated), so it can never lag or disagree with the real value: the number
 * and the segments change in the same frame as the health. Only the colour of
 * a segment glides (a short CSS transition), never the value.
 */

/** At this much health or less the filled segments turn a muted red. */
export const CRITICAL_AT = 25;
/** How many segments the bar has. */
export const SEGMENTS = 7;

export interface HealthReading {
  readonly current: number;
  readonly max: number;
}

export class PlayerHealthBar {
  private readonly root = document.createElement("div");
  private readonly value = document.createElement("div");
  private readonly segments: HTMLElement[] = [];
  private lastText = "";
  private lastFilled = -1;
  private lastCritical: boolean | null = null;

  constructor(parent: HTMLElement) {
    const bar = document.createElement("div");

    this.root.className = "player-health";
    this.root.setAttribute("aria-hidden", "true");
    this.value.className = "player-health__value";
    bar.className = "player-health__bar";

    for (let i = 0; i < SEGMENTS; i++) {
      const segment = document.createElement("div");

      segment.className = "player-health__segment";
      this.segments.push(segment);
      bar.append(segment);
    }

    this.root.append(this.value, bar);
    parent.append(this.root);
  }

  /** Shows `health` as it is now; writes to the page only what changed. */
  public update(health: HealthReading): void {
    const max = Math.max(health.max, 1);
    // Never shown above max or below zero, and always a whole number.
    const current = Math.min(Math.max(health.current, 0), max);
    const text = String(Math.ceil(current));
    // Proportional: any health at all shows a segment; none shows none.
    const filled = Math.ceil((current / max) * SEGMENTS - 1e-9);
    const critical = current <= CRITICAL_AT;

    if (text !== this.lastText) {
      this.lastText = text;
      this.value.textContent = text;
    }

    if (filled !== this.lastFilled) {
      this.lastFilled = filled;

      this.segments.forEach((segment, i) => {
        segment.classList.toggle("on", i < filled);
      });
    }

    if (critical !== this.lastCritical) {
      this.lastCritical = critical;
      this.root.classList.toggle("critical", critical);
    }
  }

  /** The number shown (for tests). */
  public get text(): string {
    return this.lastText;
  }

  /** How many segments are lit (for tests). */
  public get filled(): number {
    return this.lastFilled;
  }

  /** Whether the red state is on (for tests). */
  public get isCritical(): boolean {
    return this.lastCritical === true;
  }

  public dispose(): void {
    this.root.remove();
  }
}
