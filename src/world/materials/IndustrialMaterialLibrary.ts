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
import { createIndustrialGlassMaterial } from "./GlassMaterial";
import { createIndustrialSteelMaterial } from "./SteelMaterial";
import { createFloorMaterial, type FloorVariant } from "./FloorMaterial";
import { createBarrierMaterial } from "./BarrierMaterial";
import { createMetalTexture } from "./MetalTexture";

/**
 * The map's reusable surface materials, made on first use and shared by every
 * mesh that asks. Floors are the first family; walls, metal, painted metal,
 * roofs and wood get their own `get...` here later, so the builder only ever
 * asks the library for a look.
 */
/**
 * Three complementary sets of each concrete texture. They differ in seed, tile
 * size (so their repeats never line up), amount of staining, hairline cracks
 * and damp, and the variants that use them sit next to each other all over the
 * map: no two neighbouring surfaces show the same marks.
 */
const FLOOR_SETS: Array<{
  size: number;
  seed: number;
  tileMetres: number;
  cracks: number;
}> = [
  { size: 1024, seed: 1337, tileMetres: 8, cracks: 3 },
  { size: 640, seed: 9001, tileMetres: 5, cracks: 12 },
  { size: 768, seed: 4711, tileMetres: 6.5, cracks: 6 },
];

const PAINTED_SETS: Array<{
  size: number;
  seed: number;
  tileMetres: number;
  cracks: number;
  damp: number;
}> = [
  { size: 768, seed: 77, tileMetres: 7.5, cracks: 0, damp: 1 },
  { size: 640, seed: 515, tileMetres: 6, cracks: 9, damp: 1.5 },
  { size: 768, seed: 911, tileMetres: 9, cracks: 5, damp: 0.6 },
];

export class IndustrialMaterialLibrary {
  private floorSets: Array<ConcreteTextures | null> = [null, null, null];
  private paintedSets: Array<PaintedConcreteTextures | null> = [
    null,
    null,
    null,
  ];
  private readonly barriers = new Map<number, THREE.MeshStandardMaterial>();
  private readonly floors = new Map<FloorVariant, THREE.MeshStandardMaterial>();
  private steelMaterial: THREE.MeshStandardMaterial | null = null;
  private metalWear: THREE.DataTexture | null = null;
  private glassMaterial: THREE.MeshStandardMaterial | null = null;
  private brickTextures: BrickTextures | null = null;
  private readonly painted = new Map<
    PaintedVariant,
    THREE.MeshStandardMaterial
  >();
  private readonly bricks = new Map<BrickVariant, THREE.MeshStandardMaterial>();

  /** One of the three floor-concrete texture sets (made on first use). */
  public concrete(index = 0): ConcreteTextures {
    const found = this.floorSets[index];

    if (found) {
      return found;
    }

    const spec = FLOOR_SETS[index];
    const made = createConcreteTextures(spec.size, spec.seed, {
      tileMetres: spec.tileMetres,
      cracks: spec.cracks,
    });

    this.floorSets[index] = made;

    return made;
  }

  /** The material of a floor variant (3 in all, each made once). */
  public floor(variant: FloorVariant): THREE.MeshStandardMaterial {
    let material = this.floors.get(variant);

    if (!material) {
      material = createFloorMaterial(
        variant,
        this.concrete(variant === "dark" ? 0 : variant === "medium" ? 1 : 2),
      );
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

  /** One of the three painted-concrete texture sets (made on first use). */
  public paintedMaps(index = 0): PaintedConcreteTextures {
    const found = this.paintedSets[index];

    if (found) {
      return found;
    }

    const spec = PAINTED_SETS[index];
    const made = createPaintedConcreteTextures(spec.size, spec.seed, {
      tileMetres: spec.tileMetres,
      cracks: spec.cracks,
      damp: spec.damp,
    });

    this.paintedSets[index] = made;

    return made;
  }

  /**
   * A concrete-barrier material (railings, low walls and cover): lighter than
   * the walls, from one of the three painted sets, so neighbouring barriers
   * differ. `index` is 0 to 2.
   */
  public barrier(index: number): THREE.MeshStandardMaterial {
    const at = ((index % 3) + 3) % 3;
    let material = this.barriers.get(at);

    if (!material) {
      material = createBarrierMaterial(at, this.paintedMaps((at + 1) % 3));
      this.barriers.set(at, material);
    }

    return material;
  }

  /** Which barrier variant a piece gets, spread by its id (the same every run). */
  public barrierVariantFor(id: string): number {
    let hash = 2166136261;

    for (let i = 0; i < id.length; i++) {
      hash = Math.imul(hash ^ id.charCodeAt(i), 16777619);
    }

    return (hash >>> 0) % 3;
  }

  /** The material of a painted-concrete variant (3 in all, each made once). */
  public paintedConcrete(variant: PaintedVariant): THREE.MeshStandardMaterial {
    let material = this.painted.get(variant);

    if (!material) {
      material = createPaintedConcreteMaterial(
        variant,
        this.paintedMaps(
          variant === "dark" ? 0 : variant === "standard" ? 1 : 2,
        ),
      );
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

  /**
   * The wear texture shared by every metal surface: scratches and a little
   * rust, near-white so the material's own colour does the tinting.
   */
  public metalWearMap(): THREE.DataTexture {
    this.metalWear ??= createMetalTexture();

    return this.metalWear;
  }

  /** The structural-steel material, shared by every beam, column, brace and truss. */
  public steel(): THREE.MeshStandardMaterial {
    this.steelMaterial ??= createIndustrialSteelMaterial(this.metalWearMap());

    return this.steelMaterial;
  }

  /** Tinted, see-through reinforced glass for skylights and roof barriers. */
  public glass(): THREE.MeshStandardMaterial {
    this.glassMaterial ??= createIndustrialGlassMaterial();

    return this.glassMaterial;
  }

  /** How many floor materials and textures exist (for tests and reports). */
  public get counts(): { materials: number; textures: number } {
    return {
      materials:
        this.floors.size +
        this.bricks.size +
        this.painted.size +
        this.barriers.size +
        (this.steelMaterial ? 1 : 0) +
        (this.glassMaterial ? 1 : 0),
      textures:
        this.floorSets.filter(Boolean).length * 2 +
        (this.brickTextures ? 3 : 0) +
        this.paintedSets.filter(Boolean).length * 3 +
        (this.metalWear ? 1 : 0),
    };
  }
}

export const industrialMaterials = new IndustrialMaterialLibrary();
