import * as THREE from "three";

import { GRENADE_CONFIG } from "../combat/GrenadeConfig";
import { createPuffTexture } from "./SoftTexture";

/** Seconds the fire and smoke of an explosion are on screen. */
const LIFE = 1.9;
/** Seconds the scorch mark on the ground takes to fade. */
const SCORCH_LIFE = 5;
const FIRE_PUFFS = 10;
const SMOKE_PUFFS = 9;
const DUST_PUFFS = 7;
const SPARKS = 26;
/** Downward acceleration of the sparks, m/s^2. */
const SPARK_GRAVITY = 15;
/** At most this many explosions are drawn at once (the oldest is replaced). */
const MAX_EXPLOSIONS = 4;

interface Explosion {
  age: number;
  active: boolean;
  flash: THREE.Sprite;
  core: THREE.Sprite;
  fire: THREE.Sprite[];
  smoke: THREE.Sprite[];
  dust: THREE.Sprite[];
  sparks: THREE.Sprite[];
  ring: THREE.Mesh;
  scorch: THREE.Mesh;
  /** Where each puff drifts to, in units of the blast radius. */
  fireDir: THREE.Vector3[];
  smokeDir: THREE.Vector3[];
  dustDir: THREE.Vector3[];
  /** Each spark's launch velocity, m/s. */
  sparkVel: THREE.Vector3[];
  at: THREE.Vector3;
}

const clamp01 = (t: number): number => Math.min(Math.max(t, 0), 1);
const easeOut = (t: number): number => 1 - Math.pow(1 - t, 3);

/**
 * The picture of a grenade going off, spanning the blast radius (the same
 * one that hurts):
 *   - a white-hot flash and core that die within a tenth of a second,
 *   - a layered fireball that swells out and cools from yellow through orange
 *     and red to nothing,
 *   - sparks that fly out and fall back under gravity,
 *   - a shock ring and a skirt of dust racing out along the ground,
 *   - dark smoke that rises, spreads and thins, and
 *   - a scorch mark that stays on the floor for a few seconds.
 * A fixed pool of sprites, nothing allocated per explosion. Local only: it
 * follows the "explosion" event.
 */
export class ExplosionView {
  public readonly group = new THREE.Group();

  private readonly pool: Explosion[] = [];
  private readonly texture = createPuffTexture(64, 11);
  private readonly ringGeometry = new THREE.RingGeometry(0.8, 1, 48);
  private readonly discGeometry = new THREE.CircleGeometry(1, 28);
  private next = 0;

  constructor() {
    for (let i = 0; i < MAX_EXPLOSIONS; i++) {
      this.pool.push(this.createExplosion());
    }
  }

  /** How many explosions are playing now. */
  public get playing(): number {
    return this.pool.filter((e) => e.active).length;
  }

  public spawn(point: THREE.Vector3): void {
    const e = this.pool[this.next];

    this.next = (this.next + 1) % this.pool.length;
    e.active = true;
    e.age = 0;
    e.at.copy(point);
    e.ring.position.set(point.x, point.y + 0.05, point.z);
    e.scorch.position.set(point.x, point.y + 0.03, point.z);
    e.scorch.rotation.z = Math.random() * Math.PI * 2;

    // The fireball: a lump of puffs, the first ones low, the later ones up.
    for (let i = 0; i < FIRE_PUFFS; i++) {
      const a = (i / FIRE_PUFFS) * Math.PI * 2 + Math.random() * 0.8;
      const spread = 0.35 + Math.random() * 0.65;

      e.fireDir[i].set(
        Math.cos(a) * spread,
        0.15 + Math.random() * 0.85,
        Math.sin(a) * spread,
      );
    }

    for (let i = 0; i < SMOKE_PUFFS; i++) {
      const a = (i / SMOKE_PUFFS) * Math.PI * 2 + Math.random();

      e.smokeDir[i].set(
        Math.cos(a) * (0.5 + Math.random() * 0.4),
        0.5 + Math.random() * 1.0,
        Math.sin(a) * (0.5 + Math.random() * 0.4),
      );
    }

    for (let i = 0; i < DUST_PUFFS; i++) {
      const a = (i / DUST_PUFFS) * Math.PI * 2 + Math.random() * 0.5;

      e.dustDir[i].set(Math.cos(a), 0, Math.sin(a));
    }

    // Sparks fly out in every direction, mostly upward.
    for (let i = 0; i < SPARKS; i++) {
      const a = Math.random() * Math.PI * 2;
      const up = 0.2 + Math.random() * 0.9;
      const speed = 7 + Math.random() * 11;

      e.sparkVel[i].set(
        Math.cos(a) * speed * (1 - up * 0.4),
        up * speed * 0.9,
        Math.sin(a) * speed * (1 - up * 0.4),
      );
    }
  }

