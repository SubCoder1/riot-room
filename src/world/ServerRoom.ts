import { Pieces, rng } from "./FittingPieces";
import type { MapBuilder } from "./MapParts";
import {
  BLACK,
  CARDBOARD,
  CHARCOAL,
  GUNMETAL,
  LED_AMBER,
  LED_GREEN,
  LED_RED,
  STEEL,
  STEEL_BARE,
  STEEL_LIGHT,
  extinguisher,
  led,
  plate,
  trayX,
  trayZ,
  warningSign,
} from "./RoomKit";

/**
 * The Server room (x 22 to 32, z -12 to -5, floor 4, ceiling 6.5 m up; inside
 * x 22.3 to 31.7): two short rows of 2.6 m server racks each side of a 2.2 m
 * aisle, their backs, with the cable bundles, to the outer lanes; ladder
 * trays, beams and a duct overhead; a
 * wall patch cabinet; a maintenance console closing the east end of the
 * aisle; a spare-parts shelf and a service trolley in the west corners.
 *
 * Fewer racks than before, one fitting per row. The aisle stays open from the
 * door (z -9 to -7) to the console, and the cross lane between the row ends
 * stays open for flanking.
 */

const WIRE_DARK = 0x1b1d21;
const WIRE_RED = 0x4a2a2a;
const WIRE_BLUE = 0x2a4260;
const WIRE_GREY = 0x6a707a;
/** The room is as tall as the Storage room: 6.5 m to the ceiling. */
const CEILING = 6.5;
/** The racks stand 2.6 m, well under the trays and beams above them. */
const RACK_H = 2.6;
const TRAY_Y = 3.9;

/** A rack in use, one stripped bare with its door open, or one with a unit pulled out. */
type RackState = "live" | "empty" | "pulled";

type Unit = "server" | "switch" | "patch" | "vent" | "ups" | "blank";

