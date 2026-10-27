import type {
  PlayerUtilities,
  UtilityDefinition,
} from "../inventory/PlayerUtilities";
import type { WeaponWheel } from "../inventory/WeaponWheel";
import { ICONS, svg } from "./WeaponIcons";

/**
 * Draws the weapon wheel: a screen-space overlay (not part of the 3D scene, so
 * it behaves the same in first and third person). It draws whatever slots the
 * inventory is configured with and reads quantities from it every frame, so a
 * grenade picked up later shows up on the wheel by itself.
 *
 * Plain inline SVG and CSS: a thin ring, one sector per slot, small line icons,
 * and the highlighted slot's name and quantity in the middle.
 */

const OUTER = 138;
const INNER = 54;
/** Every slot's block (icon, name, quantity) is centred on its sector's midpoint. */
const SLOT_RADIUS = (INNER + OUTER) / 2;
/** Inside a slot's block, measured from the block's centre: icon, name, quantity. */
const ICON_Y = -17;
const NAME_Y = 15;
const QTY_Y = 29;
/** Every icon is scaled so its longer side is this many units, drawn at one stroke weight. */
const ICON_SIZE = 28;
const ICON_STROKE = 1.7;
/** The widest the name in the hub may be (the hub is 2 * INNER across). */
const HUB_TEXT_WIDTH = 2 * INNER - 18;
const HUB_NAME_SIZE = 22;

/** A point at `radius`, `degrees` clockwise from straight up. */
function polar(radius: number, degrees: number): [number, number] {
  const a = (degrees * Math.PI) / 180;

  return [radius * Math.sin(a), -radius * Math.cos(a)];
}

function sectorPath(from: number, to: number): string {
  const [x0, y0] = polar(OUTER, from);
  const [x1, y1] = polar(OUTER, to);
  const [x2, y2] = polar(INNER, to);
  const [x3, y3] = polar(INNER, from);
  const f = (n: number): string => n.toFixed(2);

  return (
    `M${f(x0)},${f(y0)} A${OUTER},${OUTER} 0 0 1 ${f(x1)},${f(y1)} ` +
    `L${f(x2)},${f(y2)} A${INNER},${INNER} 0 0 0 ${f(x3)},${f(y3)} Z`
  );
}

interface SlotView {
  definition: UtilityDefinition;
  sector: SVGElement;
  group: SVGElement | null;
  quantity: SVGElement | null;
  icon: SVGElement | null;
  /** A mission item's empty ring, shown until the item is picked up. */
  placeholder: SVGElement | null;
  /** A short arc on the hub's rim, lit while this slot is selected. */
  rim: SVGElement;
  lastQuantity: string;
}

export class WeaponWheelView {
  public readonly root: HTMLElement;

  private readonly utilities: PlayerUtilities;
  private readonly wheel: WeaponWheel;
  private readonly slots: SlotView[] = [];
  private readonly centerName: SVGElement;
  private readonly centerQuantity: SVGElement;
  private lastOpen = false;
  private lastHighlight = -1;
  private lastCenter = "";

