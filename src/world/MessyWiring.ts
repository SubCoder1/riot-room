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
 * A lead run up a pole the way an electrician on a site does it: it comes up
 * from the floor in a gentle curve, then runs dead straight up the pole,
 * held by a black cable tie every half metre (the cut tails sticking out), a
 * wrap of tape at the lowest tie, and ends in a short slack loop into the
 * lamp head's gland. A spare turn of slack lies at the foot.
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
  // Thick insulated site cable, dark (a reddish one now and then).
  const diameter = 0.03 + random() * 0.006;
  const reach = radius + diameter / 2;
  const angle = random() * Math.PI * 2;
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  const at = (r: number, y: number, side = 0): Vec => [
    cx + ca * r - sa * side,
    y,
    cz + sa * r + ca * side,
  ];
  const lead = random() < 0.7 ? 0x1c1e22 : color;
  const end = Math.max(top - 0.4, 0.8);

  // From the floor, 0.45 m out, curving in to the pole by 0.35 m up.
  const rise: Array<[number, number, number]> = [
    [0.45, 0.015, 0.12],
    [0.3, 0.02, 0.06],
    [0.18, 0.08, 0.03],
    [0.09, 0.2, 0.0],
    [0.03, 0.34, 0.0],
    [0, 0.45, 0],
  ];
  let from = at(reach + rise[0][0], rise[0][1], rise[0][2]);

  for (const [r, y, side] of rise.slice(1)) {
    const to = at(reach + r, y, side);

    wire(p, from, to, diameter, lead);
    from = to;
  }

  // A spare turn of slack at the foot, lying on the floor.
  for (let k = 0; k < 8; k++) {
    const t0 = (k / 8) * Math.PI * 2;
    const t1 = ((k + 1) / 8) * Math.PI * 2;
    const centre = reach + 0.55;

    wire(
      p,
      at(centre + Math.cos(t0) * 0.12, diameter / 2, Math.sin(t0) * 0.12),
      at(centre + Math.cos(t1) * 0.12, diameter / 2, Math.sin(t1) * 0.12),
      diameter,
      lead,
    );
  }

  // Straight up the pole, with a tiny sway so it is not ruler-true.
  let y = 0.45;

  while (y < end) {
    const dy = Math.min(0.5, end - y);
    const to = at(reach, y + dy, (random() - 0.5) * 0.004);

    wire(p, from, to, diameter, lead);
    from = to;
    y += dy;

    // A black cable tie round both pole and lead, its cut tail out.
    if (y < end - 0.05) {
      p.box(
        cx + ca * (reach + 0.004),
        y - 0.012,
        cz + sa * (reach + 0.004),
        0.03,
        0.014,
        0.03,
        0x0e0f11,
        angle,
      );
      p.box(
        cx + ca * (reach + 0.03),
        y - 0.01,
        cz + sa * (reach + 0.03) + 0.01,
        0.04,
        0.006,
        0.008,
        0x0e0f11,
        angle,
      );
    }
  }

  // A band of tape at the first tie.
  p.box(
    cx + ca * (reach + 0.002),
    0.52,
    cz + sa * (reach + 0.002),
    0.05,
    0.06,
    0.05,
    0x14161a,
    angle,
  );

  // The top: the lead leaves the pole in a short loop and goes into the lamp head.
  const loop: Array<[number, number, number]> = [
    [0.05, 0.1, 0.03],
    [0.12, 0.12, 0.07],
    [0.18, 0.05, 0.1],
  ];

  for (const [r, up, side] of loop) {
    const to = at(reach + r, end + up, side);

    wire(p, from, to, diameter, lead);
    from = to;
  }
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
    // A mast's little service platform is not a floor: wiring set out for the
    // floor under a lamp would hang 1.2 m up in the air beside the mast.
    if (/^support-.*-platform/.test(s.id)) {
      continue;
    }

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
  const lamps: LightDefinition[] = nightLights(layout).filter(
    // (A hanging bulb has its own wiring, on the wall: see JunkRoom.)
    (l) => l.target && !l.id.startsWith("bulb-"),
  );
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

    // The walkway masts and the spawn lamp posts have their own clamped run
    // from their junction box up the front (see PowerGrid): a second lead
    // wound on a spot beside the mast hung loose in the air.
    const hasOwnRun = /^light-(support-|lamp-spawn)/.test(lamp.id);

    if (!wrapped.has(key) && !hasOwnRun) {
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

    // A taped-up junction and a loose plug on the floor. (Both must be on the
    // floor the lamp's own level is, with a hand's margin: a lamp over a
    // platform's edge put them past it, hanging in the air. Pulled toward the
    // lamp until they are on it, or left out; the random draws stay the same.)
    const junctionTurn = random() * 3;
    const lidTurn = random() * 3;
    const plugTurn = random() * 3;
    const fits = (k: number): boolean =>
      [
        [fx + 0.3, fz - 0.2],
        [fx - 0.35, fz + 0.3],
      ].every(([x, z]) =>
        [
          [0, 0],
          [0.15, 0],
          [-0.15, 0],
          [0, 0.15],
          [0, -0.15],
        ].every(([dx, dz]) =>
          onLevel(level)(
            lamp.x + (x - lamp.x) * k + dx,
            lamp.z + (z - lamp.z) * k + dz,
          ),
        ),
      );
    const shrink = [1, 0.7, 0.4, 0.15].find(fits);

    if (shrink !== undefined) {
      const jx = lamp.x + (fx + 0.3 - lamp.x) * shrink;
      const jz = lamp.z + (fz - 0.2 - lamp.z) * shrink;
      const gx = lamp.x + (fx - 0.35 - lamp.x) * shrink;
      const gz = lamp.z + (fz + 0.3 - lamp.z) * shrink;

      p.box(jx, 0, jz, 0.18, 0.1, 0.12, GUNMETAL, junctionTurn);
      p.box(jx, 0.1, jz, 0.2, 0.02, 0.14, 0x14161a, lidTurn);
      p.box(gx, 0, gz, 0.07, 0.04, 0.05, STEEL_BARE, plugTurn);
    }
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
