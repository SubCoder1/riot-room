import type { UtilityIcon } from "../inventory/PlayerUtilities";

/**
 * The line icons for the throwables and fists, shared by the weapon wheel and
 * the HUD's equipped-item readout: one drawing, so they always agree.
 */

const SVG = "http://www.w3.org/2000/svg";

export type Shape = [tag: string, attrs: Record<string, string>];

/** Small line icons on a 32 x 32 grid centred on (0, 0). Colour comes from CSS. */
export const ICONS: Record<UtilityIcon, Shape[]> = {
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
  // A bundle of dynamite: three sticks bound with a band, a fuse and a spark.
  dynamite: [
    ["rect", { x: "-9", y: "-3", width: "6", height: "17", rx: "1.5" }],
    ["rect", { x: "-3", y: "-3", width: "6", height: "17", rx: "1.5" }],
    ["rect", { x: "3", y: "-3", width: "6", height: "17", rx: "1.5" }],
    ["line", { x1: "-10", y1: "4", x2: "10", y2: "4" }],
    ["path", { d: "M0,-3 C0,-7 4,-8 5,-12" }],
    ["path", { d: "M5,-12 L7.5,-14.5 M5,-12 L2.5,-14.5 M5,-12 L8,-11" }],
  ],
  // A reserved slot: an empty dashed ring (no weapon is drawn for a gun that
  // does not exist yet).
  empty: [
    ["circle", { cx: "0", cy: "0", r: "10", "stroke-dasharray": "3.5 4" }],
  ],
};

export function svg(
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

/** The height (in the icon grid) of the middle of each drawing's lines. */
const ICON_CENTRE: Record<UtilityIcon, number> = {
  grenade: 2.5,
  molotov: -3,
  smoke: 0,
  glove: -0.5,
  dynamite: -0.5,
  empty: 0,
};

/** A small standalone icon (the same drawing as on the wheel), styled by CSS. */
export function createIconSvg(icon: UtilityIcon): SVGElement {
  // Each drawing is centred in its box by where its lines actually are (they
  // differ: a molotov's flame reaches high, a grenade sits low), so every icon
  // lines up with the numbers beside it.
  const centre = ICON_CENTRE[icon];
  const root = svg("svg", {
    viewBox: `-17 ${(centre - 19).toFixed(1)} 34 38`,
    class: "hud-icon",
  });
  const group = svg("g", {}, root);

  for (const [tag, attrs] of ICONS[icon]) {
    svg(tag, attrs, group);
  }

  return root;
}
