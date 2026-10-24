import * as THREE from "three";

import { ArenaCollision } from "./ArenaCollision";
import {
  allSolids,
  type ArenaLayout,
  type LightDefinition,
} from "./ArenaLayout";
import { openAt } from "./Debris";
import { rng } from "./FittingPieces";
import { LIGHT_SUM, MAX_LIGHTS } from "./Rain";
import { ventDripPoints } from "./ArmoryVent";
import { ventBlocks, ventBlocksNear } from "./Vents";

/**
 * Standing rainwater: a few shallow puddles where the floor is open to the
 * sky (never indoors, never under a roof) and clear of every solid. Each is a
 * flat, irregular patch a hair above the floor that darkens the surface,
 * mirrors the glow of the lamps and, during a flash, the sky, and has rings
 * opening across it where drops land. Drawn together as one mesh.
 */

const COUNT = 44;
const TOP = 16;

const VERTEX = /* glsl */ `
  attribute vec2 aLocal;
  attribute float aSeed;
  attribute float aStretch;
  varying vec2 vLocal;
  varying float vSeed;
  varying float vStretch;
  varying vec3 vWorld;

  void main() {
    vLocal = aLocal;
    vSeed = aSeed;
    vStretch = aStretch;
    vWorld = position;
    gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uFlash;
  uniform vec4 uPos[${MAX_LIGHTS}];
  uniform vec4 uCol[${MAX_LIGHTS}];
  uniform vec4 uDir[${MAX_LIGHTS}];
  varying vec2 vLocal;
  varying float vSeed;
  varying float vStretch;
  varying vec3 vWorld;

  ${LIGHT_SUM}

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);

    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  void main() {
    vec2 p = vLocal;
    p.x *= vStretch;

    // An irregular outline: the radius wanders with the angle.
    float angle = atan(p.y, p.x);
    float edge = 0.8
      + 0.18 * noise(vec2(angle * 1.6 + vSeed * 20.0, vSeed * 7.0))
      + 0.12 * noise(vec2(angle * 4.0 + vSeed * 31.0, 3.0));
    float r = length(p);
    float shape = 1.0 - smoothstep(edge - 0.1, edge, r);

    if (shape < 0.01) {
      discard;
    }

    // Rings from drops landing: four sets, each on its own beat.
    float rings = 0.0;

    for (int i = 0; i < 4; i++) {
      float period = 0.8 + float(i) * 0.25 + vSeed * 0.3;
      float t = uTime / period + float(i) * 0.37 + vSeed * 5.0;
      float cycle = floor(t);
      float age = fract(t);
      vec2 centre = (vec2(
        hash(vec2(cycle, float(i) + vSeed * 9.0)),
        hash(vec2(float(i) + vSeed * 4.0, cycle))
      ) - 0.5) * 1.1;
      float radius = age * 0.2;
      float dist = abs(length(p - centre) - radius);
      float ring = smoothstep(0.04, 0.0, dist) * smoothstep(0.0, 0.03, radius);

      rings += ring * (1.0 - age) * (1.0 - age);
    }

    // The sheen: lamplight on the water, and the sky when it flashes.
    vec3 lamp = lampLight(vWorld);
    vec3 view = normalize(cameraPosition - vWorld);
    float glancing = pow(1.0 - clamp(view.y, 0.0, 1.0), 2.0);
    vec3 sheen = lamp * (0.9 + 1.8 * glancing)
      + vec3(0.32, 0.37, 0.48) * uFlash * (0.4 + glancing);
    vec3 colour = sheen * (0.7 + 2.2 * rings) + vec3(0.02, 0.03, 0.04);
    // Dark water: it deepens the floor, and only the sheen is bright.
    float alpha = shape * (0.5 + min(max(sheen.r, max(sheen.g, sheen.b)), 0.5));

    gl_FragColor = vec4(min(colour, vec3(1.0)), min(alpha, 0.9));
  }
`;

interface Spot {
  x: number;
  z: number;
  y: number;
  radius: number;
  stretch: number;
  seed: number;
}

