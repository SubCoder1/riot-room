import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { createPiles } from "../../src/world/PileMeshes";
import { ARENA_LAYOUT } from "../../src/world/UpperFloorMap";

function meshes(group: THREE.Object3D): THREE.Mesh[] {
  const found: THREE.Mesh[] = [];

  group.traverse((object) => {
    if ((object as THREE.Mesh).isMesh) {
      found.push(object as THREE.Mesh);
    }
  });

  return found;
}

describe("createPiles (every piece is a lean copy of its shared source)", () => {
  it("builds the same heaps every time: sharing a source's index changes nothing", () => {
    const first = meshes(createPiles(ARENA_LAYOUT));
    const second = meshes(createPiles(ARENA_LAYOUT));

    expect(first.length).toBeGreaterThan(0);
    expect(second.map((m) => m.name)).toEqual(first.map((m) => m.name));

    first.forEach((mesh, k) => {
      const other = second[k].geometry;

      expect(other.index?.count).toBe(mesh.geometry.index?.count);

      for (const name of Object.keys(mesh.geometry.attributes)) {
        const a = mesh.geometry.getAttribute(name).array;
        const b = other.getAttribute(name).array;

        expect(a.length).toBe(b.length);
        // Spot-check (a full compare of ~2 million vertices is slow).
        for (let i = 0; i < a.length; i += 997) {
          expect(a[i]).toBe(b[i]);
        }
      }
    });
  });

  it("gives each merged mesh all the attributes the weathering and lighting read", () => {
    for (const mesh of meshes(createPiles(ARENA_LAYOUT))) {
      const g = mesh.geometry;

      for (const name of ["aWearA", "aWearB", "color", "normal", "position"]) {
        expect(g.getAttribute(name), name).toBeDefined();
      }

      const count = g.getAttribute("position").count;

      expect(g.getAttribute("color").count).toBe(count);
      expect(g.getAttribute("normal").count).toBe(count);
      expect(g.getAttribute("aWearA").count).toBe(count);

      if (g.index) {
        expect(g.index.count % 3).toBe(0);

        // Every index points at a vertex that exists.
        let highest = 0;

        for (let k = 0; k < g.index.count; k++) {
          highest = Math.max(highest, g.index.getX(k));
        }

        expect(highest).toBeLessThan(count);
      } else {
        expect(count % 3).toBe(0);
      }
    }
  }, 30000);
});
