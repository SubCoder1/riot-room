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
          // Wall damage, as damaged concrete rather than lines drawn on it.
          // Sites are scattered over a coarse grid, a few cells in each part
          // of the wall and none in most. A site is one of: an impact (a
          // ragged chip, a stain round it and a few short, separate fractures
          // running out of it), a single longer fracture (a few straight,
          // kinked stretches along a structural direction, broken by gaps and
          // bitten wider in places) or a spalled patch (a larger missing piece).
          // Nothing joins or forks: no branches. x is a fracture, y a chip
          // (missing concrete), z the pale broken rim, w discolouration.
          float cHash( vec2 p ) {
            return fract( sin( dot( p, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
          }
          vec2 cHash2( vec2 p ) {
            return vec2( cHash( p ), cHash( p + vec2( 41.3, 17.7 ) ) );
          }
          float segDist( vec2 p, vec2 a, vec2 b, out float t ) {
            vec2 pa = p - a;
            vec2 ba = b - a;
            t = clamp( dot( pa, ba ) / dot( ba, ba ), 0.0, 1.0 );
            return length( pa - ba * t );
          }
          // A ragged bite of radius r: its edge steps in six sectors.
          vec3 chipAt( vec2 d, float r, float seed ) {
            float sector = floor( ( atan( d.y, d.x ) / 6.2832 + 0.5 ) * 6.0 );
            float edge = r * ( 0.65 + 0.6 * cHash( vec2( sector, seed ) ) );
            // A ragged edge: blocky noise on the distance, so it is no disc.
            float dist = length( d ) + ( cHash( floor( d * 110.0 ) + seed ) - 0.5 ) * edge * 0.55;
            float chip = 1.0 - smoothstep( edge * 0.9, edge, dist );
            float rim = max( ( 1.0 - smoothstep( edge, edge * 1.4, dist ) ) - chip, 0.0 );
            float stain = 1.0 - smoothstep( edge * 1.3, edge * 3.5, dist );
            return vec3( chip, rim, stain );
          }
          vec4 wallDamage( vec2 q, float density ) {
            vec2 cell = floor( q / 1.7 );
            float crack = 0.0;
            float chip = 0.0;
            float rim = 0.0;
            float stain = 0.0;
            for ( int y = -1; y <= 1; y++ ) {
              for ( int x = -1; x <= 1; x++ ) {
                vec2 c = cell + vec2( float( x ), float( y ) );
                vec2 h = cHash2( c );
                if ( h.x > density ) continue;
                vec2 g = cHash2( c + vec2( 7.7, 3.3 ) );
                vec2 d = q - ( c + 0.15 + 0.7 * vec2( h.y, g.x ) ) * 1.7;
                // Jagged edges: the point is nudged by blocky noise.
                vec2 cellN = floor( d * 70.0 );
                vec2 jag = ( vec2( cHash( cellN + c ), cHash( cellN + c + 9.0 ) ) - 0.5 ) * 0.007;
                float kind = g.y;
                if ( kind < 0.62 ) {
                  float R = 0.045 + 0.11 * cHash( c + 1.3 );
                  vec3 cp = chipAt( d, R, c.x * 3.1 + c.y );
                  chip = max( chip, cp.x );
                  rim = max( rim, cp.y );
                  stain = max( stain, cp.z );
                  for ( int j = 0; j < 4; j++ ) {
                    float fj = float( j );
                    float ang = 6.2832 * cHash( c + fj * 3.7 );
                    vec2 dir = vec2( cos( ang ), sin( ang ) );
                    float len = R * ( 1.3 + 2.6 * cHash( c + fj * 5.1 ) );
                    float t;
                    float dd = segDist( d + jag, dir * R * 0.7, dir * len, t );
                    float w = 0.0032 * ( 1.0 - 0.6 * t ) + 0.0008;
                    float whole = step( 0.2, cHash( vec2( floor( t * 5.0 ), fj ) + c ) ) * step( 0.25, cHash( c + fj * 9.1 ) );
                    crack = max( crack, ( 1.0 - smoothstep( w * 0.5, w, dd ) ) * whole );
                  }
                } else if ( kind < 0.9 ) {
                  float flip = cHash( c + 4.4 ) < 0.55 ? 0.0 : 1.0;
                  float ang = flip < 0.5
                    ? 1.5708 + ( cHash( c + 2.2 ) - 0.5 ) * 0.3
                    : ( cHash( c + 5.5 ) < 0.5 ? 0.75 : 2.39 ) + ( cHash( c + 6.1 ) - 0.5 ) * 0.3;
                  vec2 dir = vec2( cos( ang ), sin( ang ) );
                  vec2 perp = vec2( -dir.y, dir.x );
                  float L = 0.45 + 0.6 * cHash( c + 8.8 );
                  vec2 p0 = -dir * L * 0.5;
                  vec2 p1 = p0 + dir * L * 0.3 + perp * ( cHash( c + 1.9 ) - 0.5 ) * 0.08;
                  vec2 p2 = p1 + dir * L * 0.35 + perp * ( cHash( c + 2.9 ) - 0.5 ) * 0.09;
                  vec2 p3 = p2 + dir * L * 0.35 + perp * ( cHash( c + 3.9 ) - 0.5 ) * 0.08;
                  float w0 = 0.0035 + 0.006 * cHash( c + 3.3 );
                  float t;
                  float s0 = segDist( d + jag, p0, p1, t );
                  float s1 = segDist( d + jag, p1, p2, t );
                  float s2 = segDist( d + jag, p2, p3, t );
                  // One stretch is missing in about half of them.
                  float gap = step( 0.5, cHash( c + 6.6 ) );
                  float fr = max( 1.0 - smoothstep( w0 * 0.5, w0, s0 ), max( ( 1.0 - smoothstep( w0 * 0.5, w0, s1 ) ) * gap, 1.0 - smoothstep( w0 * 0.5, w0 * 0.8, s2 ) ) );
                  crack = max( crack, fr );
                  // Chipped wider where the stretches meet.
                  vec3 b1 = chipAt( d - p1, 0.022 + 0.03 * cHash( c + 7.1 ), c.x + 11.0 );
                  vec3 b2 = chipAt( d - p2, 0.02 + 0.03 * cHash( c + 7.9 ), c.y + 23.0 );
                  chip = max( chip, max( b1.x, b2.x * step( 0.4, cHash( c + 9.9 ) ) ) );
                  rim = max( rim, max( b1.y, b2.y ) );
                } else {
                  float R = 0.1 + 0.2 * cHash( c + 2.7 );
                  vec3 cp = chipAt( d, R, c.x * 1.7 + c.y * 2.3 );
                  chip = max( chip, cp.x );
                  rim = max( rim, cp.y );
                  stain = max( stain, cp.z );
                }
              }
            }
            return vec4( crack, chip, rim, stain );
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
              // Damage, only where this part of the wall is hurt, and more
              // of it near the entrance and the collapse (see wallDamage);
              // the rest of a wall is whole. Faded with distance: far off it
              // would only shimmer.
              float nearCrack = 1.0 - smoothstep( 12.0, 26.0, length( vViewPosition ) );
              float hurt = smoothstep( 0.5, 0.78, macroNoise( mp * 0.17 + vec3( 7.0, 2.0, 5.0 ) ) );
              float collapse = 1.0 - smoothstep( 1.5, 11.0, distance( mp.xz, vec2( 23.0, -15.0 ) ) );
              float density = 0.006 + 0.14 * hurt + 0.45 * collapse;
              if ( nearCrack > 0.0 ) {
                vec2 wq = abs( vWorldFlat.x ) > abs( vWorldFlat.z ) ? mp.zy : mp.xy;
                vec4 dmg = wallDamage( wq, density );
                float speck = step( 0.97, cHash( floor( wq * 90.0 ) ) );
                float darken = clamp( 0.55 * dmg.x + 0.3 * dmg.y + 0.07 * dmg.w, 0.0, 0.8 ) * nearCrack;
                diffuseColor.rgb *= 1.0 - darken;
                // Rough aggregate showing in what is missing, and a pale rim.
                diffuseColor.rgb += dmg.y * speck * 0.09 * nearCrack;
                diffuseColor.rgb += dmg.z * ( 1.0 - dmg.y ) * 0.035 * nearCrack;
              }
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
