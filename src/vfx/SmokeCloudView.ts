import * as THREE from "three";

import {
  SMOKE_CENTRE_LIFT,
  smokeRadius,
  smokeThickness,
  type SmokeCloud,
  type SmokeSystem,
} from "../combat/Smoke";
import { SMOKE_CONFIG as C } from "../combat/SmokeConfig";
import { createPuffTexture } from "./SoftTexture";

/** Puffs closer to the camera than this share of their size fade out. */
const NEAR_FADE = 0.55;
/** Seconds of the bright flash when a canister starts to emit. */
const FLASH_SECONDS = 0.4;

interface Puff {
  /** This puff's tint (smoke grey, a touch of blue). */
  color: THREE.Color;
  /** Where in the cloud, in units of its radius. */
  offset: THREE.Vector3;
  /** Diameter as a share of the cloud radius. */
  size: number;
  phase: number;
  /**
   * How a wall, prop or the ceiling near it shapes it, found once when the
   * cloud starts (never re-measured, so nothing flickers): the share of its
   * way out it can go before it meets one, the share of its size it keeps so
   * it never pokes into one, and how far it is moved off one. Not placed
   * (and not drawn) until found.
   */
  reach: number;
  /** The way round (radians) it is turned from its own direction to where there is room. */
  turn: number;
  /** How far above the cloud's heart the ceiling (or anything over it) lets it climb, metres. */
  up: number;
  fit: number;
  push: THREE.Vector3;
  placed: boolean;
  /** Where it is, how big it is drawn and how opaque, this frame. */
  world: THREE.Vector3;
  drawSize: number;
  alpha: number;
}

interface Lobe {
  centre: THREE.Vector3;
  size: number;
  reach: number;
  turn: number;
  up: number;
  fit: number;
  push: THREE.Vector3;
  placed: boolean;
}

/**
 * One cloud's drawn parts. Every cloud there can be at once is built when the
 * view is made and kept (hidden) in the scene, so a grenade landing only lays
 * the parts out: nothing is made, compiled or uploaded in the frame it goes
 * off, which is what stalled it.
 */
interface Slot {
  puffs: Puff[];
  /** All the puffs, drawn at once: one instanced billboard mesh. */
  mesh: THREE.Mesh;
  attributes: {
    offset: THREE.InstancedBufferAttribute;
    look: THREE.InstancedBufferAttribute;
    color: THREE.InstancedBufferAttribute;
  };
  flash: THREE.Sprite;
  /** The lumps the cloud is made of: where each is, and its size, in units of the cloud radius. */
  lobes: Lobe[];
  /** A soft grey body in each lump that hides whatever is inside it. */
  cores: THREE.Mesh[];
  coreMaterial: THREE.ShaderMaterial;
}

interface CloudView extends Slot {
  cloud: SmokeCloud;
  slot: Slot;
  /** Each puff's distance from the camera this frame (reused). */
  distance: number[];
}

/** How many lumps a cloud has: an uneven heap, not one ball. */
const LOBES = 6;

/**
 * Smoke is drawn after everything else that is see-through (puddles, light
 * beams, rain), so none of it shows through or over a cloud; the core goes
 * first, then the puffs over it, then the flash.
 */
const CORE_ORDER = 8;
const PUFF_ORDER = 9;
const FLASH_ORDER = 10;
/** How much of a lump's size its hiding body fills (the puffs billow beyond it). */
const CORE_SHARE = 0.78;

/**
 * The hiding body's look: a smooth ball that is solid in the middle and fades
 * to nothing at its silhouette (the more the surface turns away from the eye,
 * the clearer), so it has no outline of its own.
 */
const CORE_VERTEX = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vView;

  void main() {
    vec4 view = modelViewMatrix * vec4(position, 1.0);

    vNormal = normalize(normalMatrix * normal);
    vView = -view.xyz;
    gl_Position = projectionMatrix * view;
  }
`;
const CORE_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec3 vNormal;
  varying vec3 vView;

  void main() {
    float facing = abs(dot(normalize(vNormal), normalize(vView)));

    gl_FragColor = vec4(uColor, uOpacity * smoothstep(0.0, 0.7, facing));
  }
`;

