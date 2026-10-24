import { Pieces } from "./FittingPieces";
import type { MapBuilder } from "./MapParts";
import { EXTRA_LAMPS } from "./NightLights";
import { CHARCOAL, GUNMETAL, RUST, STEEL_BARE } from "./RoomKit";

/**
 * The wiring behind the rooftop halogens: each stands on a base plate with a
 * junction box, its cable climbs the mast beside it, and the power comes along
 * the roof in clipped runs to a feed box. Drawn only (it lies flat, so nothing
 * trips on it).
 */

const CABLE = 0x3a3f47;
const CABLE_RED = 0xa03a30;

type XZ = [number, number];

/** A cable laid straight between points on the roof, with clips along it. */
function run(p: Pieces, points: XZ[], diameter: number, color: number): void {
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, az] = points[i];
    const [bx, bz] = points[i + 1];
    const length = Math.hypot(bx - ax, bz - az);

    if (length < 0.05) {
      continue;
    }

    p.cable(
      (ax + bx) / 2,
      diameter / 2,
      (az + bz) / 2,
      length,
      diameter,
      color,
      -Math.atan2(bz - az, bx - ax),
    );

    // Clips every metre, and a small round joint at each bend.
    for (let t = 0.5; t < length; t += 1) {
      const x = ax + ((bx - ax) * t) / length;
      const z = az + ((bz - az) * t) / length;

      p.box(
        x,
        0,
        z,
        0.07,
        diameter + 0.012,
        0.07,
        GUNMETAL,
        -Math.atan2(bz - az, bx - ax),
      );
    }

    p.chunk(bx, 0, bz, diameter * 1.6, color);
  }
}

function feedBox(p: Pieces, x: number, z: number): void {
  p.box(x, 0, z, 0.55, 0.38, 0.22, CHARCOAL);
  p.box(x, 0.38, z, 0.6, 0.03, 0.26, GUNMETAL);
  p.box(x, 0.2, z - 0.115, 0.2, 0.14, 0.012, STEEL_BARE);
  p.box(x - 0.14, 0.36, z - 0.115, 0.03, 0.03, 0.01, RUST);
}

export function furnishRoofWiring(map: MapBuilder): void {
  const lamps = EXTRA_LAMPS.filter((l) => l.id.startsWith("halogen-roof"));
  const byRoof = new Map<number, typeof lamps>();

  for (const lamp of lamps) {
    const roof = lamp.target?.y ?? 0;

    byRoof.set(roof, [...(byRoof.get(roof) ?? []), lamp]);
  }

  for (const [roof, group] of byRoof) {
    const p = new Pieces();

    for (const lamp of group) {
      // The foot of the mast: a base plate with bolts, and a junction box.
      p.box(lamp.x, 0, lamp.z, 0.45, 0.04, 0.45, GUNMETAL);

      for (const [dx, dz] of [
        [-0.17, -0.17],
        [0.17, -0.17],
        [-0.17, 0.17],
        [0.17, 0.17],
      ]) {
        p.chunk(lamp.x + dx, 0.04, lamp.z + dz, 0.04, STEEL_BARE);
      }

      p.box(lamp.x + 0.42, 0, lamp.z + 0.05, 0.3, 0.24, 0.2, CHARCOAL);
      p.box(lamp.x + 0.42, 0.24, lamp.z + 0.05, 0.33, 0.025, 0.23, GUNMETAL);

      // Its lead up the mast to the lamp, held by a clamp every metre.
      const height = lamp.y - roof - 0.3;

      p.cableUp(lamp.x + 0.09, 0.05, lamp.z, height, 0.035, CABLE);

      for (let y = 0.6; y < height; y += 1) {
        p.box(lamp.x + 0.07, y, lamp.z, 0.07, 0.05, 0.07, GUNMETAL);
      }

      // From the junction box a short lead to the feed run.
      p.cable(
        lamp.x + 0.42,
        0.12,
        lamp.z + 0.3,
        0.4,
        0.03,
        CABLE,
        0,
        0,
        Math.PI / 2,
      );
    }

    if (group.length >= 2) {
      // The main run joins the lamps along the roof and meets a feed box.
      const a = group[0];
      const b = group[group.length - 1];
      const z = Math.max(a.z, b.z) + 0.8;
      const mid = (a.x + b.x) / 2;

      run(
        p,
        [
          [a.x + 0.42, a.z + 0.4],
          [a.x + 0.42, z],
          [mid, z],
        ],
        0.04,
        CABLE,
      );
      run(
        p,
        [
          [b.x + 0.42, b.z + 0.4],
          [b.x + 0.42, z],
          [mid, z],
        ],
        0.04,
        CABLE,
      );
      run(
        p,
        [
          [mid, z],
          [mid, z - 0.6],
        ],
        0.03,
        CABLE_RED,
      );
      feedBox(p, mid, z + 0.1);
    } else {
      // One lamp alone: its run goes to a feed box a few metres off.
      const lamp = group[0];

      run(
        p,
        [
          [lamp.x + 0.42, lamp.z + 0.4],
          [lamp.x + 0.42, lamp.z + 1.3],
          [lamp.x + 3.2, lamp.z + 1.3],
        ],
        0.04,
        CABLE,
      );
      feedBox(p, lamp.x + 3.35, lamp.z + 1.3);
    }

    map.createFitting(`roof-wiring-${roof}`, roof, p.elements, []);
  }

  furnishWallLampWiring(map);
}

/**
 * The cable of a wall-mounted halogen: out of the back plate, up the wall's
 * face under clips, over the top and down the far side to a junction box on
 * the roof, and from there along the roof to a feed box.
 */
function furnishWallLampWiring(map: MapBuilder): void {
  const lamp = EXTRA_LAMPS.find((l) => l.id === "halogen-wall-storage");

  if (!lamp) {
    return;
  }

  const roof = 8.1;
  const face = lamp.x - 0.36 + 0.04;
  const back = face - 0.46;
  const top = 1.9;
  const p = new Pieces();
  const up = lamp.y - roof - 0.2;

  // Up the face from the plate, across the wall top, down the yard side.
  p.cableUp(face, up, lamp.z, top - up + 0.04, 0.03, CABLE);
  p.cable((face + back) / 2, top + 0.03, lamp.z, face - back, 0.03, CABLE);
  p.cableUp(back, 0.3, lamp.z, top - 0.3, 0.03, CABLE);

  for (const y of [up + 0.2, up + 0.6, 0.6, 1.2]) {
    const x = y > top - 0.1 || y < up ? back : face;

    p.box(x, y, lamp.z - 0.035, 0.05, 0.07, 0.07, GUNMETAL);
  }

  // The junction box at the foot of the wall, and a clipped run to a feed box.
  p.box(back - 0.1, 0, lamp.z - 0.1, 0.18, 0.3, 0.2, CHARCOAL);
  p.box(back - 0.1, 0.3, lamp.z - 0.1, 0.2, 0.025, 0.22, GUNMETAL);
  run(
    p,
    [
      [back - 0.1, lamp.z],
      [back - 0.1, lamp.z - 1.5],
      [back - 2.4, lamp.z - 1.5],
    ],
    0.035,
    CABLE,
  );
  feedBox(p, back - 2.55, lamp.z - 1.5);

  map.createFitting("roof-wiring-wall-lamp", roof, p.elements, []);
}
