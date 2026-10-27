import * as THREE from "three";

/**
 * A bundle of four dynamite sticks lying on a surface, two over two, held by a
 * worn paper strap with a short fuse out of one end. Its base is at y = 0 and
 * it lies along x, about 0.22 m long. Plain flat-shaded colours (a slightly
 * different red for each stick, darker ends, a stained strap): no textures.
 */

const RADIUS = 0.018;
const LENGTH = 0.22;
const STICK_REDS = [0x8f2a22, 0x9a3026, 0x852720, 0x923025];
const END_DARK = 0x4a1814;
const STRAP = 0x8a8266;
const STRAP_STAIN = 0x5e5844;
const FUSE = 0x2a2824;

function material(color: number, roughness = 0.85): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness });
}

export function createDynamite(): THREE.Group {
  const group = new THREE.Group();
  const stick = new THREE.CylinderGeometry(RADIUS, RADIUS, LENGTH, 10);
  const cap = new THREE.CylinderGeometry(
    RADIUS * 1.012,
    RADIUS * 1.012,
    0.016,
    10,
  );

  stick.rotateZ(Math.PI / 2);
  cap.rotateZ(Math.PI / 2);

  // Two sticks side by side, two more on top between and over them (a square
  // bundle, never perfectly even: each stick sits a hair off its neighbour).
  const lanes = [
    [RADIUS, -RADIUS * 1.03, 0.004],
    [RADIUS, RADIUS * 1.03, -0.003],
    [RADIUS * 2.95, -RADIUS * 1.03, -0.002],
    [RADIUS * 2.95, RADIUS * 1.03, 0.005],
  ] as const;

  lanes.forEach(([y, z, slip], i) => {
    const mesh = new THREE.Mesh(stick, material(STICK_REDS[i]));

    mesh.position.set(slip, y, z);
    mesh.castShadow = true;
    group.add(mesh);

    // Darker, grimy ends where the paper is cut and handled.
    for (const end of [-1, 1]) {
      const dark = new THREE.Mesh(cap, material(END_DARK, 0.95));

      dark.position.set(slip + end * (LENGTH / 2 - 0.007), y, z);
      group.add(dark);
    }
  });

  // The strap: a band of old paper tape right round the bundle, stained at
  // its edges, with a second narrower turn near one end and a loose tail
  // lying on the table.
  const height = RADIUS * 3.95;
  const width = RADIUS * 4.1;
  const mid = height / 2;
  const band = new THREE.Mesh(
    new THREE.BoxGeometry(0.034, height + 0.006, width + 0.006),
    material(STRAP, 0.95),
  );

  band.position.set(0.004, mid, 0);
  band.rotation.y = 0.04;
  group.add(band);

  for (const side of [-1, 1]) {
    const stain = new THREE.Mesh(
      new THREE.BoxGeometry(0.006, height + 0.008, width + 0.008),
      material(STRAP_STAIN, 1),
    );

    stain.position.set(0.004 + side * 0.0145, mid, 0);
    stain.rotation.y = 0.04;
    group.add(stain);
  }

  const turn = new THREE.Mesh(
    new THREE.BoxGeometry(0.014, height + 0.004, width + 0.004),
    material(STRAP_STAIN, 1),
  );

  turn.position.set(-0.07, mid, 0);
  group.add(turn);

  const tail = new THREE.Mesh(
    new THREE.BoxGeometry(0.036, 0.003, 0.012),
    material(STRAP, 0.95),
  );

  tail.position.set(0.02, 0.0015, width / 2 + 0.018);
  tail.rotation.y = -0.35;
  group.add(tail);

  // The fuse comes out of the middle of one end and rises a little.
  const length = 0.09;
  const lead = new THREE.CylinderGeometry(0.0035, 0.0035, length, 6);

  lead.translate(0, length / 2, 0);

  const fuse = new THREE.Mesh(lead, material(FUSE, 1));

  fuse.position.set(LENGTH / 2 + 0.002, mid, 0);
  fuse.rotation.z = -(Math.PI / 2 - 0.22);
  group.add(fuse);

  group.name = "dynamite";

  return group;
}
