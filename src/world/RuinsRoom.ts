import type { PileElement } from "./ArenaLayout";
import { Pieces, rng } from "./FittingPieces";
import { halfExtents, type MapBuilder } from "./MapParts";
import { meshExtent } from "./PileMeshes";

/**
 * The Ruins: the room behind the collapsed vault entrance, a two-level
 * industrial structure that has partly fallen in on itself. It occupies the
 * footprint of the old Server room (x 22 to 32, z -24 to -10, roof at 10.5).
 *
 *  - UPPER FLOOR (y 4): the level the entrance opens onto. A damaged walkway
 *    runs straight ahead from the doorway (z about -14.3) along the room, in
 *    slices of floor each broken off at its own line, so its north edge is
 *    ragged and overlooks the lower level. The strip south of it is the solid
 *    east-wing floor.
 *  - GROUND FLOOR (y 0): the north half of the room, where the floor has
 *    fallen away, heaped with debris, heaviest under the collapse.
 *  - THE TILTED SLAB: on the left of the entrance (north), a big floor slab
 *    still joined to the walkway at its top edge and broken away at the other
 *    end, sloping 24 degrees down onto a heap of fallen concrete. Its
 *    collision is a run of small steps (it is walkable); the way on down is
 *    across the rubble steps beside its foot. It stands over open space
 *    (a dark recess) at the high end.
 *
 * Everything is set out in world coordinates. Drawn pieces are fractured
 * slabs, rocks, bricks, bars, pipes and cables (the existing fitting shapes);
 * collision is exact boxes where a body can meet it, and none for the small
 * debris.
 */

const CONCRETE = [0x3d3f43, 0x45474b, 0x4b4d51, 0x36383c, 0x505256, 0x4a4845];
/** Fresh fractures: lighter, so a broken edge reads in the dark. */
const FRACTURE = [0x62646a, 0x6c6e72, 0x585a60];
const BRICK = [0x6a4033, 0x74483a, 0x58352c, 0x7a5042, 0x4e2c26];
const REBAR = 0x5e3320;
const REBAR_BARE = 0x7a4a2a;
const STEEL = 0x4f5f74;
const STEEL_DARK = 0x353b46;
const CABLE = 0x1c1e22;
const PIPE = 0x59606a;
const CRATE = 0x5a4632;
const CABINET = 0x4a5560;

/** The room's x range, and its north and south edges. */
const X0 = 22;
const X1 = 32;
const Z_NORTH = -24;
/** Where the walkway's solid floor (the east wing) begins. */
const Z_WING = -12;
/** Roof underside. */
const CEILING = 10.5;

/** The tilted slab: where it joins the walkway, where it ends, and its heights. */
export const SLAB = {
  x0: 22.4,
  x1: 26.8,
  zTop: -16.0,
  zFoot: -21.6,
  yTop: 3.9,
  yFoot: 1.4,
} as const;

const slabHeight = (z: number): number =>
  SLAB.yTop +
  ((z - SLAB.zTop) * (SLAB.yTop - SLAB.yFoot)) / (SLAB.zTop - SLAB.zFoot);

/** The north edge (z) of each metre-wide slice of the walkway, x 22 to 32. */
const DECK_EDGES = [
  -16.3, -16.0, -16.0, -16.0, -16.0, -17.3, -16.4, -15.6, -15.3, -15.2,
];

