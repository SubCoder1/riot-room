import * as THREE from "three";

import { LAMP } from "./NightLights";

/**
 * What lights up in the Ruins' chamber, drawn like the Armory's tubes: small
 * emissive meshes (not lit, so they read as lit in the dark) at the fixtures
 * RuinsChamber hangs, with the lamps in NightLights doing the real lighting.
 * Always on (the chamber's lamps are on neither generator circuit).
 */
export interface ChamberGlow {
  group: THREE.Group;
  /** How lit the Power Room's emergency lamp is (0 out, 1 on). */
  setEmergency(level: number): void;
  dispose(): void;
}

export function createChamberGlow(): ChamberGlow {
  const group = new THREE.Group();
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  const material = (color: number): THREE.MeshBasicMaterial => {
    const m = new THREE.MeshBasicMaterial({
      color,
      toneMapped: false,
      fog: false,
    });

    materials.push(m);

    return m;
  };
  const add = (
    geometry: THREE.BufferGeometry,
    color: number,
    parent: THREE.Object3D,
    x: number,
    y: number,
    z: number,
  ): void => {
    geometries.push(geometry);

    const mesh = new THREE.Mesh(geometry, material(color));

    mesh.position.set(x, y, z);
    mesh.frustumCulled = false;
    parent.add(mesh);
  };

  // The old double fluorescent fixture over the hall, hanging crooked from
  // one chain (x 22.4, 3.08 up, z 0.3, tilted 0.18 about z): two tubes under it.
  const fixture = new THREE.Group();

  fixture.position.set(22.4, 3.08, 0.3);
  fixture.rotation.z = 0.1;

  for (const dz of [-0.09, 0.09]) {
    const tube = new THREE.CylinderGeometry(0.02, 0.02, 2.2, 8);

    tube.rotateZ(Math.PI / 2);
    add(tube, 0xdcebf2, fixture, 0, -0.065, dz);
  }

  // The painted reflector in the channel, faintly lit by its own tubes.
  add(new THREE.BoxGeometry(2.3, 0.006, 0.26), 0x2e3234, fixture, 0, -0.052, 0);

  group.add(fixture);

  // The vestibule's emergency lamp: a warm bulb in its cage.
  add(
    new THREE.SphereGeometry(0.095, 14, 10),
    0xffb060,
    group,
    23.7,
    3.46,
    -9.6,
  );

  // The far end's emergency lamp: a deep red bulb in its guard over the way up
  // to the enclosure (always on: it is on no circuit).
  add(new THREE.SphereGeometry(0.085, 14, 10), LAMP.red, group, 24.0, 3.2, 8.9);

  // The two wall fixtures either side of the enclosure's approach.
  for (const x of [21.03, 26.97]) {
    add(new THREE.SphereGeometry(0.06, 12, 8), LAMP.red, group, x, 2.24, 8.1);
  }

  // The Power Room's emergency lamp: a steel plate on the ceiling, a six-bar
  // wire guard and a red bulb. It glows only while the interior circuit is out
  // (see `setEmergency`, driven by the lamp's level in Arena).
  const bulbMaterial = material(LAMP.red);
  const bulbGeometry = new THREE.SphereGeometry(0.09, 14, 10);
  const steel = new THREE.MeshStandardMaterial({
    color: 0x2a2e34,
    roughness: 0.6,
    metalness: 0.5,
  });
  const plate = new THREE.CylinderGeometry(0.17, 0.17, 0.06, 16);
  const bar = new THREE.BoxGeometry(0.02, 0.5, 0.02);

  geometries.push(bulbGeometry, plate, bar);
  materials.push(steel);

  const px = 6.0;
  const pz = -21.4;
  const ceilingTop = 7.8;
  const bulb = new THREE.Mesh(bulbGeometry, bulbMaterial);

  bulb.position.set(px, 7.2, pz);
  bulb.frustumCulled = false;
  group.add(bulb);

  const cap = new THREE.Mesh(plate, steel);

  cap.position.set(px, ceilingTop - 0.03, pz);
  group.add(cap);

  for (let k = 0; k < 6; k++) {
    const angle = (k / 6) * Math.PI * 2;
    const b = new THREE.Mesh(bar, steel);

    b.position.set(
      px + Math.cos(angle) * 0.13,
      ceilingTop - 0.31,
      pz + Math.sin(angle) * 0.13,
    );
    group.add(b);
  }

  const dark = new THREE.Color(0x1a0907);
  const lit = new THREE.Color(LAMP.red);

  bulbMaterial.color.copy(dark);

  // The transformer's indicator lamps, and one on each of two cabinets.
  for (const [x, color] of [
    [23.5, 0x3aff8a],
    [23.7, 0x3aff8a],
    [24.1, 0xffa030],
    [24.5, 0xff3a2a],
  ] as const) {
    add(new THREE.BoxGeometry(0.07, 0.07, 0.02), color, group, x, 1.28, 10.17);
  }

  add(
    new THREE.BoxGeometry(0.02, 0.07, 0.07),
    0xffa030,
    group,
    29.14,
    1.19,
    -5.63,
  );
  add(
    new THREE.BoxGeometry(0.02, 0.07, 0.07),
    0xff3a2a,
    group,
    29.14,
    1.19,
    -3.43,
  );

  // Cyan tube fixtures over the collapsed floor inside the Ruins: three
  // two-tube fluorescent fixtures screwed flat to the roof, a steel channel
  // with a painted reflector and end caps (like the Armory's), along x.
  for (const x of [24.4, 27.5, 30.4]) {
    const top = 10.5;
    const z = -19.8;
    const length = 1.5;
    const channel = new THREE.BoxGeometry(length + 0.1, 0.05, 0.26);
    const reflector = new THREE.BoxGeometry(length, 0.006, 0.22);
    const cap = new THREE.BoxGeometry(0.04, 0.07, 0.26);

    geometries.push(channel, reflector, cap);

    const steel = new THREE.MeshStandardMaterial({
      color: 0x30353b,
      roughness: 0.6,
      metalness: 0.5,
    });

    materials.push(steel);

    const body = new THREE.Mesh(channel, steel);

    body.position.set(x, top - 0.025, z);
    group.add(body);

    for (const dx of [-length / 2 - 0.03, length / 2 + 0.03]) {
      const c = new THREE.Mesh(cap, steel);

      c.position.set(x + dx, top - 0.04, z);
      group.add(c);
    }

    add(reflector, 0x2c3a40, group, x, top - 0.054, z);

    for (const dz of [-0.065, 0.065]) {
      const tube = new THREE.CylinderGeometry(0.018, 0.018, length - 0.1, 8);

      tube.rotateZ(Math.PI / 2);
      add(tube, 0x9fe6ff, group, x, top - 0.078, z + dz);
    }
  }

  return {
    group,
    setEmergency(level: number): void {
      bulbMaterial.color.copy(dark).lerp(lit, Math.min(Math.max(level, 0), 1));
    },
    dispose(): void {
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
      group.removeFromParent();
    },
  };
}