  constructor(
    parent: HTMLElement,
    utilities: PlayerUtilities,
    wheel: WeaponWheel,
  ) {
    this.utilities = utilities;
    this.wheel = wheel;

    this.root = document.createElement("div");
    this.root.className = "weapon-wheel";
    this.root.dataset.open = "false";
    this.root.setAttribute("aria-hidden", "true");

    const canvas = svg("svg", {
      viewBox: `${-OUTER - 6} ${-OUTER - 6} ${(OUTER + 6) * 2} ${(OUTER + 6) * 2}`,
    });

    this.root.appendChild(canvas);

    // The dark disc behind everything, with a thin outer edge.
    svg("circle", { r: String(OUTER), class: "ww-disc" }, canvas);

    const slots = utilities.slots;
    const half = 180 / slots.length;

    // Sectors first (so the lines and icons sit on top).
    for (const definition of slots) {
      const sector = svg(
        "path",
        {
          d: sectorPath(definition.angle - half, definition.angle + half),
          class: "ww-sector",
        },
        canvas,
      );

      sector.dataset.type = definition.type;

      const [rx0, ry0] = polar(INNER, definition.angle - half);
      const [rx1, ry1] = polar(INNER, definition.angle + half);
      const rim = svg(
        "path",
        {
          d: `M${rx0.toFixed(2)},${ry0.toFixed(2)} A${INNER},${INNER} 0 0 1 ${rx1.toFixed(2)},${ry1.toFixed(2)}`,
          class: "ww-rim",
        },
        canvas,
      );

      this.slots.push({
        definition,
        sector,
        group: null,
        quantity: null,
        icon: null,
        placeholder: null,
        rim,
        lastQuantity: "",
      });
    }

    // Thin radial separators between the sectors.
    for (const definition of slots) {
      const [x0, y0] = polar(INNER, definition.angle + half);
      const [x1, y1] = polar(OUTER, definition.angle + half);

      svg(
        "line",
        {
          x1: x0.toFixed(2),
          y1: y0.toFixed(2),
          x2: x1.toFixed(2),
          y2: y1.toFixed(2),
          class: "ww-divider",
        },
        canvas,
      );
    }

    svg("circle", { r: String(INNER), class: "ww-hub" }, canvas);

    // Icon, name and quantity for each slot: one block, centred on the
    // midpoint of the slot's sector (the same radius and the same inner layout
    // for every slot, so nothing is placed by hand).
    for (const slot of this.slots) {
      const [x, y] = polar(SLOT_RADIUS, slot.definition.angle);
      const group = svg(
        "g",
        {
          transform: `translate(${x.toFixed(2)},${y.toFixed(2)})`,
          class: "ww-slot",
        },
        canvas,
      );

      slot.group = group;
      group.dataset.type = slot.definition.type;

      if (slot.definition.reserved) {
        group.dataset.reserved = "true";
      }

      const icon = svg("g", { class: "ww-icon" }, group);

      slot.icon = icon;
      icon.dataset.icon = slot.definition.icon;

      for (const [tag, attrs] of ICONS[slot.definition.icon]) {
        svg(tag, attrs, icon);
      }

      // A mission item's slot is an empty ring until the item is picked up:
      // the item's own icon and name appear then (see `render`).
      if (slot.definition.missionItem) {
        const ring = svg("g", { class: "ww-icon" }, group);

        slot.placeholder = ring;
        ring.dataset.icon = "empty";
        ring.dataset.placeholder = "true";

        for (const [tag, attrs] of ICONS.empty) {
          svg(tag, attrs, ring);
        }
      }

      const name = svg(
        "text",
        { x: "0.85", y: String(NAME_Y), class: "ww-name" },
        group,
      );

      // A placeholder carries no name: only its quiet empty ring.
      name.textContent = slot.definition.reserved
        ? ""
        : slot.definition.name.toUpperCase();

      // A mission item is one thing, held or not: no "x1" under it.
      if (slot.definition.counted && !slot.definition.missionItem) {
        slot.quantity = svg(
          "text",
          { y: String(QTY_Y), class: "ww-qty" },
          group,
        );
      }
    }

    this.centerName = svg(
      "text",
      { x: "1.5", y: "-2", class: "ww-center-name" },
      canvas,
    );
    this.centerQuantity = svg(
      "text",
      { y: "19", class: "ww-center-qty" },
      canvas,
    );

    parent.appendChild(this.root);
    this.layoutIcons();
    this.render();
  }

