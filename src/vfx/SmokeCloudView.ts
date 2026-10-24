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
  sprite: THREE.Sprite;
  /** Where in the cloud, in units of its radius. */
  offset: THREE.Vector3;
  /** Diameter as a share of the cloud radius. */
  size: number;
  spin: number;
  phase: number;
}

interface CloudView {
  cloud: SmokeCloud;
  puffs: Puff[];
  flash: THREE.Sprite;
  /** The lumps the cloud is made of: where each is, and its size, in units of the cloud radius. */
  lobes: Lobe[];
  /** A soft grey body in each lump that hides whatever is inside it. */
  cores: THREE.Mesh[];
  coreMaterial: THREE.ShaderMaterial;
}

interface Lobe {
  centre: THREE.Vector3;
  size: number;
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
 * Cheap on purpose: sprites sharing one generated texture, a fixed number per
 * cloud (SMOKE_PARTICLE_COUNT) and at most SMOKE_MAX_CLOUDS clouds. Puffs that
 * would swallow the lens fade out, and the screen tint (`interior`) carries
 * the feeling of being inside. Local only: a view of the smoke system.
 */
export class SmokeCloudView {
  public readonly group = new THREE.Group();

  private readonly views = new Map<number, CloudView>();
  private readonly texture = createPuffTexture(64, 7);
  private readonly flashTexture = createPuffTexture(32, 3);
  private readonly smoke: SmokeSystem;
  private readonly world = new THREE.Vector3();
  private readonly coreGeometry = new THREE.IcosahedronGeometry(1, 3);

  constructor(smoke: SmokeSystem) {
    this.smoke = smoke;

    // One sprite of each kind a cloud uses, kept hidden in the scene, so the
    // first cloud finds its programs compiled and its textures uploaded (see
    // Game.warmUp) instead of stalling the frame it appears in.
    const puff = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.texture,
        transparent: true,
        depthWrite: false,
        opacity: 0,
        fog: false,
      }),
    );
    const flash = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.flashTexture,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        opacity: 0,
        fog: false,
      }),
    );

    puff.renderOrder = PUFF_ORDER;
    flash.renderOrder = FLASH_ORDER;

    for (const sprite of [puff, flash]) {
      sprite.name = "smoke-warm";
      sprite.visible = false;
      sprite.frustumCulled = false;
      this.group.add(sprite);
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

  private create(cloud: SmokeCloud): CloudView {
    const puffs: Puff[] = [];
    // The lumps: a handful, spread unevenly (the outline is never an oval).
    const lobes: Lobe[] = Array.from({ length: LOBES }, (_, k) => {
      const a = hash(k + 600, cloud.seed) * Math.PI * 2;
      const reach = 0.2 + 0.75 * hash(k + 700, cloud.seed);

      return {
        centre: new THREE.Vector3(
          Math.cos(a) * reach,
          (hash(k + 800, cloud.seed) - 0.3) * 0.4,
          Math.sin(a) * reach,
        ),
        size: 0.18 + 0.34 * hash(k + 900, cloud.seed),
      };
    });

    for (let i = 0; i < C.SMOKE_PARTICLE_COUNT; i++) {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.texture,
          // Smoke grey with a touch of blue, each puff its own shade, so the
          // cloud has lumps and shadows, dark enough for the night.
          color: new THREE.Color().setHSL(
            0.6,
            0.04,
            0.2 + 0.16 * hash(i, cloud.seed),
          ),
          transparent: true,
          depthWrite: false,
          opacity: 0,
          fog: false,
        }),
      );
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
      const offset = new THREE.Vector3(
        Math.cos(theta) * sinPhi * radius * lobe.size,
        Math.max(-0.2, cosPhi * radius * 0.8 * lobe.size),
        Math.sin(theta) * sinPhi * radius * lobe.size,
      ).add(lobe.centre);

      sprite.frustumCulled = false;
      sprite.visible = false;
      sprite.renderOrder = PUFF_ORDER;
      this.group.add(sprite);
      puffs.push({
        sprite,
        offset,
        size: 0.45 + 0.45 * hash(i + 300, cloud.seed),
        spin: (hash(i + 400, cloud.seed) - 0.5) * 0.35,
        phase: hash(i + 500, cloud.seed) * Math.PI * 2,
      });
    }

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
    const cores = lobes.map(() => {
      const core = new THREE.Mesh(this.coreGeometry, coreMaterial);

      core.frustumCulled = false;
      core.visible = false;
      core.renderOrder = CORE_ORDER;
      this.group.add(core);

      return core;
    });

    return { cloud, puffs, flash, lobes, cores, coreMaterial };
  }

  private pose(view: CloudView, camera: THREE.Camera, time: number): void {
    const { cloud } = view;
    const radius = smokeRadius(cloud.age);
    const thick = smokeThickness(cloud.age);
    const floor = cloud.position.y - SMOKE_CENTRE_LIFT;

    for (const puff of view.puffs) {
      const sprite = puff.sprite;
      const sway = 0.06 * radius;

      this.world
        .copy(cloud.position)
        .addScaledVector(puff.offset, radius * 0.85);
      this.world.x += Math.sin(time * 0.31 + puff.phase) * sway;
      this.world.z += Math.cos(time * 0.27 + puff.phase * 1.3) * sway;

      const size = Math.max(puff.size * radius * 1.15, 0.5);

      // Never sunk into the floor.
      this.world.y = Math.max(this.world.y, floor + size * 0.2);
      sprite.position.copy(this.world);
      sprite.scale.set(size, size, 1);
      // The puffs are shaded balls lit from one side, so they do not spin.

      // Fade the puffs round the lens so nothing fills the view with one disc.
      const distance = camera.position.distanceTo(this.world);
      const near = Math.min(
        Math.max((distance - size * 0.2) / (size * NEAR_FADE), 0),
        1,
      );

      sprite.material.opacity = C.SMOKE_OPACITY * thick * near;
      sprite.visible = sprite.material.opacity > 0.004;
    }

    // The bodies: one in each lump, as dense as the cloud, over the floor.
    view.coreMaterial.uniforms.uOpacity.value = Math.min(0.94 * thick, 0.94);

    view.lobes.forEach((lobe, k) => {
      const core = view.cores[k];
      const size = Math.max(lobe.size * radius * 0.85 * CORE_SHARE, 0.2);

      core.position
        .copy(cloud.position)
        .addScaledVector(lobe.centre, radius * 0.85);
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

  private destroy(view: CloudView): void {
    for (const puff of view.puffs) {
      puff.sprite.removeFromParent();
      puff.sprite.material.dispose();
    }

    view.flash.removeFromParent();
    view.flash.material.dispose();
    for (const core of view.cores) {
      core.removeFromParent();
    }

    view.coreMaterial.dispose();
  }

  public dispose(): void {
    for (const view of this.views.values()) {
      this.destroy(view);
    }

    this.views.clear();

    for (const child of [...this.group.children]) {
      if (child instanceof THREE.Sprite && child.name === "smoke-warm") {
        child.material.dispose();
      }
    }

    this.texture.dispose();
    this.flashTexture.dispose();
    this.coreGeometry.dispose();
    this.group.removeFromParent();
  }
}
