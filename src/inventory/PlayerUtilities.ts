import { GRENADE_CONFIG } from "../combat/GrenadeConfig";
import { SMOKE_CONFIG } from "../combat/SmokeConfig";

/**
 * A player's utilities (things they throw) and which one is selected.
 *
 * This is only the inventory and selection foundation. Nothing here throws,
 * damages or spawns anything, and it knows nothing about punches: the FISTS
 * slot just means "no utility is in use", the fallback when nothing else is
 * equipped. Each player owns their own instance (there is no shared inventory).
 *
 * The EMPTY slot is reserved for future equipment: it can be selected, but it
 * holds nothing and does nothing (no throw, no punch).
 *
 * Adding a utility later means filling the EMPTY slot or adding one entry to
 * UTILITY_SLOTS. The wheel draws whatever the list says.
 */

export type UtilityType = "GRENADE" | "MOLOTOV" | "SMOKE" | "FISTS" | "EMPTY";

export type UtilityIcon = "grenade" | "molotov" | "smoke" | "glove" | "empty";

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
  /**
   * A placeholder for future equipment: selectable, but holding nothing and
   * doing nothing.
   */
  reserved?: boolean;
}

/**
 * The wheel's slots, in the order the mouse wheel steps through them (GRENADE,
 * MOLOTOV, SMOKE, FISTS, EMPTY, then back to GRENADE), evenly spaced round the
 * wheel (72 degrees apart, the grenade at the top). FISTS is the plain "no
 * utility" slot: the existing fist combat, with no quantity.
 */
export const UTILITY_SLOTS: readonly UtilityDefinition[] = [
  {
    type: "GRENADE",
    name: "Grenade",
    icon: "grenade",
    counted: true,
    startingQuantity: GRENADE_CONFIG.GRENADE_START_QUANTITY,
    angle: 0,
  },
  {
    type: "MOLOTOV",
    name: "Molotov",
    icon: "molotov",
    counted: true,
    startingQuantity: 0,
    angle: 72,
  },
  {
    type: "SMOKE",
    name: "Smoke",
    icon: "smoke",
    counted: true,
    startingQuantity: SMOKE_CONFIG.SMOKE_START_QUANTITY,
    angle: 144,
  },
  {
    type: "FISTS",
    name: "Fists",
    icon: "glove",
    counted: false,
    startingQuantity: 0,
    angle: 216,
  },
  {
    type: "EMPTY",
    name: "Empty",
    icon: "empty",
    counted: false,
    startingQuantity: 0,
    angle: 288,
    reserved: true,
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
      definitions.find((d) => !d.counted && !d.reserved)?.type ??
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
   * Gives the player some (a pickup will call this, e.g. add("GRENADE", 1)).
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

  /** The reserved slot is selected: hands empty, nothing to throw and nothing to punch with. */
  public get reservedSelected(): boolean {
    return this.definitionOf(this.selectedType)?.reserved === true;
  }

  /**
   * True when the player should be punching: nothing selected (FISTS), or the
   * selected utility has run out. The existing fist combat is the fallback.
   * The reserved slot is never this: it does nothing at all.
   */
  public get usingFists(): boolean {
    if (this.reservedSelected) {
      return false;
    }

    const have = this.quantities.get(this.selectedType);

    return have === undefined || have <= 0;
  }

  /** The utility that could be used right now, or null for fists. */
  public get active(): UtilityType | null {
    return this.usingFists || this.reservedSelected ? null : this.selectedType;
  }
}
