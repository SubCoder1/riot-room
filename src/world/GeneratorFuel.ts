/**
 * The fuel in one generator: a plain tank with a capacity, filled in fixed
 * measures from a resource the player carries (a Molotov, which is a bottle of
 * petrol). It knows nothing about where it is or how it is drawn; the game
 * keeps one per generator and shows its level through the interaction prompt.
 * Nothing consumes fuel yet and there is no global power state: this is the
 * reliable "add petrol" part.
 */

/** How much one bottle adds. */
export const FUEL_PER_BOTTLE = 25;

/** A full generator tank (the roof's smaller one holds half). */
export const FUEL_CAPACITY = 100;

export type FuelResult =
  | { ok: true; added: number; level: number }
  | { ok: false; reason: "full" | "none"; level: number };

export class GeneratorFuel {
  public readonly capacity: number;

  private current: number;

  constructor(capacity: number, start = 0) {
    this.capacity = Math.max(1, capacity);
    this.current = Math.min(Math.max(0, start), this.capacity);
  }

  public get level(): number {
    return this.current;
  }

  public get isFull(): boolean {
    return this.current >= this.capacity;
  }

  /**
   * Pours one bottle in. `available` is how many the player has; nothing
   * changes (and nothing is spent) if there are none or the tank is full. The
   * amount is capped at the free space.
   */
  public fill(available: number, perBottle = FUEL_PER_BOTTLE): FuelResult {
    if (this.isFull) {
      return { ok: false, reason: "full", level: this.current };
    }

    if (available < 1) {
      return { ok: false, reason: "none", level: this.current };
    }

    const added = Math.min(perBottle, this.capacity - this.current);

    this.current += added;

    return { ok: true, added, level: this.current };
  }
}