export function createPuddles(
  layout: ArenaLayout,
  lights: LightDefinition[],
  uniforms: Record<string, THREE.IUniform>,
  halfX: number,
  halfZ: number,
): THREE.Mesh {
  const collision = new ArenaCollision(layout);
  const solids = allSolids(layout);
  const random = rng(8123);
  const grates = [
    ...ventBlocks(layout.vents),
    ...ventBlocks(layout.upperVents),
  ];
  const spots: Spot[] = [];
  // Ground, first floor, the balconies (2.8 and 5.2) and the three roof layers.
  const levels = [0, 4, 2.8, 8.1, 5.2, 9.3, 10.8];
  const lit = lights.filter((l) => l.target && !l.id.startsWith("tube-"));

  for (let tries = 0; tries < 40000 && spots.length < COUNT; tries++) {
    // Half of them in or near a lamp's pool, so they are seen.
    const lamp =
      lit.length > 0 && spots.length % 2 === 0
        ? lit[Math.floor(random() * lit.length)]
        : null;
    const x = lamp
      ? lamp.target!.x + (random() - 0.5) * 5
      : (random() * 2 - 1) * (halfX - 1);
    const z = lamp
      ? lamp.target!.z + (random() - 0.5) * 5
      : (random() * 2 - 1) * (halfZ - 1);
    const y = collision.groundHeight(x, z, TOP);

    // Open to the sky: the rain lands here, so no roof is overhead. They are
    // shared out over the levels in turn, so some are on balconies and roofs.
    const want = levels[tries % levels.length];
    const here = spots.filter((o) => Math.abs(o.y - want) < 0.02).length;

    if (here >= Math.ceil(COUNT / levels.length) + 2) {
      continue;
    }

    if (Math.abs(want - y) > 0.02) {
      continue;
    }

    const radius = 0.5 + random() * 0.7;

    // The whole patch lies on this one surface: no edge of a roof, balcony or
    // step under it, or the water would hang in the air.
    let flat = true;

    for (let k = 0; k < 16 && flat; k++) {
      const a = (k / 16) * Math.PI * 2;

      for (const reach of [0.5, 1.0, 1.4]) {
        const px = x + Math.cos(a) * radius * reach * 1.3 + Math.cos(a) * 0.15;
        const pz = z + Math.sin(a) * radius * reach * 1.3 + Math.sin(a) * 0.15;

        if (Math.abs(collision.groundHeight(px, pz, y + 0.3) - y) > 0.02) {
          flat = false;
          break;
        }
      }
    }

    if (!flat) {
      continue;
    }

    if (
      !openAt(solids, x, z, y) ||
      ventBlocksNear(grates, x, z, radius + 0.3).length > 0 ||
      // Not touching another puddle.
      spots.some((s) => Math.hypot(s.x - x, s.z - z) < s.radius + radius + 0.8)
    ) {
      continue;
    }

    spots.push({
      x,
      z,
      y,
      radius,
      stretch: 0.6 + random() * 0.7,
      seed: random(),
    });
  }

  // Where the Armory's overhead vents let the rain in: a puddle on the floor
  // under each (at its drip point), as the water comes from above.
  for (const drip of ventDripPoints()) {
    const y = collision.groundHeight(drip.x, drip.z, 5);
    const radius = 0.5 + random() * 0.25;
    let flat = Math.abs(y - 4) < 0.02;

    for (let k = 0; k < 12 && flat; k++) {
      const a = (k / 12) * Math.PI * 2;

      if (
        Math.abs(
          collision.groundHeight(
            drip.x + Math.cos(a) * radius * 1.3,
            drip.z + Math.sin(a) * radius * 1.3,
            y + 0.3,
          ) - y,
        ) > 0.02
      ) {
        flat = false;
      }
    }

    if (flat) {
      spots.push({
        x: drip.x,
        z: drip.z,
        y,
        radius,
        stretch: 0.8 + random() * 0.4,
        seed: random(),
      });
    }
  }

  const position = new Float32Array(spots.length * 12);
  const local = new Float32Array(spots.length * 8);
  const seed = new Float32Array(spots.length * 4);
  const stretch = new Float32Array(spots.length * 4);
  const index: number[] = [];

  spots.forEach((s, i) => {
    const corners: Array<[number, number]> = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ];
    // A turned patch: its long side runs along a heading of its own.
    const turn = s.seed * Math.PI * 2;
    const wide = Math.max(s.stretch, 1);

    corners.forEach(([cx, cz], k) => {
      const v = i * 4 + k;
      // The quad covers the widest the outline can be.
      const reach = s.radius * 1.25;
      const wx = cx * reach * wide;
      const wz = cz * reach;

      position[v * 3] = s.x + wx * Math.cos(turn) - wz * Math.sin(turn);
      position[v * 3 + 1] = s.y + 0.014;
      position[v * 3 + 2] = s.z + wx * Math.sin(turn) + wz * Math.cos(turn);
      local[v * 2] = cx;
      local[v * 2 + 1] = cz;
      seed[v] = s.seed;
      stretch[v] = wide / s.stretch;
    });

    index.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
  });

  const geometry = new THREE.BufferGeometry();

  geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
  geometry.setAttribute("aLocal", new THREE.BufferAttribute(local, 2));
  geometry.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
  geometry.setAttribute("aStretch", new THREE.BufferAttribute(stretch, 1));
  geometry.setIndex(index);
  geometry.boundingSphere = new THREE.Sphere(
    new THREE.Vector3(0, 5, 0),
    Math.hypot(halfX, halfZ, 12),
  );

  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    // The same lamps, clock and flash as the rain.
    uniforms: {
      uTime: uniforms.uTime,
      uFlash: uniforms.uFlash,
      uPos: uniforms.uPos,
      uCol: uniforms.uCol,
      uDir: uniforms.uDir,
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    fog: false,
  });
  const mesh = new THREE.Mesh(geometry, material);

  mesh.name = "puddles";
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;

  return mesh;
}
