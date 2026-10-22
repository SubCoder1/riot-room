import { allSolids, type Solid } from "./ArenaLayout";
import { Pieces, rng } from "./FittingPieces";
import type { MapBuilder } from "./MapParts";
import { ventBlocks, ventBlocksNear } from "./Vents";

/**
 * Debris scattered over the open floors, walkways and roofs: broken concrete,
 * loose bricks, snapped boards, scraps of sheet metal, pipe offcuts and cable
 * ends. Everything is low and drawn only, so nothing trips or stops a body or
 * a shot. Spots are picked at random (the same every run) from places that are
 * open floor, outside the rooms, and at least a metre from any solid.
 */

const CONCRETE = [0x5d6168, 0x676b72, 0x50545b];
const BRICK = [0x6f4638, 0x7a4e3e, 0x5d3a30];
const TIMBER = [0x6a5035, 0x7a5c3c, 0x4e3a28];
const SHEET = [0x4f5a66, 0x5d6672, 0x6a4a38];
const PIPE = [0x4a5260, 0x5f6772];

/** [surface height, clusters]. */
const LEVELS: ReadonlyArray<readonly [number, number]> = [
  [0, 36],
  [4, 26],
  [8.1, 12],
  [10.8, 12],
];

function scrap(p: Pieces, random: () => number, x: number, z: number): void {
  const pick = <T>(list: readonly T[]): T =>
    list[Math.floor(random() * list.length)];
  const kind = random();

  if (kind < 0.3) {
    p.chunk(x, 0, z, 0.1 + random() * 0.16, pick(CONCRETE), random() * 3);
  } else if (kind < 0.5) {
    // A loose brick, or half of one.
    p.box(
      x,
      0,
      z,
      random() < 0.4 ? 0.11 : 0.22,
      0.07,
      0.105,
      pick(BRICK),
      random() * 3,
    );
  } else if (kind < 0.7) {
    // A snapped board with a split end.
    const length = 0.35 + random() * 0.6;
    const turn = random() * 3;

    p.box(x, 0, z, length, 0.035, 0.09 + random() * 0.05, pick(TIMBER), turn);

    if (random() < 0.5) {
      p.box(
        x + Math.cos(turn) * length * 0.55,
        0,
        z - Math.sin(turn) * length * 0.55,
        0.14,
        0.03,
        0.07,
        pick(TIMBER),
        turn + 0.5,
      );
    }
  } else if (kind < 0.84) {
    // A scrap of sheet metal, one corner lifted.
    p.box(
      x,
      0.012,
      z,
      0.3 + random() * 0.35,
      0.012,
      0.25 + random() * 0.3,
      pick(SHEET),
      random() * 3,
      0.05,
      0.04,
    );
  } else if (kind < 0.94) {
    // A pipe offcut.
    p.bar(x, 0.03, z, 0.3 + random() * 0.4, 0.05, pick(PIPE), random() * 3);
  } else {
    // A cable end with a stripped tail.
    const turn = random() * 3;

    p.cable(x, 0.015, z, 0.5 + random() * 0.5, 0.03, 0x2e3238, turn);
    p.cable(
      x + Math.cos(turn) * 0.3,
      0.012,
      z - Math.sin(turn) * 0.3,
      0.14,
      0.016,
      0xa8602c,
      turn + 0.3,
    );
  }
}

/** Distance from (x, z) to a solid's footprint (0 inside it). */
function footprintDistance(solid: Solid, x: number, z: number): number {
  if (solid.kind === "cylinder") {
    return Math.max(Math.hypot(x - solid.x, z - solid.z) - solid.radius, 0);
  }

  return Math.hypot(
    Math.max(solid.minX - x, 0, x - solid.maxX),
    Math.max(solid.minZ - z, 0, z - solid.maxZ),
  );
}

/**
 * Whether (x, z) is open floor at `level`: the highest surface under it is
 * that level, and no solid that reaches into a body's height is within a metre.
 */
export function openAt(
  solids: Solid[],
  x: number,
  z: number,
  level: number,
  clearance = 1,
): boolean {
  let surface = 0;

  for (const solid of solids) {
    const top = solid.height;
    const bottom = solid.kind === "ramp" ? 0 : (solid.bottom ?? 0);
    const distance = footprintDistance(solid, x, z);

    if (distance === 0 && top <= level + 0.3 && bottom <= level + 0.3) {
      surface = Math.max(surface, top);
    }

    // Anything standing up from this floor, or hanging low over it, is near.
    if (distance < clearance && top > level + 0.08 && bottom < level + 2.2) {
      if (!(distance === 0 && top <= level + 0.3 && bottom <= level + 0.3)) {
        return false;
      }
    }
  }

  return Math.abs(surface - level) < 0.02;
}

export function furnishDebris(map: MapBuilder): void {
  const layout = map.build();
  const solids = allSolids(layout);
  const random = rng(5527);
  const grates = [
    ...ventBlocks(layout.vents),
    ...ventBlocks(layout.upperVents),
  ];

  for (const [level, clusters] of LEVELS) {
    const p = new Pieces();
    let made = 0;

    for (let tries = 0; tries < 4000 && made < clusters; tries++) {
      const x = (random() * 2 - 1) * 30;
      const z = (random() * 2 - 1) * 22;

      // Open floor at this level, nowhere near a solid, outside every room.
      if (
        !openAt(solids, x, z, level) ||
        ventBlocksNear(grates, x, z, 1).length > 0 ||
        layout.rooms.some(
          (r) =>
            r.floorY === level &&
            x > r.minX - 0.3 &&
            x < r.maxX + 0.3 &&
            z > r.minZ - 0.3 &&
            z < r.maxZ + 0.3,
        )
      ) {
        continue;
      }

      // A loose scatter of three to six pieces round the spot.
      const pieces = 3 + Math.floor(random() * 4);

      for (let i = 0; i < pieces; i++) {
        scrap(
          p,
          random,
          x + (random() - 0.5) * 1.3,
          z + (random() - 0.5) * 1.3,
        );
      }

      made++;
    }

    map.createFitting(`debris-${level}`, level, p.elements, []);
  }
}
