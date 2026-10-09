import * as THREE from "three";

export interface WorldSpaceUvOptions {
  /** Metres of surface per texture repeat. */
  tileMetres: number;
  /** Turns the pattern about the surface normal (radians), to tell variants apart. */
  rotation?: number;
  /** Shifts the pattern in the surface plane (metres), to tell variants apart. */
  offset?: [number, number];
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
  { tileMetres, rotation = 0, offset = [0, 0] }: WorldSpaceUvOptions,
): void {
  const scale = (1 / tileMetres).toFixed(6);
  const cos = Math.cos(rotation).toFixed(6);
  const sin = Math.sin(rotation).toFixed(6);
  const [shiftU, shiftV] = offset.map((v) => (v / tileMetres).toFixed(6));
  const key = `worldUv:${scale}:${cos}:${sin}:${shiftU}:${shiftV}`;

  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
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
      }
      `,
    );
  };
  material.customProgramCacheKey = () => key;
}