/** One rack: a steel cabinet whose front (towards `front` along z) carries rack equipment. */
function rack(
  p: Pieces,
  random: () => number,
  cx: number,
  cz: number,
  w: number,
  front: 1 | -1,
  kind: "servers" | "network",
  state: RackState = "live",
): void {
  const fz = cz + front * 0.5;
  const bz = cz - front * 0.5;
  const pw = w - 0.12;

  // The cabinet: a plinth, the body and a top cap, with a side rail each side.
  p.box(cx, 0, cz, w - 0.01, 0.06, 1.0, BLACK);
  p.box(cx, 0.06, cz, w - 0.02, RACK_H - 0.09, 0.98, GUNMETAL);
  p.box(cx, RACK_H - 0.03, cz, w - 0.01, 0.03, 1.0, CHARCOAL);

  for (const s of [-1, 1]) {
    p.box(
      cx + s * (w / 2 - 0.03),
      0.06,
      fz + front * 0.01,
      0.04,
      RACK_H - 0.09,
      0.024,
      STEEL,
    );
  }

  // Equipment from the bottom up; the odd blanking plate where a unit is missing.
  let y = 0.14;
  const order: Unit[] =
    kind === "network"
      ? [
          "patch",
          "switch",
          "patch",
          "switch",
          "switch",
          "vent",
          "patch",
          "switch",
        ]
      : [
          "ups",
          "server",
          "server",
          "vent",
          "server",
          "switch",
          "server",
          "server",
          "vent",
        ];
  let index = 0;

  while (y < RACK_H - 0.28 && state !== "empty") {
    let unit = order[index % order.length];

    index++;

    if (random() < 0.12) {
      unit = "blank";
    }

    const h =
      unit === "ups"
        ? 0.22
        : unit === "server"
          ? 0.09
          : unit === "vent"
            ? 0.05
            : 0.045;
    const z = fz + front * 0.006;

    if (y + h > RACK_H - 0.12) {
      break;
    }

    if (unit === "server") {
      p.box(cx, y, z, pw, h, 0.03, CHARCOAL);

      for (let b = 0; b < 4; b++) {
        p.box(
          cx - pw / 2 + 0.05 + b * 0.065,
          y + 0.015,
          z + front * 0.017,
          0.05,
          h - 0.03,
          0.006,
          GUNMETAL,
        );
      }

      led(
        p,
        cx + pw / 2 - 0.04,
        y + h * 0.68,
        fz + front * 0.022,
        LED_GREEN,
        "z",
        front,
      );
      led(
        p,
        cx + pw / 2 - 0.04,
        y + h * 0.3,
        fz + front * 0.022,
        random() < 0.2 ? LED_RED : random() < 0.4 ? LED_AMBER : LED_GREEN,
        "z",
        front,
      );
    } else if (unit === "switch") {
      p.box(cx, y, z, pw, h, 0.03, STEEL);
      p.box(
        cx - 0.04,
        y + 0.012,
        z + front * 0.017,
        pw * 0.6,
        h - 0.024,
        0.006,
        BLACK,
      );

      for (let k = 0; k < 4; k++) {
        led(
          p,
          cx + pw / 2 - 0.045 + (k % 2) * 0.0,
          y + 0.012 + (k % 2) * 0.016,
          fz + front * 0.022,
          k === 2 && random() < 0.5 ? LED_AMBER : LED_GREEN,
          "z",
          front,
        );
      }
    } else if (unit === "patch") {
      p.box(cx, y, z, pw, h, 0.03, CHARCOAL);

      for (let k = 0; k < 8; k++) {
        p.box(
          cx - pw / 2 + 0.045 + k * ((pw - 0.09) / 7),
          y + 0.012,
          z + front * 0.017,
          0.022,
          0.02,
          0.006,
          BLACK,
        );
      }

      // One or two patch cables, drooping from a port.
      if (random() < 0.55) {
        const px =
          cx - pw / 2 + 0.045 + Math.floor(random() * 8) * ((pw - 0.09) / 7);

        p.cableUp(
          px,
          y - 0.1,
          fz + front * 0.03,
          0.12,
          0.014,
          [WIRE_BLUE, 0x6a4a1a, WIRE_GREY][Math.floor(random() * 3)],
        );
      }
    } else if (unit === "vent") {
      p.box(cx, y, z, pw, h, 0.03, BLACK);

      for (let k = 0; k < 3; k++) {
        p.box(
          cx,
          y + 0.01 + k * 0.014,
          fz + front * 0.022,
          pw - 0.06,
          0.006,
          0.004,
          STEEL,
        );
      }
    } else if (unit === "ups") {
      p.box(cx, y, z, pw, h, 0.04, STEEL);
      p.box(
        cx - 0.06,
        y + 0.12,
        fz + front * 0.026,
        0.1,
        0.05,
        0.006,
        0x23402e,
      );
      led(p, cx + 0.1, y + 0.16, fz + front * 0.026, LED_GREEN, "z", front);
      plate(p, cx, y + 0.04, fz + front * 0.024, 0.14, 0.05, "z", front);
    } else {
      p.box(cx, y, z, pw, h, 0.02, GUNMETAL);
    }

    y += h + 0.012;
  }

  if (state === "empty") {
    // Stripped: a dark open frame with its rail holes, the door swung back
    // and left hanging, a few cable ends and a coil on the floor.
    p.box(cx, 0.1, fz + front * 0.004, pw + 0.04, RACK_H - 0.2, 0.02, 0x232a34);

    for (let k = 0; k < 20; k++) {
      for (const sx of [-1, 1]) {
        p.box(
          cx + sx * (pw / 2),
          0.2 + k * 0.12,
          fz + front * 0.016,
          0.02,
          0.012,
          0.006,
          STEEL_LIGHT,
        );
      }
    }

    p.box(
      cx - w / 2 + 0.02,
      0.1,
      fz + front * 0.3,
      0.025,
      RACK_H - 0.15,
      0.56,
      GUNMETAL,
    );
    p.box(
      cx - w / 2 + 0.034,
      1.0,
      fz + front * 0.5,
      0.012,
      0.14,
      0.03,
      STEEL_BARE,
    );
    p.cableUp(cx + 0.1, 0.9, fz + front * 0.03, 0.7, 0.022, WIRE_DARK);
    p.cableUp(cx - 0.12, 1.2, fz + front * 0.03, 0.4, 0.022, WIRE_BLUE);
    p.cable(cx + 0.05, 0.03, fz + front * 0.4, 0.5, 0.04, WIRE_DARK, 0.4);
    p.cable(cx + 0.15, 0.03, fz + front * 0.45, 0.4, 0.04, WIRE_RED, -0.3);
  } else if (state === "pulled") {
    // A server unit half out on its rails, and a dead one on the floor.
    p.box(cx, 1.05, fz + front * 0.22, pw - 0.02, 0.09, 0.42, CHARCOAL);
    p.box(cx, 1.14, fz + front * 0.22, pw - 0.06, 0.006, 0.38, BLACK);

    for (const sx of [-1, 1]) {
      p.box(
        cx + sx * (pw / 2 - 0.02),
        1.0,
        fz + front * 0.2,
        0.012,
        0.05,
        0.4,
        STEEL_BARE,
      );
    }

    p.box(cx + 0.06, 0, fz + front * 0.34, pw - 0.1, 0.09, 0.5, GUNMETAL, 0.2);
    led(p, cx + 0.2, 0.06, fz + front * 0.6, LED_AMBER, "z", front);
    p.cable(cx - 0.1, 0.03, fz + front * 0.5, 0.45, 0.03, WIRE_GREY, 0.5);
  }

  // The back: a power strip up one side and a bundle of cables to the tray.
  p.box(cx + (w / 2 - 0.09), 0.3, bz - front * 0.03, 0.05, 1.9, 0.05, BLACK);

  for (let k = 0; k < 8; k++) {
    p.box(
      cx + (w / 2 - 0.09),
      0.4 + k * 0.22,
      bz - front * 0.058,
      0.03,
      0.03,
      0.008,
      STEEL_LIGHT,
    );
  }

  const bundle = [WIRE_DARK, WIRE_RED, WIRE_BLUE][Math.floor(random() * 3)];

  // The bundle rises past the rack's top to the overhead tray.
  p.cableUp(cx - 0.1, 0.24, bz - front * 0.04, TRAY_Y - 0.2, 0.038, bundle);
  p.cableUp(cx - 0.06, 0.4, bz - front * 0.04, RACK_H - 0.3, 0.026, WIRE_DARK);

  for (const by of [0.6, 1.1, 1.6, 2.1, 2.6, 3.1, 3.5]) {
    p.box(cx - 0.08, by, bz - front * 0.04, 0.09, 0.03, 0.07, STEEL_LIGHT);
  }

  // A small label on the top front edge.
  plate(p, cx, RACK_H - 0.1, fz + front * 0.012, w - 0.2, 0.05, "z", front);
}

