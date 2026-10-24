import * as THREE from "three";

/**
 * A bug or two darting round a lamp: a tiny speck on a fast, erratic path (a
 * few overlapping quick wobbles) that stays within a metre of the lamp head.
 * Cheap: one small box per bug, moved by one function of time, no state to
 * keep between frames.
 */

// A tiny bug: a short speck, no wings.
const BODY = new THREE.BoxGeometry(0.03, 0.014, 0.014);

/** Everything that makes one bug's flight its own. */
interface Flight {
  /** Loop rate (rad/s, signed: some go the other way), radius and its wobble. */
  rate: number;
  radius: number;
  breathe: number;
  /** Tilt of the loop's plane, and how stretched the loop is. */
  tilt: [number, number];
  stretch: number;
  /** Darts: rate, size and phase on each axis, two of them each. */
  darts: Array<[number, number, number]>;
  phase: number;
}

interface Moth {
  group: THREE.Group;
  centre: THREE.Vector3;
  flight: Flight;
  /** Phase and rate offsets so no two moths move alike. */
  seed: number;
  /** The lamp it flies round (if it has an id): when that lamp goes out, so does it. */
  lampId?: string;
}

function seeded(seed: number): () => number {
  let a = seed;

  return () => {
    a = (a + 0x6d2b79f5) | 0;

    let t = Math.imul(a ^ (a >>> 15), 1 | a);

    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Moths {
  public readonly group = new THREE.Group();

  private readonly moths: Moth[] = [];
  private readonly material: THREE.MeshBasicMaterial;
  private readonly next = new THREE.Vector3();

  /**
   * `lamps` are the lamp heads (where they hang and where they point); one or
   * two moths go to each, chosen the same way every run.
   */
  constructor(
    lamps: ReadonlyArray<{
      position: THREE.Vector3;
      aim: THREE.Vector3;
      id?: string;
    }>,
    seed = 4417,
  ) {
    const random = seeded(seed);

    this.group.name = "moths";
    this.material = new THREE.MeshBasicMaterial({
      color: 0xd9d0b8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
      fog: false,
      toneMapped: false,
      depthWrite: false,
    });

    for (const lamp of lamps) {
      const count = random() < 0.5 ? 1 : 2;
      // They circle a little in front of the lens, where the light is.
      const forward = lamp.aim.clone().sub(lamp.position).normalize();
      const centre = lamp.position.clone().addScaledVector(forward, 0.55);

      for (let i = 0; i < count; i++) {
        const moth = this.make(centre, random);

        moth.lampId = lamp.id;
        this.moths.push(moth);
      }
    }
  }

  /** The bugs round a lamp go when it goes out (a bulb breaks), and come back with it. */
  public setLampOut(id: string, out: boolean): void {
    for (const moth of this.moths) {
      if (moth.lampId === id) {
        moth.group.visible = !out;
      }
    }
  }

  private make(centre: THREE.Vector3, random: () => number): Moth {
    const group = new THREE.Group();
    const body = new THREE.Mesh(BODY, this.material);
    const between = (lo: number, hi: number): number =>
      lo + random() * (hi - lo);
    const dart = (): [number, number, number] => [
      between(4, 26),
      between(0.03, 0.12),
      between(0, Math.PI * 2),
    ];

    group.add(body);
    group.scale.setScalar(between(0.8, 1.4));
    this.group.add(group);

    return {
      group,
      centre,
      seed: random(),
      flight: {
        rate: between(5, 15) * (random() < 0.5 ? -1 : 1),
        radius: between(0.18, 0.4),
        breathe: between(0.8, 3.5),
        tilt: [between(-0.9, 0.9), between(-0.9, 0.9)],
        stretch: between(0.5, 1.3),
        darts: [dart(), dart(), dart(), dart(), dart(), dart()],
        phase: between(0, Math.PI * 2),
      },
    };
  }

  /** Where a bug is at `time` (seconds), round its lamp: its own path, not a copy. */
  private place(moth: Moth, time: number, out: THREE.Vector3): void {
    const f = moth.flight;
    const a = time * f.rate + f.phase;
    const r = f.radius * (1 + 0.45 * Math.sin(time * f.breathe + f.phase * 2));
    // A loop in a plane of its own: round, then tipped two ways.
    let x = Math.cos(a) * r * f.stretch;
    let y = Math.sin(a * 0.7 + f.phase) * r * 0.5;
    let z = Math.sin(a) * r;

    const cx = Math.cos(f.tilt[0]);
    const sx = Math.sin(f.tilt[0]);
    const y1 = y * cx - z * sx;
    const z1 = y * sx + z * cx;

    y = y1;
    z = z1;

    const cz = Math.cos(f.tilt[1]);
    const sz = Math.sin(f.tilt[1]);
    const x1 = x * cz - y * sz;
    const y2 = x * sz + y * cz;

    x = x1;
    y = y2;

    // Darts: quick wobbles at rates of its own on every axis.
    const d = f.darts;

    x +=
      Math.sin(time * d[0][0] + d[0][2]) * d[0][1] +
      Math.sin(time * d[1][0] + d[1][2]) * d[1][1];
    y +=
      Math.sin(time * d[2][0] + d[2][2]) * d[2][1] +
      Math.sin(time * d[3][0] + d[3][2]) * d[3][1];
    z +=
      Math.sin(time * d[4][0] + d[4][2]) * d[4][1] +
      Math.sin(time * d[5][0] + d[5][2]) * d[5][1];

    out.set(moth.centre.x + x, moth.centre.y + y, moth.centre.z + z);
  }

  public update(time: number): void {
    for (const moth of this.moths) {
      this.place(moth, time, this.next);
      moth.group.position.copy(this.next);
    }
  }

  public get count(): number {
    return this.moths.length;
  }

  public dispose(): void {
    this.material.dispose();
    this.group.removeFromParent();
  }
}