  public update(dt: number): void {
    const R = GRENADE_CONFIG.GRENADE_BLAST_RADIUS;

    for (const e of this.pool) {
      if (!e.active) {
        continue;
      }

      e.age += dt;

      // The scorch outlasts the rest.
      const scorch = clamp01(e.age / SCORCH_LIFE);

      e.scorch.visible = scorch < 1;
      (e.scorch.material as THREE.MeshBasicMaterial).opacity =
        0.3 * clamp01(e.age / 0.1) * (1 - scorch * scorch);
      e.scorch.scale.setScalar(
        R * (0.22 + 0.14 * easeOut(clamp01(e.age / 0.4))),
      );

      if (e.age >= SCORCH_LIFE) {
        e.active = false;
        this.hide(e);

        continue;
      }

      const t = e.age / LIFE;
      const live = t < 1;

      // Flash and core: white-hot and gone within a tenth of a second.
      const flash = clamp01(1 - e.age / 0.09);
      const core = clamp01(1 - e.age / 0.22);

      e.flash.visible = flash > 0.01;
      e.flash.position.copy(e.at).setY(e.at.y + 0.7);
      e.flash.scale.setScalar(R * (1.0 + 1.6 * (1 - flash)));
      e.flash.material.opacity = flash;

      e.core.visible = core > 0.01;
      e.core.position.copy(e.at).setY(e.at.y + 0.9);
      e.core.scale.setScalar(R * (0.6 + 0.9 * easeOut(1 - core)));
      e.core.material.opacity = core * 0.9;

      // Fireball: out fast, then cooling and fading from the outside in.
      for (let i = 0; i < FIRE_PUFFS; i++) {
        const s = e.fire[i];
        const d = e.fireDir[i];
        // Each puff starts a little later than the one before it.
        const local = clamp01((e.age - i * 0.012) / 0.75);
        const g = easeOut(local);

        s.visible = live && local < 1;
        s.position
          .copy(e.at)
          .addScaledVector(d, R * 0.5 * g)
          .setY(e.at.y + 0.4 + d.y * R * 0.42 * g);
        s.scale.setScalar(R * (0.32 + 0.45 * g));
        s.material.opacity = 0.55 * (1 - local * local);
        // White-yellow at birth, orange, then a deep red as it dies.
        s.material.color.setHSL(0.1 - 0.1 * local, 1, 0.5 - 0.24 * local);
      }

      // Dark smoke rising, spreading and thinning over the whole life.
      const rise = clamp01(e.age / (LIFE + 0.2));

      for (let i = 0; i < SMOKE_PUFFS; i++) {
        const s = e.smoke[i];
        const d = e.smokeDir[i];
        const local = clamp01((e.age - 0.12 - i * 0.03) / (LIFE + 0.1));

        s.visible = local > 0 && local < 1;
        s.position
          .copy(e.at)
          .addScaledVector(d, R * 0.55 * easeOut(local))
          .setY(e.at.y + 0.8 + d.y * R * 0.7 * easeOut(local));
        s.scale.setScalar(R * (0.45 + 0.65 * easeOut(local)));
        s.material.opacity = 0.55 * clamp01(local * 6) * (1 - local);
      }

      // Dust skirt racing along the ground.
      const out = easeOut(clamp01(e.age / 0.5));

      for (let i = 0; i < DUST_PUFFS; i++) {
        const s = e.dust[i];
        const d = e.dustDir[i];
        const local = clamp01(e.age / (LIFE * 0.9));

        s.visible = local < 1;
        s.position
          .copy(e.at)
          .addScaledVector(d, R * 0.85 * out)
          .setY(e.at.y + 0.5 + 0.9 * local);
        s.scale.setScalar(R * (0.35 + 0.35 * local));
        s.material.opacity = 0.5 * (1 - local) * clamp01(e.age / 0.05);
      }

      // Sparks: out fast and falling back, each a short bright streak.
      const sparkLife = 0.9;

      for (let i = 0; i < SPARKS; i++) {
        const s = e.sparks[i];
        const v = e.sparkVel[i];
        const age = e.age;

        s.visible = age < sparkLife;

        if (s.visible) {
          s.position
            .copy(e.at)
            .addScaledVector(v, age)
            .setY(e.at.y + 0.5 + v.y * age - 0.5 * SPARK_GRAVITY * age * age);
          // Never below the floor.
          s.position.y = Math.max(s.position.y, e.at.y + 0.05);
          s.scale.setScalar(0.28 * (1 - age / sparkLife) + 0.06);
          s.material.opacity = 1 - age / sparkLife;
        }
      }

      // The shock ring: out along the floor, thin and bright, then gone.
      const sweep = clamp01(e.age / 0.4);

      e.ring.visible = sweep < 1;
      e.ring.scale.setScalar(Math.max(R * easeOut(sweep), 0.01));
      (e.ring.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - sweep);

      // Nothing left of the fire and smoke: only the scorch remains.
      if (!live && rise >= 1) {
        this.hideEffects(e);
      }
    }
  }

