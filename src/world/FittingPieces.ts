import type { PileElement } from "./ArenaLayout";

/**
 * The pieces a room's fittings are drawn from: boxes (painted steel, timber,
 * bins), pipes (bare steel, from a centre, a length and a diameter) and a few
 * chunks and bags. They become a pile's `elements`.
 */

/** A small repeatable generator (the same layout every run). */
export function rng(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;

    return state / 4294967296;
  };
}

export class Pieces {
  public readonly elements: PileElement[] = [];

  /** A box from its bottom centre; `ry`, `rz` and `rx` turn it. */
  public box(
    x: number,
    bottom: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    color: number,
    ry = 0,
    rz = 0,
    rx = 0,
  ): void {
    this.elements.push({
      shape: "plank",
      x,
      y: bottom + sy / 2,
      z,
      sx,
      sy,
      sz,
      rx,
      ry,
      rz,
      color,
    });
  }

  /** A pipe or bar from its centre, its length along x unless turned. */
  public bar(
    x: number,
    y: number,
    z: number,
    length: number,
    diameter: number,
    color: number,
    ry = 0,
    rz = 0,
    rx = 0,
  ): void {
    this.elements.push({
      shape: "pipe",
      x,
      y,
      z,
      sx: length,
      sy: diameter,
      sz: diameter,
      rx,
      ry,
      rz,
      color,
    });
  }

  /** A pipe lying along x from `x0` to `x1`. */
  public alongX(
    x0: number,
    x1: number,
    y: number,
    z: number,
    diameter: number,
    color: number,
  ): void {
    this.bar((x0 + x1) / 2, y, z, Math.abs(x1 - x0), diameter, color);
  }

  /** A pipe lying along z from `z0` to `z1`. */
  public alongZ(
    x: number,
    y: number,
    z0: number,
    z1: number,
    diameter: number,
    color: number,
  ): void {
    this.bar(
      x,
      y,
      (z0 + z1) / 2,
      Math.abs(z1 - z0),
      diameter,
      color,
      Math.PI / 2,
    );
  }

  /** An upright pipe from `bottom` up `height`. */
  public post(
    x: number,
    bottom: number,
    z: number,
    height: number,
    diameter: number,
    color: number,
  ): void {
    this.bar(
      x,
      bottom + height / 2,
      z,
      height,
      diameter,
      color,
      0,
      Math.PI / 2,
    );
  }

  public chunk(
    x: number,
    bottom: number,
    z: number,
    size: number,
    color: number,
    ry = 0,
  ): void {
    this.elements.push({
      shape: "chunk",
      x,
      y: bottom + size * 0.3,
      z,
      sx: size,
      sy: size * 0.6,
      sz: size * 0.85,
      rx: 0,
      ry,
      rz: 0,
      color,
    });
  }

  public bag(
    x: number,
    bottom: number,
    z: number,
    ry: number,
    color: number,
  ): void {
    this.elements.push({
      shape: "bag",
      x,
      y: bottom + 0.1,
      z,
      sx: 0.8,
      sy: 0.2,
      sz: 0.5,
      rx: 0,
      ry,
      rz: 0,
      color,
    });
  }
}
