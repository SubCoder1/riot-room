import * as THREE from "three";

import type { LightDefinition } from "./ArenaLayout";
import { Pieces } from "./FittingPieces";
import type { MapBuilder } from "./MapParts";
import { GUNMETAL, STEEL_BARE } from "./RoomKit";

/**
 * The Armory's tube lighting: four long steel fluorescent fixtures, one hung
 * under each of the beams across the room. The fixtures are drawn with the
 * room; the tubes themselves are a
 * small emissive mesh (so they glow, and one can dip with its lamp); the light
 * is one spotlight per fixture, each aimed at what it should show.
 *
 * Heights are above the first floor (4 m); the ceiling is 6.5 m up and the
 * beams' undersides 5.9 m.
 */

const FLOOR = 4;

/** How long a tube is, and where the tubes hang (m up from the floor). */
export const TUBE_LENGTH = 2.8;
const CEILING_TUBE_Y = 5.578;

const HOUSING = 0x474d54;
const DARK = 0x1d2024;
const GUARD = 0x24282c;
const RUST = 0x6a4a38;

export interface TubeFixture {
  /** The tube lamp that lights from it. */
  id: string;
  x: number;
  z: number;
}

/** One under each beam, down the middle of the room. */
export const TUBE_FIXTURES: readonly TubeFixture[] = [
  { id: "tube-armory-1", x: -30.2, z: 8.65 },
  { id: "tube-armory-2", x: -27.1, z: 8.65 },
  { id: "tube-armory-3", x: -24.0, z: 8.65 },
  { id: "tube-armory-4", x: -21.1, z: 8.65 },
];

/**
 * The cool, neutral white of a fluorescent tube (a touch green-blue), kept
 * well short of full white. Spotlights, so each lights a cone and not the
 * rooms round it. The first is turned across the bays' faces, the last turned
 * in from the east wall (so it does not spill out through the shutter). The
 * third is the loose one that stutters now and then.
 */
const TUBE_COLOR = 0xd9e6ee;

export const TUBE_LIGHTS: readonly LightDefinition[] = [
  // (Aimed straight down like the others: its beam used to point at the west
  // wall and 80% of it went on through.)
  tubeLamp("tube-armory-1", -30.2, 8.65, { x: -30.2, y: 4, z: 8.65 }, 0.62),
  tubeLamp("tube-armory-2", -27.1, 8.65, { x: -27.1, y: 4, z: 8.65 }, 0.62),
  tubeLamp("tube-armory-3", -24.0, 8.65, { x: -24.0, y: 4, z: 8.65 }, 0.62),
  tubeLamp("tube-armory-4", -21.1, 8.65, { x: -23.6, y: 4, z: 8.65 }, 0.62),
];

function tubeLamp(
  id: string,
  x: number,
  z: number,
  target: { x: number; y: number; z: number },
  angle: number,
): LightDefinition {
  return {
    id,
    x,
    y: FLOOR + CEILING_TUBE_Y - 0.12,
    z,
    color: TUBE_COLOR,
    intensity: 210,
    distance: 13,
    target,
    angle,
  };
}

/** Adds the four tube lamps to the map. */
export function furnishTubeLights(map: MapBuilder): void {
  for (const light of TUBE_LIGHTS) {
    map.addLight({ ...light });
  }
}

/** A fixture hung from a beam: rods, a steel channel, end caps, a wire guard. */
function ceilingFixture(p: Pieces, x: number, z: number, worn: boolean): void {
  const length = TUBE_LENGTH + 0.2;
  const half = length / 2;

  // Two rods up to the beam's underside (5.9), and a clamp at each.
  for (const dz of [-(half - 0.35), half - 0.35]) {
    p.post(x, 5.72, z + dz, 0.19, 0.022, STEEL_BARE);
    p.box(x, 5.86, z + dz, 0.1, 0.04, 0.05, GUNMETAL);
  }

  // The channel the tubes sit in, with a lip down each side.
  p.box(x, 5.62, z, 0.26, 0.1, length, HOUSING);

  for (const side of [-1, 1]) {
    p.box(x + side * 0.125, 5.572, z, 0.016, 0.05, length, HOUSING);
    // End caps holding the tube sockets.
    p.box(x, 5.545, z + side * (half - 0.02), 0.28, 0.175, 0.04, DARK);
  }

  // The wire guard under the tubes: rungs every 0.23 m between two rails.
  const rungs = Math.floor(half / 0.23) - 1;

  for (let k = -rungs; k <= rungs; k++) {
    p.box(x, 5.528, z + k * 0.23, 0.27, 0.012, 0.012, GUARD);
  }

  for (const side of [-1, 1]) {
    p.box(x + side * 0.133, 5.528, z, 0.012, 0.012, length - 0.08, GUARD);
  }

  if (worn) {
    // A rust bloom on the channel where water has run.
    p.box(x + 0.134, 5.63, z - 0.5, 0.004, 0.07, 0.9, RUST);
  }
}

