import type {
  PlayerUtilities,
  UtilityIcon,
  UtilityType,
} from "../inventory/PlayerUtilities";
import { createIconSvg } from "./WeaponIcons";

/**
 * What the player is holding, as the HUD shows it: only the equipped item
 * (never a row of the others), read straight from the inventory every frame.
 *
 * - A throwable: its icon and "have / most you can carry" (e.g. 1 / 2).
 * - Fists: the glove icon and nothing else (no counter).
 * - The reserved empty slot: nothing at all.
 *
 * (There are no firearms in the game yet, so no magazine or reserve rounds:
 * when an item has "loaded / reserve" numbers they go in `primary` / `secondary`.)
 */

export interface Equipped {
  type: UtilityType;
  icon: UtilityIcon;
  name: string;
  /** The numbers shown beside the icon, or null for none. */
  primary: number | null;
  secondary: number | null;
  /** Out of it: shown dimmed (the player punches until they have one). */
  spent: boolean;
}

/** The equipped item now, from the real inventory. Null when nothing is held. */
export function describeEquipped(
  utilities: PlayerUtilities,
  carryMax: (type: UtilityType) => number,
): Equipped | null {
  const definition = utilities.definitionOf(utilities.selected);

  if (!definition || definition.reserved) {
    return null;
  }

  // The mission item is carried, not counted: just its icon.
  if (!definition.counted || definition.missionItem) {
    return {
      type: definition.type,
      icon: definition.icon,
      name: definition.name,
      primary: null,
      secondary: null,
      spent: false,
    };
  }

  const have = utilities.quantityOf(definition.type) ?? 0;

  return {
    type: definition.type,
    icon: definition.icon,
    name: definition.name,
    primary: have,
    secondary: Math.max(carryMax(definition.type), have),
    spent: have <= 0,
  };
}

/** A string that changes exactly when what is drawn would. */
export function equippedKey(equipped: Equipped | null): string {
  return equipped
    ? `${equipped.type}|${equipped.primary}|${equipped.secondary}`
    : "none";
}

/** Writes an item's icon and numbers into `host` (replacing what was there). */
function fill(host: HTMLElement, equipped: Equipped | null): void {
  host.replaceChildren();
  host.classList.toggle("is-empty", equipped === null);
  host.classList.toggle("is-spent", equipped?.spent === true);

  if (!equipped) {
    return;
  }

  host.dataset.type = equipped.type;
  host.append(createIconSvg(equipped.icon) as unknown as Node);

  if (equipped.primary !== null) {
    const count = document.createElement("div");
    const have = document.createElement("span");

    count.className = "equipped__count";
    have.className = "equipped__have";
    have.textContent = String(equipped.primary);
    count.append(have);

    if (equipped.secondary !== null) {
      const max = document.createElement("span");

      max.className = "equipped__max";
      max.textContent = ` / ${equipped.secondary}`;
      count.append(max);
    }

    host.append(count);
  }
}

/** The compact readout just right of the health bar. */
export class EquippedHud {
  private readonly root = document.createElement("div");
  private readonly utilities: PlayerUtilities;
  private readonly carryMax: (type: UtilityType) => number;
  private lastKey = "";

  constructor(
    parent: HTMLElement,
    utilities: PlayerUtilities,
    carryMax: (type: UtilityType) => number,
  ) {
    this.utilities = utilities;
    this.carryMax = carryMax;
    this.root.className = "equipped";
    this.root.setAttribute("aria-hidden", "true");
    parent.append(this.root);
    this.update();
  }

  /** Call every frame: the page is only written when the item or count changed. */
  public update(): void {
    const equipped = describeEquipped(this.utilities, this.carryMax);
    const key = equippedKey(equipped);

    if (key !== this.lastKey) {
      this.lastKey = key;
      fill(this.root, equipped);
    }
  }

  public dispose(): void {
    this.root.remove();
  }
}
