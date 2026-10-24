import {
  allSolids,
  type ArenaLayout,
  type LightDefinition,
  type Solid,
} from "./ArenaLayout";
import { Pieces, rng } from "./FittingPieces";
import type { MapBuilder } from "./MapParts";
import { nightLights, WALL_LAMPS } from "./NightLights";
import { GUNMETAL, STEEL_BARE } from "./RoomKit";

/**
 * The temporary wiring round every halogen: a site installation put up in a
 * hurry. Loose cables sprawl over the floor from each foot, cross and double
 * back, and wind round the pole up to the lamp head in
 * loose turns. Red leads are everywhere, there are no clips or trays, and the joints
 * are wrapped in tape. Drawn only and kept close to the floor, so it never
 * trips or stops anything.
 */

const RED = [0xb02a22, 0xb02a22, 0xb02a22, 0x7a1f1a];
const OTHER = [0x1c1e22, 0x2e3238, 0xc8742a, 0xc9a43a, 0x6a7078];

type Vec = [number, number, number];

/** A cable between two points in space (the floor is y = 0). */
function wire(
  p: Pieces,
  a: Vec,
  b: Vec,
  diameter: number,
  color: number,
): void {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  const length = Math.hypot(dx, dy, dz);

  if (length < 0.04) {
    return;
  }

  p.cable(
    (a[0] + b[0]) / 2,
    (a[1] + b[1]) / 2,
    (a[2] + b[2]) / 2,
    // A touch long, so neighbouring pieces meet at a bend with no gap.
    length * 1.05,
    diameter,
    color,
    -Math.atan2(dz, dx),
    Math.atan2(dy, Math.hypot(dx, dz)),
  );
}

/** A cable that wanders over the floor from (x, z), turning as it goes. */
function sprawl(
  p: Pieces,
  random: () => number,
  x: number,
  z: number,
  color: number,
  steps: number,
  layer: number,
  onFloor: (x: number, z: number) => boolean,
): void {
  const diameter = 0.02 + random() * 0.012;
  let heading = random() * Math.PI * 2;
  // How fast the lead is curving: it drifts, so the run bends smoothly.
  let curve = (random() - 0.5) * 0.3;
  let cx = x;
  let cz = z;
  // Cables lie over one another: each sits a little higher than the last.
  const y = diameter / 2 + layer * 0.02;

  for (let i = 0; i < steps * 4; i++) {
    curve = Math.max(-0.3, Math.min(0.3, curve + (random() - 0.5) * 0.14));
    heading += curve;

    const length = 0.16 + random() * 0.1;
    const nx = cx + Math.cos(heading) * length;
    const nz = cz + Math.sin(heading) * length;

    // A lead never runs off the edge of the floor it lies on.
    if (!onFloor(nx, nz)) {
      break;
    }

    wire(p, [cx, y, cz], [nx, y, nz], diameter, color);
    cx = nx;
    cz = nz;
  }

  // The end is left bare: a short stripped tail.
  p.cable(cx, y, cz, 0.1, 0.01, 0xa8602c, -heading + 0.3);
}

/**
 * A lead run up a pole and kept against it: sometimes wound round in uneven
 * turns, sometimes running straight up for a stretch, now and then a tight
 * few turns of tape-like wrapping, and it ends short of the lamp head, still
 * on the pole.
 */
function wrapPole(
  p: Pieces,
  random: () => number,
  cx: number,
  cz: number,
  top: number,
  radius: number,
  color: number,
): void {
  const diameter = 0.02 + random() * 0.006;
  const reach = radius + diameter / 2;
  // Runs right up to the lamp's arm, ending a hand below it.
  const end = Math.max(top - 0.35, 0.6);
  const step = 0.06;
  let y = 0.15;
  let angle = random() * Math.PI * 2;
  let from: Vec = [
    cx + Math.cos(angle) * (reach + 0.05),
    y,
    cz + Math.sin(angle) * (reach + 0.05),
  ];
  let mode: "wind" | "straight" | "tight" = "wind";
  let left = 0.3 + random() * 0.7;
  let rate = 0;

  const pick = (): void => {
    const roll = random();

    mode = roll < 0.5 ? "wind" : roll < 0.8 ? "straight" : "tight";
    // How fast it turns, in radians per metre of height, and which way.
    rate =
      mode === "wind"
        ? (3 + random() * 9) * (random() < 0.5 ? 1 : -1)
        : mode === "tight"
          ? (30 + random() * 20) * (random() < 0.5 ? 1 : -1)
          : (random() - 0.5) * 1.2;
    left = mode === "tight" ? 0.12 + random() * 0.2 : 0.3 + random() * 1.1;
  };

  pick();

  while (y < end) {
    // Never turn more than ~0.3 rad in one piece, so a bend stays smooth.
    const dy = Math.min(step, end - y, 0.3 / Math.max(Math.abs(rate), 1));

    y += dy;
    angle += rate * dy;

    const r = reach + (random() - 0.5) * 0.008;
    const to: Vec = [cx + Math.cos(angle) * r, y, cz + Math.sin(angle) * r];

    wire(p, from, to, diameter, color);
    from = to;
    left -= dy;

    if (left <= 0) {
      pick();
    }
  }

  // The end is left bare, pressed to the pole.
  p.cable(
    from[0],
    from[1] + 0.05,
    from[2],
    0.1,
    0.01,
    0xa8602c,
    0,
    Math.PI / 2,
  );
}