/**
 * The puffs of a cloud, all in one draw: each is a camera-facing quad (placed
 * in view space so it always faces the lens) with its own centre, size, grey
 * and opacity as per-instance data.
 */
const PUFF_VERTEX = /* glsl */ `
  attribute vec3 aOffset;
  attribute vec2 aLook;
  attribute vec3 aColor;
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    vUv = uv;
    vColor = aColor;
    vAlpha = aLook.y;

    vec4 centre = modelViewMatrix * vec4( aOffset, 1.0 );

    centre.xy += position.xy * aLook.x;
    gl_Position = projectionMatrix * centre;
  }
`;
const PUFF_FRAGMENT = /* glsl */ `
  uniform sampler2D uMap;
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    vec4 texel = texture2D( uMap, vUv );
    float a = texel.a * vAlpha;

    if ( a < 0.003 ) {
      discard;
    }

    gl_FragColor = vec4( texel.rgb * vColor, a );
  }
`;

/** The ways round, and up: what a part is kept clear of. */
const DIRECTIONS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 0, 1],
  [0, 0, -1],
  [0.7071, 0, 0.7071],
  [0.7071, 0, -0.7071],
  [-0.7071, 0, 0.7071],
  [-0.7071, 0, -0.7071],
  [0, 1, 0],
];
/** How much wider (sideways) and taller the drawn cloud is than its plain ball. */
const SPREAD_X = 1.15;
const RISE = 2.2;
/** Parts placed against the scenery per frame, at the start of a cloud. */
const PLACE_PER_FRAME = 60;

/** A cheap, repeatable 0..1 number from two numbers. */
function hash(a: number, b: number): number {
  const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;

  return x - Math.floor(x);
}

/**
 * Draws the smoke clouds: each is a set of soft, slowly turning puffs that
 * swell out to the cloud's radius, hold, then thin away. The same radius and
 * thickness the SmokeSystem uses for sight, so the picture matches the rule.
 *
 * Cheap on purpose: the puffs of a cloud are one instanced mesh of facing
 * quads sharing one generated texture (a fixed number per cloud,
 * SMOKE_PARTICLE_COUNT), at most SMOKE_MAX_CLOUDS clouds, all built up front.
 * Puffs that would swallow the lens fade out, and the screen tint
 * (`interior`) carries the feeling of being inside. Local only: a view of the
 * smoke system.
 */
export class SmokeCloudView {
  public readonly group = new THREE.Group();

  private readonly views = new Map<number, CloudView>();
  /** Parts built ahead of time and not in use. */
  private readonly free: Slot[] = [];
  private readonly texture = createPuffTexture(64, 7);
  private readonly flashTexture = createPuffTexture(32, 3);
  private readonly smoke: SmokeSystem;
  private readonly world = new THREE.Vector3();
  private readonly coreGeometry = new THREE.IcosahedronGeometry(1, 3);

  /**
   * How much of the line from A to B is free before it meets scenery (1 if all
   * of it; see ArenaCollision.segmentClearFraction). Smoke does not pass a
   * wall: each part of a cloud is stopped at the first one on its way out and
   * kept clear of the ones round it. Left unset, nothing stops it.
   */
  public reach:
    | ((
        x0: number,
        y0: number,
        z0: number,
        x1: number,
        y1: number,
        z1: number,
      ) => number)
    | null = null;

  private readonly probe = new THREE.Vector3();
  private readonly away = new THREE.Vector3();

  constructor(smoke: SmokeSystem) {
    this.smoke = smoke;

    // Every cloud there can be, built now and kept hidden in the scene (see
    // Game.warmUp, which draws them once so their programs are compiled).
    for (let i = 0; i < C.SMOKE_MAX_CLOUDS; i++) {
      this.free.push(this.makeSlot());
    }
  }

  /** How many clouds are being drawn (for tests and debugging). */
  public get count(): number {
    return this.views.size;
  }

  public update(camera: THREE.Camera, time: number): void {
    const seen = new Set<number>();

    for (const cloud of this.smoke.clouds) {
      seen.add(cloud.id);

      let view = this.views.get(cloud.id);

      if (!view) {
        view = this.create(cloud);
        this.views.set(cloud.id, view);
      }

      this.pose(view, camera, time);
    }

    for (const [id, view] of this.views) {
      if (!seen.has(id)) {
        this.destroy(view);
        this.views.delete(id);
      }
    }
  }