  public dispose(): void {
    for (const e of this.pool) {
      for (const s of [
        e.flash,
        e.core,
        ...e.fire,
        ...e.smoke,
        ...e.dust,
        ...e.sparks,
      ]) {
        s.removeFromParent();
        s.material.dispose();
      }

      for (const m of [e.ring, e.scorch]) {
        m.removeFromParent();
        (m.material as THREE.Material).dispose();
      }
    }

    this.pool.length = 0;
    this.texture.dispose();
    this.ringGeometry.dispose();
    this.discGeometry.dispose();
    this.group.removeFromParent();
  }

  private sprite(color: number, additive: boolean): THREE.Sprite {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.texture,
        color,
        transparent: true,
        depthWrite: false,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
        opacity: 0,
        fog: false,
      }),
    );

    sprite.visible = false;
    sprite.frustumCulled = false;
    this.group.add(sprite);

    return sprite;
  }

  private createExplosion(): Explosion {
    const flash = this.sprite(0xfff4cc, true);
    const core = this.sprite(0xffd27a, true);

    const ring = new THREE.Mesh(
      this.ringGeometry,
      new THREE.MeshBasicMaterial({
        color: 0xf2e2b8,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );

    ring.rotation.x = -Math.PI / 2;
    ring.visible = false;
    ring.frustumCulled = false;
    this.group.add(ring);

    const scorch = new THREE.Mesh(
      this.discGeometry,
      new THREE.MeshBasicMaterial({
        color: 0x050505,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      }),
    );

    scorch.rotation.x = -Math.PI / 2;
    scorch.visible = false;
    scorch.frustumCulled = false;
    this.group.add(scorch);

    return {
      age: 0,
      active: false,
      flash,
      core,
      fire: Array.from({ length: FIRE_PUFFS }, () =>
        this.sprite(0xffa030, true),
      ),
      smoke: Array.from({ length: SMOKE_PUFFS }, () =>
        this.sprite(0x2c2c2e, false),
      ),
      dust: Array.from({ length: DUST_PUFFS }, () =>
        this.sprite(0x8a8274, false),
      ),
      sparks: Array.from({ length: SPARKS }, () => this.sprite(0xffc060, true)),
      ring,
      scorch,
      fireDir: Array.from({ length: FIRE_PUFFS }, () => new THREE.Vector3()),
      smokeDir: Array.from({ length: SMOKE_PUFFS }, () => new THREE.Vector3()),
      dustDir: Array.from({ length: DUST_PUFFS }, () => new THREE.Vector3()),
      sparkVel: Array.from({ length: SPARKS }, () => new THREE.Vector3()),
      at: new THREE.Vector3(),
    };
  }

  private hideEffects(e: Explosion): void {
    e.flash.visible = false;
    e.core.visible = false;
    e.ring.visible = false;

    for (const s of [...e.fire, ...e.smoke, ...e.dust, ...e.sparks]) {
      s.visible = false;
    }
  }

  private hide(e: Explosion): void {
    this.hideEffects(e);
    e.scorch.visible = false;
  }
}
