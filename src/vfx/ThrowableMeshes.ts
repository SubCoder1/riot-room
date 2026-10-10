import * as THREE from "three";

/** Small meshes for the things you throw. Shared by the hand and the flying copy. */

/** How big a Molotov bottle is drawn (1 = 25 cm tall). */
export const BOTTLE_SCALE = 1.4;

/** How big a grenade is drawn (1 = about 9 cm across: a real fragmentation grenade). */
export const GRENADE_SCALE = 1.55;

/** How big a smoke grenade is drawn: bigger than a grenade, so it reads at a glance. */
export const SMOKE_SCALE = 1.9;

/** What a grenade and a smoke canister need to be cleaned up (shared by every copy). */
export interface GrenadeParts {
  /** The olive-drab body of the grenade. */
  casing: THREE.MeshStandardMaterial;
  /** Bare steel: the spoon, the collar and the pin ring. */
  steel: THREE.MeshStandardMaterial;
  /** The smoke grenade's grey-green body. */
  canister: THREE.MeshStandardMaterial;
  /** The pale band round a smoke grenade. */
  band: THREE.MeshStandardMaterial;
  /** The dark fuse and cap of both grenades. */
  cap: THREE.MeshStandardMaterial;
  /** The yellow marking band round a frag grenade. */
  marking: THREE.MeshStandardMaterial;
  /**
   * 0 grenade body, 1 fuse, 2 grenade spoon, 3 pin ring, 4 canister body, 5
   * canister band, 6 canister cap, 7 canister spoon, 8 grenade band, 9 collar.
   */
  geometries: THREE.BufferGeometry[];
}

export function createGrenadeParts(): GrenadeParts {
  // A frag grenade: a smooth olive egg, a little taller than it is wide.
  const body = new THREE.LatheGeometry(
    [
      new THREE.Vector2(0, -0.062),
      new THREE.Vector2(0.022, -0.06),
      new THREE.Vector2(0.037, -0.048),
      new THREE.Vector2(0.045, -0.022),
      new THREE.Vector2(0.047, 0.008),
      new THREE.Vector2(0.043, 0.036),
      new THREE.Vector2(0.032, 0.054),
      new THREE.Vector2(0.021, 0.062),
      new THREE.Vector2(0, 0.064),
    ],
    20,
  );
  // The long steel spoon, down the side from the fuse.
  const spoon = new THREE.BoxGeometry(0.006, 0.112, 0.02);

  spoon.translate(0.0485, -0.004, 0);

  // The smoke grenade: a tall round-shouldered cylinder (a lathe), like the
  // classic M18, with a pale band, a dark cap and a long spoon down its side.
  const tube = new THREE.LatheGeometry(
    [
      new THREE.Vector2(0, -0.085),
      new THREE.Vector2(0.03, -0.085),
      new THREE.Vector2(0.037, -0.076),
      new THREE.Vector2(0.038, 0.052),
      new THREE.Vector2(0.034, 0.072),
      new THREE.Vector2(0.024, 0.082),
      new THREE.Vector2(0, 0.084),
    ],
    18,
  );
  const spoonLong = new THREE.BoxGeometry(0.005, 0.15, 0.016);

  spoonLong.translate(0.0405, 0.0, 0);

  return {
    casing: new THREE.MeshStandardMaterial({
      color: 0x4e5a38,
      roughness: 0.62,
      metalness: 0.2,
    }),
    steel: new THREE.MeshStandardMaterial({
      color: 0xa4a9ae,
      roughness: 0.35,
      metalness: 0.85,
    }),
    canister: new THREE.MeshStandardMaterial({
      color: 0x6f7a66,
      roughness: 0.55,
      metalness: 0.25,
    }),
    band: new THREE.MeshStandardMaterial({
      color: 0xe4e6e2,
      roughness: 0.6,
      metalness: 0.05,
    }),
    cap: new THREE.MeshStandardMaterial({
      color: 0x24272a,
      roughness: 0.5,
      metalness: 0.4,
    }),
    marking: new THREE.MeshStandardMaterial({
      color: 0xd2b640,
      roughness: 0.6,
      metalness: 0.05,
    }),
    geometries: [
      body,
      new THREE.CylinderGeometry(0.014, 0.018, 0.034, 12),
      spoon,
      new THREE.TorusGeometry(0.016, 0.003, 6, 14),
      tube,
      new THREE.CylinderGeometry(0.0392, 0.0392, 0.03, 18),
      new THREE.CylinderGeometry(0.02, 0.026, 0.026, 14),
      spoonLong,
      new THREE.CylinderGeometry(0.0475, 0.0475, 0.014, 20),
      new THREE.CylinderGeometry(0.024, 0.024, 0.009, 14),
    ],
  };
}

