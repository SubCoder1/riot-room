import * as THREE from "three";

/**
 * A small bundle of dynamite lying on a surface: three red sticks tied with a
 * band of tape and a short fuse out of one end. Its base is at y = 0 and it
 * lies along x, about 0.2 m long.
 */
export function createDynamite(): THREE.Group {
  const group = new THREE.Group();
  const red = new THREE.MeshStandardMaterial({
    color: 0x8f2a22,
    roughness: 0.85,
  });
  const tape = new THREE.MeshStandardMaterial({
    color: 0x9d9478,
    roughness: 0.9,
  });
  const fuse = new THREE.MeshStandardMaterial({
    color: 0x2c2a26,
    roughness: 1,
  });
  const radius = 0.016;
  const stick = new THREE.CylinderGeometry(radius, radius, 0.2, 10);

  stick.rotateZ(Math.PI / 2);

  // Two sticks side by side, one on top between them.
  for (const [y, z] of [
    [radius, -radius * 1.05],
    [radius, radius * 1.05],
    [radius * 2.8, 0],
  ] as const) {
    const mesh = new THREE.Mesh(stick, red);

    mesh.position.set(0, y, z);
    mesh.castShadow = true;
    group.add(mesh);
  }

  const band = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.074, 0.07), tape);

  band.position.set(0, radius * 1.65, 0);
  group.add(band);

  const lead = new THREE.Mesh(
    new THREE.CylinderGeometry(0.003, 0.003, 0.1, 6),
    fuse,
  );

  lead.rotation.z = Math.PI / 2 - 0.35;
  lead.position.set(0.14, radius * 2.8 + 0.018, 0);
  group.add(lead);

  group.name = "dynamite";

  return group;
}