  /** 0 to 1: how much smoke the camera is in (drives the screen tint). */
  public interior(camera: THREE.Camera): number {
    return this.smoke.densityAt(camera.position);
  }

  /** Builds one cloud's parts, hidden and ready (the puffs, the flash, the bodies). */
  private makeSlot(): Slot {
    const count = C.SMOKE_PARTICLE_COUNT;
    const puffs: Puff[] = [];

    for (let i = 0; i < count; i++) {
      puffs.push({
        color: new THREE.Color(),
        offset: new THREE.Vector3(),
        size: 1,
        phase: 0,
        reach: 1,
        turn: 0,
        up: 99,
        fit: 1,
        push: new THREE.Vector3(),
        placed: false,
        world: new THREE.Vector3(),
        drawSize: 1,
        alpha: 0,
      });
    }

    const quad = new THREE.PlaneGeometry(1, 1);
    const geometry = new THREE.InstancedBufferGeometry();
    const attributes = {
      offset: new THREE.InstancedBufferAttribute(
        new Float32Array(count * 3),
        3,
      ),
      look: new THREE.InstancedBufferAttribute(new Float32Array(count * 2), 2),
      color: new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3),
    };

    geometry.index = quad.index;
    geometry.setAttribute("position", quad.getAttribute("position"));
    geometry.setAttribute("uv", quad.getAttribute("uv"));
    geometry.setAttribute("aOffset", attributes.offset);
    geometry.setAttribute("aLook", attributes.look);
    geometry.setAttribute("aColor", attributes.color);
    geometry.instanceCount = count;

    for (const attribute of Object.values(attributes)) {
      attribute.setUsage(THREE.DynamicDrawUsage);
    }

    const mesh = new THREE.Mesh(
      geometry,
      new THREE.ShaderMaterial({
        uniforms: { uMap: { value: this.texture } },
        vertexShader: PUFF_VERTEX,
        fragmentShader: PUFF_FRAGMENT,
        transparent: true,
        depthWrite: false,
        depthTest: true,
        fog: false,
      }),
    );

    mesh.frustumCulled = false;
    mesh.visible = false;
    mesh.renderOrder = PUFF_ORDER;
    mesh.name = "smoke-slot";
    this.group.add(mesh);

