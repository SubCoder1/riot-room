import type * as THREE from "three";

import {
  createConcreteTextures,
  type ConcreteTextures,
} from "./ConcreteTexture";
import { createBrickTextures, type BrickTextures } from "./BrickTexture";
import { createBrickMaterial, type BrickVariant } from "./BrickMaterial";
import {
  createPaintedConcreteMaterial,
  type PaintedVariant,
} from "./PaintedConcreteMaterial";
import {
  createPaintedConcreteTextures,
  type PaintedConcreteTextures,
} from "./PaintedConcreteTexture";
import { createIndustrialSteelMaterial } from "./SteelMaterial";
import { createFloorMaterial, type FloorVariant } from "./FloorMaterial";

/**
 * The map's reusable surface materials, made on first use and shared by every
 * mesh that asks. Floors are the first family; walls, metal, painted metal,
 * roofs and wood get their own `get...` here later, so the builder only ever
 * asks the library for a look.
 */
export class IndustrialMaterialLibrary {
  private textures: ConcreteTextures | null = null;
  private readonly floors = new Map<FloorVariant, THREE.MeshStandardMaterial>();
  private steelMaterial: THREE.MeshStandardMaterial | null = null;
  private brickTextures: BrickTextures | null = null;
  private paintedTextures: PaintedConcreteTextures | null = null;
  private readonly painted = new Map<
    PaintedVariant,
    THREE.MeshStandardMaterial
  >();
  private readonly bricks = new Map<BrickVariant, THREE.MeshStandardMaterial>();

  /** Concrete textures (colour and normal), shared by every concrete surface. */
  public concrete(): ConcreteTextures {
    this.textures ??= createConcreteTextures();

    return this.textures;
  }

  /** The material of a floor variant (3 in all, each made once). */
  public floor(variant: FloorVariant): THREE.MeshStandardMaterial {
    let material = this.floors.get(variant);

    if (!material) {
      material = createFloorMaterial(variant, this.concrete());
      this.floors.set(variant, material);
    }

    return material;
  }

  /**
   * Which variant a floor gets: spread over the map by its id, so it is the
   * same every run and no two neighbours are guaranteed the same.
   */
  public floorVariantFor(id: string): FloorVariant {
    let hash = 2166136261;

    for (let i = 0; i < id.length; i++) {
      hash = Math.imul(hash ^ id.charCodeAt(i), 16777619);
    }

    const pick = (hash >>> 0) % 100;

    return pick < 40 ? "dark" : pick < 75 ? "medium" : "worn";
  }

  /** Brick textures (colour, normal, roughness), shared by every brick wall. */
  public brickMaps(): BrickTextures {
    this.brickTextures ??= createBrickTextures();

    return this.brickTextures;
  }

  /** The material of a brick variant (2 in all, each made once). */
  public brick(variant: BrickVariant): THREE.MeshStandardMaterial {
    let material = this.bricks.get(variant);

    if (!material) {
      material = createBrickMaterial(variant, this.brickMaps());
      this.bricks.set(variant, material);
    }

    return material;
  }

  /** Which brick variant a wall gets, spread by its id (the same every run). */
  public brickVariantFor(id: string): BrickVariant {
    let hash = 2166136261;

    for (let i = 0; i < id.length; i++) {
      hash = Math.imul(hash ^ id.charCodeAt(i), 16777619);
    }

    return (hash >>> 0) % 100 < 55 ? "dark" : "worn";
  }

  /** Painted-concrete textures (colour, normal, roughness), shared by every such wall. */
  public paintedMaps(): PaintedConcreteTextures {
    this.paintedTextures ??= createPaintedConcreteTextures();

    return this.paintedTextures;
  }

  /** The material of a painted-concrete variant (3 in all, each made once). */
  public paintedConcrete(variant: PaintedVariant): THREE.MeshStandardMaterial {
    let material = this.painted.get(variant);

    if (!material) {
      material = createPaintedConcreteMaterial(variant, this.paintedMaps());
      this.painted.set(variant, material);
    }

    return material;
  }

  /** Which painted variant a wall gets, spread by its id (the same every run). */
  public paintedVariantFor(id: string): PaintedVariant {
    let hash = 2166136261;

    for (let i = 0; i < id.length; i++) {
      hash = Math.imul(hash ^ id.charCodeAt(i), 16777619);
    }

    const pick = (hash >>> 0) % 100;

    return pick < 35 ? "dark" : pick < 75 ? "standard" : "worn";
  }

  /** The structural-steel material, shared by every beam, column, brace and truss. */
  public steel(): THREE.MeshStandardMaterial {
    this.steelMaterial ??= createIndustrialSteelMaterial();

    return this.steelMaterial;
  }

  /** How many floor materials and textures exist (for tests and reports). */
  public get counts(): { materials: number; textures: number } {
    return {
      materials:
        this.floors.size +
        this.bricks.size +
        this.painted.size +
        (this.steelMaterial ? 1 : 0),
      textures:
        (this.textures ? 2 : 0) +
        (this.brickTextures ? 3 : 0) +
        (this.paintedTextures ? 3 : 0),
    };
  }
}

export const industrialMaterials = new IndustrialMaterialLibrary();
