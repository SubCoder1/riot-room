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
  const scale = (1 / tileMetres).toFixed(6);
  const cos = Math.cos(rotation).toFixed(6);
  const sin = Math.sin(rotation).toFixed(6);
  const [shiftU, shiftV] = offset.map((v) => (v / tileMetres).toFixed(6));
  const macroKey = macro
    ? `:m${macro.frequency}:${macro.strength}:${macro.baseDirt ?? 0}`
    : "";
  const key = `worldUv:${scale}:${cos}:${sin}:${shiftU}:${shiftV}${macroKey}`;

  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        macro
          ? "#include <common>\nvarying vec3 vWorldMacro;"
          : "#include <common>",
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
          worldUv.x * ${cos} - worldUv.y * ${sin},
          worldUv.x * ${sin} + worldUv.y * ${cos}
        ) * ${scale} + vec2( ${shiftU}, ${shiftV} );
        #ifdef USE_MAP
          vMapUv = worldUv;
        #endif
        #ifdef USE_NORMALMAP
          vNormalMapUv = worldUv;
        #endif
        #ifdef USE_ROUGHNESSMAP
          vRoughnessMapUv = worldUv;
        #endif
        ${macro ? "vWorldMacro = worldUvPosition.xyz;" : ""}
      }
      `,
      );

    if (macro) {
      const frequency = macro.frequency.toFixed(5);
      const slower = (macro.frequency * 0.37).toFixed(5);
      const finer = (macro.frequency * 2.9).toFixed(5);
      const strength = macro.strength.toFixed(4);
      const dirt = (macro.baseDirt ?? 0).toFixed(4);

      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          /* glsl */ `
          #include <common>
          varying vec3 vWorldMacro;
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
            float blotch = macroNoise( mp * ${frequency} ) * 0.6 + macroNoise( mp * ${finer} ) * 0.4;
            diffuseColor.rgb *= 1.0 + ( blotch - 0.5 ) * 2.0 * ${strength};
            float drift = macroNoise( mp * ${slower} + vec3( 17.0, 3.0, 9.0 ) );
            diffuseColor.rgb *= mix( vec3( 0.97, 0.985, 1.02 ), vec3( 1.025, 1.005, 0.975 ), drift );
            ${
              macro.baseDirt
                ? `float storey = mod( mp.y + 0.02, 4.0 );
            diffuseColor.rgb *= 1.0 - ${dirt} * ( 1.0 - smoothstep( 0.0, 0.9, storey ) );`
                : ""
            }
          }
          `,
        );
    }
  };
  material.customProgramCacheKey = () => key;
}