export function disposeGrenadeParts(parts: GrenadeParts): void {
  parts.casing.dispose();
  parts.steel.dispose();
  parts.canister.dispose();
  parts.band.dispose();
  parts.cap.dispose();
  parts.marking.dispose();

  for (const geometry of parts.geometries) {
    geometry.dispose();
  }
}

/**
 * A frag grenade, upright and centred on its body: an olive egg with a yellow
 * band, a dark fuse and steel collar on top, the long spoon down one side and
 * the pin ring (named "pin"; the hand pulls it before the throw). About 13 cm
 * tall before GRENADE_SCALE.
 */
export function createGrenade(parts: GrenadeParts): THREE.Group {
  const [casing, fuse, spoon, ring, , , , , band, collar] = parts.geometries;
  const group = new THREE.Group();
  const body = new THREE.Mesh(casing, parts.casing);
  const stripe = new THREE.Mesh(band, parts.marking);
  const neck = new THREE.Mesh(fuse, parts.cap);
  const rim = new THREE.Mesh(collar, parts.steel);
  const lever = new THREE.Mesh(spoon, parts.steel);
  const pin = new THREE.Mesh(ring, parts.steel);

  stripe.position.y = 0.02;
  neck.position.y = 0.078;
  rim.position.y = 0.06;
  lever.position.y = 0.0;
  pin.position.set(-0.012, 0.094, 0);
  pin.rotation.y = Math.PI / 2;
  pin.name = "pin";

  group.add(body, stripe, neck, rim, lever, pin);

  for (const mesh of [body, stripe, neck, rim, lever, pin]) {
    mesh.frustumCulled = false;
  }

  return group;
}

/**
 * A smoke grenade, upright and centred on its body: a grey-green canister with
 * rounded shoulders, a pale band, a dark cap with its fuse, the long spoon down
 * one side and a pin ring. About 17 cm tall before SMOKE_SCALE.
 */
export function createSmokeCanister(parts: GrenadeParts): THREE.Group {
  const [, fuse, , ring, tube, band, cap, spoon] = parts.geometries;
  const group = new THREE.Group();
  const body = new THREE.Mesh(tube, parts.canister);
  const stripe = new THREE.Mesh(band, parts.band);
  const lid = new THREE.Mesh(cap, parts.cap);
  const nozzle = new THREE.Mesh(fuse, parts.steel);
  const lever = new THREE.Mesh(spoon, parts.steel);
  const pin = new THREE.Mesh(ring, parts.steel);

  // The band sits in the middle of the body, a darker cap over the shoulder.
  stripe.position.y = 0.004;
  lid.position.y = 0.088;
  nozzle.position.y = 0.11;
  nozzle.scale.set(0.75, 0.75, 0.75);
  lever.position.y = 0.02;
  pin.position.set(-0.012, 0.118, 0);
  pin.rotation.y = Math.PI / 2;
  // Found by name: the hand pulls it out when the grenade is equipped.
  pin.name = "pin";

  group.add(body, stripe, lid, nozzle, lever, pin);

  for (const mesh of [body, stripe, lid, nozzle, lever, pin]) {
    mesh.frustumCulled = false;
  }

  return group;
}

/**
 * A flame tongue: a rounded teardrop (wide near the base, drawn out to a soft
 * tip) one unit tall with a base about one unit across, coloured from `bottom`
 * to `top` along its height with vertex colours. Scale it to size.
 */
export function createFlameGeometry(
  bottom: THREE.Color,
  top: THREE.Color,
): THREE.BufferGeometry {
  const samples = 14;
  const profile: THREE.Vector2[] = [];

  for (let i = 0; i <= samples; i++) {
    const y = i / samples;
    const radius =
      Math.sin(Math.PI * Math.pow(y, 0.65)) * Math.pow(1 - y, 0.25);

    profile.push(new THREE.Vector2(Math.max(radius, 0), y));
  }

  const geometry = new THREE.LatheGeometry(profile, 8);
  const position = geometry.getAttribute("position");
  const colors = new Float32Array(position.count * 3);
  const color = new THREE.Color();

  for (let i = 0; i < position.count; i++) {
    const y = Math.min(Math.max(position.getY(i), 0), 1);

    color.copy(bottom).lerp(top, Math.pow(y, 0.8));
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }

  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  return geometry;
}

