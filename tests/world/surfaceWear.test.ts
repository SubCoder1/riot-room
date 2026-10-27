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
      uniforms: {},
    } as THREE.WebGLProgramParametersWithUniforms;

    material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);

    expect(own).toBe(1);
    expect(shader.fragmentShader).toContain("wxAmount");
    expect(shader.vertexShader).toContain("vWxEdge");
  });

  it("gives each look its own program, and each exposure its own uniform", () => {
    const key = (kind: "metal" | "wood" | "concrete", exposure: number) =>
      weather(new THREE.MeshStandardMaterial(), kind, {
        exposure,
      }).customProgramCacheKey();

    expect(key("metal", 1)).not.toBe(key("wood", 1));
    // Exposure is a uniform, so materials that differ only in it share a program.
    expect(key("metal", 1)).toBe(key("metal", 0.5));

    const uniformOf = (exposure: number): number => {
      const material = weather(new THREE.MeshStandardMaterial(), "metal", {
        exposure,
      });
      const shader = {
        vertexShader: "#include <common>\n#include <project_vertex>",
        fragmentShader:
          "#include <common>\n#include <color_fragment>\n#include <metalnessmap_fragment>",
        uniforms: {} as Record<string, { value: number }>,
      } as unknown as THREE.WebGLProgramParametersWithUniforms;

      material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);

      return (shader.uniforms as Record<string, { value: number }>).wearExposure
        .value;
    };

    expect(uniformOf(0.5)).toBe(0.5);
    expect(uniformOf(1)).toBe(1);
  });

  it("lets a mixed material tell its pieces apart", () => {
    const material = weather(new THREE.MeshStandardMaterial(), "mixed");
    const shader = {
      vertexShader: "#include <common>\n#include <project_vertex>",
      fragmentShader:
        "#include <common>\n#include <color_fragment>\n#include <metalnessmap_fragment>",
      uniforms: {},
    } as THREE.WebGLProgramParametersWithUniforms;

    material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);

    expect(shader.vertexShader).toContain("attribute vec4 aWearA");
    expect(shader.fragmentShader).toContain("vWxKind");
  });
});