export function furnishRuins(map: MapBuilder, F: number): void {
  const random = rng(7311);
  const pick = <T>(list: readonly T[]): T =>
    list[Math.floor(random() * list.length)];

  // ------------------------------------------------------------- the floors
  // The walkway, in slices each broken off at its own line, hanging as a slab
  // half a metre thick over open ground.
  DECK_EDGES.forEach((north, i) => {
    const slice = map.createFloorSection(
      `east-wing~ruins-deck-${i}`,
      { minX: X0 + i, maxX: X0 + i + 1, minZ: north, maxZ: Z_WING },
      F,
    );

    slice.bottom = F - 0.5;
  });

  // The lower level's walls, up to the room's own: north and east, and
  // nothing on the west (the platform of the north wing is its wall) or the
  // south (the solid east wing).
  map.createWall("ruins-pit-wall-n", "x", Z_NORTH, X0, X1, 0, 0.3, F);
  map.createWall("ruins-pit-wall-e", "z", X1 - 0.3, Z_NORTH, Z_WING, 0, 0.3, F);

  // ----------------------------------------------------- slab and its heap
  const slab: PileElement[] = [];
  const put = (
    into: PileElement[],
    shape: PileElement["shape"],
    x: number,
    y: number,
    z: number,
    size: [number, number, number],
    turn: [number, number, number],
    color: number,
  ): void => {
    into.push({
      shape,
      x,
      y,
      z,
      sx: size[0],
      sy: size[1],
      sz: size[2],
      rx: turn[0],
      ry: turn[1],
      rz: turn[2],
      color,
    });
  };
  const rock = (
    into: PileElement[],
    x: number,
    y: number,
    z: number,
    size: number,
    flat = 0.7,
  ): void =>
    put(
      into,
      "rock",
      x,
      y,
      z,
      [
        size * (0.9 + random() * 0.5),
        size * flat,
        size * (0.9 + random() * 0.6),
      ],
      [random() * 0.8, random() * Math.PI * 2, random() * 0.8],
      pick(CONCRETE),
    );
  const bar = (
    into: PileElement[],
    x: number,
    y: number,
    z: number,
    length: number,
    turn: [number, number, number],
  ): void =>
    put(
      into,
      "plank",
      x,
      y,
      z,
      [0.035, 0.035, length],
      turn,
      random() < 0.4 ? REBAR_BARE : REBAR,
    );

  // The slab itself: a main plate and three broken pieces at their own
  // tilts, so its outline is not a rectangle. (Thin axis first, laid flat
  // with a quarter turn, then tipped down toward the foot.)
  const tilt = Math.atan2(SLAB.yTop - SLAB.yFoot, SLAB.zTop - SLAB.zFoot);
  const centre = (z: number): number => slabHeight(z) - 0.25;

  put(
    slab,
    "slab",
    24.6,
    centre(-18.7),
    -18.7,
    [0.55, 4.3, 4.9],
    [-tilt, 0, Math.PI / 2],
    pick(CONCRETE),
  );
  put(
    slab,
    "slab",
    23.7,
    centre(-16.6) + 0.04,
    -16.6,
    [0.5, 2.3, 1.7],
    [-tilt + 0.03, 0.06, Math.PI / 2],
    pick(CONCRETE),
  );
  put(
    slab,
    "slab",
    25.5,
    centre(-21.2) - 0.12,
    -21.2,
    [0.5, 3.1, 1.9],
    [-tilt - 0.22, -0.05, Math.PI / 2 + 0.06],
    pick(CONCRETE),
  );
  put(
    slab,
    "slab",
    26.7,
    centre(-19.6) - 0.1,
    -19.6,
    [0.45, 1.3, 1.7],
    [-tilt - 0.14, 0.1, Math.PI / 2 + 0.2],
    pick(CONCRETE),
  );

  // Rebar standing out of the broken underside and the far end.
  for (let i = 0; i < 9; i++) {
    const z = -17.5 - i * 0.55;

    bar(
      slab,
      i % 2 ? 22.75 : 26.55,
      slabHeight(z) - 0.45,
      z,
      0.5 + random() * 0.4,
      [0.3 + random() * 0.5, random() * 0.8, (random() - 0.5) * 0.8],
    );
  }

  // Fractured cross-section along the high end: bricks and chunks where the
  // slab broke from the walkway.
  for (let i = 0; i < 6; i++) {
    put(
      slab,
      "brick",
      23 + i * 0.7,
      3.55,
      -16.05,
      [0.14, 0.075, 0.22],
      [0, 0, 0],
      pick(BRICK),
    );
  }

  // The heap the foot rests on, and the rubble steps down beside it. The
  // boxes are the steps; the rocks drawn over each cover it.
  const boxes: Array<{
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
    top: number;
    bottom?: number;
    exact: true;
  }> = [];
  const STEPS = 14;
  const depth = (SLAB.zTop - SLAB.zFoot) / STEPS;

  for (let i = 0; i < STEPS; i++) {
    const z0 = SLAB.zTop - i * depth;
    const z1 = z0 - depth;
    const top = slabHeight(z1) + 0.02;

    boxes.push({
      minX: SLAB.x0,
      maxX: SLAB.x1,
      minZ: z1,
      maxZ: z0,
      top,
      bottom: top - 0.5,
      exact: true,
    });
  }

  // Rubble steps (each 0.35 to 0.4 lower than the last) from the foot, east.
  const ladder: Array<[number, number, number]> = [
    [26.8, 27.7, 1.15],
    [27.7, 28.6, 0.78],
    [28.6, 29.5, 0.4],
  ];

  for (const [x0, x1, top] of ladder) {
    boxes.push({
      minX: x0,
      maxX: x1,
      minZ: -22.6,
      maxZ: -20.3,
      top,
      exact: true,
    });

    // The step's body: rocks from the ground up to it, so none hangs in air.
    for (let level = 0.3; level < top - 0.3; level += 0.38) {
      for (let k = 0; k < 3; k++) {
        rock(
          slab,
          x0 + 0.2 + random() * (x1 - x0 - 0.4),
          level,
          -22.2 + k * 0.7 + random() * 0.2,
          0.7,
          0.8,
        );
      }
    }

    // Rocks drawn over the step, their tops at its level.
    for (let k = 0; k < 4; k++) {
      const size = 0.55 + random() * 0.4;

      rock(
        slab,
        x0 + 0.15 + random() * (x1 - x0 - 0.3),
        top - size * 0.28,
        -22.3 + k * 0.55 + random() * 0.15,
        size,
        0.6,
      );
    }
  }

  // The heap round and under the foot: big chunks and a mass of small ones,
  // thickest where the slab lands (these are drawn only: the space under the
  // foot is too low for a body, so nothing can reach them).
  for (let i = 0; i < 18; i++) {
    const z = -19.5 - random() * 3.6;
    // (Chunks, not boulders: the heap should not wall off the view.)
    const size = (0.4 + random() * 0.6) * 0.78;

    const x = 22.9 + random() * 4.0;
    // Only a small stone perches (on the heap's bigger ones): a big one
    // lifted off the floor has nothing under it.
    const perched = random() < 0.3 && size < 0.45;

    rock(slab, x, size * 0.3 + (perched ? size * 0.55 : 0), z, size, 0.8);
  }

  // Under the slab at its high end: the dark recess, with a hanging bar, a
  // few cables and a fallen pipe, and small debris on the floor beneath.
  for (let i = 0; i < 5; i++) {
    const x = 23.2 + i * 0.75;
    const z = -17 - random() * 1.8;
    const high = slabHeight(z) - 0.5;

    put(
      slab,
      "cable",
      x,
      high - 0.5,
      z,
      [0.04, 1.0 + random() * 0.8, 0.04],
      [0, 0, 0],
      CABLE,
    );
  }

  // Lying on the ground, one end propped on a rock.
  put(slab, "pipe", 25.1, 0.1, -18.6, [2.4, 0.16, 0.16], [0, 0.5, 0.03], PIPE);
  rock(slab, 24.3, 0.12, -18.2, 0.3, 0.7);

  for (let i = 0; i < 20; i++) {
    const size = 0.07 + random() * 0.16;

    rock(
      slab,
      23 + random() * 3.6,
      size * 0.3,
      -17.2 - random() * 2.6,
      size,
      0.65,
    );
  }

  // Heavy rubble packed under the slab's broken foot, up to its underside, so
  // the slab rests on something. (Fixed pieces, no random draw: the rest of
  // the room's layout stays as it was. Drawn only; nobody can get under it.)
  for (const [x, y, z, w, h, d, turn] of [
    [23.4, 0.42, -21.6, 1.3, 0.85, 1.2, 0.3],
    [24.7, 0.5, -21.9, 1.4, 1.0, 1.3, 1.1],
    [25.9, 0.45, -21.5, 1.2, 0.9, 1.2, 2.0],
    [24.2, 0.55, -20.7, 1.1, 1.1, 1.0, 0.6],
  ] as const) {
    put(slab, "rock", x, y, z, [w, h, d], [0.1, turn, 0.12], CONCRETE[0]);
  }

  settle(map.createFitting("fittings-ruins-slab", 0, slab, boxes).elements);

  // ------------------------------------------------- the lower floor's debris
  const pit: PileElement[] = [];
  const pitBoxes: typeof boxes = [];

  // Fallen floor: a slab lying flat on the ground, another leaning on the
  // east wall (both solid), a third broken in two at the foot of the deck.
  put(
    pit,
    "slab",
    29.4,
    0.32,
    -17.6,
    [0.55, 2.1, 2.9],
    [0.12, 0.3, Math.PI / 2 - 0.12],
    pick(CONCRETE),
  );
  pitBoxes.push({
    minX: 28.4,
    maxX: 30.5,
    minZ: -19.1,
    maxZ: -16.1,
    top: 0.62,
    exact: true,
  });
  put(
    pit,
    "slab",
    31.2,
    // Leaning steeply on the east wall, its lower edge on the ground (laid
    // flatter it spanned an open wedge that read as floating).
    1.05,
    -21.4,
    [0.6, 2.2, 2.6],
    [0.1, 0.1, 0.55],
    pick(CONCRETE),
  );
  pitBoxes.push({
    minX: 30.5,
    maxX: 31.7,
    minZ: -22.7,
    maxZ: -20.1,
    top: 2.0,
    exact: true,
  });

  put(
    pit,
    "slab",
    25.2,
    0.4,
    -14.9,
    [0.5, 1.6, 2.2],
    [0.1, 0.5, Math.PI / 2 - 0.2],
    pick(CONCRETE),
  );

  // Debris heaps: under the deck's edge (heavy), and loose along the walls.
  for (let i = 0; i < 70; i++) {
    const x = 24 + random() * 7.4;
    const z = -23 + random() * 8;
    // Not on the route or on the slab's foot: thin there.
    const onRoute = x > 26.6 && x < 29.9 && z < -20.1 && z > -23;

    if (onRoute && random() < 0.9) continue;

    const near = Math.exp(-Math.abs(z + 16.6) / 3);
    const size = (0.12 + random() * 0.45 * (0.5 + near)) * 0.78;

    rock(pit, x, size * 0.28, z, size, 0.7);
  }

  for (let i = 0; i < 24; i++) {
    put(
      pit,
      "brick",
      23.5 + random() * 8,
      0.04,
      -23.3 + random() * 7.6,
      [0.2, 0.065, 0.1],
      [0, random() * Math.PI, 0],
      pick(BRICK),
    );
  }

  // Overturned cabinet and crates, a fallen pipe, a broken beam leaning down
  // from the deck, rebar sticking out of the rubble.
  put(pit, "plank", 30.5, 0.35, -15.4, [1.6, 0.7, 0.6], [0, 0.4, 0], CABINET);
  pitBoxes.push({
    minX: 29.7,
    maxX: 31.3,
    minZ: -15.8,
    maxZ: -15.0,
    top: 0.7,
    exact: true,
  });
  put(pit, "plank", 26.9, 0.25, -23.0, [0.6, 0.5, 0.6], [0, 0.3, 0.1], CRATE);
  put(pit, "pipe", 31.0, 0.12, -18.4, [2.6, 0.2, 0.2], [0, 1.5, 0], PIPE);
  // A broken beam: hanging from under the walkway, resting on the ground.
  // Its top end runs 0.2 m into the walkway's underside (a steel gusset plate
  // bolted there), its foot sinks into the ground in a bank of rubble.
  put(pit, "plank", 27.6, 1.84, -16.78, [0.3, 0.26, 5.1], [-0.81, 0, 0], STEEL);
  put(
    pit,
    "plank",
    27.6,
    3.42,
    -15.45,
    [0.7, 0.06, 0.9],
    [0, 0, 0],
    STEEL_DARK,
  );

  for (let i = 0; i < 5; i++) {
    const size = 0.25 + random() * 0.3;

    rock(
      pit,
      27.1 + random() * 1.1,
      size * 0.3,
      -18.8 - random() * 0.6,
      size,
      0.7,
    );
  }

  // Collision for the lower end, where a body can meet it: two steps up the
  // beam's width (the upper part is out of reach under the walkway).
  pitBoxes.push(
    { minX: 27.4, maxX: 27.8, minZ: -18.7, maxZ: -18.1, top: 0.6, exact: true },
    { minX: 27.4, maxX: 27.8, minZ: -18.1, maxZ: -17.6, top: 1.3, exact: true },
  );

  for (let i = 0; i < 8; i++) {
    const x = 24 + random() * 7;

    random();

    const z = -23 + random() * 7;
    const length = 0.5 + random() * 0.5;
    const turn: [number, number, number] = [
      random() * 0.7,
      random() * Math.PI,
      (random() - 0.5) * 0.7,
    ];
    // A bar rooted in the rubble: its low end sunk a little into the floor,
    // the other raised by the bar's lean (not hung in the air at a fixed height).
    const rise = (length / 2) * Math.abs(Math.sin(turn[0]) * Math.cos(turn[1]));

    bar(pit, x, rise + 0.02 - 0.06, z, length, turn);
  }

  // Structural columns under the walkway: one standing, one snapped.
  map.createSteelColumn("ruins-column-1", 24.5, -14.3, 0, F - 0.5, 0.36);
  map.createSteelColumn("ruins-column-2", 29.5, -13.0, 0, F - 0.5, 0.36);
  put(
    pit,
    "plank",
    30.8,
    1.0,
    -14.2,
    [0.34, 2.1, 0.34],
    [0.5, 0.2, 0.25],
    STEEL_DARK,
  );
  pitBoxes.push({
    minX: 30.4,
    maxX: 31.2,
    minZ: -14.6,
    maxZ: -13.8,
    top: 1.0,
    exact: true,
  });

  // Cables and pipes hanging from the walkway's underside.
  for (let i = 0; i < 9; i++) {
    const x = 23 + i * 1.05 + random() * 0.4;
    const z = -15.4 + random() * 2.4;

    const len = 1.2 + random() * 1.1;

    // Top at the walkway's underside (y 3.5).
    put(
      pit,
      "cable",
      x,
      F - 0.5 - len / 2,
      z,
      [0.04, len, 0.04],
      [0, 0, 0],
      CABLE,
    );
  }

  // More for the middle of the floor, kept off the way through (x 26.6 to
  // 29.9, z below -20.1): planks fallen and broken, a cabinet half buried in
  // rubble, collapsed shelving, bent sheet metal, bricks and chips.
  const PLANK = [0x6b5338, 0x5a4632, 0x7a6244];

  for (const [x, z, len, turn, lean] of [
    [24.6, -22.9, 1.3, 0.3, 0],
    [25.5, -21.6, 0.9, 1.2, 0.2],
    [30.2, -23.3, 1.1, -0.5, 0],
    [29.2, -18.6, 1.0, 0.9, 0.12],
    [24.2, -19.9, 1.4, -0.2, 0],
  ] as const) {
    put(
      pit,
      "plank",
      x,
      0.03 + lean * 0.5,
      z,
      [len, 0.04, 0.16],
      [lean, turn, 0],
      pick(PLANK),
    );
  }

  // The cabinet: its body sunk in the heap, one door tilted open.
  put(
    pit,
    "plank",
    30.9,
    0.45,
    -22.9,
    [0.8, 0.9, 0.55],
    [0.0, 0.25, 0.28],
    CABINET,
  );
  put(
    pit,
    "plank",
    30.45,
    0.4,
    -22.5,
    [0.05, 0.7, 0.5],
    [0.0, 0.25, 0.9],
    STEEL_DARK,
  );
  rock(pit, 30.4, 0.2, -23.3, 0.55, 0.7);
  rock(pit, 31.2, 0.25, -22.3, 0.5, 0.7);
  pitBoxes.push({
    minX: 30.5,
    maxX: 31.4,
    minZ: -23.3,
    maxZ: -22.5,
    top: 0.8,
    exact: true,
  });

  // Collapsed shelving: two uprights fallen across each other, a shelf sloping
  // from one to the ground.
  put(
    pit,
    "plank",
    24.2,
    0.4,
    -23.2,
    [0.05, 0.05, 1.6],
    [0.8, 0.3, 0.0],
    STEEL,
  );
  put(
    pit,
    "plank",
    24.8,
    0.3,
    -22.7,
    [0.05, 0.05, 1.5],
    [-0.5, 0.9, 0.0],
    STEEL,
  );
  put(
    pit,
    "plank",
    24.5,
    0.22,
    -22.95,
    [0.9, 0.03, 0.35],
    [0.0, 0.6, 0.25],
    STEEL_DARK,
  );

  // Bent sheet metal, and a flattened drum on its side.
  put(
    pit,
    "plank",
    25.9,
    0.1,
    -19.4,
    [0.9, 0.025, 0.6],
    [0.1, 0.5, 0.15],
    STEEL,
  );
  put(
    pit,
    "plank",
    29.6,
    0.06,
    -23.4,
    [0.7, 0.025, 0.5],
    [0.05, -0.4, 0.1],
    STEEL_DARK,
  );

  for (let i = 0; i < 14; i++) {
    const brick = i % 2 === 0;
    const size = 0.06 + random() * 0.14;
    const x = 23.4 + random() * 8;
    const z = -23.2 + random() * 5.2;

    if (x > 26.6 && x < 29.9 && z < -20.1) continue;

    put(
      pit,
      brick ? "brick" : "rock",
      x,
      brick ? 0.04 : size * 0.3,
      z,
      brick ? [0.17, 0.06, 0.09] : [size, size * 0.65, size * 1.1],
      [0, random() * Math.PI, 0],
      brick ? pick(BRICK) : pick(CONCRETE),
    );
  }

  settle(map.createFitting("fittings-ruins-pit", 0, pit, pitBoxes).elements);

  // ------------------------------------------------------- the upper floor
  const deck = new Pieces();

  // The broken edge: chunks of floor hanging off the lip, bars bent out of it.
  DECK_EDGES.forEach((north, i) => {
    if (i >= 1 && i <= 4) return; // the slab's own break

    const x = X0 + i + 0.5;

    // Two pieces of the floor's own thickness: one hanging off the lip, bent
    // down, and one that has slid up onto it and rests on the edge.
    for (const [lift, drop, side] of [
      [-0.6, 1, 0.1],
      [0.12, 0.7, 0.05],
    ] as const) {
      const size = (0.45 + random() * 0.45) * drop;

      deck.elements.push({
        shape: "slab",
        x: x + (random() - 0.5) * 0.4,
        y: lift,
        z: north + side,
        sx: size * 0.55,
        sy: size * 1.1,
        sz: size * 1.5,
        rx: 0.2 + random() * 0.5,
        ry: random() * 0.8,
        rz: (random() - 0.5) * 1.2,
        color: pick(FRACTURE),
      });
    }

    bar(
      deck.elements,
      x + (random() - 0.5) * 0.5,
      -0.2,
      north - 0.25,
      0.6 + random() * 0.5,
      [0.8 + random() * 0.5, (random() - 0.5) * 0.9, 0],
    );
  });

  // The broken edge itself: an outer layer of chips, small stones and bricks
  // packed against the face of each slice (half sunk into it), and rubble
  // banked on the deck at the foot of the chunks that rest on the lip, so
  // nothing there stands or hangs on bare edge. (A random stream of its own:
  // the rest of the room's layout is not disturbed.)
  const lipRandom = rng(9031);

  DECK_EDGES.forEach((north, i) => {
    for (let k = 0; k < 7; k++) {
      const size = 0.1 + lipRandom() * 0.2;
      const brick = lipRandom() < 0.2;

      deck.elements.push({
        shape: brick ? "brick" : "rock",
        x: X0 + i + 0.06 + lipRandom() * 0.88,
        y: -0.46 + lipRandom() * 0.4,
        // Centred a little outside the face, so about a third is in it.
        z: north - size * 0.15,
        sx: brick ? 0.17 : size * 1.2,
        sy: brick ? 0.07 : size * 0.85,
        sz: brick ? 0.1 : size * 1.2,
        rx: lipRandom() * 0.5,
        ry: lipRandom() * Math.PI * 2,
        rz: lipRandom() * 0.5,
        color: brick
          ? BRICK[Math.floor(lipRandom() * BRICK.length)]
          : FRACTURE[Math.floor(lipRandom() * FRACTURE.length)],
      });
    }

    for (let k = 0; k < 3; k++) {
      const size = 0.14 + lipRandom() * 0.18;

      deck.elements.push({
        shape: "rock",
        x: X0 + i + 0.1 + lipRandom() * 0.8,
        y: size * 0.3,
        z: north + 0.12 + lipRandom() * 0.5,
        sx: size * 1.3,
        sy: size * 0.8,
        sz: size * 1.2,
        rx: lipRandom() * 0.5,
        ry: lipRandom() * Math.PI * 2,
        rz: lipRandom() * 0.5,
        color: CONCRETE[Math.floor(lipRandom() * CONCRETE.length)],
      });
    }
  });

  // Railings: some posts stand with a rail, some are bent, some are gone.
  const posts: Array<[number, number, "ok" | "bent"]> = [
    [27.9, -17.1, "ok"],
    [28.7, -16.3, "ok"],
    [29.5, -15.5, "bent"],
    [30.4, -15.2, "ok"],
    [31.3, -15.1, "ok"],
    [23.1, -15.9, "bent"],
  ];

  for (const [x, z, state] of posts) {
    deck.box(
      x,
      0,
      z,
      0.06,
      state === "bent" ? 0.7 : 1.1,
      0.06,
      STEEL_DARK,
      0,
      state === "bent" ? 0.5 : 0,
      state === "bent" ? 0.3 : 0,
    );
  }

  deck.box(28.3, 1.0, -16.7, 0.05, 0.05, 1.15, STEEL, 0.785, 0, 0);
  deck.box(30.85, 1.0, -15.15, 0.05, 0.05, 0.93, STEEL, 1.46, 0, 0);

  // Overhead: cross beams under the roof, one dropped at an angle, a pipe
  // run along the north wall that stops and hangs, cables from the ceiling,
  // and fallen ceiling plates.
  for (const x of [23.5, 26.5, 29.5]) {
    deck.box(x, CEILING - F - 0.45, -17, 0.3, 0.45, 14, STEEL_DARK);
  }

  deck.box(
    28.6,
    CEILING - F - 1.5,
    -15.0,
    0.3,
    0.4,
    5.2,
    STEEL_DARK,
    0,
    0,
    0.4,
  );
  // The pipe run is held to the wall by brackets bolted into it.
  for (const x of [23.9, 25.7, 27.5, 29.0]) {
    deck.box(x, 4.25, -23.62, 0.08, 0.3, 0.24, STEEL_DARK);
  }

  deck.elements.push({
    shape: "pipe",
    x: 26.4,
    y: 4.4,
    z: -23.5,
    sx: 6.0,
    sy: 0.28,
    sz: 0.28,
    rx: 0,
    ry: 0,
    rz: 0,
    color: PIPE,
  });
  deck.elements.push({
    shape: "pipe",
    x: 30.3,
    y: 3.9,
    z: -23.4,
    sx: 2.4,
    sy: 0.28,
    sz: 0.28,
    rx: 0,
    ry: 0.1,
    rz: -0.45,
    color: PIPE,
  });

  for (const [x, z, len] of [
    [25.0, -13.0, 2.4],
    [28.4, -11.4, 2.9],
    [30.9, -13.8, 2.0],
    [23.6, -10.9, 2.2],
  ] as const) {
    deck.cableUp(x, CEILING - F - len, z, len, 0.04, CABLE);
  }

  for (const [x, z] of [
    [30.6, -12.5],
    [25.7, -12.4],
  ] as const) {
    deck.elements.push({
      shape: "slab",
      x,
      y: 0.3,
      z,
      sx: 0.5,
      sy: 1.0,
      sz: 1.3,
      rx: 0.2,
      ry: random() * 3,
      rz: Math.PI / 2 - 0.3,
      color: pick(CONCRETE),
    });
  }

  // Small debris on the walkway, thinner in the middle of the way ahead.
  for (let i = 0; i < 34; i++) {
    const size = 0.05 + random() * 0.13;
    const z = -10.7 - random() * 5;
    const way = Math.abs(z + 14.3) < 0.9;

    if (way && random() < 0.85) continue;

    deck.elements.push({
      shape: i % 4 === 0 ? "brick" : "rock",
      x: 23 + random() * 8.6,
      y: i % 4 === 0 ? 0.035 : size * 0.3,
      z,
      sx: i % 4 === 0 ? 0.17 : size,
      sy: i % 4 === 0 ? 0.06 : size * 0.65,
      sz: i % 4 === 0 ? 0.09 : size * 1.1,
      rx: random() * 0.5,
      ry: random() * Math.PI * 2,
      rz: random() * 0.5,
      color: i % 4 === 0 ? pick(BRICK) : pick(CONCRETE),
    });
  }

  // Abandoned crates and a tipped cabinet against the south wall.
  deck.box(31.1, 0, -11.1, 0.9, 0.8, 0.9, CRATE, 0.05);
  deck.box(30.2, 0, -10.85, 0.7, 0.55, 0.5, CRATE, -0.1);
  deck.box(23.55, 0, -10.85, 1.5, 0.55, 0.55, CABINET, 0.08);

  const deckPile = map.createFitting("fittings-ruins-deck", F, deck.elements, [
    {
      minX: 30.65,
      maxX: 31.55,
      minZ: -11.45,
      maxZ: -10.65,
      top: 0.8,
      exact: true,
    },
    {
      minX: 29.85,
      maxX: 30.55,
      minZ: -11.1,
      maxZ: -10.6,
      top: 0.55,
      exact: true,
    },
    {
      minX: 22.8,
      maxX: 24.3,
      minZ: -11.12,
      maxZ: -10.58,
      top: 0.55,
      exact: true,
    },
  ]);

  settle(deckPile.elements);
}

/**
 * Lets what lies on the floor touch it. A rounded rock or a chipped slab is
 * smaller than the box a heap is laid out by, and the box is what is stood on
 * the floor, so the drawn stone hovers a few centimetres above it. A piece
 * whose box rests on the floor but whose real mesh does not is lowered until
 * the mesh is just sunk into it (a stone partly buried reads as resting).
 */
function settle(elements: PileElement[]): void {
  for (const e of elements) {
    if (e.shape !== "rock" && e.shape !== "slab" && e.shape !== "chunk") {
      continue;
    }

    const extent = meshExtent(e);

    if (!extent) {
      continue;
    }

    const boxBottom = e.y - halfExtents(e)[1];
    const meshBottom = e.y + extent.low;

    if (Math.abs(boxBottom) < 0.02 && meshBottom > 0.025 && meshBottom < 0.7) {
      e.y = -extent.low - 0.012;
    }
  }
}