/** The two layers of a flame: a red-orange outer and a hot yellow core. */
export function createFlameMaterial(opacity = 0.95): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

export const FLAME_OUTER_BOTTOM = new THREE.Color(0xffa21a);
export const FLAME_OUTER_TOP = new THREE.Color(0xe02a08);
export const FLAME_INNER_BOTTOM = new THREE.Color(0xfff4b0);
export const FLAME_INNER_TOP = new THREE.Color(0xffb02e);

/** A stable pseudo-random number in [-1, 1] from a few numbers. */
function noise(a: number, b: number): number {
  const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;

  return (x - Math.floor(x)) * 2 - 1;
}

/**
 * A strip of cloth hanging down a bottle neck: it wraps round the neck at
 * `angle`, follows its widening, waves and puckers, tapers, and ends in a
 * ragged edge. Shaded from clean cloth at the top to fuel-soaked at the bottom.
 */
export function createClothStrip(
  angle: number,
  width: number,
  length: number,
  seed: number,
): THREE.BufferGeometry {
  const across = 4;
  const down = 10;
  const top = 0.158;
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const clean = new THREE.Color(0xd9d0b0);
  const soaked = new THREE.Color(0x6e5a33);
  const color = new THREE.Color();

  for (let row = 0; row <= down; row++) {
    const t = row / down;
    // Hangs down from the plug: out over the neck, then the shoulder.
    const y = top - t * length;
    const neck = 0.015 + Math.max(0, 0.135 - y) * 0.3;
    const radius = Math.min(neck, 0.036) + 0.004 + 0.003 * t;

    for (let col = 0; col <= across; col++) {
      const u = col / across - 0.5;
      // Narrower toward the bottom, with a ragged, uneven end.
      const half = (width / 2) * (1 - 0.35 * t);
      const ragged = row === down ? noise(col, seed) * 0.014 : 0;
      const phi = angle + (u * half * 2) / radius;
      const pucker =
        1 + 0.12 * Math.sin(t * 17 + seed) * Math.cos(u * 9 + seed * 2);
      const r = radius * pucker + 0.002 * noise(row + seed, col);

      positions.push(
        Math.cos(phi) * r,
        y + ragged + 0.003 * noise(col + seed, row),
        Math.sin(phi) * r,
      );

      color.copy(clean).lerp(soaked, Math.pow(t, 0.7));
      colors.push(color.r, color.g, color.b);
    }
  }

  for (let row = 0; row < down; row++) {
    for (let col = 0; col < across; col++) {
      const a = row * (across + 1) + col;
      const b = a + 1;
      const c = a + across + 1;
      const d = c + 1;

      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();

  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return geometry;
}

/** A crumpled wad of cloth stuffed in the bottle's neck. */
export function createClothWad(radius: number): THREE.BufferGeometry {
  const geometry = new THREE.IcosahedronGeometry(radius, 2);
  const position = geometry.getAttribute("position");

  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const crumple =
      1 + 0.22 * Math.sin(x * 260 + y * 90) * Math.cos(z * 230 - y * 120);

    position.setXYZ(
      i,
      x * crumple * 1.1,
      y * crumple * 1.25,
      z * crumple * 1.1,
    );
  }

  geometry.computeVertexNormals();

  return geometry;
}

/** What a bottle needs to be cleaned up (shared by every copy). */
export interface BottleParts {
  glass: THREE.MeshStandardMaterial;
  /** Clean cloth: the tie and the stuffed plug. */
  rag: THREE.MeshStandardMaterial;
  /** Cloth soaked in fuel: the strips hanging down the neck. */
  soaked: THREE.MeshStandardMaterial;
  flame: THREE.MeshBasicMaterial;
  /**
   * 0 body, 1 neck, 2 cloth wad, 3 flame (outer), 4 flame (core), 5 / 7 / 8
   * strips of cloth hanging down the neck, 6 cloth tie around the neck.
   */
  geometries: THREE.BufferGeometry[];
}

export function createBottleParts(): BottleParts {
  return {
    // Solid glass, not see-through.
    glass: new THREE.MeshStandardMaterial({
      color: 0x24602f,
      roughness: 0.3,
      metalness: 0.05,
    }),
    rag: new THREE.MeshStandardMaterial({ color: 0xd9d0b0, roughness: 1 }),
    // Cloth strips carry their own shading (clean at the top, soaked below).
    soaked: new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 1,
      side: THREE.DoubleSide,
    }),
    flame: createFlameMaterial(),
    geometries: [
      new THREE.CylinderGeometry(0.032, 0.034, 0.15, 12),
      new THREE.CylinderGeometry(0.013, 0.03, 0.06, 12),
      createClothWad(0.021),
      createFlameGeometry(FLAME_OUTER_BOTTOM, FLAME_OUTER_TOP),
      createFlameGeometry(FLAME_INNER_BOTTOM, FLAME_INNER_TOP),
      createClothStrip(0.5, 0.034, 0.1, 1),
      new THREE.TorusGeometry(0.017, 0.004, 6, 14),
      createClothStrip(3.6, 0.03, 0.075, 7),
      createClothStrip(5.2, 0.026, 0.06, 13),
    ],
  };
}

