import * as THREE from "three";

import { ArenaCollision } from "./ArenaCollision";
import type { ArenaLayout, LightDefinition } from "./ArenaLayout";
import { isVentHatchId } from "./ArmoryVent";
import {
  CEILING_SLAB_AREA,
  CEILING_SLAB_ID,
  CEILING_SLAB_TOP,
} from "./CeilingSlab";

/**
 * A light drizzle: fine streaks that fall only until they meet a surface
 * (a roof or a floor, read from the collision field), so nothing rains through
 * a roof. Far away a streak is lit by the map's lamps alone (it shows in a
 * beam and all but vanishes in the dark); near the player it also has a
 * little pale sky light, so the rain round you shows anywhere in the open.
 */

const DROPS = 5200;
/** Extra streaks over the wooden slab: they fall only once it is broken. */
const SLAB_DROPS = 40;
const TOP = 16;
const SPEED = 12;
const LENGTH = 0.55;
export const MAX_LIGHTS = 40;
/** Slots at the end of the list for the carried flame (the last) and up to 5 fires. */
export const RESERVED_LIGHTS = 6;

/** The light the map's lamps cast at a point: shared by the streaks and the puddles. */
export const LIGHT_SUM = /* glsl */ `
  vec3 lampLight(vec3 p) {
    vec3 sum = vec3(0.0);

    for (int i = 0; i < ${MAX_LIGHTS}; i++) {
      vec3 d = p - uPos[i].xyz;
      float dist = length(d);
      float window = clamp(1.0 - dist / uPos[i].w, 0.0, 1.0);
      float cone = uDir[i].w < -0.5
        ? 1.0
        : smoothstep(uDir[i].w, mix(uDir[i].w, 1.0, 0.25), dot(d / max(dist, 0.001), uDir[i].xyz));

      sum += uCol[i].rgb * (window * window * cone * 0.5 / (dist * dist * 0.08 + 1.0));
    }

    return sum;
  }
`;

const VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uFlash;
  uniform vec4 uPos[${MAX_LIGHTS}];
  uniform vec4 uCol[${MAX_LIGHTS}];
  uniform vec4 uDir[${MAX_LIGHTS}];
  attribute float aSeed;
  attribute float aFloor;
  attribute float aTail;
  attribute float aOpenFloor;
  attribute float aOnlyOpen;
  uniform float uOpen;
  varying float vAlpha;
  varying vec3 vTint;
  varying float vNear;
  varying float vFar;

  ${LIGHT_SUM}

  void main() {
    float floorY = uOpen > 0.5 ? aOpenFloor : aFloor;
    float span = ${TOP.toFixed(1)} - floorY;
    float head = ${TOP.toFixed(1)} - mod(uTime * ${SPEED.toFixed(1)} + aSeed * span, span);
    float lean = 0.05 + 0.03 * sin(uTime * 0.4 + aSeed * 9.0);
    vec3 p = position;
    p.y = head + aTail * ${LENGTH.toFixed(2)};
    p.x += (p.y - ${TOP.toFixed(1)}) * lean;

    // A streak that has reached its surface is gone until it restarts above.
    if (head < floorY + 0.02 || (aOnlyOpen > 0.5 && uOpen < 0.5)) {
      p.y = -50.0;
    }

    // A flash shows the drizzle faintly, never as a bright curtain.
    vTint = lampLight(p) + vec3(0.1, 0.11, 0.13) * uFlash;
    // Far from the player the drizzle is lit by the lamps alone (a faint
    // streak in a beam); close to the player it also catches the sky's pale
    // light, fading out between 3 and 10 m, so the rain round you shows
    // anywhere in the open.
    vNear = 1.0 - smoothstep(3.0, 10.0, distance(p, cameraPosition));
    // Far streaks (past about 8 m) fade a little more with distance, lit or not.
    vFar = 1.0 - 0.5 * smoothstep(8.0, 30.0, distance(p, cameraPosition));
    vAlpha = 0.05 + 0.18 * vNear;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  varying float vAlpha;
  varying vec3 vTint;
  varying float vNear;
  varying float vFar;

  void main() {
    vec3 lit = min(vTint, vec3(0.9));
    float strength = clamp(max(lit.r, max(lit.g, lit.b)), 0.0, 0.9);
    gl_FragColor = vec4(lit + vec3(0.1, 0.12, 0.16) + vec3(0.32, 0.4, 0.52) * vNear, (vAlpha + strength * 0.5) * vFar);
  }
`;

export function createRain(
  layout: ArenaLayout,
  lights: LightDefinition[],
  halfX: number,
  halfZ: number,
): THREE.LineSegments {
  // A grating and a vent hatch are open bars: the rain falls through them
  // (to the floor of the room below), so they are not surfaces for it.
  const open = (id: string): boolean =>
    id.startsWith("vent-grating-") || isVentHatchId(id);
  const collision = new ArenaCollision({
    ...layout,
    platforms: layout.platforms.filter((p) => !open(p.id)),
    hatches: layout.hatches.filter((h) => !open(h.id)),
  });
  // The same field with the wooden slab gone: what its opening lets through.
  const broken = new ArenaCollision({
    ...layout,
    platforms: layout.platforms.filter(
      (p) => !open(p.id) && p.id !== CEILING_SLAB_ID,
    ),
    hatches: layout.hatches.filter((h) => !open(h.id)),
  });
  const random = mulberry32(90125);
  const total = DROPS + SLAB_DROPS;
  const base = new Float32Array(total * 6);
  const seed = new Float32Array(total * 2);
  const floor = new Float32Array(total * 2);
  const openFloor = new Float32Array(total * 2);
  const onlyOpen = new Float32Array(total * 2);
  const tail = new Float32Array(total * 2);
  let used = 0;

  const add = (
    x: number,
    z: number,
    surface: number,
    below: number,
    extra: boolean,
  ): void => {
    const s = random();

    for (let end = 0; end < 2; end++) {
      const v = used * 2 + end;

      base.set([x, 0, z], v * 3);
      seed[v] = s;
      floor[v] = surface;
      openFloor[v] = below;
      onlyOpen[v] = extra ? 1 : 0;
      tail[v] = end;
    }

    used++;
  };

  while (used < DROPS) {
    const x = (random() * 2 - 1) * (halfX - 0.3);
    const z = (random() * 2 - 1) * (halfZ - 0.3);
    const surface = collision.groundHeight(x, z, TOP);

    // Surfaces beside the drop (a wall's shoulder) are not roofs worth keeping.
    if (surface > TOP - 3) {
      continue;
    }

    add(x, z, surface, broken.groundHeight(x, z, TOP), false);
  }

  // A steady fall through the opening once the slab has broken.
  const slab = CEILING_SLAB_AREA;

  for (let i = 0; i < SLAB_DROPS; i++) {
    const x = slab.minX + 0.05 + random() * (slab.maxX - slab.minX - 0.1);
    const z = slab.minZ + 0.05 + random() * (slab.maxZ - slab.minZ - 0.1);

    add(
      x,
      z,
      CEILING_SLAB_TOP,
      broken.groundHeight(x, z, CEILING_SLAB_TOP),
      true,
    );
  }

  const geometry = new THREE.BufferGeometry();

  geometry.setAttribute("position", new THREE.BufferAttribute(base, 3));
  geometry.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
  geometry.setAttribute("aFloor", new THREE.BufferAttribute(floor, 1));
  geometry.setAttribute("aOpenFloor", new THREE.BufferAttribute(openFloor, 1));
  geometry.setAttribute("aOnlyOpen", new THREE.BufferAttribute(onlyOpen, 1));
  geometry.setAttribute("aTail", new THREE.BufferAttribute(tail, 1));
  // The shader moves every vertex; the box must cover the whole map.
  geometry.boundingSphere = new THREE.Sphere(
    new THREE.Vector3(0, TOP / 2, 0),
    Math.hypot(halfX, halfZ, TOP),
  );

  const pos = Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector4());
  const col = Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector4());
  const dir = Array.from(
    { length: MAX_LIGHTS },
    () => new THREE.Vector4(0, 0, 0, -1),
  );

  // The last slots are kept free for the lights that come and go: the player's
  // Molotov in hand and the fires burning after one is thrown.
  lights.slice(0, MAX_LIGHTS - RESERVED_LIGHTS).forEach((light, i) => {
    const colour = new THREE.Color(light.color);
    const power = Math.min(light.intensity / 30, 2.2);

    pos[i].set(light.x, light.y, light.z, light.distance);
    col[i].set(colour.r * power, colour.g * power, colour.b * power, 0);

    if (light.target) {
      const d = new THREE.Vector3(
        light.target.x - light.x,
        light.target.y - light.y,
        light.target.z - light.z,
      ).normalize();

      dir[i].set(d.x, d.y, d.z, Math.cos(light.angle ?? 0.8));
    }
  });

  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms: {
      uTime: { value: 0 },
      uFlash: { value: 0 },
      uOpen: { value: 0 },
      uPos: { value: pos },
      uCol: { value: col },
      uDir: { value: dir },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });

  const rain = new THREE.LineSegments(geometry, material);

  rain.name = "rain";
  rain.frustumCulled = false;
  rain.renderOrder = 5;
  rain.onBeforeRender = () => {
    material.uniforms.uTime.value = performance.now() / 1000;
  };

  return rain;
}

function mulberry32(seed: number): () => number {
  let a = seed;

  return () => {
    a = (a + 0x6d2b79f5) | 0;

    let t = Math.imul(a ^ (a >>> 15), 1 | a);

    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
