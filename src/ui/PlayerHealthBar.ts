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

/** At this much health or less the number and the filled segments turn red. */
export const CRITICAL_AT = 25;
/** Below this much health (and above the red) they are yellow. */
export const LOW_BELOW = 50;
/** How many segments the bar has. */
export const SEGMENTS = 7;
/** From this much health up the bar is full: a scratch does not show on it. */
export const FULL_FROM = 90;

type Rgb = readonly [number, number, number];

/** Bar and number colours at full health, at half and at the red: the colour glides between them. */
const BAR_STOPS: ReadonlyArray<readonly [number, Rgb]> = [
  [25, [168, 64, 63]],
  [50, [201, 162, 39]],
  [70, [120, 148, 131]],
];
const TEXT_STOPS: ReadonlyArray<readonly [number, Rgb]> = [
  [25, [224, 85, 79]],
  [50, [224, 190, 60]],
  [70, [242, 244, 245]],
];

/** The colour for `hp` along `stops` (flat beyond the ends, blended between). */
function glide(
  stops: ReadonlyArray<readonly [number, Rgb]>,
  hp: number,
): string {
  if (hp <= stops[0][0]) {
    return `rgb(${stops[0][1].join(",")})`;
  }

  for (let i = 1; i < stops.length; i++) {
    const [hi, high] = stops[i];
    const [lo, low] = stops[i - 1];

    if (hp <= hi) {
      const t = (hp - lo) / (hi - lo);

      return `rgb(${low.map((c, k) => Math.round(c + (high[k] - c) * t)).join(",")})`;
    }
  }

  return `rgb(${stops[stops.length - 1][1].join(",")})`;
}

export interface HealthReading {
  readonly current: number;
  readonly max: number;
}

export class PlayerHealthBar {
  private readonly root = document.createElement("div");
  private readonly value = document.createElement("div");
  private readonly segments: HTMLElement[] = [];
  private readonly fills: HTMLElement[] = [];
  private lastHealth = -1;
  private lastText = "";
  private lastFilled = -1;
  private lastCritical: boolean | null = null;
  private lastLow: boolean | null = null;

  constructor(parent: HTMLElement) {
    const bar = document.createElement("div");

    this.root.className = "player-health";
    this.root.setAttribute("aria-hidden", "true");
    this.value.className = "player-health__value";
    bar.className = "player-health__bar";

    for (let i = 0; i < SEGMENTS; i++) {
      const segment = document.createElement("div");

      const fill = document.createElement("div");

      segment.className = "player-health__segment";
      fill.className = "player-health__fill";
      segment.append(fill);
      this.segments.push(segment);
      this.fills.push(fill);
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
    // Proportional, and full from FULL_FROM up; any health at all shows some.
    const share = Math.min(current / (max * (FULL_FROM / 100)), 1) * SEGMENTS;
    const filled = Math.ceil(share - 1e-9);
    const critical = current <= CRITICAL_AT;
    const low = !critical && current < LOW_BELOW;

    if (text !== this.lastText) {
      this.lastText = text;
      this.value.textContent = text;
    }

    if (current !== this.lastHealth) {
      this.lastHealth = current;

      // Each segment drains from its end, a little at a time (its width glides
      // by a CSS transition): never a whole block at once.
      this.fills.forEach((fill, i) => {
        const part = Math.min(Math.max(share - i, 0), 1);

        fill.style.width = `${(part * 100).toFixed(1)}%`;
      });

      // The colours glide with the health (percent of max, so any max works).
      const percent = (current / max) * 100;

      this.root.style.setProperty("--hp-bar", glide(BAR_STOPS, percent));
      this.root.style.setProperty("--hp-text", glide(TEXT_STOPS, percent));
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

    if (low !== this.lastLow) {
      this.lastLow = low;
      this.root.classList.toggle("low", low);
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

  /** Whether the yellow state is on (for tests). */
  public get isLow(): boolean {
    return this.lastLow === true;
  }

  public dispose(): void {
    this.root.remove();
  }
}
