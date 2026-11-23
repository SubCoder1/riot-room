import type { PartRole, PileElement } from "./ArenaLayout";
import { Pieces, rng } from "./FittingPieces";
import { groundPieces, surfaceUnder } from "./DebrisGround";
import { halfExtents, type MapBuilder } from "./MapParts";
import { meshExtent, meshVertices } from "./PileMeshes";

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
 *  - THE FALLEN CEILING SLAB: a floor section that broke away from the
 *    walkway and came down on the ground floor below its edge: half of it
 *    still a recognisable rectangle of reinforced concrete, the other half
 *    broken up along an irregular fracture, bars out of the break, one
 *    edge resting on the pieces that broke off under it. There is no way back
 *    up from the lower floor: it is a drop, not a descent.
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

/** The north edge (z) of each metre-wide slice of the walkway, x 22 to 32. */
const DECK_EDGES = [
  -16.3, -15.7, -16.5, -15.9, -16.35, -17.3, -13.6, -13.6, -15.3, -15.2,
];

/**
 * The hole in the walkway east of the slab (slices 6 and 7, x 28 to 30): the
 * floor is cut back to a strip along the south wall, so the way along is kept
 * and whoever steps off its north side falls to the lower floor. Nothing is
 * built on the new edge (no lip chunks, rubble, railing or cables).
 */
