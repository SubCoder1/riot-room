import { Pieces, rng } from "./FittingPieces";
import type { MapBuilder } from "./MapParts";
import {
  BLACK,
  CARDBOARD,
  CARDBOARD_B,
  CHARCOAL,
  GUNMETAL,
  STEEL,
  STEEL_BARE,
  TIMBER,
  TIMBER_B,
  TIMBER_DARK,
  extinguisher,
  plate,
} from "./RoomKit";
import { carton, crate, drum, pallet, shelving, turn } from "./StorageRoom";

/**
 * The Warehouse (x 18 to 32, z 12 to 24, floor 4; inside x 18.3 to 31.7 and
 * z 12.3 to 23.7, 6.5 m to the roof): the bulk goods area. Five cargo groups
 * of different kinds stand with 2 m lanes between them: shrink-wrapped
 * cartons on pallets, a stack of heavy wooden crates, drums on a pallet
 * pair, a steel transport container and a second wrapped load. Two runs of
 * industrial shelving (two bays on the east wall), a pallet truck, a stack of empty
 * pallets and a corner of drums fill the edges; an overhead hoist rail,
 * floor markings round the west door and corner guards at the doors finish it.
 *
 * Doors (all kept clear): north x 19 to 21 and x 26 to 28, west z 18.5 to 20.5.
 * The five groups keep the ids and 2 x 2 m footprints of the stacks they
 * replace (stack-wh-1 to 5); their heights now differ.
 */

const WRAP = 0x8a9298;
const WRAP_DARK = 0x6a7076;
const CONTAINER = 0x6a3a30;
const CONTAINER_DARK = 0x4f2a24;
const HAZARD = 0x9a8836;
const DRUM_BLUE = 0x3c5a78;
const DRUM_GREEN = 0x3f5a4a;
const DRUM_RED = 0x6a3a35;
const DRUM_GREY = 0x6a7076;

/** A load of cartons on a pallet, wrapped and strapped, `layers` high. */
function wrappedLoad(
  p: Pieces,
  random: () => number,
  cx: number,
  cz: number,
  w: number,
  d: number,
  layers: number,
  ry: number,
  tone: number,
): number {
  pallet(p, cx, cz, w, d, ry);

  const lh = 0.38;
  const base = 0.125;

  for (let k = 0; k < layers; k++) {
    for (const [dx, dz] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ]) {
      const [x, z] = turn(cx, cz, ry, (dx * w) / 4, (dz * d) / 4);

      carton(
        p,
        x,
        base + k * lh,
        z,
        w / 2 - 0.02,
        d / 2 - 0.02,
        lh - 0.01,
        ry + (random() - 0.5) * 0.04,
        k % 2 ? CARDBOARD_B : CARDBOARD,
      );
    }
  }

  // The wrap: a pale film round the load, with a bright tape band and a shipping label.
  const h = layers * lh;

  p.box(cx, base, cz, w + 0.02, h, d + 0.02, tone, ry);
  p.box(cx, base + h * 0.6, cz, w + 0.03, 0.05, d + 0.03, STEEL_BARE, ry);
  p.box(cx, base + h * 0.25, cz, w + 0.03, 0.04, d + 0.03, 0x9a8836, ry);

  const [lx, lz] = turn(cx, cz, ry, w * 0.2, d / 2 + 0.014);

  p.box(lx, base + h * 0.4, lz, 0.3, 0.2, 0.008, 0xc9c6b4, ry);
  p.box(lx - 0.04, base + h * 0.43, lz, 0.16, 0.03, 0.01, 0x2a2622, ry);

  return base + h;
}

/** A steel drum lying across the top of a load, with a rim ring at each end. */
function lyingDrum(
  p: Pieces,
  x: number,
  bottom: number,
  z: number,
  color: number,
  ry: number,
): void {
  p.bar(x, bottom + 0.29, z, 0.88, 0.58, color, ry);

  for (const s of [-1, 1]) {
    p.bar(
      x + Math.cos(ry) * 0.3 * s,
      bottom + 0.29,
      z - Math.sin(ry) * 0.3 * s,
      0.04,
      0.6,
      CHARCOAL,
      ry,
    );
  }

  p.bar(x, bottom + 0.29, z, 0.04, 0.6, CHARCOAL, ry);
}

