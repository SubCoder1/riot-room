import * as THREE from "three";

/**
 * Slow variation laid over a surface in world space, so a texture that repeats
 * every few metres does not read as a pattern: broad patches a little lighter
 * or darker (and a little warmer or cooler) that never repeat across the map.
 */
export interface MacroVariation {
  /** Patches per metre (0.12 is a patch about every 8 m). */
  frequency: number;
  /** How far a patch changes the colour (0.15 is 15% lighter or darker). */
  strength: number;
  /**
   * Dirt gathered low on a wall (and at the foot of each floor above it):
   * how much darker the first 0.9 m above every 4 m storey is (0 = none).
   */
  baseDirt?: number;
}

export interface WorldSpaceUvOptions {
  /** Metres of surface per texture repeat. */
  tileMetres: number;
  /** Turns the pattern about the surface normal (radians), to tell variants apart. */
  rotation?: number;
  /** Shifts the pattern in the surface plane (metres), to tell variants apart. */
  offset?: [number, number];
  /** Broad variation across the map, in world space. */
  macro?: MacroVariation;
}

/**
 * Makes a material's texture coordinates come from where a surface is in the
 * world, instead of from the mesh's own UVs. Axis-aligned boxes (this map's only
 * shape) get a planar projection along their dominant axis, so one texture keeps
 * the same physical scale on a 2 m ledge and a 40 m floor, the shared unit box is
 * left alone, and neighbouring slabs line up with no seam between them.
 *
 * Applies to the colour, normal and roughness maps. Reusable for walls, roofs and metal.
 */
