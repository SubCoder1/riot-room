import type {
  PlayerUtilities,
  UtilityDefinition,
  UtilityIcon,
} from "../inventory/PlayerUtilities";
import type { WeaponWheel } from "../inventory/WeaponWheel";

/**
 * Draws the weapon wheel: a screen-space overlay (not part of the 3D scene, so
 * it behaves the same in first and third person). It draws whatever slots the
 * inventory is configured with and reads quantities from it every frame, so a
 * grenade picked up later shows up on the wheel by itself.
 *
 * Plain inline SVG and CSS: a thin ring, one sector per slot, small line icons,
 * and the highlighted slot's name and quantity in the middle.
 */

const SVG = "http://www.w3.org/2000/svg";

const OUTER = 140;
const INNER = 50;
const ICON_RADIUS = 96;
/** How far a top slot is moved outward so its icon is near the rim (see below). */
const TOP_SLOT_LIFT = 17;

type Shape = [tag: string, attrs: Record<string, string>];

/** Small line icons on a 32 x 32 grid centred on (0, 0). Colour comes from CSS. */
const ICONS: Record<UtilityIcon, Shape[]> = {
  // A fragmentation grenade: a ribbed casing, a fuse and a lever with a pin ring.
  grenade: [
    ["ellipse", { cx: "0", cy: "5", rx: "9", ry: "10" }],
    ["rect", { x: "-3.5", y: "-7", width: "7", height: "4", rx: "1" }],
    ["path", { d: "M3.5,-6 C11,-7 13,0 11,7" }],
    ["circle", { cx: "-7.5", cy: "-7.5", r: "2.5" }],
    ["line", { x1: "-5", y1: "-7", x2: "-3.5", y2: "-6" }],
    ["path", { d: "M-8.7,2 Q0,5.5 8.7,2" }],
    ["path", { d: "M-8.2,8 Q0,11.5 8.2,8" }],
    ["line", { x1: "0", y1: "-3", x2: "0", y2: "15" }],
  ],
  // A bottle with a rag and a flame.
  molotov: [
    [
      "path",
      {
        d: "M-3,-3 L-3,-8 L3,-8 L3,-3 C9,1 9,11 6,13 L-6,13 C-9,11 -9,1 -3,-3 Z",
      },
    ],
    ["line", { x1: "-7", y1: "5", x2: "7", y2: "5" }],
    ["line", { x1: "-8", y1: "9", x2: "8", y2: "9" }],
    ["line", { x1: "0", y1: "-8", x2: "0", y2: "-11" }],
    ["path", { d: "M0,-11 C-5,-14 -2,-16 -2,-19 C2,-17 5,-14 0,-11 Z" }],
  ],
  // A smoke canister with a band and a billowing cloud over it.
  smoke: [
    ["rect", { x: "-6", y: "-1", width: "12", height: "17", rx: "2" }],
    ["line", { x1: "-6", y1: "4", x2: "6", y2: "4" }],
    ["line", { x1: "-6", y1: "8", x2: "6", y2: "8" }],
    [
      "path",
      {
        d: "M-10,-4 C-15,-5 -14,-11 -9,-10 C-9,-15 -2,-16 0,-12 C3,-16 10,-14 9,-9 C14,-9 15,-3 10,-4 Z",
      },
    ],
  ],
  // A boxing glove: mitt, thumb, finger curl and a laced cuff.
  glove: [
    [
      "path",
      {
        d: "M-8,4 L-8,-4 C-8,-11 -3,-14 3,-14 C10,-14 14,-9 13,-3 C12,2 9,4 6,4",
      },
    ],
    ["path", { d: "M-8,-3 C-14,-3 -15,5 -10,6 C-8,6.5 -6,5.5 -5,3" }],
    ["path", { d: "M4,-10 C9,-9 10,-4 7,-1 L1,-1" }],
    ["path", { d: "M-8,4 L-9,13 L7,13 L6,4" }],
    ["line", { x1: "-8.5", y1: "8.5", x2: "6.5", y2: "8.5" }],
    ["path", { d: "M-4,8.5 L-2,11.5 M0,8.5 L2,11.5" }],
  ],
  // A reserved slot: an empty dashed ring.
  empty: [
    ["circle", { cx: "0", cy: "0", r: "11", "stroke-dasharray": "4 4.5" }],
  ],
};

function svg(
  tag: string,
  attrs: Record<string, string> = {},
  parent?: Element,
): SVGElement {
  const element = document.createElementNS(SVG, tag);

  for (const [key, value] of Object.entries(attrs)) {
    element.setAttribute(key, value);
  }

  parent?.appendChild(element);

  return element as SVGElement;
}

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
      this.slots.push({
        definition,
        sector,
        group: null,
        quantity: null,
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

    // Icon, name and quantity for each slot.
    for (const slot of this.slots) {
      const [x, baseY] = polar(ICON_RADIUS, slot.definition.angle);
      // The name and quantity hang below the icon. For a slot at the top that
      // is toward the middle of the wheel, so lift it outward until its icon
      // sits as near the rim as the bottom slot's label does.
      const y =
        Math.cos((slot.definition.angle * Math.PI) / 180) > 0.5
          ? baseY - TOP_SLOT_LIFT
          : baseY;
      const group = svg(
        "g",
        {
          transform: `translate(${x.toFixed(2)},${y.toFixed(2)})`,
          class: "ww-slot",
        },
        canvas,
      );
      slot.group = group;

      if (slot.definition.reserved) {
        group.dataset.reserved = "true";
      }

      const icon = svg("g", { class: "ww-icon" }, group);

      icon.dataset.icon = slot.definition.icon;

      for (const [tag, attrs] of ICONS[slot.definition.icon]) {
        svg(tag, attrs, icon);
      }

      const name = svg("text", { x: "0.85", y: "31", class: "ww-name" }, group);

      name.textContent = slot.definition.name.toUpperCase();

      if (slot.definition.counted) {
        slot.quantity = svg("text", { y: "45", class: "ww-qty" }, group);
      }
    }

    this.centerName = svg(
      "text",
      { x: "1.5", y: "-2", class: "ww-center-name" },
      canvas,
    );
    this.centerQuantity = svg(
      "text",
      { y: "18", class: "ww-center-qty" },
      canvas,
    );

    parent.appendChild(this.root);
    this.render();
  }

  /** Brings the drawing up to date. Call every frame; unchanged parts cost nothing. */
  public render(): void {
    const open = this.wheel.isOpen;

    if (open !== this.lastOpen) {
      this.lastOpen = open;
      this.root.dataset.open = String(open);
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
      });
    }

    const current = this.slots[highlight].definition;
    const have = current.counted
      ? (this.utilities.quantityOf(current.type) ?? 0)
      : null;
    const center = `${current.type}:${have}`;

    if (center !== this.lastCenter) {
      this.lastCenter = center;
      this.centerName.textContent = current.name.toUpperCase();
      // With a quantity underneath the pair is centred; alone, the name is.
      this.centerName.setAttribute("y", have === null ? "8" : "-2");
      this.centerQuantity.textContent = have === null ? "" : `×${have}`;
    }
  }

  public dispose(): void {
    this.root.remove();
    this.slots.length = 0;
  }
}
