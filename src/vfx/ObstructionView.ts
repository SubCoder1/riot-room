import * as THREE from "three";

import type { ObstructionPiece } from "../world/CollapsedEntrance";

/**
 * The rubble that blocks the vault passage, drawn piece by piece: a cracked
 * concrete slab, the chunks that prop it, small debris at its base, a few
 * bars. Before the blast every piece stands where the plan puts it. On the
 * blast each is thrown along a short arc to its own predetermined resting
 * place (a staged animation, no physics: a fixed few dozen pieces, each moved
 * by a formula for about a second), then lies there for the rest of the round.
 * `reset` puts every piece back for a new round.
 *
 * Geometry is shared (a few rough rocks and slabs, one box) and so are the
 * materials (one per colour used), so there is next to nothing to build.
 */

/** A roughly broken block: its corners pushed about, the same every time. */
function jagged(
  geometry: THREE.BufferGeometry,
  seed: number,
  amount: number,
): THREE.BufferGeometry {
  let state = seed;
  const random = (): number => {
    state = (state * 1664525 + 1013904223) % 4294967296;

    return state / 4294967296;
  };
  const position = geometry.getAttribute("position");
  const moved = new Map<string, THREE.Vector3>();
  const key = (i: number): string =>
    `${position.getX(i).toFixed(3)},${position.getY(i).toFixed(3)},${position.getZ(i).toFixed(3)}`;

  for (let i = 0; i < position.count; i++) {
    const k = key(i);

    if (!moved.has(k)) {
      moved.set(
        k,
        new THREE.Vector3(
          (random() - 0.5) * amount,
          (random() - 0.5) * amount,
          (random() - 0.5) * amount,
        ),
      );
    }

    const d = moved.get(k)!;

    position.setXYZ(
      i,
      position.getX(i) + d.x,
      position.getY(i) + d.y,
      position.getZ(i) + d.z,
    );
  }

  geometry.computeVertexNormals();

  return geometry;
}

const ease = (t: number): number => 1 - Math.pow(1 - t, 3);

interface Part {
  piece: ObstructionPiece;
  mesh: THREE.Mesh;
}

export class ObstructionView {
  public readonly group = new THREE.Group();

  private readonly parts: Part[] = [];
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials = new Map<number, THREE.MeshStandardMaterial>();
  private age = Number.POSITIVE_INFINITY;
  private playing = false;

  constructor(plan: readonly ObstructionPiece[]) {
    // Broken concrete, not natural rock: slabs are thick plates with broad,
    // slightly uneven faces and knocked corners (three different ones, so no two
    // neighbours match); chunks are blunt, rounded-off lumps. Both are pushed
    // about only a little: no spikes, no shards.
    const bit = jagged(new THREE.DodecahedronGeometry(0.5, 0), 71, 0.14);
    const slabs = [
      jagged(new THREE.BoxGeometry(1, 1, 1, 3, 3, 3), 311, 0.16),
      jagged(new THREE.BoxGeometry(1, 1, 1, 3, 3, 3), 977, 0.2),
      jagged(new THREE.BoxGeometry(1, 1, 1, 3, 3, 3), 4421, 0.18),
    ];
    const rocks = [
      jagged(new THREE.DodecahedronGeometry(0.5, 0), 5, 0.16),
      jagged(new THREE.DodecahedronGeometry(0.5, 0), 143, 0.2),
    ];
    const bar = new THREE.BoxGeometry(1, 1, 1);

    this.geometries.push(bit, ...slabs, ...rocks, bar);

    let slabCount = 0;
    let rockCount = 0;

    for (const piece of plan) {
      const geometry =
        piece.kind === "slab"
          ? slabs[slabCount++ % slabs.length]
          : piece.kind === "rock"
            ? rocks[rockCount++ % rocks.length]
            : piece.kind === "rebar"
              ? bar
              : bit;
      const mesh = new THREE.Mesh(geometry, this.material(piece));

      mesh.scale.set(...piece.size);
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      this.parts.push({ piece, mesh });
    }

    this.group.name = "vault-obstruction";
    this.reset();
  }

  private material(piece: ObstructionPiece): THREE.MeshStandardMaterial {
    let material = this.materials.get(piece.color);

    if (!material) {
      material = new THREE.MeshStandardMaterial({
        color: piece.color,
        // Rough concrete, a touch of grit in the shading; rebar a little duller metal.
        roughness: piece.kind === "rebar" ? 0.7 : 0.95,
        metalness: piece.kind === "rebar" ? 0.3 : 0,
        flatShading: true,
      });
      this.materials.set(piece.color, material);
    }

    return material;
  }

  /** The blast: every piece starts its flight (once; a second call does nothing). */
  public detonate(): void {
    if (this.playing || this.age !== Number.POSITIVE_INFINITY) {
      return;
    }

    this.age = 0;
    this.playing = true;
  }

  /** Whether the pieces are still in flight (the view needs updating). */
  public get isMoving(): boolean {
    return this.playing;
  }

  /** Whether the blast has happened this round. */
  public get isBlasted(): boolean {
    return this.age !== Number.POSITIVE_INFINITY;
  }

  public update(dt: number): void {
    if (!this.playing) {
      return;
    }

    this.age += Math.min(dt, 0.05);

    let moving = false;

    for (const { piece, mesh } of this.parts) {
      const t = Math.min(
        Math.max((this.age - piece.delay) / piece.duration, 0),
        1,
      );

      if (t < 1) {
        moving = true;
      }

      const e = ease(t);
      // Thrown up and landing, with a small hop at the end.
      const hop = t > 0.85 ? 0.05 * Math.sin(((t - 0.85) / 0.15) * Math.PI) : 0;

      mesh.position.set(
        piece.from.p[0] + (piece.to.p[0] - piece.from.p[0]) * e,
        piece.from.p[1] +
          (piece.to.p[1] - piece.from.p[1]) * e +
          piece.arc * Math.sin(Math.PI * Math.min(t * 1.1, 1)) * (1 - t * 0.3) +
          hop,
        piece.from.p[2] + (piece.to.p[2] - piece.from.p[2]) * e,
      );
      mesh.rotation.set(
        piece.from.r[0] + (piece.to.r[0] - piece.from.r[0]) * e,
        piece.from.r[1] + (piece.to.r[1] - piece.from.r[1]) * e,
        piece.from.r[2] + (piece.to.r[2] - piece.from.r[2]) * e,
      );
    }

    if (!moving) {
      this.playing = false;
    }
  }

  /** Every piece back where it stood (a new round). */
  public reset(): void {
    this.age = Number.POSITIVE_INFINITY;
    this.playing = false;

    for (const { piece, mesh } of this.parts) {
      mesh.position.set(...piece.from.p);
      mesh.rotation.set(...piece.from.r);
    }
  }

  public dispose(): void {
    for (const geometry of this.geometries) {
      geometry.dispose();
    }

    for (const material of this.materials.values()) {
      material.dispose();
    }

    this.group.removeFromParent();
  }
}