export function useWorldSpaceUv(
  material: THREE.MeshStandardMaterial,
  { tileMetres, rotation = 0, offset = [0, 0], macro }: WorldSpaceUvOptions,
): void {
  // The numbers go to the shader as this material's own uniforms (rounded as
  // they were when written into the text), not into the shader text, so
  // materials that differ only in these share one compiled program: the
  // program key says only which code is in the shader.
  const round = (value: number, digits: number): number =>
    Number(value.toFixed(digits));
  const scale = round(1 / tileMetres, 6);
  const cos = round(Math.cos(rotation), 6);
  const sin = round(Math.sin(rotation), 6);
  const [shiftU, shiftV] = offset.map((v) => round(v / tileMetres, 6));
  const key = `worldUv${macro ? (macro.baseDirt ? ":macro-dirt" : ":macro") : ""}`;

  material.onBeforeCompile = (shader) => {
    shader.uniforms.worldUvA = { value: new THREE.Vector3(scale, cos, sin) };
    shader.uniforms.worldUvShift = {
      value: new THREE.Vector2(shiftU, shiftV),
    };

    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
uniform vec3 worldUvA;
uniform vec2 worldUvShift;
${macro ? "varying vec3 vWorldMacro;\nvarying vec3 vWorldFlat;" : ""}`,
      )
      .replace(
        "#include <uv_vertex>",
        /* glsl */ `
      #include <uv_vertex>
      {
        vec4 worldUvPosition = modelMatrix * vec4( position, 1.0 );
        vec3 worldUvNormal = abs( mat3( modelMatrix ) * normal );
        vec2 worldUv = worldUvNormal.y > max( worldUvNormal.x, worldUvNormal.z )
          ? worldUvPosition.xz
          : ( worldUvNormal.x > worldUvNormal.z ? worldUvPosition.zy : worldUvPosition.xy );
        worldUv = vec2(
          worldUv.x * worldUvA.y - worldUv.y * worldUvA.z,
          worldUv.x * worldUvA.z + worldUv.y * worldUvA.y
        ) * worldUvA.x + worldUvShift;
        #ifdef USE_MAP
          vMapUv = worldUv;
        #endif
        #ifdef USE_NORMALMAP
          vNormalMapUv = worldUv;
        #endif
        #ifdef USE_ROUGHNESSMAP
          vRoughnessMapUv = worldUv;
        #endif
        ${macro ? "vWorldMacro = worldUvPosition.xyz; vWorldFlat = worldUvNormal;" : ""}
      }
      `,
      );

    if (macro) {
      shader.uniforms.worldMacroA = {
        value: new THREE.Vector4(
          round(macro.frequency, 5),
          round(macro.frequency * 0.37, 5),
          round(macro.frequency * 2.9, 5),
          round(macro.strength, 4),
        ),
      };
      shader.uniforms.worldDirt = { value: round(macro.baseDirt ?? 0, 4) };

      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          /* glsl */ `
          #include <common>
          varying vec3 vWorldMacro;
          varying vec3 vWorldFlat;
          uniform vec4 worldMacroA;
          uniform float worldDirt;
          float macroHash( vec3 p ) {
            p = fract( p * 0.3183099 + vec3( 0.1, 0.2, 0.3 ) );
            p *= 17.0;
            return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) );
          }
          float macroNoise( vec3 x ) {
            vec3 i = floor( x );
            vec3 f = fract( x );
            f = f * f * ( 3.0 - 2.0 * f );
            return mix(
              mix( mix( macroHash( i + vec3( 0, 0, 0 ) ), macroHash( i + vec3( 1, 0, 0 ) ), f.x ),
                   mix( macroHash( i + vec3( 0, 1, 0 ) ), macroHash( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
              mix( mix( macroHash( i + vec3( 0, 0, 1 ) ), macroHash( i + vec3( 1, 0, 1 ) ), f.x ),
                   mix( macroHash( i + vec3( 0, 1, 1 ) ), macroHash( i + vec3( 1, 1, 1 ) ), f.x ), f.y ),
              f.z );
          }
          `,
        )
        .replace(
          "#include <map_fragment>",
          /* glsl */ `
          #include <map_fragment>
          {
            vec3 mp = vWorldMacro;
            float blotch = macroNoise( mp * worldMacroA.x ) * 0.6 + macroNoise( mp * worldMacroA.z ) * 0.4;
            diffuseColor.rgb *= 1.0 + ( blotch - 0.5 ) * 2.0 * worldMacroA.w;
            float drift = macroNoise( mp * worldMacroA.y + vec3( 17.0, 3.0, 9.0 ) );
            diffuseColor.rgb *= mix( vec3( 0.97, 0.985, 1.02 ), vec3( 1.025, 1.005, 0.975 ), drift );
            ${
              macro.baseDirt
                ? `float storey = mod( mp.y + 0.02, 4.0 );
            // Only an upright face has a foot: a narrow plinth band, a thin
            // shadow seam where it meets the wall, a little contact darkening
            // at the very base and a soft grime above (a fraction of the old
            // broad band, so the wall no longer melts into the floor).
            if ( vWorldFlat.y < 0.5 ) {
              float grime = 1.0 - smoothstep( 0.0, 0.7, storey );
              diffuseColor.rgb *= 1.0 - worldDirt * 0.55 * grime;
              float plinth = 1.0 - smoothstep( 0.11, 0.125, storey );
              diffuseColor.rgb *= mix( 1.0, 1.1, plinth );
              float seam = exp( - pow( ( storey - 0.125 ) / 0.012, 2.0 ) );
              diffuseColor.rgb *= 1.0 - 0.4 * seam;
              float contact = 1.0 - smoothstep( 0.0, 0.05, storey );
              diffuseColor.rgb *= 1.0 - 0.28 * contact;
              // Cracks: hairlines where a noise field crosses its middle, in
              // patches (a long fault with finer ones branching from it).
              float faultMask = smoothstep( 0.42, 0.66, macroNoise( mp * 0.3 + vec3( 7.0, 2.0, 5.0 ) ) );
              float fault = 1.0 - smoothstep( 0.0, 0.014, abs( macroNoise( mp * 0.8 + vec3( 31.0 ) ) - 0.5 ) );
              float twigMask = smoothstep( 0.5, 0.72, macroNoise( mp * 0.55 + vec3( 3.0, 9.0, 1.0 ) ) );
              float twig = 1.0 - smoothstep( 0.0, 0.022, abs( macroNoise( mp * 2.4 + vec3( 11.0 ) ) - 0.5 ) );
              float crack = clamp( fault * faultMask + twig * twigMask * 0.8, 0.0, 1.0 );
              diffuseColor.rgb *= 1.0 - 0.6 * crack;
            }`
                : ""
            }
          }
          `,
        );
    }
  };
  material.customProgramCacheKey = () => key;
}