export function furnishWarehouse(map: MapBuilder, floorY: number): void {
  const F = floorY;
  const random = rng(9407);

  // ----------- 1: cartons on pallets, shrink-wrapped (north-west of centre)
  {
    const p = new Pieces();
    const a = wrappedLoad(p, random, 20.3, 16.8, 0.95, 1.1, 4, 0.04, WRAP);
    const b = wrappedLoad(
      p,
      random,
      21.35,
      16.8,
      0.95,
      1.1,
      2,
      -0.05,
      WRAP_DARK,
    );

    // A single carton dropped on the lower load, a strap end trailing.
    carton(p, 21.35, b, 16.7, 0.4, 0.3, 0.28, 0.3);
    p.box(20.2, a - 0.02, 16.22, 0.03, 0.3, 0.008, STEEL_BARE);
    map.createFitting("stack-wh-1", F, p.elements, [
      { minX: 19.8, maxX: 21.8, minZ: 15.8, maxZ: 17.8, top: 1.8 },
    ]);
  }

  // ----------- 2: heavy wooden crates, three of them, stacked (north middle)
  {
    const p = new Pieces();

    crate(p, 24.55, 0, 15.1, 1.0, 1.1, 0.9, 0.02, TIMBER);
    crate(p, 25.55, 0, 15.5, 0.9, 1.2, 0.8, -0.03, TIMBER_B);
    crate(p, 24.8, 0.9, 15.5, 1.1, 1.0, 0.9, 0.12, TIMBER);
    // Steel straps, stencilled numbers and a dented corner.
    p.box(24.8, 0.9, 15.5, 1.12, 0.03, 1.02, STEEL_BARE, 0.12);
    plate(p, 25.35, 0.35, 14.55, 0.26, 0.2, "z", -1, 0x9a8836);
    plate(p, 24.1, 1.2, 14.98, 0.3, 0.2, "z", -1);
    map.createFitting("stack-wh-2", F, p.elements, [
      { minX: 24.0, maxX: 26.0, minZ: 14.4, maxZ: 16.4, top: 1.9 },
    ]);
  }

  // ----------- 3: drums on a double pallet (north-east of centre)
  {
    const p = new Pieces();
    const colors = [
      DRUM_BLUE,
      DRUM_GREEN,
      DRUM_RED,
      DRUM_GREY,
      DRUM_BLUE,
      DRUM_GREEN,
    ];

    pallet(p, 28.85, 15.8, 1.2, 1.2, 0.0);
    pallet(p, 29.65, 15.8, 1.0, 1.2, 0.0);

    let i = 0;

    for (const x of [28.5, 29.1, 29.7]) {
      for (const z of [15.5, 16.1]) {
        drum(p, x, z, colors[i % colors.length], i % 2 === 0, 0.13);
        i++;
      }
    }

    // Two more laid across the top of the back row.
    lyingDrum(p, 28.8, 1.02, 15.5, DRUM_RED, 0.1);
    map.createFitting("stack-wh-3", F, p.elements, [
      { minX: 28.2, maxX: 30.2, minZ: 14.8, maxZ: 16.8, top: 1.7 },
    ]);
  }

  // ----------- 4: a steel transport container (south-west of centre)
  {
    const p = new Pieces();
    const x0 = 21.6;
    const x1 = 23.6;
    const z0 = 20.0;
    const z1 = 22.0;
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;

    p.box(cx, 0.1, cz, 1.96, 1.65, 1.96, CONTAINER);
    p.box(cx, 0, cz, 2.0, 0.1, 2.0, CHARCOAL);
    p.box(cx, 1.75, cz, 2.0, 0.05, 2.0, CONTAINER_DARK);

    // Corrugations on all four sides.
    for (let k = 0; k < 11; k++) {
      const t = -0.9 + k * 0.18;

      p.box(cx + t, 0.14, z0 - 0.012, 0.07, 1.57, 0.03, CONTAINER_DARK);
      p.box(cx + t, 0.14, z1 + 0.012, 0.07, 1.57, 0.03, CONTAINER_DARK);
      p.box(x0 - 0.012, 0.14, cz + t, 0.03, 1.57, 0.07, CONTAINER_DARK);
      p.box(x1 + 0.012, 0.14, cz + t, 0.03, 1.57, 0.07, CONTAINER_DARK);
    }

    // Corner castings, a door seam with two locking bars and a latch on the south face.
    for (const x of [x0 + 0.05, x1 - 0.05]) {
      for (const z of [z0 + 0.05, z1 - 0.05]) {
        p.box(x, 0, z, 0.12, 1.8, 0.12, CHARCOAL);
      }
    }

    p.box(cx, 0.12, z1 + 0.03, 0.012, 1.6, 0.012, BLACK);

    for (const dx of [-0.35, 0.35]) {
      p.box(cx + dx, 0.2, z1 + 0.04, 0.03, 1.4, 0.03, STEEL_BARE);
      p.box(cx + dx, 0.8, z1 + 0.055, 0.1, 0.06, 0.02, STEEL);
    }

    p.box(cx + 0.12, 0.9, z1 + 0.05, 0.1, 0.08, 0.03, 0x7a6a2e);
    // A faded code plate and a rust streak.
    p.box(cx - 0.55, 1.3, z1 + 0.035, 0.5, 0.2, 0.008, 0xc9c6b4);
    p.box(cx - 0.55, 1.36, z1 + 0.042, 0.4, 0.04, 0.004, BLACK);
    p.box(cx + 0.7, 0.1, z1 + 0.036, 0.1, 1.0, 0.004, 0x4a3a2e);
    // Fork pockets low on the east face.
    for (const dz of [-0.55, 0.55]) {
      p.box(x1 + 0.03, 0.02, cz + dz, 0.02, 0.12, 0.36, BLACK);
    }

    map.createFitting("stack-wh-4", F, p.elements, [
      { minX: x0, maxX: x1, minZ: z0, maxZ: z1, top: 1.8 },
    ]);
  }

  // ----------- 5: a second wrapped load, taller, with a lying drum (south-east)
  {
    const p = new Pieces();
    const a = wrappedLoad(p, random, 26.95, 20.0, 1.0, 1.1, 3, -0.03, WRAP);
    const b = wrappedLoad(p, random, 27.9, 21.05, 0.9, 1.0, 3, 0.07, WRAP_DARK);

    lyingDrum(p, 26.95, a, 20.0, DRUM_BLUE, 0.2);
    p.box(27.9, b, 21.05, 0.7, 0.2, 0.5, CARDBOARD_B, 0.4);
    map.createFitting("stack-wh-5", F, p.elements, [
      { minX: 26.4, maxX: 28.4, minZ: 19.6, maxZ: 21.6, top: 1.9 },
    ]);
  }

  // -------------- industrial shelving along the east wall, two themed bays
  for (const [id, z0, theme] of [
    ["shelving-wh-east-1", 16.8, "cartons"],
    ["shelving-wh-east-2", 20.25, "steel"],
  ] as const) {
    const p = new Pieces();
    const box = shelving(
      p,
      random,
      31.0,
      z0,
      3.45,
      0.7,
      "z",
      [1, 0.9, 1, 0.8],
      theme,
    );

    map.createFitting(id, F, p.elements, [box]);
  }

  // ------------------------------ a pallet truck by the north wall
  {
    const p = new Pieces();
    const x0 = 22.3;
    const x1 = 23.8;
    const z0 = 12.3;
    const z1 = 12.85;

    // Two steel forks pointing south, a chassis, a wheel at each tip and a handle.
    for (const dz of [-0.2, 0.2]) {
      p.box(
        (x0 + x1) / 2,
        0.05,
        (z0 + z1) / 2 + dz,
        1.15,
        0.07,
        0.15,
        0x9a8836,
      );
    }

    p.box(x0 + 0.12, 0.02, (z0 + z1) / 2, 0.2, 0.2, 0.5, CHARCOAL);
    p.post(x0 + 0.12, 0.2, (z0 + z1) / 2, 0.08, 0.1, STEEL);
    p.box(x0 + 0.12, 0.2, (z0 + z1) / 2, 0.14, 0.3, 0.04, 0x9a8836);
    // The handle, leaning up from the pump, with its lever.
    p.box(x0 + 0.1, 0.5, (z0 + z1) / 2, 0.04, 0.6, 0.04, STEEL_BARE, 0, 0.15);
    p.box(x0 - 0.02, 1.08, (z0 + z1) / 2, 0.06, 0.04, 0.4, CHARCOAL);
    p.box(x0 - 0.01, 0.9, (z0 + z1) / 2 + 0.22, 0.04, 0.15, 0.04, 0x8a2a24);

    for (const dz of [-0.2, 0.2]) {
      p.post(x1 - 0.1, 0, (z0 + z1) / 2 + dz, 0.04, 0.1, BLACK);
    }

    // A pallet of boxed stock on the forks, half unloaded.
    carton(p, 23.15, 0.12, 12.55, 0.45, 0.4, 0.3, 0.1);
    map.createFitting("palletjack-wh", F, p.elements, [
      { minX: x0, maxX: x1, minZ: z0, maxZ: z1, top: 1.1 },
    ]);
  }

  // ------------------------ a tall stack of empty pallets, north-east corner
  {
    const p = new Pieces();

    for (let k = 0; k < 6; k++) {
      const y = k * 0.145;
      const dx = (random() - 0.5) * 0.06;

      for (const x of [-0.45, 0, 0.45]) {
        p.box(31.1 + x * 0.0 + dx, y, 12.8 + x, 1.0, 0.1, 0.1, TIMBER_DARK);
      }

      p.box(
        31.1 + dx,
        y + 0.1,
        12.8,
        1.05,
        0.025,
        1.1,
        k % 2 ? TIMBER_B : TIMBER,
      );
    }

    map.createFitting("pallets-wh", F, p.elements, [
      { minX: 30.5, maxX: 31.7, minZ: 12.3, maxZ: 13.3, top: 0.9 },
    ]);
  }

  // ------------------------------------ four drums in the south-west corner
  {
    const p = new Pieces();
    let i = 0;

    for (const [x, z] of [
      [18.65, 23.05],
      [19.25, 23.05],
      [18.65, 22.45],
      [19.25, 22.45],
    ]) {
      drum(p, x, z, [DRUM_GREY, DRUM_GREEN, DRUM_BLUE, DRUM_RED][i], i === 1);
      i++;
    }

    // A tipped spill tray, drips and a bung wrench.
    p.box(19.4, 0, 21.9, 0.5, 0.05, 0.4, GUNMETAL);
    p.bar(18.5, 0.02, 22.0, 0.3, 0.02, STEEL_BARE, 0.6);
    map.createFitting("drums-wh-corner", F, p.elements, [
      { minX: 18.3, maxX: 19.55, minZ: 22.15, maxZ: 23.7, top: 0.9 },
    ]);
  }

  // ----------------- overhead: a hoist rail with a chain block on it (drawn)
  {
    const p = new Pieces();
    const y = 5.3;

    p.box(25.0, y, 18.2, 13.4, 0.22, 0.14, STEEL);
    p.box(25.0, y + 0.22, 18.2, 13.4, 0.03, 0.34, CHARCOAL);
    p.box(25.0, y - 0.03, 18.2, 13.4, 0.03, 0.34, CHARCOAL);

    for (const x of [19.2, 24.4, 29.8]) {
      p.box(x, y + 0.25, 18.2, 0.05, 1.2, 0.05, CHARCOAL);
    }

    // The chain block: a trolley, a body, a hanging chain and a hook.
    p.box(25.4, y - 0.18, 18.2, 0.5, 0.16, 0.34, GUNMETAL);
    p.box(25.4, y - 0.62, 18.2, 0.34, 0.44, 0.3, 0x9a8836);
    p.cableUp(25.4, 3.6, 18.2, y - 0.62 - 3.6, 0.025, STEEL_BARE);
    p.box(25.4, 3.35, 18.2, 0.1, 0.28, 0.05, STEEL);
    map.createFitting("fittings-wh-hoist", F, p.elements, []);
  }

  // --------------------------- floor markings, corner guards and signs (drawn)
  {
    const p = new Pieces();
    const line = (
      x0: number,
      x1: number,
      z0: number,
      z1: number,
      w: number,
    ): void => {
      p.box(
        (x0 + x1) / 2,
        0.002,
        (z0 + z1) / 2,
        Math.max(x1 - x0, w),
        0.004,
        Math.max(z1 - z0, w),
        HAZARD,
      );
    };

    // A marked loading zone in front of the west door, and stripes at the north thresholds.
    line(18.5, 20.9, 17.4, 17.4, 0.1);
    line(18.5, 20.9, 21.6, 21.6, 0.1);
    line(20.9, 20.9, 17.4, 21.6, 0.1);

    for (let k = 0; k < 10; k++) {
      const t = 18.7 + k * 0.22;

      p.box(t, 0.002, 19.5, 0.1, 0.004, 0.5, k % 2 ? BLACK : HAZARD, 0.5);
    }

    for (const [x0, x1] of [
      [19.0, 21.0],
      [26.0, 28.0],
    ] as const) {
      for (let k = 0; k < 8; k++) {
        p.box(
          x0 + 0.13 + k * 0.25,
          0.002,
          12.62,
          0.14,
          0.004,
          0.4,
          k % 2 ? BLACK : HAZARD,
          0.6,
        );
      }

      line(x0, x1, 13.2, 13.2, 0.08);
    }

    // Aisle lines down the lanes.
    line(22.8, 22.8, 13.2, 19.0, 0.08);
    line(25.3, 25.3, 17.0, 23.5, 0.08);

    // Jamb guards: painted steel posts on the wall side of every north doorway.
    for (const x of [18.94, 21.06, 25.94, 28.06]) {
      p.box(x, 0, 12.36, 0.12, 1.2, 0.12, HAZARD);

      for (const y of [0.12, 0.4, 0.68]) {
        p.box(x, y, 12.36, 0.124, 0.12, 0.124, BLACK);
      }
    }

    // Bay numbers on the north wall, an extinguisher by the west door and a hazard sign on the east shelf.
    for (let k = 0; k < 3; k++) {
      plate(p, 22.0 + k * 3.0, 3.0, 12.3, 0.4, 0.4, "z", 1, 0x9a8836);
    }

    extinguisher(p, 18.3, 0.9, 21.2, "x", 1);
    plate(p, 28.5, 2.4, 23.7, 0.5, 0.3, "z", -1, 0x9a8836);
    // A grimy mark on the wall behind the container.
    p.box(22.6, 1.2, 23.69, 1.6, 1.4, 0.004, 0x2a2e34);
    map.createFitting("fittings-wh-floor", F, p.elements, []);
  }

  map.addDecal({
    id: "decal-room-warehouse-oil",
    kind: "stain",
    x: 24.5,
    z: 18.0,
    y: F,
    width: 2.2,
    depth: 1.5,
    rotation: 0.3,
    color: 0x1e2024,
    alpha: 0.4,
  });
  map.addDecal({
    id: "decal-room-warehouse-dust",
    kind: "dust",
    x: 26.0,
    z: 22.8,
    y: F,
    width: 6,
    depth: 1.4,
    rotation: 0,
    color: 0x30343a,
    alpha: 0.3,
  });
}
