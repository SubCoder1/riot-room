import * as THREE from "three";

import type { LightDefinition } from "./ArenaLayout";
import { Pieces } from "./FittingPieces";
import type { MapBuilder } from "./MapParts";
import { BLACK, GUNMETAL, STEEL_BARE } from "./RoomKit";

/**
 * Tube lights hung on cables, as in the Armory but slung from the roof: in the
 * Warehouse, two fixtures on long cables, one each side of its middle, each a
 * steel channel with two tubes under a wire guard. They replace the two work
 * lamps. The tubes themselves are a small emissive mesh; the light is one
 * spotlight each, aimed down (no halogen head, no moths: see `Arena`).
 *
 * Heights are above the first floor (4 m).
 */

const FLOOR = 4;
/** How long a tube is (m), and where a fixture's tubes hang (above the floor). */
const TUBE_LENGTH = 2.3;
const TUBE_Y = 3.9;
/** What the fixtures hang from: the roof's underside over the Warehouse. */
const BEAM_Y = 6.45;
const TUBE_COLOR = 0xe0e8ee;
const HOUSING = 0x474d54;
const DARK = 0x1d2024;
const GUARD = 0x24282c;

export interface HangingTube {
  id: string;
  x: number;
  z: number;
}

/** The Warehouse's two: one on the left and one on the right of its middle (across z), both along x. */
export const WAREHOUSE_TUBES: readonly HangingTube[] = [
  { id: "tube-warehouse-1", x: 24.8, z: 15.0 },
  { id: "tube-warehouse-2", x: 24.8, z: 21.4 },
];

/** The spotlight of each: straight down, wide enough to light its bay. */
export const WAREHOUSE_TUBE_LIGHTS: readonly LightDefinition[] =
  WAREHOUSE_TUBES.map((tube) => ({
    id: tube.id,
    x: tube.x,
    y: FLOOR + TUBE_Y - 0.1,
    z: tube.z,
    color: TUBE_COLOR,
    intensity: 200,
    distance: 11,
    target: { x: tube.x, y: FLOOR, z: tube.z },
    angle: 0.95,
  }));

/** A fixture slung on two cables: a channel, end caps, a wire guard, a pair of cables up to the beam. */
function hangingFixture(p: Pieces, x: number, z: number): void {
  const length = TUBE_LENGTH + 0.2;
  const half = length / 2;

  // The channel (along x) and its lips, and the end caps that hold the tubes.
  p.box(x, TUBE_Y + 0.04, z, length, 0.1, 0.26, HOUSING);

  for (const side of [-1, 1]) {
    p.box(x, TUBE_Y - 0.01, z + side * 0.125, length, 0.05, 0.016, HOUSING);
    p.box(x + side * (half - 0.02), TUBE_Y - 0.035, z, 0.04, 0.175, 0.28, DARK);
  }

  // The wire guard under the tubes: rungs across it between two rails.
  const rungs = Math.floor(half / 0.23) - 1;

  for (let k = -rungs; k <= rungs; k++) {
    p.box(x + k * 0.23, TUBE_Y - 0.075, z, 0.012, 0.012, 0.27, GUARD);
  }

  for (const side of [-1, 1]) {
    p.box(
      x,
      TUBE_Y - 0.075,
      z + side * 0.133,
      length - 0.08,
      0.012,
      0.012,
      GUARD,
    );
  }

  // Two cables up to the beam, each to a clamp on the fixture and a plate on
  // the beam.
  for (const side of [-1, 1]) {
    const cx = x + side * (half - 0.3);

    p.box(cx, TUBE_Y + 0.14, z, 0.1, 0.04, 0.05, GUNMETAL);
    p.cableUp(cx, TUBE_Y + 0.17, z, BEAM_Y - TUBE_Y - 0.17, 0.018, BLACK);
    p.box(cx, BEAM_Y - 0.03, z, 0.1, 0.03, 0.1, STEEL_BARE);
  }

  // A short lead from the middle of the channel to the beam.
  p.cable(x, TUBE_Y + 0.2, z, 0.3, 0.014, BLACK, 0, 0.9);
}

/** The fixtures and their lamps, in the Warehouse. */
export function furnishHangingTubes(map: MapBuilder, floorY: number): void {
  const p = new Pieces();

  for (const tube of WAREHOUSE_TUBES) {
    hangingFixture(p, tube.x, tube.z);
  }

  map.createFitting("warehouse-hanging-tubes", floorY, p.elements, []);

  for (const light of WAREHOUSE_TUBE_LIGHTS) {
    map.addLight({ ...light });
  }
}

export interface HangingTubeGlow {
  group: THREE.Group;
  /** How lit one fixture's tubes are (0 = dark, 1 = full): its lamp's level. */
  setLevel(id: string, level: number): void;
  dispose(): void;
}

/** The tubes themselves: a small emissive mesh, two to a fixture, each lit full. */
export function createHangingTubeGlow(): HangingTubeGlow {
  const group = new THREE.Group();
  const geometry = new THREE.CylinderGeometry(0.017, 0.017, TUBE_LENGTH, 8);

  // The tubes lie along x.
  geometry.rotateZ(Math.PI / 2);

  const material = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    toneMapped: false,
    fog: false,
  });
  const mesh = new THREE.InstancedMesh(
    geometry,
    material,
    WAREHOUSE_TUBES.length * 2,
  );
  const matrix = new THREE.Matrix4();
  const color = new THREE.Color(0.88, 0.93, 0.96);
  let i = 0;

  for (const tube of WAREHOUSE_TUBES) {
    for (const dz of [-0.065, 0.065]) {
      mesh.setMatrixAt(
        i,
        matrix.makeTranslation(tube.x, FLOOR + TUBE_Y - 0.02, tube.z + dz),
      );
      mesh.setColorAt(i, color);
      i++;
    }
  }

  mesh.name = "warehouse-tubes";
  mesh.frustumCulled = false;
  group.add(mesh);

  return {
    group,
    setLevel(id: string, level: number): void {
      const k = WAREHOUSE_TUBES.findIndex((tube) => tube.id === id);

      if (k < 0) {
        return;
      }

      const lit = THREE.MathUtils.clamp(level, 0, 1);

      for (const i of [k * 2, k * 2 + 1]) {
        mesh.setColorAt(i, color.setRGB(0.88 * lit, 0.93 * lit, 0.96 * lit));
      }

      if (mesh.instanceColor) {
        mesh.instanceColor.needsUpdate = true;
      }
    },
    dispose(): void {
      geometry.dispose();
      material.dispose();
      mesh.dispose();
      group.removeFromParent();
    },
  };
}