/** The fixtures, hung from the beams. */
export function furnishTubeFixtures(map: MapBuilder, floorY: number): void {
  const p = new Pieces();

  TUBE_FIXTURES.forEach((fixture, index) => {
    ceilingFixture(p, fixture.x, fixture.z, index === 1);
  });

  map.createFitting("armory-tube-fixtures", floorY, p.elements, []);
}

export interface TubeGlow {
  readonly group: THREE.Group;
  /** How lit a fixture's tubes are (1 on, 0 out), by fixture id. */
  setLevel(id: string, level: number): void;
  dispose(): void;
}

/**
 * The tubes: thin emissive cylinders, one instanced mesh for all of them, with
 * a colour each so one can dip with the lamp that stutters, and the painted
 * reflector in each channel, faintly lit by its own tubes (what makes the
 * steel read as a fixture and not as two floating lines).
 */
export function createTubeGlow(): TubeGlow {
  const group = new THREE.Group();
  const geometry = new THREE.CylinderGeometry(0.017, 0.017, TUBE_LENGTH, 8);

  // The tubes lie along z.
  geometry.rotateX(Math.PI / 2);

  const material = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    toneMapped: false,
    fog: false,
  });
  const tubes: Array<{ id: string; x: number; y: number; z: number }> = [];

  for (const fixture of TUBE_FIXTURES) {
    for (const dx of [-0.065, 0.065]) {
      tubes.push({
        id: fixture.id,
        x: fixture.x + dx,
        y: FLOOR + CEILING_TUBE_Y,
        z: fixture.z,
      });
    }
  }

  const matrix = new THREE.Matrix4();
  const color = new THREE.Color();
  const mesh = new THREE.InstancedMesh(geometry, material, tubes.length);

  tubes.forEach((tube, i) => {
    mesh.setMatrixAt(i, matrix.makeTranslation(tube.x, tube.y, tube.z));
    mesh.setColorAt(i, color.setRGB(0.86, 0.93, 0.96));
  });

  mesh.name = "armory-tubes";
  mesh.frustumCulled = false;

  const reflectorGeometry = new THREE.BoxGeometry(
    0.22,
    0.006,
    TUBE_LENGTH + 0.1,
  );
  const reflector = new THREE.InstancedMesh(
    reflectorGeometry,
    material,
    TUBE_FIXTURES.length,
  );
  const REFLECTOR = 0.17;

  TUBE_FIXTURES.forEach((fixture, i) => {
    reflector.setMatrixAt(
      i,
      matrix.makeTranslation(fixture.x, FLOOR + 5.612, fixture.z),
    );
    reflector.setColorAt(
      i,
      color.setRGB(0.86 * REFLECTOR, 0.93 * REFLECTOR, 0.96 * REFLECTOR),
    );
  });

  reflector.name = "armory-tube-reflectors";
  reflector.frustumCulled = false;
  group.add(mesh, reflector);

  const last = new Map<string, number>();

  return {
    group,
    setLevel(id: string, level: number): void {
      if (last.get(id) === level) {
        return;
      }

      last.set(id, level);

      tubes.forEach((tube, i) => {
        if (tube.id === id) {
          mesh.setColorAt(
            i,
            color.setRGB(0.86 * level, 0.93 * level, 0.96 * level),
          );
        }
      });

      TUBE_FIXTURES.forEach((fixture, i) => {
        if (fixture.id === id) {
          reflector.setColorAt(
            i,
            color.setRGB(
              0.86 * level * REFLECTOR,
              0.93 * level * REFLECTOR,
              0.96 * level * REFLECTOR,
            ),
          );
        }
      });

      if (mesh.instanceColor) {
        mesh.instanceColor.needsUpdate = true;
      }

      if (reflector.instanceColor) {
        reflector.instanceColor.needsUpdate = true;
      }
    },
    dispose(): void {
      geometry.dispose();
      reflectorGeometry.dispose();
      material.dispose();
      mesh.dispose();
      reflector.dispose();
      group.removeFromParent();
    },
  };
}