    const flash = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.flashTexture,
        color: 0xffffff,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        opacity: 0,
        fog: false,
      }),
    );

    flash.frustumCulled = false;
    flash.visible = false;
    flash.renderOrder = FLASH_ORDER;
    flash.name = "smoke-slot";
    this.group.add(flash);

    // The body of the cloud: a grey ball (seen from inside too) that props and
    // floor inside the smoke cannot be seen through.
    const coreMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color().setHSL(0.6, 0.04, 0.26) },
        uOpacity: { value: 0 },
      },
      vertexShader: CORE_VERTEX,
      fragmentShader: CORE_FRAGMENT,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const lobes: Lobe[] = [];
    const cores: THREE.Mesh[] = [];

    for (let k = 0; k < LOBES; k++) {
      const core = new THREE.Mesh(this.coreGeometry, coreMaterial);

      core.frustumCulled = false;
      core.visible = false;
      core.renderOrder = CORE_ORDER;
      core.name = "smoke-slot";
      this.group.add(core);
      cores.push(core);
      lobes.push({
        centre: new THREE.Vector3(),
        size: 0,
        reach: 1,
        turn: 0,
        up: 99,
        fit: 1,
        push: new THREE.Vector3(),
        placed: false,
      });
    }

    return { puffs, mesh, attributes, flash, lobes, cores, coreMaterial };
  }

  /** Takes a ready set of parts and lays this cloud's lumps and puffs out in it. */
  private create(cloud: SmokeCloud): CloudView {
    const slot = this.free.pop() ?? this.makeSlot();
    const { puffs, lobes } = slot;

    // The lumps: a handful, spread unevenly (the outline is never an oval).
    lobes.forEach((lobe, k) => {
      const a = hash(k + 600, cloud.seed) * Math.PI * 2;
      const reach = 0.2 + 0.75 * hash(k + 700, cloud.seed);

      lobe.centre.set(
        Math.cos(a) * reach,
        (hash(k + 800, cloud.seed) - 0.3) * 0.4,
        Math.sin(a) * reach,
      );
      lobe.size = 0.18 + 0.34 * hash(k + 900, cloud.seed);
      lobe.placed = false;
    });

    puffs.forEach((puff, i) => {
      // Smoke grey with a touch of blue, each puff its own shade, so the
      // cloud has lumps and shadows, dark enough for the night.
      puff.color.setHSL(0.6, 0.04, 0.2 + 0.16 * hash(i, cloud.seed));

      // A point inside a sphere, flattened a little and kept off the floor.
      const u = hash(i, cloud.seed + 1);
      const v = hash(i + 100, cloud.seed + 2);
      const w = hash(i + 200, cloud.seed + 3);
      const theta = u * Math.PI * 2;
      const cosPhi = v * 2 - 1;
      const sinPhi = Math.sqrt(1 - cosPhi * cosPhi);
      const radius = Math.cbrt(w);
      // Each puff belongs to one lump, and sits inside it.
      const lobe = lobes[i % LOBES];

      puff.offset
        .set(
          Math.cos(theta) * sinPhi * radius * lobe.size,
          Math.max(-0.2, cosPhi * radius * 0.8 * lobe.size),
          Math.sin(theta) * sinPhi * radius * lobe.size,
        )
        .add(lobe.centre);
      puff.size = 0.45 + 0.45 * hash(i + 300, cloud.seed);
      puff.phase = hash(i + 500, cloud.seed) * Math.PI * 2;
      puff.placed = false;
    });

    return { ...slot, cloud, slot, distance: puffs.map(() => 0) };
  }

  /**
   * Finds where a part of the cloud can be: out along `way` (from the cloud's
   * heart, for a full radius) it goes as far as the first scenery, less a
   * margin; and where it would end up it is kept `size` clear of scenery in
   * eight directions (shrunk, and moved off, by what is near). Done once.
   */
  private place(
    part: {
      reach: number;
      turn: number;
      up: number;
      fit: number;
      push: THREE.Vector3;
    },
    heart: THREE.Vector3,
    way: THREE.Vector3,
    size: number,
  ): void {
    const reach = this.reach;

    part.push.set(0, 0, 0);
    part.reach = 1;
    part.turn = 0;
    part.up = 99;
    part.fit = 1;

    if (reach === null) {
      return;
    }

    // Sideways: the first scenery along its way at the cloud's own height (the
    // floor under it and the ceiling over it are not walls to be stopped by).
    const length = Math.hypot(way.x, way.z) * C.SMOKE_MAX_RADIUS;

    if (length > 1e-3) {
      // How far (as a share of what it wants) it can go along a turn of its
      // way, stopping a margin short of the first scenery.
      const along = (turn: number): number => {
        const c = Math.cos(turn);
        const n = Math.sin(turn);
        const wx = way.x * c - way.z * n;
        const wz = way.x * n + way.z * c;
        const free = reach(
          heart.x,
          heart.y,
          heart.z,
          heart.x + wx * C.SMOKE_MAX_RADIUS,
          heart.y,
          heart.z + wz * C.SMOKE_MAX_RADIUS,
        );

        return (free * length - size * 0.35) / length;
      };

      let best = along(0);

      // Blocked short of where it wanted to go: it spreads out instead toward
      // where there is room (the nearest turn that gets it further), and the
      // volume it lost is made up by letting it reach a little past its share.
      if (best < 0.8) {
        let bestTurn = 0;
        const slack = 1.25;

        for (const step of [0.4, 0.8, 1.2, 1.7, 2.2, 2.8, Math.PI]) {
          for (const sign of step === Math.PI ? [1] : [1, -1]) {
            const candidate = Math.min(along(step * sign), slack);

            // Needs to be clearly better than staying, and nearer turns win ties.
            if (candidate > best + 0.08) {
              best = candidate;
              bestTurn = step * sign;
            }
          }

          if (best >= 0.95) {
            break;
          }
        }

        part.turn = bestTurn;
      }

      part.reach = Math.min(Math.max(best, 0.1), 1.25);
    }

    // Upward: how high it can climb before the ceiling (or a roof over it).
    part.up =
      reach(
        heart.x,
        heart.y,
        heart.z,
        heart.x,
        heart.y + C.SMOKE_MAX_RADIUS,
        heart.z,
      ) * C.SMOKE_MAX_RADIUS;

    this.probe.set(
      heart.x +
        (way.x * Math.cos(part.turn) - way.z * Math.sin(part.turn)) *
          C.SMOKE_MAX_RADIUS *
          part.reach,
      heart.y,
      heart.z +
        (way.x * Math.sin(part.turn) + way.z * Math.cos(part.turn)) *
          C.SMOKE_MAX_RADIUS *
          part.reach,
    );

    let least = 1;

    for (const [dx, dy, dz] of DIRECTIONS) {
      const free = reach(
        this.probe.x,
        this.probe.y,
        this.probe.z,
        this.probe.x + dx * size,
        this.probe.y + dy * size,
        this.probe.z + dz * size,
      );

      if (free < 1) {
        least = Math.min(least, free);
        part.push.x -= dx * (1 - free) * size;
        part.push.y -= dy * (1 - free) * size;
        part.push.z -= dz * (1 - free) * size;
      }
    }

    // (The slanting rays add to the straight ones: about half is the push;
    // and never pushed down through the floor.)
    part.push.multiplyScalar(0.55);
    part.push.y = Math.max(part.push.y, 0);
    // Shrunk a little by scenery close by (never to separate small balls: the
    // cloud stays one soft mass; its centres are what are kept off the walls).
    part.fit = 0.6 + 0.4 * least;
  }

  /** Turns a point's sideways offset from the heart by `turn` and scales it by `reach`. */
  private turnOut(
    point: THREE.Vector3,
    heart: THREE.Vector3,
    turn: number,
    reach: number,
  ): void {
    const dx = point.x - heart.x;
    const dz = point.z - heart.z;
    const c = Math.cos(turn);
    const n = Math.sin(turn);

    point.x = heart.x + (dx * c - dz * n) * reach;
    point.z = heart.z + (dx * n + dz * c) * reach;
  }

  private pose(view: CloudView, camera: THREE.Camera, time: number): void {
    const { cloud } = view;
    const radius = smokeRadius(cloud.age);
    const thick = smokeThickness(cloud.age);
    const floor = cloud.position.y - SMOKE_CENTRE_LIFT;
    const { offset, look, color } = view.attributes;
    const alive: number[] = [];

    let budget = PLACE_PER_FRAME;

    view.puffs.forEach((puff, i) => {
      puff.alpha = 0;

      if (!puff.placed) {
        if (budget <= 0) {
          return;
        }

        budget--;
        this.away.copy(puff.offset).multiplyScalar(0.85);
        this.place(
          puff,
          cloud.position,
          this.away,
          Math.max(puff.size * C.SMOKE_MAX_RADIUS * 1.15, 0.5) * 0.75,
        );
        puff.placed = true;
      }

      const sway = 0.06 * radius;

      // Out along its own way, but never past the first scenery on it.
      this.world
        .copy(cloud.position)
        .addScaledVector(puff.offset, radius * 0.85)
        .addScaledVector(puff.push, radius / C.SMOKE_MAX_RADIUS);
      // A little wider and a good deal taller than the plain ball.
      this.world.x += puff.offset.x * radius * 0.85 * (SPREAD_X - 1);
      this.world.z += puff.offset.z * radius * 0.85 * (SPREAD_X - 1);
      this.world.y += Math.max(puff.offset.y, 0) * radius * 0.85 * (RISE - 1);
      // Out only as far as the first wall (sideways), and no higher than the
      // ceiling lets it.
      this.turnOut(this.world, cloud.position, puff.turn, puff.reach);
      this.world.x += Math.sin(time * 0.31 + puff.phase) * sway * puff.reach;
      this.world.z +=
        Math.cos(time * 0.27 + puff.phase * 1.3) * sway * puff.reach;

      const size = Math.max(puff.size * radius * 1.15, 0.5) * puff.fit;

      this.world.y = Math.min(
        this.world.y,
        cloud.position.y + puff.up - size * 0.4,
      );
      // Never sunk into the floor.
      this.world.y = Math.max(this.world.y, floor + size * 0.2);

      // Fade the puffs round the lens so nothing fills the view with one disc.
      const distance = camera.position.distanceTo(this.world);
      const near = Math.min(
        Math.max((distance - size * 0.2) / (size * NEAR_FADE), 0),
        1,
      );

      puff.world.copy(this.world);
      puff.drawSize = size;
      puff.alpha = C.SMOKE_OPACITY * thick * near;
      view.distance[i] = distance;

      if (puff.alpha > 0.004) {
        alive.push(i);
      }
    });

    // Back to front, so the nearer puffs blend over the farther ones (one sort
    // of the cloud's own puffs; the draw itself is a single call).
    alive.sort((a, b) => view.distance[b] - view.distance[a]);

    alive.forEach((index, slot) => {
      const puff = view.puffs[index];

      offset.setXYZ(slot, puff.world.x, puff.world.y, puff.world.z);
      look.setXY(slot, puff.drawSize, puff.alpha);
      color.setXYZ(slot, puff.color.r, puff.color.g, puff.color.b);
    });

    (view.mesh.geometry as THREE.InstancedBufferGeometry).instanceCount =
      alive.length;
    view.mesh.visible = alive.length > 0;
    offset.needsUpdate = true;
    look.needsUpdate = true;
    color.needsUpdate = true;

    // The bodies: one in each lump, as dense as the cloud, over the floor.
    view.coreMaterial.uniforms.uOpacity.value = Math.min(0.94 * thick, 0.94);

    view.lobes.forEach((lobe, k) => {
      const core = view.cores[k];

      core.visible = false;

      if (!lobe.placed) {
        this.away.copy(lobe.centre).multiplyScalar(0.85);
        this.place(
          lobe,
          cloud.position,
          this.away,
          lobe.size * C.SMOKE_MAX_RADIUS * 0.85 * CORE_SHARE * 1.2,
        );
        lobe.placed = true;
      }

      const size =
        Math.max(lobe.size * radius * 0.85 * CORE_SHARE, 0.2) * lobe.fit;

      core.position
        .copy(cloud.position)
        .addScaledVector(lobe.centre, radius * 0.85)
        .addScaledVector(lobe.push, radius / C.SMOKE_MAX_RADIUS);
      core.position.x += lobe.centre.x * radius * 0.85 * (SPREAD_X - 1);
      core.position.z += lobe.centre.z * radius * 0.85 * (SPREAD_X - 1);
      core.position.y +=
        Math.max(lobe.centre.y, 0) * radius * 0.85 * (RISE - 1);
      this.turnOut(core.position, cloud.position, lobe.turn, lobe.reach);
      core.position.y = Math.min(
        core.position.y,
        cloud.position.y + lobe.up - size * 0.4,
      );
      core.scale.set(size, size * 0.85, size);
      core.position.y = Math.max(core.position.y, floor + size * 0.85 * 0.9);
      core.visible = thick > 0.02;
    });

    // The flash when it starts to emit.
    const flare = Math.max(0, 1 - cloud.age / FLASH_SECONDS);

    view.flash.visible = flare > 0.01;

    if (view.flash.visible) {
      view.flash.position.copy(cloud.position);
      view.flash.scale.setScalar(1.2 + (1 - flare) * 2.5);
      view.flash.material.opacity = flare * 0.8;
    }
  }

  /** Hides a finished cloud's parts and keeps them for the next one. */
  private destroy(view: CloudView): void {
    view.mesh.visible = false;
    view.flash.visible = false;

    for (const core of view.cores) {
      core.visible = false;
    }

    view.coreMaterial.uniforms.uOpacity.value = 0;
    this.free.push(view.slot);
  }

  public dispose(): void {
    this.views.clear();

    for (const child of [...this.group.children]) {
      if (child instanceof THREE.Sprite) {
        child.material.dispose();
      }

      if (child instanceof THREE.Mesh && child.name === "smoke-slot") {
        const material = child.material;

        if (child.geometry instanceof THREE.InstancedBufferGeometry) {
          child.geometry.dispose();
        }

        if (!Array.isArray(material)) {
          material.dispose();
        }
      }
    }

    for (const slot of this.free) {
      slot.coreMaterial.dispose();
    }

    this.texture.dispose();
    this.flashTexture.dispose();
    this.coreGeometry.dispose();
    this.group.removeFromParent();
  }
}