/** A row of racks across `x0` to `x1`; the last is a network cabinet. */
function row(
  p: Pieces,
  random: () => number,
  x0: number,
  x1: number,
  cz: number,
  front: 1 | -1,
  network: number,
  states: RackState[],
): void {
  const count = Math.round((x1 - x0) / 0.63);
  const w = (x1 - x0) / count;

  for (let i = 0; i < count; i++) {
    rack(
      p,
      random,
      x0 + w / 2 + i * w,
      cz,
      w,
      front,
      i === network ? "network" : "servers",
      states[i] ?? "live",
    );
  }
}

export function furnishServerRoom(map: MapBuilder, floorY: number): void {
  const F = floorY;
  const random = rng(7301);

  // ------------------------------------------------------------ the racks
  // Fewer racks and a wider aisle: two short rows each side of a 2.2 m aisle
  // (z -9.95 to -7.75), a 3.3 m cross lane between the row ends, and a lane
  // behind each row.
  const NORTH_Z = -9.95;
  const SOUTH_Z = -6.75;
  const rows: Array<
    [string, number, number, number, 1 | -1, number, RackState[]]
  > = [
    ["rack-server-1", 24.4, 26.3, NORTH_Z, 1, 2, ["live", "empty", "live"]],
    ["rack-server-2", 29.5, 31.7, NORTH_Z, 1, 0, ["live", "pulled", "live"]],
    ["rack-server-3", 24.6, 26.7, SOUTH_Z, -1, 2, ["live", "live", "empty"]],
    ["rack-server-4", 29.5, 31.7, SOUTH_Z, -1, 1, ["pulled", "live", "live"]],
  ];

  for (const [id, x0, x1, cz, front, network, states] of rows) {
    const p = new Pieces();

    row(p, random, x0, x1, cz, front, network, states);
    map.createFitting(id, F, p.elements, [
      { minX: x0, maxX: x1, minZ: cz - 0.5, maxZ: cz + 0.5, top: RACK_H },
    ]);
  }

  // --------------------------------------- overhead trays (drawn only)
  {
    const p = new Pieces();
    const northRear = NORTH_Z - 0.54;
    const southRear = SOUTH_Z + 0.54;

    // Steel beams across the room under the ceiling, every 2.6 m.
    for (let x = 23.3; x < 31.8; x += 2.6) {
      p.box(x, CEILING - 0.6, -8.65, 0.3, 0.05, 6.4, STEEL);
      p.box(x, CEILING - 0.32, -8.65, 0.3, 0.05, 6.4, STEEL);
      p.box(x, CEILING - 0.55, -8.65, 0.06, 0.23, 6.3, CHARCOAL);
    }

    // The high ventilation duct along the south wall, with flanges and drops.
    p.box(27.0, CEILING - 1.6, -5.9, 9.0, 0.7, 0.8, GUNMETAL);

    for (let x = 22.8; x < 31.5; x += 1.8) {
      p.box(x, CEILING - 1.63, -5.9, 0.07, 0.76, 0.86, STEEL);
    }

    for (const x of [24.0, 29.0]) {
      p.box(x, CEILING - 1.85, -5.9, 0.5, 0.25, 0.5, CHARCOAL);
    }

    // A trunk along the north wall, a branch over the cross lane, and one
    // tray behind each row, where its cables rise.
    trayX(p, 22.6, 31.5, TRAY_Y, -11.7, 0.34, CEILING - 0.6, [
      WIRE_DARK,
      WIRE_BLUE,
    ]);
    trayZ(p, 28.1, TRAY_Y, -11.7, southRear, 0.34, CEILING - 0.6, [
      WIRE_DARK,
      WIRE_RED,
    ]);
    trayX(p, 24.4, 31.7, TRAY_Y, northRear, 0.4, CEILING - 0.6, [
      WIRE_DARK,
      WIRE_RED,
      WIRE_BLUE,
    ]);
    trayX(p, 24.6, 31.7, TRAY_Y, southRear, 0.4, CEILING - 0.6, [
      WIRE_DARK,
      WIRE_BLUE,
    ]);
    // A drop from the trunk to the wall cabinet.
    p.cableUp(24.55, 1.5, -11.76, TRAY_Y - 1.4, 0.04, WIRE_DARK);

    // Light fittings over the aisle: a pair of high-bay lamps on rods.
    for (const x of [25.0, 29.0]) {
      p.post(x, CEILING - 1.2, -8.75, 0.7, 0.025, CHARCOAL);
      p.box(x, CEILING - 1.35, -8.75, 0.7, 0.16, 0.34, CHARCOAL);
      p.box(x, CEILING - 1.37, -8.75, 0.58, 0.03, 0.26, 0xdfe6ea);
    }

    map.createFitting("fittings-server-trays", F, p.elements, []);
    // The beams, duct and trays under the ceiling stop shots and throws.
    map.addShotBlocksFor("fittings-server-trays", F, p.elements);
  }

  // ------------------------------------------ the wall patch cabinet
  {
    const p = new Pieces();
    const x = 24.85;
    const z = -11.89;

    p.box(x, 0.88, z, 1.3, 1.4, 0.22, STEEL);
    p.box(x, 0.94, z + 0.1, 1.14, 1.28, 0.03, BLACK);

    for (let k = 0; k < 5; k++) {
      const y = 1.02 + k * 0.23;

      p.box(x, y, z + 0.115, 1.04, 0.07, 0.014, CHARCOAL);

      for (let n = 0; n < 12; n++) {
        p.box(
          x - 0.46 + n * 0.084,
          y + 0.022,
          z + 0.124,
          0.03,
          0.03,
          0.006,
          BLACK,
        );
      }

      // Patch cables dropping from a few ports.
      for (let n = 0; n < 3; n++) {
        const px = x - 0.46 + Math.floor(random() * 12) * 0.084;

        p.cableUp(
          px,
          y - 0.14,
          z + 0.13,
          0.15,
          0.014,
          [WIRE_BLUE, 0x6a4a1a, WIRE_GREY, WIRE_RED][Math.floor(random() * 4)],
        );
      }
    }

    // The open door, hanging off its hinge side.
    p.box(x - 0.67, 0.88, z + 0.2, 0.03, 1.4, 0.36, STEEL_LIGHT, 0.35);
    p.box(x, 2.28, z, 1.34, 0.04, 0.24, CHARCOAL);
    // A conduit up the wall to the ceiling.
    p.post(x + 0.5, 2.32, z - 0.04, CEILING - 2.32, 0.05, STEEL_BARE);
    plate(p, x, 2.2, z + 0.12, 0.4, 0.08, "z", 1);
    map.createFitting("fittings-server-cabinet", F, p.elements, []);
    map.addShotBlocksFor("fittings-server-cabinet", F, p.elements, 0.8);
  }

  // ----------------------------------- the maintenance console, east end
  {
    const p = new Pieces();
    const z0 = -9.2;
    const z1 = -7.7;
    const zc = (z0 + z1) / 2;

    // The desk: a worn top, a drawer pedestal against the wall, legs on the aisle side.
    p.box(31.3, 0.74, zc, 0.8, 0.04, 1.5, CHARCOAL);
    p.box(31.45, 0, zc, 0.5, 0.74, 1.46, GUNMETAL);

    for (let d = 0; d < 3; d++) {
      const dz = z0 + 0.27 + d * 0.48;

      p.box(31.19, 0.08 + d * 0.0, dz, 0.012, 0.6, 0.42, STEEL);
      p.box(31.185, 0.35, dz, 0.012, 0.03, 0.16, STEEL_BARE);
    }

    for (const dz of [z0 + 0.04, z1 - 0.04]) {
      p.box(30.96, 0, dz, 0.05, 0.74, 0.05, STEEL);
    }

    // Two monitors on the desk, facing the aisle, dim green traces on them.
    for (const dz of [-0.4, 0.4]) {
      const z = zc + dz;

      p.box(31.5, 0.78, z, 0.14, 0.03, 0.2, BLACK);
      p.box(31.5, 0.8, z, 0.04, 0.2, 0.05, CHARCOAL);
      p.box(31.48, 0.98, z, 0.05, 0.36, 0.56, BLACK);
      p.box(31.452, 1.0, z, 0.008, 0.32, 0.5, 0x1f3a2a);
      p.box(31.446, 1.1, z - 0.08, 0.006, 0.01, 0.26, 0x4c7a50);
      p.box(31.446, 1.04, z + 0.06, 0.006, 0.01, 0.18, 0x4c7a50);
      p.box(31.446, 1.16, z + 0.02, 0.006, 0.01, 0.3, 0x3c6a44);
    }

    // A keyboard, a mouse and a pad of notes.
    p.box(31.0, 0.78, zc - 0.05, 0.17, 0.02, 0.46, CHARCOAL);
    p.box(31.0, 0.8, zc - 0.05, 0.14, 0.006, 0.42, STEEL);
    p.box(31.05, 0.78, zc + 0.4, 0.07, 0.025, 0.05, BLACK);
    p.box(30.98, 0.78, zc - 0.58, 0.16, 0.012, 0.2, 0xb9b49c, 0.2);

    // The status board above, on the wall: a grid of small lights.
    p.box(31.66, 1.62, zc, 0.04, 0.36, 1.2, GUNMETAL);

    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 8; c++) {
        const color =
          random() < 0.12 ? LED_RED : random() < 0.25 ? LED_AMBER : LED_GREEN;

        led(p, 31.64, 1.7 + r * 0.1, zc - 0.5 + c * 0.14, color, "x", -1);
      }
    }

    // Cables from the wall panel down behind the desk.
    p.cableUp(31.62, 0.1, zc - 0.6, 1.5, 0.03, WIRE_DARK);
    p.cableUp(31.62, 0.1, zc + 0.6, 1.5, 0.03, WIRE_RED);
    map.createFitting("console-server", F, p.elements, [
      { minX: 30.9, maxX: 31.7, minZ: z0, maxZ: z1, top: 1.1 },
    ]);
  }

  // A stool at the console.
  {
    const p = new Pieces();

    p.post(30.35, 0.1, -8.45, 0.3, 0.05, STEEL);
    p.post(30.35, 0.4, -8.45, 0.05, 0.36, CHARCOAL);

    for (const a of [0, 1, 2]) {
      p.bar(30.35, 0.07, -8.45, 0.34, 0.03, GUNMETAL, a * (Math.PI / 3));
    }

    map.createFitting("fittings-server-stool", F, p.elements, []);
  }

  // ---------------------------- the spare-parts shelf, north-west corner
  {
    const p = new Pieces();
    const x0 = 22.3;
    const x1 = 23.0;
    const z0 = -12.0;
    const z1 = -10.6;
    const xc = (x0 + x1) / 2;
    const zc = (z0 + z1) / 2;

    for (const dx of [x0 + 0.03, x1 - 0.03]) {
      for (const dz of [z0 + 0.03, z1 - 0.03]) {
        p.box(dx, 0, dz, 0.05, 2.7, 0.05, CHARCOAL);
      }
    }

    for (let level = 0; level < 6; level++) {
      const y = 0.2 + level * 0.45;

      p.box(xc, y, zc, x1 - x0 - 0.02, 0.03, z1 - z0 - 0.02, STEEL);

      // What lies on each shelf.
      if (level === 0) {
        // Boxed spares, one with its lid off.
        p.box(xc, y + 0.03, z0 + 0.3, 0.45, 0.28, 0.4, CARDBOARD);
        p.box(xc, y + 0.03, z0 + 0.8, 0.45, 0.2, 0.34, 0x6f5d40, 0.05);
        p.box(xc, y + 0.23, z0 + 0.8, 0.46, 0.03, 0.36, CARDBOARD, 0.05);
        plate(p, xc + 0.23, y + 0.1, z0 + 0.3, 0.2, 0.08, "x", 1);
      } else if (level === 1) {
        // Drive caddies and a power supply.
        for (let k = 0; k < 4; k++) {
          p.box(xc, y + 0.03, z0 + 0.14 + k * 0.13, 0.4, 0.04, 0.1, GUNMETAL);
          led(
            p,
            x1 - 0.04,
            y + 0.06,
            z0 + 0.14 + k * 0.13,
            k === 1 ? LED_AMBER : LED_GREEN,
            "x",
            1,
          );
        }

        p.box(xc, y + 0.03, z0 + 0.95, 0.4, 0.1, 0.22, STEEL_LIGHT);
      } else if (level === 2) {
        // Fan modules and a coil of cable.
        p.post(xc, y + 0.03, z0 + 0.25, 0.06, 0.3, CHARCOAL);
        p.post(xc, y + 0.03, z0 + 0.6, 0.06, 0.3, CHARCOAL);
        p.bar(
          xc,
          y + 0.2,
          z0 + 0.95,
          0.12,
          0.3,
          WIRE_DARK,
          Math.PI / 2,
          Math.PI / 2,
        );
      } else if (level > 3) {
        // Sealed spares boxes, stacked on the upper tiers.
        p.box(xc, y + 0.03, z0 + 0.35, 0.45, 0.3, 0.45, CARDBOARD);
        p.box(xc, y + 0.03, z0 + 0.95, 0.45, 0.24, 0.4, 0x6f5d40, 0.05);
      } else {
        // A toolbox and loose cable ends.
        p.box(xc, y + 0.03, z0 + 0.3, 0.35, 0.14, 0.5, 0x8a3a30);
        p.box(xc, y + 0.17, z0 + 0.3, 0.3, 0.02, 0.4, STEEL_BARE);
        p.cable(xc, y + 0.05, z0 + 0.95, 0.4, 0.03, WIRE_BLUE, 0.6);
      }
    }

    map.createFitting("fittings-server-spares", F, p.elements, [
      { minX: x0, maxX: x1, minZ: z0, maxZ: z1, top: 2.7 },
    ]);
  }

  // ----------------------------- the service trolley, south-west corner
  {
    const p = new Pieces();
    const x0 = 22.3;
    const x1 = 23.1;
    const z0 = -6.3;
    const z1 = -5.3;
    const xc = (x0 + x1) / 2;
    const zc = (z0 + z1) / 2;

    for (const dx of [x0 + 0.04, x1 - 0.04]) {
      for (const dz of [z0 + 0.04, z1 - 0.04]) {
        p.box(dx, 0.07, dz, 0.04, 0.85, 0.04, STEEL);
        p.post(dx, 0, dz, 0.07, 0.07, BLACK);
      }
    }

    p.box(xc, 0.26, zc, x1 - x0 - 0.04, 0.03, z1 - z0 - 0.04, STEEL_LIGHT);
    p.box(xc, 0.84, zc, x1 - x0 - 0.02, 0.03, z1 - z0 - 0.02, STEEL);
    // The push handle, along the west edge.
    p.box(x0 + 0.02, 0.9, zc, 0.03, 0.03, 0.9, STEEL_BARE);
    // A toolbox on the lower shelf, a laptop and a PSU on the top.
    p.box(xc + 0.04, 0.29, zc, 0.36, 0.2, 0.6, 0x8a3a30);
    p.box(xc + 0.04, 0.49, zc, 0.38, 0.03, 0.62, STEEL_BARE);
    p.box(xc, 0.87, zc - 0.1, 0.3, 0.02, 0.34, CHARCOAL);
    p.box(xc + 0.13, 0.89, zc - 0.1, 0.02, 0.22, 0.32, BLACK, 0, 0.2);
    p.box(xc, 0.87, zc + 0.3, 0.2, 0.1, 0.16, STEEL_LIGHT);
    p.cable(xc, 0.89, zc + 0.12, 0.24, 0.02, WIRE_DARK, 1.3);
    map.createFitting("fittings-server-trolley", F, p.elements, [
      { minX: x0, maxX: x1, minZ: z0, maxZ: z1, top: 0.95 },
    ]);
  }

  // -------------------------------- wall details and floor marks (drawn)
  {
    const p = new Pieces();

    extinguisher(p, 22.3, 0.9, -6.75, "x", 1);
    warningSign(p, 28.6, 1.7, -12.0, "z", 1);
    warningSign(p, 31.7, 1.9, -6.2, "x", -1);
    map.createFitting("fittings-server-wall", F, p.elements, []);
  }

  for (const [z, w] of [
    [-9.1, 0.1],
    [-7.8, 0.1],
  ] as const) {
    map.addDecal({
      id: `decal-room-server-line-${z}`,
      kind: "wear",
      x: 27.0,
      z,
      y: F,
      width: 8.6,
      depth: w,
      rotation: 0,
      color: 0x8a7a3a,
      alpha: 0.45,
    });
  }

  map.addDecal({
    id: "decal-room-server-dust",
    kind: "dust",
    x: 28.0,
    z: -8.4,
    y: F,
    width: 5.5,
    depth: 1.2,
    rotation: 0,
    color: 0x30343a,
    alpha: 0.3,
  });
}
