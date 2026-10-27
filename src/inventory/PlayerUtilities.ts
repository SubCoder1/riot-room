import { GRENADE_CONFIG } from "../combat/GrenadeConfig";
import { MOLOTOV_CONFIG } from "../combat/MolotovConfig";
import { SMOKE_CONFIG } from "../combat/SmokeConfig";

/**
 * A player's utilities (things they throw) and which one is selected.
 *
 * This is only the inventory and selection foundation. Nothing here throws,
 * damages or spawns anything, and it knows nothing about punches: the FISTS
 * slot just means "no utility is in use", the fallback when nothing else is
 * equipped. Each player owns their own instance (there is no shared inventory).
 *
 * The DYNAMITE slot is a mission item: it is locked until the dynamite has
 * been picked up (its quantity is the one fact the wheel, the HUD and the
 * selection all read), and once it is in hand it is carried, not thrown.
 *
 * The two GUN slots are reserved for future guns: they are drawn, but they are
 * never available, so nothing can select them.
 *
 * Adding a utility later means filling a reserved slot or adding one entry to
 * UTILITY_SLOTS. The wheel draws whatever the list says.
 */

export type UtilityType =
  "GRENADE" | "MOLOTOV" | "SMOKE" | "FISTS" | "DYNAMITE" | "GUN_1" | "GUN_2";

export type UtilityIcon =
  "grenade" | "molotov" | "smoke" | "glove" | "dynamite" | "empty";

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
   * A placeholder for future equipment: drawn, but never available, so it can
   * never be selected, equipped or stepped onto.
   */
  reserved?: boolean;
  /**
   * An item for the mission, not a throwable: unavailable until the player has
   * one (at most one), and when selected it is held, never thrown or punched.
   */
  missionItem?: boolean;
}

/** The angle between neighbouring slots: seven, evenly spaced. */
const STEP = 360 / 7;

/**
 * The wheel's slots, in the order the mouse wheel steps through them (GRENADE,
 * MOLOTOV, SMOKE, FISTS, DYNAMITE, then the two reserved gun slots, which are
 * skipped), evenly spaced round the wheel with the grenade at the top. FISTS is
 * the plain "no utility" slot: the existing fist combat, with no quantity.
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
    startingQuantity: MOLOTOV_CONFIG.MOLOTOV_START_QUANTITY,
    angle: STEP,
  },
  {
    type: "SMOKE",
    name: "Smoke",
    icon: "smoke",
    counted: true,
    startingQuantity: SMOKE_CONFIG.SMOKE_START_QUANTITY,
    angle: STEP * 2,
  },
  {
    type: "FISTS",
    name: "Fists",
    icon: "glove",
    counted: false,
    startingQuantity: 0,
    angle: STEP * 3,
  },
  {
    type: "DYNAMITE",
    name: "Dynamite",
    icon: "dynamite",
    counted: true,
    startingQuantity: 0,
    angle: STEP * 4,
    missionItem: true,
  },
  {
    type: "GUN_1",
    name: "Empty",
    icon: "empty",
    counted: false,
    startingQuantity: 0,
    angle: STEP * 5,
    reserved: true,
  },
  {
    type: "GUN_2",
    name: "Empty",
    icon: "empty",
    counted: false,
    startingQuantity: 0,
    angle: STEP * 6,
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
    this.selectedType = selected ?? this.fallbackType;
  }

  /** The configured slots, in wheel order. */
  public get slots(): readonly UtilityDefinition[] {
    return this.definitions;
  }

  public definitionOf(type: UtilityType): UtilityDefinition | undefined {
    return this.definitions.find((d) => d.type === type);
  }

  /** The slot with no quantity that is not a placeholder: always usable (the fists). */
  private get fallbackType(): UtilityType {
    return (
      this.definitions.find((d) => !d.counted && !d.reserved)?.type ??
      this.definitions[0].type
    );
  }

  /**
   * Whether a slot can be selected now: it exists, it is not a placeholder, and
   * a mission item has been picked up (and not used). The one test the wheel,
   * the HUD and the selection all share.
   */
  public isAvailable(type: UtilityType): boolean {
    const definition = this.definitionOf(type);

    if (!definition || definition.reserved) {
      return false;
    }

    return !definition.missionItem || (this.quantities.get(type) ?? 0) > 0;
  }

  /** How many the player has, or null for a slot without a quantity. */
  public quantityOf(type: UtilityType): number | null {
    return this.quantities.get(type) ?? null;
  }

  /**
   * Gives the player some (a pickup will call this, e.g. add("GRENADE", 1)).
   * Returns the new quantity; unknown or uncounted types and non-positive
   * amounts change nothing. A mission item is one thing: it never goes past one.
   */
  public add(type: UtilityType, amount = 1): number | null {
    const have = this.quantities.get(type);

    if (have === undefined || !Number.isFinite(amount) || amount <= 0) {
      return have ?? null;
    }

    const cap = this.definitionOf(type)?.missionItem ? 1 : Infinity;
    const next = Math.min(cap, have + Math.floor(amount));

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

  /**
   * The slot the player has chosen (it may have none left: see usingFists). A
   * slot that is no longer available (the dynamite, once it is used) gives way
   * to fists, so the selection is never one that cannot be used.
   */
  public get selected(): UtilityType {
    return this.isAvailable(this.selectedType)
      ? this.selectedType
      : this.fallbackType;
  }

  /** Selects a slot. A slot that is not there, or not available, changes nothing. */
  public select(type: UtilityType): void {
    if (this.isAvailable(type)) {
      this.selectedType = type;
    }
  }

  /** The mission item is in hand: nothing to throw, and nothing to punch with. */
  public get missionSelected(): boolean {
    return this.definitionOf(this.selected)?.missionItem === true;
  }

  /**
   * True when the player should be punching: nothing selected (FISTS), or the
   * selected utility has run out. The existing fist combat is the fallback.
   * The mission item is never this: it is held, not used.
   */
  public get usingFists(): boolean {
    if (this.missionSelected) {
      return false;
    }

    const have = this.quantities.get(this.selected);

    return have === undefined || have <= 0;
  }

  /** The utility that could be used right now, or null for fists (or the mission item). */
  public get active(): UtilityType | null {
    return this.usingFists || this.missionSelected ? null : this.selected;
  }
}