const HOLE = { x0: 28, x1: 30, z0: -17.4, z1: -13.6 };
const inHole = (x: number, z: number, pad = 0): boolean =>
  x > HOLE.x0 - pad &&
  x < HOLE.x1 + pad &&
  z > HOLE.z0 - pad &&
  z < HOLE.z1 + pad;

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
  // The west wall of the pit is the north wing's floor slab, a different
  // concrete a step (0.3 m) behind the room wall above it: a painted wall like
  // the other two, flush with that room wall, hides both (north of the walkway
  // only: under the walkway the pit's wall stays as it was).
  map.createWall("ruins-pit-wall-w", "z", X0, Z_NORTH + 0.3, -16.3, 0, 0.3, F);

  // ----------------------------------------------------- slab and its heap
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
      // (Lying, not standing: a rock turned far off flat points a corner at the sky.)
      [random() * 0.22, random() * Math.PI * 2, random() * 0.22],
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

  // ------------------------------------------------- the lower floor
  const pit: PileElement[] = [];
  const pitBoxes: Array<{
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
    top: number;
    bottom?: number;
    exact: true;
  }> = [];
  const fall = rng(8821);
  const flat = Math.PI / 2;
  const PLANK = [0x6b5338, 0x5a4632, 0x7a6244];

  // A piece laid on `base` (the floor, or what it rests on) by its own lowest
  // point, a hair sunk in; if it is big enough to stop a body, with a box
  // round its drawn mesh. Returns the height of its top.
  const lay = (
    shape: PileElement["shape"],
    x: number,
    z: number,
    size: [number, number, number],
    turn: [number, number, number],
    color: number,
    base = 0,
    solid = false,
  ): number => {
    const e: PileElement = {
      shape,
      x,
      y: 0,
      z,
      sx: size[0],
      sy: size[1],
      sz: size[2],
      rx: turn[0],
      ry: turn[1],
      rz: turn[2],
      color,
    };
    const extent = meshExtent(e);

    e.y = base - (extent ? extent.low : size[1] / 2) - 0.015;
    pit.push(e);

    const vertices = solid ? meshVertices(e) : null;

    if (vertices) {
      let minX = Infinity;
      let maxX = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;

      for (const v of vertices) {
        minX = Math.min(minX, v.x);
        maxX = Math.max(maxX, v.x);
        minZ = Math.min(minZ, v.z);
        maxZ = Math.max(maxZ, v.z);
      }

      pitBoxes.push({
        minX: e.x + minX,
        maxX: e.x + maxX,
        minZ: e.z + minZ,
        maxZ: e.z + maxZ,
        top: e.y + (extent ? extent.high : size[1] / 2),
        bottom: base > 0.05 ? base : undefined,
        exact: true,
      });
    }

    return e.y + (extent ? extent.high : size[1] / 2);
  };

  // A piece of rubble dropped at (x, z): it comes to rest on what is drawn
  // under its lowest point, sunk a little into it (a heap built from contact),
  // and is left out where its middle would have to sink into something.
  const heapRock = (x: number, z: number, size: number, cap = 3.3): void => {
    const e: PileElement = {
      shape: "rock",
      x,
      y: 0,
      z,
      sx: size * (0.9 + fall() * 0.6),
      sy: size * 0.7,
      sz: size * (0.8 + fall() * 0.6),
      rx: fall() * 0.5,
      ry: fall() * Math.PI * 2,
      rz: fall() * 0.5,
      color: pick(CONCRETE),
    };
    const vertices = meshVertices(e);
    const extent = meshExtent(e);
    let lowest = { x: 0, z: 0 };

    if (vertices) {
      let y = Infinity;

      for (const v of vertices) {
        if (v.y < y) {
          y = v.y;
          lowest = { x: v.x, z: v.z };
        }
      }
    }

    const rest = surfaceUnder(pit, x + lowest.x, z + lowest.z, 0.18);

    if (surfaceUnder(pit, x, z, 0.18) > rest + size * 0.45) return;

    e.y = rest - (extent ? extent.low : e.sy / 2) - Math.min(0.11, size * 0.15);

    if (e.y + (extent ? extent.high : e.sy / 2) > cap) return;

    pit.push(e);
  };

  // Where a piece's real underside is raised off what is under it, one broken
  // piece is wedged in from a few centimetres into the floor (or rubble) to a
  // few into the piece, so nothing is left resting on air.
  const bearUnder = (
    piece: PileElement,
    points: ReadonlyArray<readonly [number, number]>,
  ): void => {
    const vertices = meshVertices(piece);

    if (!vertices) return;

    for (const [x, z] of points) {
      let underside = Infinity;

      for (const v of vertices) {
        if (Math.hypot(piece.x + v.x - x, piece.z + v.z - z) < 0.5) {
          underside = Math.min(underside, piece.y + v.y);
        }
      }

      const rest = surfaceUnder(pit, x, z, 0.3);

      if (!Number.isFinite(underside) || underside - rest < 0.12) continue;

      const wedge: PileElement = {
        shape: "rock",
        x: x + (fall() - 0.5) * 0.15,
        y: 0,
        z: z + (fall() - 0.5) * 0.15,
        sx: 0.55 + fall() * 0.3,
        sy: 1,
        sz: 0.5 + fall() * 0.3,
        rx: (fall() - 0.5) * 0.25,
        ry: fall() * Math.PI * 2,
        rz: (fall() - 0.5) * 0.25,
        color: pick(CONCRETE),
      };
      const unit = meshExtent(wedge);
      const span = unit ? unit.high - unit.low : 1;

      wedge.sy = (underside - rest + 0.1) / span;

      const extent = meshExtent(wedge);

      wedge.y = rest - 0.05 - (extent ? extent.low : wedge.sy / 2);
      pit.push(wedge);
    }
  };

  // ---- Fallen floor slabs against the east side (both solid).
  put(
    pit,
    "slab",
    30.45,
    0.32,
    -17.6,
    [0.55, 2.1, 2.9],
    [0.03, 0.3, flat - 0.03],
    pick(CONCRETE),
  );
  pitBoxes.push({
    minX: 29.4,
    maxX: 31.6,
    minZ: -19.1,
    maxZ: -16.1,
    top: 0.62,
    exact: true,
  });
  put(
    pit,
    "slab",
    32.05,
    0.32,
    -21.4,
    [0.6, 2.2, 2.6],
    [0.02, 0.1, flat - 0.03],
    pick(CONCRETE),
  );
  pitBoxes.push({
    minX: 30.9,
    maxX: 31.7,
    minZ: -22.7,
    maxZ: -20.1,
    top: 0.7,
    exact: true,
  });

  // ---- THE FALLEN CEILING SLAB.
  // It came down from the walkway's broken edge and landed on the ground floor
  // to the north-west of it. Its west half is still the slab: a 3 x 3.4 m
  // rectangle of reinforced concrete 0.5 m thick, straight-edged on its west,
  // north and south sides (against the room's west edge), settled a little
  // out of true. Its east half is broken away along a ragged fracture into
  // five pieces of different size, with bars out of the break. The slab's
  // east edge rests on a fragment that broke off and landed under it first,
  // its west side on the floor.
  const intactX = 23.72;
  const intactZ = -19.3;
  lay(
    "slab",
    25.5,
    -19.35,
    [0.32, 1.5, 1.8],
    [0.0, 0.45, flat - 0.015],
    CONCRETE[2],
    0,
    true,
  );
  lay(
    "slab",
    intactX,
    intactZ,
    [0.5, 3.0, 3.4],
    [0.0, 0.12, flat + 0.04],
    CONCRETE[0],
    0,
    true,
  );
  const intact = pit[pit.length - 1];

  // Wedges under whatever of the slab's underside is raised off the floor.
  bearUnder(intact, [
    [intactX + 1.2, intactZ - 1.45],
    [intactX + 1.2, intactZ + 1.45],
    [intactX + 0.4, intactZ - 1.5],
    [intactX + 0.4, intactZ + 1.5],
  ]);

  // The broken half. Each fragment lies on the floor with its west end tucked
  // against (or, for one, under) the slab's edge; no two alike.
  lay(
    "slab",
    26.55,
    -17.75,
    [0.42, 1.5, 1.25],
    [0.0, 0.9, flat - 0.015],
    CONCRETE[3],
    0,
    true,
  );
  lay(
    "slab",
    26.95,
    -19.9,
    [0.4, 1.25, 1.1],
    [0.0, 2.0, flat + 0.02],
    CONCRETE[4],
    0,
    true,
  );
  lay(
    "slab",
    26.15,
    -21.45,
    [0.38, 1.1, 1.0],
    [0.0, 0.3, flat - 0.02],
    CONCRETE[1],
    0,
    true,
  );
  lay(
    "slab",
    27.95,
    -21.0,
    [0.34, 0.8, 0.85],
    [0.0, 1.4, flat + 0.03],
    CONCRETE[5],
    0,
    true,
  );
  lay(
    "slab",
    27.9,
    -18.5,
    [0.3, 0.7, 0.75],
    [0.2, 0.2, flat - 0.3],
    CONCRETE[2],
    0,
    false,
  );

  // A scaffold frame bent where it fell, trapped under the middle fragment of
  // the broken half: two tubes and a brace, the ends out from under it.
  put(pit, "pipe", 27.4, 0.04, -19.55, [1.9, 0.07, 0.07], [0, 0.25, 0], STEEL);
  put(pit, "pipe", 27.3, 0.04, -20.25, [1.5, 0.07, 0.07], [0, -0.15, 0], STEEL);
  put(
    pit,
    "pipe",
    26.9,
    0.04,
    -19.95,
    [0.8, 0.06, 0.06],
    [0, 1.45, 0],
    STEEL_DARK,
  );
  // A formwork plank caught under the north-east fragment.
  put(
    pit,
    "plank",
    27.5,
    0.03,
    -21.2,
    [1.2, 0.04, 0.16],
    [0, 0.7, 0],
    PLANK[1],
  );
  // A broken formwork panel leaning on the slab's south edge: its upper end
  // against the edge, its lower end on the floor.
  put(
    pit,
    "plank",
    23.6,
    0.27,
    -17.38,
    [1.0, 0.03, 0.55],
    [1.0, 0.2, 0.0],
    PLANK[0],
  );

  // Reinforcement out of the fracture. Each bar starts inside the concrete,
  // at the slab's mid-thickness, and leaves the broken face: some run straight
  // out and level, some bend down after a short level run and end on the
  // floor (so no bar is left hanging free in the air: a level one is held at
  // the face, a bent one is held at the face and rests on the ground).
  // `rod` runs a bar from its start point along a bearing (0: east, a quarter
  // turn: north) and a pitch (down is positive).
  const rod = (
    x: number,
    y: number,
    z: number,
    length: number,
    yaw: number,
    down: number,
  ): { x: number; y: number; z: number } => {
    const dx = Math.cos(down) * Math.cos(yaw);
    const dy = -Math.sin(down);
    const dz = -Math.cos(down) * Math.sin(yaw);

    put(
      pit,
      "plank",
      x + (dx * length) / 2,
      y + (dy * length) / 2,
      z + (dz * length) / 2,
      [length, 0.035, 0.035],
      [0, yaw, -down],
      fall() < 0.4 ? REBAR_BARE : REBAR,
    );

    return { x: x + dx * length, y: y + dy * length, z: z + dz * length };
  };
  const mid = 0.3;
  const faceX = intactX + 1.5;

  for (const [z, len, bend] of [
    [-20.6, 0.95, 0],
    [-19.95, 0.7, 1],
    [-19.3, 1.05, 0],
    [-18.65, 0.55, 1],
    [-18.05, 0.8, 0],
  ] as const) {
    const yaw = (fall() - 0.5) * 0.4;

    if (bend) {
      // Level out of the face, then bent down to the floor.
      const knee = rod(faceX - 0.25, mid, z, 0.5, yaw, 0);

      rod(knee.x, knee.y, knee.z, 0.45, yaw + (fall() - 0.5) * 0.5, 0.65);
    } else {
      rod(faceX - 0.25, mid, z, len + 0.25, yaw, 0);
    }
  }

  // Bars out of the slab's north edge, bent over and down onto the floor.
  rod(intactX - 0.7, mid, intactZ - 1.45, 0.95, Math.PI / 2 + 0.15, 0.32);
  rod(intactX + 0.5, mid, intactZ - 1.45, 0.8, Math.PI / 2 - 0.3, 0.38);

  // A steel beam that came down with it: its north end on the slab's top, its
  // south end on the floor, a bent flange on it.
  put(
    pit,
    "plank",
    24.55,
    0.47,
    -16.75,
    [0.3, 0.3, 2.7],
    [0.2, 0.08, 0],
    STEEL,
  );
  pitBoxes.push({
    minX: 24.35,
    maxX: 24.75,
    minZ: -17.3,
    maxZ: -15.5,
    top: 0.42,
    exact: true,
  });

  // Fragments broken off in the fall: large ones next to the impact, medium
  // pieces further out, thinning east. Each rests on what is under it.
  for (const [x, z, size] of [
    [22.7, -22.1, 0.62],
    [23.6, -22.65, 0.5],
    [25.2, -22.7, 0.7],
    [22.6, -16.9, 0.55],
    [23.5, -16.3, 0.45],
    [26.0, -16.4, 0.6],
    [28.7, -22.3, 0.45],
    [28.9, -20.4, 0.38],
    [28.4, -17.0, 0.34],
    [27.6, -23.0, 0.4],
  ] as const) {
    heapRock(x, z, size);
  }

  for (let k = 0; k < 64; k++) {
    const x = 22.5 + Math.pow(fall(), 1.25) * 9;
    const z = -23.2 + fall() * 10.4;

    // (Not on the standing columns.)
    if (Math.hypot(x - 24.5, z + 14.3) < 0.6) continue;
    if (Math.hypot(x - 29.5, z + 13.0) < 0.6) continue;

    // (Nothing on the broken slab's own footprint, or where bodies land.)
    if (x > 22.4 && x < 25.8 && z < -17.4 && z > -21.1) continue;
    if (x > 28 && x < 30 && z > -17.2 && z < -13.4) continue;

    heapRock(x, z, 0.12 + Math.pow(fall(), 2) * 0.36);
  }

  // ---- The rest of the lower floor.
  // Overturned cabinet and crates, a fallen pipe, a broken beam hanging from
  // the walkway to the ground.
  put(pit, "plank", 30.88, 0.35, -15.4, [1.6, 0.7, 0.6], [0, 0.0, 0], CABINET);
  pitBoxes.push({
    minX: 30.08,
    maxX: 31.7,
    minZ: -15.8,
    maxZ: -15.0,
    top: 0.7,
    exact: true,
  });
  put(pit, "plank", 26.9, 0.25, -23.0, [0.6, 0.5, 0.6], [0, 0.3, 0.1], CRATE);
  put(pit, "pipe", 31.0, 0.12, -18.4, [2.6, 0.2, 0.2], [0, 1.5, 0], PIPE);
  // Its top end runs 0.2 m into the walkway's underside (a steel gusset plate
  // bolted there), its foot sinks into the ground in a bank of rubble.
  put(pit, "plank", 27.6, 1.84, -16.78, [0.3, 0.26, 5.1], [-0.81, 0, 0], STEEL);
  put(
    pit,
    "plank",
    27.6,
    3.47,
    -15.45,
    [0.7, 0.06, 0.9],
    [0, 0, 0],
    STEEL_DARK,
  );

  for (const [x, z, size] of [
    [27.3, -18.85, 0.5],
    [27.8, -18.95, 0.38],
    [27.15, -19.3, 0.32],
  ] as const) {
    heapRock(x, z, size);
  }

  pitBoxes.push(
    { minX: 27.4, maxX: 27.8, minZ: -18.7, maxZ: -18.1, top: 0.6, exact: true },
    { minX: 27.4, maxX: 27.8, minZ: -18.1, maxZ: -17.6, top: 1.3, exact: true },
  );

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

  // Cables hanging from the walkway's underside (a few).
  for (let i = 0; i < 9; i++) {
    const x = 23 + i * 1.05 + random() * 0.4;
    const z = -15.4 + random() * 2.4;
    const len = 1.2 + random() * 1.1;

    if (inHole(x, z, 0.1) || i % 2 === 1) continue;

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

  for (const [x, z, len, turn, lean] of [
    [24.6, -22.9, 1.3, 0.3, 0],
    [30.2, -23.3, 1.1, -0.5, 0],
    [29.2, -18.6, 1.0, 0.9, 0.12],
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

  // The pocket between the two fallen floor slabs on the east side: rubble and
  // two crushed drums, one box (a slot a crouched body could jump into).
  // A steel drum lying on its side, with the ribbing a real one has: the
  // body, a rolling hoop at each end and one in the middle, a rim and a bung
  // at each end. `squash` flattens it (crushed under the slab).
  const drum = (
    x: number,
    z: number,
    yaw: number,
    body: number,
    hoops: number,
    squash: number,
    length = 1.15,
    diameter = 0.76,
  ): void => {
    const r = diameter / 2;
    const h = diameter * squash;
    const along = [Math.cos(yaw), -Math.sin(yaw)] as const;
    const at = (t: number): [number, number] => [
      x + along[0] * t,
      z + along[1] * t,
    ];

    put(pit, "pipe", x, h / 2, z, [length, h, diameter], [0, yaw, 0], body);

    for (const t of [-0.4, 0, 0.4]) {
      const [hx, hz] = at(t * length);

      put(
        pit,
        "pipe",
        hx,
        (h + 0.04) / 2,
        hz,
        [0.07, h + 0.04, diameter + 0.04],
        [0, yaw, 0],
        hoops,
      );
    }

    for (const t of [-0.5, 0.5]) {
      const [ex, ez] = at(t * length);

      // The chime (the rolled rim) round each end, and a bung in one.
      put(
        pit,
        "pipe",
        ex,
        (h + 0.06) / 2,
        ez,
        [0.06, h + 0.06, diameter + 0.06],
        [0, yaw, 0],
        hoops,
      );
    }

    const [bx, bz] = at(0.5 * length + 0.025);

    put(
      pit,
      "pipe",
      bx,
      h / 2 + r * 0.25,
      bz,
      [0.05, 0.12, 0.12],
      [0, yaw, 0],
      STEEL_DARK,
    );
  };

  drum(30.55, -19.8, 0.4, 0x4b5663, STEEL_DARK, 0.82);
  drum(30.7, -18.65, 1.2, 0x6a4030, 0x3a2c25, 0.9, 1.05, 0.72);
  // (A lid lying on the first drum, its underside on the drum's top.)
  put(
    pit,
    "plank",
    30.55,
    0.66,
    -19.8,
    [0.62, 0.03, 0.62],
    [0.06, 0.3, 0.04],
    STEEL_DARK,
  );

  for (const [x, z, size] of [
    [29.75, -19.55, 0.6],
    [29.8, -20.05, 0.55],
    [30.9, -20.0, 0.62],
    [31.35, -19.6, 0.5],
    [30.45, -19.3, 0.4],
    [31.3, -19.25, 0.4],
  ] as const) {
    lay(
      "rock",
      x,
      z,
      [size * (0.9 + fall() * 0.6), size * 0.7, size * (0.8 + fall() * 0.6)],
      [fall() * 0.3, fall() * Math.PI * 2, fall() * 0.3],
      pick(CONCRETE),
      0,
    );
  }

  pitBoxes.push({
    minX: 29.4,
    maxX: 31.65,
    minZ: -20.35,
    maxZ: -18.1,
    top: 0.7,
    exact: true,
  });

  // Bent sheet metal, and a flattened drum on its side.
  put(
    pit,
    "plank",
    28.8,
    0.1,
    -22.0,
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

  for (let i = 0; i < 36; i++) {
    const brick = i % 2 === 0;
    const size = 0.06 + random() * 0.14;
    const x = 23.4 + random() * 8;
    const z = -23.2 + random() * 10.2;

    if (x > 22.4 && x < 25.8 && z < -17.4 && z > -21.1) continue;

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

  // Micro rubble: a scatter of small stones, chips and bricks round the base of
  // every big piece lying on the floor, and loose over the open ground. (A
  // random stream of its own; drawn only, so no body is stopped by it.)
  const micro = rng(4417);
  const pebble = (x: number, z: number): void => {
    // Not on the slab itself.
    if (x > 22.5 && x < 25.7 && z < -17.6 && z > -21.0) return;

    const size = 0.03 + micro() * 0.07;
    const brick = micro() < 0.12;

    pit.push({
      shape: brick ? "brick" : "rock",
      x,
      y: brick ? 0.03 : size * 0.3,
      z,
      sx: brick ? 0.12 : size * 1.3,
      sy: brick ? 0.05 : size * 0.7,
      sz: brick ? 0.07 : size * 1.1,
      rx: brick ? 0 : micro() * 0.5,
      ry: micro() * Math.PI * 2,
      rz: brick ? 0 : micro() * 0.5,
      color: brick
        ? BRICK[Math.floor(micro() * BRICK.length)]
        : (micro() < 0.5 ? CONCRETE : FRACTURE)[Math.floor(micro() * 3)],
    });
  };

  for (const e of [...pit]) {
    if (e.shape !== "rock" && e.shape !== "slab") continue;
    if (e.y - Math.max(e.sx, e.sy, e.sz) / 2 > 0.3) continue;

    const reach = Math.max(e.sx, e.sz) / 2;
    const count = 3 + Math.floor(micro() * 4);

    for (let k = 0; k < count; k++) {
      const a = micro() * Math.PI * 2;
      const d = reach * (0.85 + micro() * 0.6) + 0.06;

      pebble(e.x + Math.cos(a) * d, e.z + Math.sin(a) * d);
    }
  }

  for (let i = 0; i < 300; i++) {
    pebble(22.6 + micro() * 8.9, -23.6 + micro() * 10.8);
  }

  propUp(pit, rng(5822));

  const pitPile = map.createFitting(
    "fittings-ruins-pit",
    0,
    pit,
    withRole(pitBoxes),
  );

  settle(pitPile.elements);
  groundPieces(pitPile.elements);

  // A big rock lying on other debris must touch it along its underside, not on
  // one point: where a quarter of its underside hangs more than 10 cm over what
  // is under it, it is settled down into what it rests on (the gap is its own
  // shadow's dark line, and read as floating).
  for (const e of pitPile.elements) {
    if (e.shape !== "rock" || Math.max(e.sx, e.sy, e.sz) < 0.5) continue;

    const vertices = meshVertices(e);

    if (!vertices) continue;

    const ys = vertices.map((v) => e.y + v.y).sort((p, q) => p - q);
    const cut = ys[Math.floor(ys.length * 0.25)];
    const near = pitPile.elements.filter(
      (o) =>
        o !== e &&
        Math.abs(o.x - e.x) < 1.6 &&
        Math.abs(o.z - e.z) < 1.6 &&
        Math.max(o.sx, o.sy, o.sz) > 0.2,
    );
    // What is under it: the drawn points of the pieces round it, found once.
    const under: Array<{ x: number; z: number; y: number }> = [];

    for (const o of near) {
      const ov = meshVertices(o);

      if (!ov) continue;

      for (let k = 0; k < ov.length; k += 2) {
        under.push({ x: o.x + ov[k].x, z: o.z + ov[k].z, y: o.y + ov[k].y });
      }
    }

    const restAt = (x: number, z: number): number => {
      let top = 0;

      for (const q of under) {
        if (Math.hypot(q.x - x, q.z - z) < 0.12 && q.y > top) top = q.y;
      }

      return top;
    };
    let hang = 0;
    let bad = 0;
    let count = 0;

    for (let k = 0; k < vertices.length; k += 3) {
      const v = vertices[k];

      if (e.y + v.y > cut) continue;

      count++;

      const gap = e.y + v.y - restAt(e.x + v.x, e.z + v.z);

      if (gap > 0.1) bad++;

      hang = Math.max(hang, gap);
    }

    if (count > 0 && bad / count > 0.3) e.y -= Math.min(hang * 0.55, 0.16);
  }

  // A fallen slab lies sunk a little into the floor: its underside is uneven,
  // and resting on its lowest point alone left a dark gap along every edge.
  for (const e of pitPile.elements) {
    if (e.shape === "slab" && e.y < 0.4) e.y -= 0.035;
  }

  // ------------------------------------------------------- the upper floor
  const deck = new Pieces();

  // The broken edge: chunks of floor hanging off the lip, bars bent out of it.
  DECK_EDGES.forEach((north, i) => {
    if (i === 6 || i === 7) return; // the hole

    const x = X0 + i + 0.5;

    // Two pieces of the floor's own thickness: one hanging off the lip, bent
    // down (its upper part still in the broken face it tore from), and one
    // that has slid up onto it and rests on the edge.
    for (const [lift, drop, side, lying] of [
      [-0.42, 1, 0.0, false],
      [0.12, 0.7, 0.35, true],
    ] as const) {
      const size = (0.45 + random() * 0.45) * drop;

      // The first still hangs from the lip, tipped down; the second came off
      // the floor above and lies on the deck, flat, its far end over the edge.
      deck.elements.push({
        shape: "slab",
        x: x + (random() - 0.5) * 0.4,
        y: lying ? size * 0.2 : lift,
        z: north + side,
        sx: size * 0.55,
        sy: size * 1.1,
        sz: size * 1.5,
        rx: lying ? (random() - 0.5) * 0.25 : 0.2 + random() * 0.5,
        ry: random() * 0.8,
        rz: lying
          ? Math.PI / 2 + (random() - 0.5) * 0.3
          : (random() - 0.5) * 1.2,
        color: pick(FRACTURE),
      });
    }

    // Reinforcement out of the broken face: a straight bar lying out
    // horizontally from every slice, and on every other one a second bent
    // down over the edge. (Each starts inside the concrete, at the slab's
    // mid-thickness.)
    const barX = x + (random() - 0.5) * 0.5;
    const barLength = 0.6 + random() * 0.5;

    bar(
      deck.elements,
      barX,
      -0.25,
      north + 0.2 - barLength / 2,
      barLength + 0.4,
      [0, (random() - 0.5) * 0.2, 0],
    );

    if (i % 2 === 1) {
      bar(
        deck.elements,
        barX + 0.3,
        -0.42,
        north - 0.02,
        0.9 + random() * 0.4,
        [-0.9, (random() - 0.5) * 0.3, 0],
      );
    }
  });

  // Two damaged girders bolted under the walkway at its edge: each is held by
  // a gusset plate under the floor, runs out past the broken edge and is bent
  // down at its end where the floor let go of it.
  for (const [gx, north] of [
    [25.5, DECK_EDGES[3]],
    [30.6, DECK_EDGES[8]],
  ] as const) {
    deck.box(gx, -0.55, north + 0.7, 0.55, 0.04, 0.6, STEEL_DARK);
    deck.elements.push({
      shape: "plank",
      x: gx,
      y: -0.67,
      z: north - 0.35,
      sx: 0.24,
      sy: 0.26,
      sz: 2.3,
      rx: 0.22,
      ry: 0.04,
      rz: 0,
      color: STEEL,
    });
  }

  // The broken edge itself: an outer layer of chips, small stones and bricks
  // packed against the face of each slice (half sunk into it), and rubble
  // banked on the deck at the foot of the chunks that rest on the lip, so
  // nothing there stands or hangs on bare edge. (A random stream of its own:
  // the rest of the room's layout is not disturbed.)
  const lipRandom = rng(9031);

  DECK_EDGES.forEach((north, i) => {
    if (i === 6 || i === 7) return; // the hole: a clean edge, no outer layer

    for (let k = 0; k < 3; k++) {
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

    for (let k = 0; k < 1; k++) {
      const size = 0.14 + lipRandom() * 0.18;

      deck.elements.push({
        shape: "rock",
        x: X0 + i + 0.1 + lipRandom() * 0.8,
        y: size * 0.3,
        z: north + 0.3 + lipRandom() * 0.5,
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
    [23.1, -15.5, "bent"],
  ];

  for (const [x, z, state] of posts) {
    if (inHole(x, z, 0.3)) continue;

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

  // ---- The pipe run carried on to the entrance. It leaves the existing pipe's
  // west end, turns the north-west corner in two 45 degree mitres, runs south
  // along the west wall (face at x 22.3) on brackets, and goes into the wall
  // at z -18.7 through a flange, in a hole broken round it. Everything is
  // above 8 m (the roof is at 10.5): nothing in reach of a player or the camera.
  {
    const PY = 4.4; // the pipe's centre, above the walkway (F)
    const D = 0.28;
    const wallX = 22.3;
    const px = wallX + 0.2; // the pipe's centre line along the west wall
    const run = (
      x0: number,
      z0: number,
      x1: number,
      z1: number,
      d: number,
      y: number,
      color: number,
    ): void => {
      const dx = x1 - x0;
      const dz = z1 - z0;

      deck.elements.push({
        shape: "pipe",
        x: (x0 + x1) / 2,
        y,
        z: (z0 + z1) / 2,
        // A touch long so neighbours overlap at a bend and no open end shows.
        sx: Math.hypot(dx, dz) + d * 0.5,
        sy: d,
        sz: d,
        rx: 0,
        ry: Math.atan2(-dz, dx),
        rz: 0,
        color,
      });
    };
    // A coupling collar round a pipe at (x, z), `along` the way it runs.
    const collar = (
      x: number,
      z: number,
      d: number,
      y: number,
      yaw: number,
      length = 0.14,
    ): void => {
      deck.elements.push({
        shape: "pipe",
        x,
        y,
        z,
        sx: length,
        sy: d + 0.09,
        sz: d + 0.09,
        rx: 0,
        ry: yaw,
        rz: 0,
        color: STEEL_DARK,
      });
    };
    // A thin steel bar from one point to another (reinforcement).
    const bar = (
      a: [number, number, number],
      b: [number, number, number],
      thick: number,
      color: number,
    ): void => {
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const dz = b[2] - a[2];
      const len = Math.hypot(dx, dy, dz);

      deck.elements.push({
        shape: "plank",
        x: (a[0] + b[0]) / 2,
        y: (a[1] + b[1]) / 2,
        z: (a[2] + b[2]) / 2,
        sx: len,
        sy: thick,
        sz: thick,
        rx: 0,
        ry: Math.atan2(-dz, dx),
        rz: Math.asin(dy / len),
        color,
      });
    };
    const zS = -23.5; // the existing pipe's line along the north wall
    const zEnd = -18.9;
    const zHole = -18.68;

    // The route, from the existing pipe's west end (x 23.4).
    run(23.4, zS, 22.95, zS, D, PY, PIPE);
    run(22.95, zS, px, zS + (22.95 - px), D, PY, PIPE);
    run(px, zS + (22.95 - px), px, zEnd, D, PY, PIPE);
    run(px, zEnd, wallX + 0.06, zHole, D, PY, PIPE);
    run(wallX + 0.06, zHole, wallX - 0.2, zHole, D, PY, PIPE);

    // Couplings: on the old run between its brackets, and at every joint.
    for (const x of [24.8, 26.6, 28.2]) collar(x, zS, D, PY, 0);

    collar(22.95, zS, D, PY, 0, 0.18);
    collar(px, zS + (22.95 - px), D, PY, -Math.PI / 2, 0.18);
    collar(px, zEnd, D, PY, -Math.PI / 2, 0.18);
    collar(px, -21.3, D, PY, -Math.PI / 2);
    // The flange where it meets the wall: a wide plate on the face and a
    // collar behind it, with bolt heads.
    deck.box(wallX + 0.03, PY - 0.25, zHole, 0.06, 0.5, 0.5, STEEL_DARK);

    for (const [dy, dz] of [
      [-0.2, -0.2],
      [0.2, -0.2],
      [-0.2, 0.2],
      [0.2, 0.2],
    ] as const) {
      deck.box(
        wallX + 0.075,
        PY + dy - 0.025,
        zHole + dz,
        0.03,
        0.05,
        0.05,
        STEEL,
      );
    }

    // Brackets on the west wall (a plate on the face, an arm, a strap ring).
    for (const z of [-22.4, -20.6]) {
      deck.box(wallX + 0.02, PY - 0.2, z, 0.04, 0.4, 0.22, STEEL_DARK);
      deck.box(wallX + 0.1, PY - 0.03, z, 0.12, 0.06, 0.1, STEEL_DARK);
      collar(px, z, D, PY, -Math.PI / 2, 0.06);
    }

    // The broken edge round the entry: a dark bite in the face, a few
    // chunks fallen from it onto the pipe's flange line, and bars out of it.
    deck.elements.push({
      shape: "plank",
      x: wallX + 0.004,
      y: PY,
      z: zHole,
      sx: 0.01,
      sy: 1.1,
      sz: 1.0,
      rx: 0,
      ry: 0,
      rz: 0.12,
      color: 0x101114,
    });

    for (const [dz, up, tilt] of [
      [-0.45, 0.35, 0.5],
      [-0.3, -0.5, -0.3],
      [0.4, 0.45, 0.35],
      [0.5, -0.35, -0.5],
    ] as const) {
      bar(
        [wallX - 0.12, PY + up * 0.6, zHole + dz],
        [wallX + 0.5, PY + up * 0.6 + tilt * 0.4, zHole + dz + 0.08],
        0.035,
        up > 0 ? REBAR_BARE : REBAR,
      );
    }

    // Two thinner conduits along the wall, clipped to it; they turn the
    // corner in a single 45 degree bend and end in a junction box on the
    // west wall (the cable goes on inside the concrete).
    const CD = 0.07;

    for (const [y, off] of [
      [PY + 0.31, 0],
      [PY - 0.31, 0.12],
    ] as const) {
      const zc = zS - 0.15 + 0.0; // against the north wall
      const xw = wallX + 0.06 + off * 0; // against the west wall

      run(24.4, zc, 22.8 + off, zc, CD, y, 0x2a2d33);
      run(22.8 + off, zc, xw, zc + (22.8 + off - xw), CD, y, 0x2a2d33);
      run(xw, zc + (22.8 + off - xw), xw, -19.6 - off * 6, CD, y, 0x2a2d33);

      // Clips every 1.2 m.
      for (const x of [24.0, 25.4, 26.8]) {
        deck.box(x, y - 0.06, zc - 0.03, 0.05, 0.12, 0.05, STEEL_DARK);
      }

      for (const z of [-22.2, -21.0]) {
        deck.box(wallX + 0.02, y - 0.06, z, 0.05, 0.12, 0.05, STEEL_DARK);
      }

      // The junction box at the end.
      deck.box(
        wallX + 0.05,
        y - 0.09,
        -19.6 - off * 6 - 0.09,
        0.1,
        0.18,
        0.18,
        STEEL_DARK,
      );
    }

    // ---- The pipe goes on: two more run down into the chamber. The old pipe
    // (C) is carried east to the north-east corner, drops down the corner and
    // runs along the pit's east wall and its south wall (above the doorway's
    // head height, under the walkway's slab at 3.5 m); a second (B) comes out
    // of the east wall and runs the same way beneath it. Both go through the
    // south wall over the chamber's doorway into a manifold box (see
    // RuinsChamber). All drawn only, above 2.6 m, nothing in reach.
    const rise = (
      x: number,
      z: number,
      y0: number,
      y1: number,
      d: number,
    ): void => {
      deck.elements.push({
        shape: "pipe",
        x,
        y: (y0 + y1) / 2 - F,
        z,
        sx: Math.abs(y1 - y0) + d * 0.5,
        sy: d,
        sz: d,
        rx: 0,
        ry: 0,
        rz: Math.PI / 2,
        color: PIPE,
      });
    };
    const eastX = 31.52; // the pipes' centre line along the pit's east wall
    const southZ = -12.2; // ... and along its south wall
    const yC = 3.3 - F;
    const yB = 2.8 - F;
    const flange = (x: number, z: number, y: number, alongX: boolean): void => {
      deck.box(
        alongX ? x : x - 0.25,
        y - 0.25 - F,
        alongX ? z - 0.25 : z,
        alongX ? 0.06 : 0.5,
        0.5,
        alongX ? 0.5 : 0.06,
        STEEL_DARK,
      );
    };

    // C: the old pipe's east end, round the corner and down.
    run(29.4, zS, eastX - 0.3, zS, D, PY, PIPE);
    run(eastX - 0.3, zS, eastX, zS, D, PY, PIPE);
    rise(eastX, zS, 3.3, 8.4 + 0.14, D);
    collar(eastX, zS, D + 0.04, PY, 0, 0.3);
    rise(eastX, zS, 3.3, 3.3, D);

    // B: out of the east wall at z -22 (a hole broken round its flange).
    run(31.7 + 0.2, -22.0, eastX, -22.0, D - 0.02, 2.8 - F, PIPE);
    flange(31.7 - 0.03, -22.0, 2.8, true);
    deck.elements.push({
      shape: "plank",
      x: 31.7 - 0.004,
      y: 2.8 - F,
      z: -22.0,
      sx: 0.01,
      sy: 1.0,
      sz: 0.9,
      rx: 0,
      ry: 0,
      rz: 0.1,
      color: 0x101114,
    });

    for (const [dz, up] of [
      [-0.4, 0.35],
      [0.4, -0.3],
      [0.45, 0.4],
    ] as const) {
      bar(
        [31.7 + 0.12, 2.8 - F + up * 0.6, -22.0 + dz],
        [31.7 - 0.5, 2.8 - F + up * 0.6 - 0.1, -22.0 + dz + 0.08],
        0.035,
        REBAR,
      );
    }

    // Both: south along the east wall, a 45 degree mitre pair round the
    // corner, then west along the south wall to above the doorway.
    for (const [y, d, xin] of [
      [yC, D, 24.3],
      [yB, D - 0.02, 23.2],
    ] as const) {
      run(eastX, y === yC ? zS : -22.0, eastX, southZ + 0.45, d, y, PIPE);
      run(eastX, southZ + 0.45, eastX - 0.45, southZ, d, y, PIPE);
      run(eastX - 0.45, southZ, xin + 0.35, southZ, d, y, PIPE);
      run(xin + 0.35, southZ, xin, southZ + 0.35, d, y, PIPE);
      // Through the wall (above the doorway) to the manifold box inside.
      run(xin, southZ + 0.35, xin, -11.45, d, y, PIPE);
      collar(eastX, southZ + 0.45, d, y, 0, 0.16);
      collar(xin + 0.35, southZ, d, y, 0, 0.16);
      collar(xin, -11.95, d, y, -Math.PI / 2, 0.16);

      for (const x of [29.8, 27.6, 25.6]) collar(x, southZ, d, y, 0, 0.14);
      for (const z of [-19.8, -16.6, -14.2]) {
        collar(eastX, z, d, y, -Math.PI / 2, 0.14);
      }
    }

    // The flange on the south wall where each goes in.
    for (const [x, y] of [
      [24.3, 3.3],
      [23.2, 2.8],
    ] as const) {
      deck.box(x - 0.25, y - 0.25 - F, -12.03, 0.5, 0.5, 0.06, STEEL_DARK);
    }

    // Brackets: one tall plate holds both pipes, on the east wall and the south.
    for (const z of [-21.0, -18.4, -16.2, -14.0]) {
      deck.box(31.7 - 0.04, 2.55 - F, z, 0.04, 0.93, 0.2, STEEL_DARK);
      deck.box(31.7 - 0.12, 3.27 - F, z, 0.12, 0.06, 0.1, STEEL_DARK);
      deck.box(31.7 - 0.12, 2.77 - F, z, 0.12, 0.06, 0.1, STEEL_DARK);
      collar(eastX, z, D, yC, -Math.PI / 2, 0.06);
      collar(eastX, z, D, yB, -Math.PI / 2, 0.06);
    }

    for (const x of [30.4, 28.8, 26.4]) {
      deck.box(x - 0.1, 2.55 - F, -12.04, 0.2, 0.93, 0.04, STEEL_DARK);
      deck.box(x - 0.05, 3.27 - F, -12.12, 0.1, 0.06, 0.12, STEEL_DARK);
      deck.box(x - 0.05, 2.77 - F, -12.12, 0.1, 0.06, 0.12, STEEL_DARK);
      collar(x, southZ, D, yC, 0, 0.06);
      collar(x, southZ, D, yB, 0, 0.06);
    }

    // Two thin conduits under them on the east and south walls, clipped, going
    // into a junction box on the south wall.
    for (const [y, off] of [
      [2.4, 0],
      [2.22, 0.12],
    ] as const) {
      const ex = 31.7 - 0.05 - off * 0.3;
      const sz = -12.0 - 0.05 - off * 0.3;

      run(ex, -22.0 + 0.3 * off, ex, sz + 0.4, 0.07, y - F, 0x2a2d33);
      run(ex, sz + 0.4, ex - 0.4, sz, 0.07, y - F, 0x2a2d33);
      run(ex - 0.4, sz, 27.1 - off * 0.5, sz, 0.07, y - F, 0x2a2d33);
      deck.box(
        26.9 - off * 0.5 - 0.09,
        y - 0.09 - F,
        sz - 0.06,
        0.18,
        0.18,
        0.1,
        STEEL_DARK,
      );

      for (const z of [-20.5, -17.4, -14.6]) {
        deck.box(ex - 0.03, y - 0.06 - F, z, 0.05, 0.12, 0.05, STEEL_DARK);
      }

      for (const x of [30.0, 28.8]) {
        deck.box(x, y - 0.06 - F, sz - 0.03, 0.05, 0.12, 0.05, STEEL_DARK);
      }
    }
  }

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

    const x = 23 + random() * 8.6;
    const north = DECK_EDGES[Math.min(9, Math.max(0, Math.floor(x - X0)))];

    // Only on floor that is there: not over the hole, not past a slice's
    // broken edge (a brick there was left lying in the air).
    if (inHole(x, z, 0.15) || z < north + 0.15) continue;

    deck.elements.push({
      shape: i % 4 === 0 ? "brick" : "rock",
      x,
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

  // Nothing lies on floor that is not there: a small piece on the deck's top
  // whose centre is past its slice's broken edge is dropped.
  for (let k = deck.elements.length - 1; k >= 0; k--) {
    const e = deck.elements[k];

    if (
      (e.shape === "rock" || e.shape === "brick") &&
      e.y > -0.2 &&
      e.y < 0.6 &&
      e.z < -12.5
    ) {
      const edge = DECK_EDGES[Math.min(9, Math.max(0, Math.floor(e.x - X0)))];

      if (e.z < edge + 0.1) deck.elements.splice(k, 1);
    }
  }

  const deckPile = map.createFitting("fittings-ruins-deck", F, deck.elements, [
    // The two slabs lying on the walkway by the south wall.
    {
      minX: 30.0,
      maxX: 31.2,
      minZ: -13.1,
      maxZ: -11.9,
      top: 0.4,
      exact: true,
    },
    {
      minX: 25.1,
      maxX: 26.3,
      minZ: -13.0,
      maxZ: -11.8,
      top: 0.4,
      exact: true,
    },
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
  groundPieces(deckPile.elements, true);
}

/**
 * Fills the dark pockets under raised rocks. A rock that sits on others in a
 * heap leaves a gap under its edge, and the shadow there reads as a stone
 * hanging in the air. Under each such rock a few smaller stones are wedged,
 * rising from the floor and tucked into its underside, so it visibly rests on
 * rubble. (Drawn only; a random stream of its own.)
 */
function propUp(elements: PileElement[], random: () => number): void {
  for (const e of [...elements]) {
    if (e.shape !== "rock") continue;

    const extent = meshExtent(e);

    if (!extent) continue;

    const under = e.y + extent.low;

    // Big rocks get stones wedged round their feet, so the dark seam where
    // they meet the floor is closed even when they rest on it.
    if (Math.max(e.sx, e.sz) >= 0.5 && under < 0.14) {
      for (let k = 0; k < 3; k++) {
        const a = random() * Math.PI * 2;
        const d = Math.max(e.sx, e.sz) * (0.3 + random() * 0.15);
        const size = 0.2 + random() * 0.15;

        elements.push({
          shape: "rock",
          x: e.x + Math.cos(a) * d,
          y: size * 0.28,
          z: e.z + Math.sin(a) * d,
          sx: size * 1.3,
          sy: size * 0.65,
          sz: size,
          rx: random() * 0.4,
          ry: random() * Math.PI * 2,
          rz: random() * 0.4,
          color: CONCRETE[Math.floor(random() * CONCRETE.length)],
        });
      }
    }

    // Only a real pocket, and only low in the heap (not the slab's own parts).
    if (under < 0.06 || under > 1.4) continue;

    const count = 3 + Math.floor(random() * 2);

    for (let k = 0; k < count; k++) {
      const wide = 0.22 + random() * 0.22;
      const high = under + 0.1;

      elements.push({
        shape: "rock",
        x: e.x + (random() - 0.5) * e.sx * 0.7,
        y: high / 2,
        z: e.z + (random() - 0.5) * e.sz * 0.7,
        sx: wide * 1.2,
        sy: high,
        sz: wide,
        rx: (random() - 0.5) * 0.3,
        ry: random() * Math.PI * 2,
        rz: (random() - 0.5) * 0.3,
        color: CONCRETE[Math.floor(random() * CONCRETE.length)],
      });
    }

    // A broad rock also rests on its edges: stones wedged under the rim, where
    // the overhang's shadow would otherwise show daylight under it.
    if (Math.max(e.sx, e.sz) >= 0.5) {
      const around = random() * Math.PI * 2;

      for (let k = 0; k < 3; k++) {
        const angle = around + (k * Math.PI * 2) / 3 + (random() - 0.5) * 0.5;
        const reach = 0.45 + random() * 0.2;
        const lx = Math.cos(angle) * e.sx * 0.5 * reach;
        const lz = Math.sin(angle) * e.sz * 0.5 * reach;
        const wide = 0.3 + random() * 0.2;
        const high = under + 0.12;

        elements.push({
          shape: "rock",
          x: e.x + lx * Math.cos(e.ry) + lz * Math.sin(e.ry),
          y: high / 2,
          z: e.z - lx * Math.sin(e.ry) + lz * Math.cos(e.ry),
          sx: wide * 1.2,
          sy: high,
          sz: wide,
          rx: (random() - 0.5) * 0.3,
          ry: random() * Math.PI * 2,
          rz: (random() - 0.5) * 0.3,
          color: CONCRETE[Math.floor(random() * CONCRETE.length)],
        });
      }
    }

    // Chips and small stones where the pocket meets the floor.
    for (let k = 0; k < 3; k++) {
      const size = 0.05 + random() * 0.07;
      const a = random() * Math.PI * 2;
      const d = Math.max(e.sx, e.sz) * (0.35 + random() * 0.2);

      elements.push({
        shape: "rock",
        x: e.x + Math.cos(a) * d,
        y: size * 0.3,
        z: e.z + Math.sin(a) * d,
        sx: size * 1.3,
        sy: size * 0.7,
        sz: size * 1.1,
        rx: random() * 0.5,
        ry: random() * Math.PI * 2,
        rz: random() * 0.5,
        color: CONCRETE[Math.floor(random() * CONCRETE.length)],
      });
    }
  }
}

/**
 * The collision of the heaps is rubble, not a low prop: it is never vaulted
 * (a "floor" part is walked up where it is a step and blocks otherwise), so
 * nobody swings over a heap that is drawn as a pile of broken concrete.
 */
function withRole<T extends object>(boxes: T[]): Array<T & { role: PartRole }> {
  return boxes.map((box) => ({ ...box, role: "floor" as const }));
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
