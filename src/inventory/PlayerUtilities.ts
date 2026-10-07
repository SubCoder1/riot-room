/**
 * A player's utilities (things they will later throw) and which one is selected.
 *
 * This is only the inventory and selection foundation. Nothing here throws,
 * damages or spawns anything, and it knows nothing about punches: the FISTS
 * slot just means "no utility is in use", the fallback when nothing else is
 * equipped. Each player owns their own instance (there is no shared inventory).
 *
 * Adding a utility later (a flash, a grenade, a heal...) means adding one entry
 * to UTILITY_SLOTS. The wheel draws whatever the list says.
 */

export type UtilityType = "ROCKS" | "MOLOTOV" | "SMOKE" | "FISTS";

export type UtilityIcon = "rock" | "molotov" | "smoke" | "glove";

export interface UtilityDefinition {
  type: UtilityType;
  name: string;
  icon: UtilityIcon;
  /**
   * Whether the slot has a quantity. The FISTS slot does not: picking it
   * means "no utility", and the player uses their fists.
   */
  counted: boolean;
  /** How many a player starts with. */
  startingQuantity: number;
  /** Where the slot sits on the wheel, in degrees clockwise from the top. */
  angle: number;
}

/**
 * The wheel's slots, in the order the mouse wheel steps through them
 * (ROCKS, MOLOTOV, SMOKE, FISTS, then back to ROCKS). FISTS is the plain
 * "no utility" slot: the existing fist combat, with no quantity.
 */
export const UTILITY_SLOTS: readonly UtilityDefinition[] = [
  {
    type: "ROCKS",
    name: "Rocks",
    icon: "rock",
    counted: true,
    startingQuantity: 3,
    angle: 0,
  },
  {
    type: "MOLOTOV",
    name: "Molotov",
    icon: "molotov",
    counted: true,
    startingQuantity: 0,
    angle: 90,
  },
  {
    type: "SMOKE",
    name: "Smoke",
    icon: "smoke",
    counted: true,
    startingQuantity: 0,
    angle: 270,
  },
  {
    type: "FISTS",
    name: "Fists",
    icon: "glove",
    counted: false,
    startingQuantity: 0,
    angle: 180,
  },
];

export class PlayerUtilities {
  private readonly definitions: readonly UtilityDefinition[];
  private readonly quantities = new Map<UtilityType, number>();
  private selectedType: UtilityType;

  constructor(
    definitions: readonly UtilityDefinition[] = UTILITY_SLOTS,
    selected?: UtilityType,
  ) {
    this.definitions = definitions;

    for (const definition of definitions) {
      if (definition.counted) {
        this.quantities.set(definition.type, definition.startingQuantity);
      }
    }

    // Nothing equipped to begin with: the player has their fists, as before.
    this.selectedType =
      selected ??
      definitions.find((d) => !d.counted)?.type ??
      definitions[0].type;
  }

  /** The configured slots, in wheel order. */
  public get slots(): readonly UtilityDefinition[] {
    return this.definitions;
  }

  public definitionOf(type: UtilityType): UtilityDefinition | undefined {
    return this.definitions.find((d) => d.type === type);
  }

  /** How many the player has, or null for a slot without a quantity. */
  public quantityOf(type: UtilityType): number | null {
    return this.quantities.get(type) ?? null;
  }

  /**
   * Gives the player some (a pickup will call this, e.g. add("ROCKS", 1)).
   * Returns the new quantity; unknown or uncounted types and non-positive
   * amounts change nothing.
   */
  public add(type: UtilityType, amount = 1): number | null {
    const have = this.quantities.get(type);

    if (have === undefined || !Number.isFinite(amount) || amount <= 0) {
      return have ?? null;
    }

    const next = have + Math.floor(amount);

    this.quantities.set(type, next);

    return next;
  }

  /** Uses some up. False (and nothing changes) if there aren't enough. */
  public remove(type: UtilityType, amount = 1): boolean {
    const have = this.quantities.get(type);

    if (
      have === undefined ||
      !Number.isFinite(amount) ||
      amount <= 0 ||
      have < Math.floor(amount)
    ) {
      return false;
    }

    this.quantities.set(type, have - Math.floor(amount));

    return true;
  }

  /** The slot the player has chosen (it may have none left: see usingFists). */
  public get selected(): UtilityType {
    return this.selectedType;
  }

  public select(type: UtilityType): void {
    if (this.definitions.some((d) => d.type === type)) {
      this.selectedType = type;
    }
  }

  /**
   * True when the player should be punching: nothing selected (FISTS), or the
   * selected utility has run out. The existing fist combat is the fallback.
   */
  public get usingFists(): boolean {
    const have = this.quantities.get(this.selectedType);

    return have === undefined || have <= 0;
  }

  /** The utility that could be used right now, or null for fists. */
  public get active(): UtilityType | null {
    return this.usingFists ? null : this.selectedType;
  }
}
