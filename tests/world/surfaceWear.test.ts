import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { weather } from "../../src/world/materials/SurfaceWear";

describe("weather", () => {
  it("weathers a material once, in place", () => {
    const material = new THREE.MeshStandardMaterial({ color: 0x556677 });
    const same = weather(material, "metal");
    const key = same.customProgramCacheKey();

    expect(same).toBe(material);
    expect(weather(material, "concrete").customProgramCacheKey()).toBe(key);
  });

  it("keeps the material's own shader changes", () => {
    const material = new THREE.MeshStandardMaterial();
    let own = 0;

    material.onBeforeCompile = (): void => {
      own++;
    };
    weather(material, "wood");

    const shader = {
      vertexShader: "#include <common>\n#include <project_vertex>",
      fragmentShader:
        "#include <common>\n#include <color_fragment>\n#include <metalnessmap_fragment>",
    } as THREE.WebGLProgramParametersWithUniforms;

    material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);

    expect(own).toBe(1);
    expect(shader.fragmentShader).toContain("wxAmount");
    expect(shader.vertexShader).toContain("vWxEdge");
  });

  it("gives each look and exposure its own program", () => {
    const key = (kind: "metal" | "wood" | "concrete", exposure: number) =>
      weather(new THREE.MeshStandardMaterial(), kind, {
        exposure,
      }).customProgramCacheKey();

    expect(key("metal", 1)).not.toBe(key("wood", 1));
    expect(key("metal", 1)).not.toBe(key("metal", 0.5));
  });

  it("lets a mixed material tell its pieces apart", () => {
    const material = weather(new THREE.MeshStandardMaterial(), "mixed");
    const shader = {
      vertexShader: "#include <common>\n#include <project_vertex>",
      fragmentShader:
        "#include <common>\n#include <color_fragment>\n#include <metalnessmap_fragment>",
    } as THREE.WebGLProgramParametersWithUniforms;

    material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);

    expect(shader.vertexShader).toContain("attribute vec4 aWearA");
    expect(shader.fragmentShader).toContain("vWxKind");
  });
});
