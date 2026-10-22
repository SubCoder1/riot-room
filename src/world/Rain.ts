import * as THREE from "three";

import { ArenaCollision } from "./ArenaCollision";
import type { ArenaLayout, LightDefinition } from "./ArenaLayout";

/**
 * A light drizzle: fine streaks that fall only until they meet a surface
 * (a roof or a floor, read from the collision field), so nothing rains through
 * a roof. Each streak is lit by the map's lights alone: it shows in a beam and
 * all but vanishes in the dark.
 */

const DROPS = 2400;
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
  varying float vAlpha;
  varying vec3 vTint;

  ${LIGHT_SUM}

  void main() {
    float span = ${TOP.toFixed(1)} - aFloor;
    float head = ${TOP.toFixed(1)} - mod(uTime * ${SPEED.toFixed(1)} + aSeed * span, span);
    float lean = 0.05 + 0.03 * sin(uTime * 0.4 + aSeed * 9.0);
    vec3 p = position;
    p.y = head + aTail * ${LENGTH.toFixed(2)};
    p.x += (p.y - ${TOP.toFixed(1)}) * lean;

    // A streak that has reached its surface is gone until it restarts above.
    if (head < aFloor + 0.02) {
      p.y = -50.0;
    }

    // A flash shows the drizzle faintly, never as a bright curtain.
    vTint = lampLight(p) + vec3(0.1, 0.11, 0.13) * uFlash;
    // Faintly visible against the dark sky anywhere it falls open to the sky.
    vAlpha = 0.06;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  varying float vAlpha;
  varying vec3 vTint;

  void main() {
    vec3 lit = min(vTint, vec3(0.9));
    float strength = clamp(max(lit.r, max(lit.g, lit.b)), 0.0, 0.9);
    gl_FragColor = vec4(lit + vec3(0.1, 0.12, 0.16), vAlpha + strength * 0.5);
  }
`;

export function createRain(
  layout: ArenaLayout,
  lights: LightDefinition[],
  halfX: number,
  halfZ: number,
): THREE.LineSegments {
  const collision = new ArenaCollision(layout);
  const random = mulberry32(90125);
  const base = new Float32Array(DROPS * 6);
  const seed = new Float32Array(DROPS * 2);
  const floor = new Float32Array(DROPS * 2);
  const tail = new Float32Array(DROPS * 2);
  let used = 0;

  while (used < DROPS) {
    const x = (random() * 2 - 1) * (halfX - 0.3);
    const z = (random() * 2 - 1) * (halfZ - 0.3);
    const surface = collision.groundHeight(x, z, TOP);

    // Surfaces beside the drop (a wall's shoulder) are not roofs worth keeping.
    if (surface > TOP - 3) {
      continue;
    }

    const s = random();

    for (let end = 0; end < 2; end++) {
      const v = used * 2 + end;

      base.set([x, 0, z], v * 3);
      seed[v] = s;
      floor[v] = surface;
      tail[v] = end;
    }

    used++;
  }

  const geometry = new THREE.BufferGeometry();

  geometry.setAttribute("position", new THREE.BufferAttribute(base, 3));
  geometry.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
  geometry.setAttribute("aFloor", new THREE.BufferAttribute(floor, 1));
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