/** The pole a lamp hangs on: its fitting's collider, or the lamp itself. */
export function poleOf(
  layout: ArenaLayout,
  lamp: LightDefinition,
): { x: number; z: number; radius: number } {
  const id = lamp.id.replace(/^light-/, "");
  // The pole is the first collider of the lamp's fitting (`<fitting>-1`); a
  // lamp with two heads is named `<fitting>-<head>`.
  const names = [`${id}-1`, `${id.replace(/-\d+$/, "")}-1`];
  const box = layout.walls.find(
    (w) => names.includes(w.id) && w.maxX - w.minX < 1.5,
  );

  if (!box) {
    return { x: lamp.x, z: lamp.z, radius: 0.12 };
  }

  return {
    x: (box.minX + box.maxX) / 2,
    z: (box.minZ + box.maxZ) / 2,
    // The visible mast is thin: the collider round it is wider than the steel.
    radius: 0.11,
  };
}

/** The floor under a spot: the highest surface below `maxY` that holds it. */
function floorUnder(
  solids: Solid[],
  x: number,
  z: number,
  maxY: number,
): number {
  let floor = 0;

  for (const s of solids) {
    const inside =
      s.kind === "cylinder"
        ? Math.hypot(x - s.x, z - s.z) <= s.radius
        : x >= s.minX && x <= s.maxX && z >= s.minZ && z <= s.maxZ;

    if (inside && s.height <= maxY && s.height > floor) {
      floor = s.height;
    }
  }

  return floor;
}

export function furnishMessyWiring(map: MapBuilder): void {
  const layout = map.build();
  const solids = allSolids(layout);
  const random = rng(7741);
  // Only lamps that are up and lit get wiring (a lamp taken down has none).
  const lamps: LightDefinition[] = nightLights(layout).filter((l) => l.target);
  const byLevel = new Map<number, Pieces>();
  const wrapped = new Set<string>();
  const piecesAt = (level: number): Pieces => {
    let p = byLevel.get(level);

    if (!p) {
      p = new Pieces();
      byLevel.set(level, p);
    }

    return p;
  };
  const onLevel =
    (level: number) =>
    (x: number, z: number): boolean =>
      Math.abs(floorUnder(solids, x, z, level + 0.4) - level) < 0.02;
  const pickRed = (): number => RED[Math.floor(random() * RED.length)];
  const pickAny = (): number =>
    random() < 0.6 ? pickRed() : OTHER[Math.floor(random() * OTHER.length)];

  for (const lamp of lamps) {
    // A lamp bolted to a wall has its own cable run (RoofWiring), and a tube
    // light hangs in a fixture with its own conduit (ArmoryLighting): neither
    // has a pole to wind a lead round.
    if (WALL_LAMPS[lamp.id] || lamp.id.startsWith("tube-")) {
      continue;
    }

    const level = floorUnder(solids, lamp.x, lamp.z, lamp.y - 1);
    const p = piecesAt(level);
    // Round the foot: a few runs sprawling out, a coil, and a couple of drapes.
    const fx = lamp.x + (random() - 0.5) * 0.5;
    const fz = lamp.z + (random() - 0.5) * 0.5;
    const height = Math.min(lamp.y - level, 5);

    // One lead wound up the pole to the lamp head (a second on some poles),
    // once per pole: lamps that share a pole share its wiring.
    const pole = poleOf(layout, lamp);
    const key = `${pole.x.toFixed(1)},${pole.z.toFixed(1)}`;

    if (!wrapped.has(key)) {
      wrapped.add(key);
      wrapPole(p, random, pole.x, pole.z, height, pole.radius, pickRed());

      if (random() < 0.0) {
        wrapPole(
          p,
          random,
          pole.x,
          pole.z,
          height,
          pole.radius + 0.02,
          pickAny(),
        );
      }
    }

    // A taped-up junction and a loose plug on the floor.
    p.box(fx + 0.3, 0, fz - 0.2, 0.18, 0.1, 0.12, GUNMETAL, random() * 3);
    p.box(fx + 0.3, 0.1, fz - 0.2, 0.2, 0.02, 0.14, 0x14161a, random() * 3);
    p.box(fx - 0.35, 0, fz + 0.3, 0.07, 0.04, 0.05, STEEL_BARE, random() * 3);
  }

  // Red leads all over, in a few places: nests of spaghetti with no plan.
  const patches = 0;

  for (let k = 0; k < patches; k++) {
    const lamp = lamps[Math.floor(random() * lamps.length)];
    const level = floorUnder(solids, lamp.x, lamp.z, lamp.y - 1);
    const p = piecesAt(level);
    const px = lamp.x + (random() - 0.5) * 5;
    const pz = lamp.z + (random() - 0.5) * 5;

    // Only where it is the same floor the lamp stands on.
    if (Math.abs(floorUnder(solids, px, pz, level + 0.4) - level) > 0.02) {
      continue;
    }

    for (let i = 0; i < 2; i++) {
      sprawl(
        p,
        random,
        px,
        pz,
        random() < 0.75 ? pickRed() : pickAny(),
        3,
        i % 4,
        onLevel(level),
      );
    }
  }

  for (const [level, p] of byLevel) {
    map.createFitting(`messy-wiring-${level}`, level, p.elements, []);
  }
}