  /**
   * Centres each icon on its block's icon position and gives all of them the
   * same size and stroke weight, from the icon's own bounding box (icons are
   * drawn around different centres and at different sizes on their grid).
   */
  private layoutIcons(): void {
    const icons = this.slots.flatMap((slot) => [slot.icon, slot.placeholder]);

    for (const icon of icons) {
      if (!icon) {
        continue;
      }

      let scale = 1.3;
      let cx = 0;
      let cy = 0;

      try {
        const box = (icon as unknown as SVGGraphicsElement).getBBox();
        const longest = Math.max(box.width, box.height);

        if (longest > 0) {
          scale = Math.min(2, Math.max(0.9, ICON_SIZE / longest));
          cx = box.x + box.width / 2;
          cy = box.y + box.height / 2;
        }
      } catch {
        // No layout to measure (a test, no DOM): the plain 1.3 scale.
      }

      icon.setAttribute(
        "transform",
        `translate(0,${ICON_Y}) scale(${scale.toFixed(3)}) translate(${(-cx).toFixed(3)},${(-cy).toFixed(3)})`,
      );
      icon.style.strokeWidth = (ICON_STROKE / scale).toFixed(3);
    }
  }

  /** Shrinks the hub's name until it fits inside the hub with room to spare. */
  private fitCenterName(): void {
    let size = HUB_NAME_SIZE;

    this.centerName.style.fontSize = `${size}px`;

    try {
      const width = (
        this.centerName as unknown as SVGTextContentElement
      ).getComputedTextLength();

      if (width > HUB_TEXT_WIDTH) {
        size = Math.max(12, (HUB_NAME_SIZE * HUB_TEXT_WIDTH) / width);
      }
    } catch {
      const length = this.centerName.textContent?.length ?? 0;

      if (length > 7) {
        size = Math.max(12, (HUB_NAME_SIZE * 7) / length);
      }
    }

    this.centerName.style.fontSize = `${size.toFixed(2)}px`;
  }

  /** Brings the drawing up to date. Call every frame; unchanged parts cost nothing. */
  public render(): void {
    const open = this.wheel.isOpen;

    if (open !== this.lastOpen) {
      this.lastOpen = open;
      this.root.dataset.open = String(open);
    }

    // A locked slot (the dynamite before it is picked up) is dimmed and has no
    // name yet. This reads the same inventory fact the selection does.
    for (const slot of this.slots) {
      if (slot.definition.missionItem && slot.group) {
        const locked = String(
          !this.utilities.isAvailable(slot.definition.type),
        );

        if (slot.group.dataset.locked !== locked) {
          slot.group.dataset.locked = locked;
        }
      }
    }

    // Quantities come straight from the inventory, so they are always current.
    for (const slot of this.slots) {
      if (!slot.quantity) {
        continue;
      }

      const have = this.utilities.quantityOf(slot.definition.type) ?? 0;
      const text = `×${have}`;

      if (text !== slot.lastQuantity) {
        slot.lastQuantity = text;
        slot.quantity.textContent = text;
        slot.group!.dataset.empty = String(have <= 0);
      }
    }

    const highlight = this.wheel.highlightedIndex;

    if (highlight !== this.lastHighlight) {
      this.lastHighlight = highlight;

      this.slots.forEach((slot, k) => {
        slot.sector.classList.toggle("is-selected", k === highlight);
        slot.group?.classList.toggle("is-selected", k === highlight);
        slot.rim.classList.toggle("is-selected", k === highlight);
      });
    }

    const current = this.slots[highlight].definition;
    const have =
      current.counted && !current.missionItem
        ? (this.utilities.quantityOf(current.type) ?? 0)
        : null;
    const center = `${current.type}:${have}`;

    if (center !== this.lastCenter) {
      this.lastCenter = center;
      this.centerName.textContent = current.name.toUpperCase();
      // With a quantity underneath the pair is centred; alone, the name is.
      this.centerName.setAttribute("y", have === null ? "8" : "-6");
      this.centerQuantity.textContent = have === null ? "" : `×${have}`;
      this.fitCenterName();
    }
  }

  public dispose(): void {
    this.root.remove();
    this.slots.length = 0;
  }
}