export function disposeBottleParts(parts: BottleParts): void {
  parts.glass.dispose();
  parts.rag.dispose();
  parts.soaked.dispose();
  parts.flame.dispose();

  for (const geometry of parts.geometries) {
    geometry.dispose();
  }
}

/** A flame (outer and core) for the bottle's rag or a lighter, `height` metres tall. */
export function createFlame(
  parts: BottleParts,
  radius: number,
  height: number,
): THREE.Group {
  const flame = new THREE.Group();
  const outer = new THREE.Mesh(parts.geometries[3], parts.flame);
  const inner = new THREE.Mesh(parts.geometries[4], parts.flame);

  outer.scale.set(radius, height, radius);
  inner.scale.set(radius * 0.55, height * 0.68, radius * 0.55);
  outer.frustumCulled = false;
  inner.frustumCulled = false;
  flame.add(outer, inner);

  return flame;
}

/**
 * A Molotov bottle, upright and centred on its body: a glass bottle with a
 * cloth stuffed in the neck, a cloth tied round it and soaked strips hanging
 * down, and a flame (named "flame") on the rag. About 25 cm tall before
 * BOTTLE_SCALE.
 */
export function createBottle(parts: BottleParts): THREE.Group {
  const [body, neck, plug, , , stripA, tie, stripB, stripC] = parts.geometries;
  const group = new THREE.Group();
  const bottle = new THREE.Mesh(body, parts.glass);
  const top = new THREE.Mesh(neck, parts.glass);
  const stuffing = new THREE.Mesh(plug, parts.rag);
  const wrap = new THREE.Mesh(tie, parts.rag);
  const hanging = [stripA, stripB, stripC].map(
    (geometry) => new THREE.Mesh(geometry, parts.soaked),
  );
  const flame = createFlame(parts, 0.032, 0.13);

  top.position.y = 0.105;
  stuffing.position.y = 0.155;
  // The tie sits round the neck, below the wad.
  wrap.position.y = 0.122;
  wrap.rotation.x = Math.PI / 2;
  flame.position.y = 0.178;
  flame.name = "flame";

  group.add(bottle, top, stuffing, wrap, ...hanging, flame);

  for (const mesh of [bottle, top, stuffing, wrap, ...hanging]) {
    mesh.frustumCulled = false;
  }

  return group;
}

/** Makes a flame flicker and lean; `age` is the seconds since it was lit (a brief flare at the start). */
export function flickerFlame(
  group: THREE.Object3D,
  time: number,
  lit: boolean,
  age = 1,
): void {
  const flame = group.getObjectByName("flame");

  if (!flame) {
    return;
  }

  flame.visible = lit;

  if (!lit) {
    return;
  }

  flame.scale.copy(flickerScale(time, age));
  flame.rotation.set(0.12 * Math.sin(time * 9), 0, 0.12 * Math.cos(time * 7.3));
}

const flare = new THREE.Vector3();

/** The scale of a flickering flame: a brief flare when first lit, then a wavering. */
export function flickerScale(time: number, age = 1): THREE.Vector3 {
  const burst = 1 + 0.7 * Math.max(0, 1 - age / 0.18);
  const flicker = 0.85 + 0.2 * Math.sin(time * 31) + 0.1 * Math.sin(time * 53);

  return flare.set(
    burst * (0.9 + 0.12 * Math.sin(time * 41 + 1)),
    burst * flicker,
    burst * (0.9 + 0.12 * Math.cos(time * 37)),
  );
}
