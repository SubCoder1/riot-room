import type * as THREE from "three";

/**
 * Years of rain on a building site, laid over a material as shader code: no
 * texture, no geometry, no prop. It is worked out in world space (so
 * neighbouring pieces carry on each other's marks and no two places repeat),
 * and added on top of whatever the material already does.
 *
 *   - metal: dark painted steel with small patches of brown-orange rust,
 *     gathered at edges, corners, seams and the foot of a piece, where water
 *     sits. Rusty patches are matte; clean paint keeps its sheen.
 *   - wood: faded, dirty boards with fine grain, grime at the corners and the
 *     bottom, a few muddy marks and water stains and a trace of green mould.
 *   - concrete: damp patches, rising damp along the foot of a wall, streaks
 *     running down it, and a rain-worn floor that is a little less rough where
 *     it is damp. Faint mould only where the damp is strongest.
 *   - mixed: a material shared by pieces of different stuff. Each piece says
 *     what it is (`WEAR_*`, in the `aWearA` attribute), so a drum rusts, a
 *     crate is stained, a brick is grimy and a cable is only dusty.
 *
 * Every effect is held back: most of a surface is left as it was.
 */
export type WearKind = "metal" | "wood" | "concrete" | "mixed";

/** What a piece of a `mixed` material is made of. */
export const WEAR_WOOD = 0;
export const WEAR_METAL = 1;
export const WEAR_MASONRY = 2;
export const WEAR_PLASTIC = 3;
/** Broken concrete and stone (rocks, slabs): grain, aggregate, pits, cracks. */
export const WEAR_RUBBLE = 4;
/** A brick: speckle, chips, mortar smeared on it. */
export const WEAR_BRICK = 5;

export interface WearOptions {
  /**
   * How much the weather reaches it: 0.5 is a sheltered interior piece, 1 a
   * rain-soaked outdoor one.
   */
  exposure?: number;
  /**
   * Marks follow the piece (in its own space) and not the map: for parts that
   * move, so the rust does not slide over them as they go.
   */
  local?: boolean;
  /**
   * Walkway steel: its upward faces carry diamond tread plate, plate seams with
   * bolts and a trace of bump, so a deck reads as a floor and not a flat sheet.
   */
  deck?: boolean;
}

const COMMON = (mixed: boolean): string => /* glsl */ `
  varying vec3 vWxPos;
  varying vec3 vWxNrm;
  varying float vWxEdge;
  varying float vWxBase;
  ${
    mixed
      ? `varying vec3 vWxLocal;
  varying vec3 vWxHalf;
  varying float vWxKind;`
      : ""
  }
`;

const NOISE = /* glsl */ `
  float wxHash( vec3 p ) {
    p = fract( p * 0.3183099 + vec3( 0.71, 0.113, 0.419 ) );
    p *= 17.0;
    return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) );
  }
  float wxNoise( vec3 x ) {
    vec3 i = floor( x );
    vec3 f = fract( x );
    f = f * f * ( 3.0 - 2.0 * f );
    return mix(
      mix( mix( wxHash( i ), wxHash( i + vec3( 1, 0, 0 ) ), f.x ),
           mix( wxHash( i + vec3( 0, 1, 0 ) ), wxHash( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
      mix( mix( wxHash( i + vec3( 0, 0, 1 ) ), wxHash( i + vec3( 1, 0, 1 ) ), f.x ),
           mix( wxHash( i + vec3( 0, 1, 1 ) ), wxHash( i + vec3( 1, 1, 1 ) ), f.x ), f.y ),
      f.z );
  }
`;

/**
 * The vertex side: where the point is (in the map, or in the piece), which way
 * it faces, how far it is from the nearest edge of its face and how high it is
 * above its own foot. The last two are only known for a plain box (this map's
 * only shape) and are "far" for anything else, so a curved or merged part never
 * rusts along edges it does not have. A `mixed` material gets them per piece
 * from its attributes instead.
 */
const vertex = (local: boolean, mixed: boolean): string => /* glsl */ `
  {
    vec4 wxp = vec4( transformed, 1.0 );
    vec3 wxn = normal;
    float wxSeed = 0.0;
    #ifdef USE_INSTANCING
      wxSeed = float( gl_InstanceID );
      wxp = instanceMatrix * wxp;
      wxn = mat3( instanceMatrix ) * wxn;
    #endif
    ${
      local
        ? "vWxPos = transformed + vec3( wxSeed * 3.17, wxSeed * 1.31, wxSeed * 2.03 );"
        : "vWxPos = ( modelMatrix * wxp ).xyz;"
    }
    vWxNrm = normalize( mat3( modelMatrix ) * wxn );
    ${
      mixed
        ? `vWxLocal = aWearA.xyz;
    vWxKind = aWearA.w;
    vWxHalf = aWearB;
    vWxEdge = 9.0;
    vWxBase = 9.0;`
        : `vec3 wxs = vec3(
      length( modelMatrix[ 0 ].xyz ),
      length( modelMatrix[ 1 ].xyz ),
      length( modelMatrix[ 2 ].xyz )
    );
    vec3 wxa = abs( position );
    vec3 wxm = abs( normal );
    vec3 wxq = ( 0.5 - wxa ) * wxs;
    float wxe = wxm.y > max( wxm.x, wxm.z )
      ? min( wxq.x, wxq.z )
      : ( wxm.x > wxm.z ? min( wxq.y, wxq.z ) : min( wxq.x, wxq.y ) );
    bool wxBox = max( wxa.x, max( wxa.y, wxa.z ) ) < 0.5001;
    #ifdef USE_INSTANCING
      wxBox = false;
    #endif
    vWxEdge = wxBox ? max( wxe, 0.0 ) : 9.0;
    vWxBase = wxBox ? ( position.y + 0.5 ) * wxs.y : 9.0;`
    }
  }
`;

/** Rust on painted metal and bare metal: edges, seams, the foot of a piece. */
const metal = (e: string): string => /* glsl */ `
  {
    vec3 p = vWxPos;
    float broad = wxNoise( p * 0.85 + vec3( 3.1, 7.7, 1.3 ) );
    float mid = wxNoise( p * 3.1 + vec3( 9.0 ) );
    float fine = wxNoise( p * 14.0 );
    float blotch = smoothstep( 0.58, 0.78, broad * 0.6 + mid * 0.4 );
    float edgeW = 1.0 - smoothstep( 0.0, 0.2, wxEdge );
    float baseW = 1.0 - smoothstep( 0.0, 0.4, wxBase );
    float amount = blotch * ( 0.1 + 0.9 * edgeW + 0.4 * baseW ) * ${e};
    amount *= 0.5 + fine;
    // Rims, corners and seams rust a little whether or not a patch is near.
    amount += edgeW * ( 0.12 + 0.4 * smoothstep( 0.4, 0.7, mid ) ) * ${e};
    amount = clamp( amount * 0.55, 0.0, 0.5 );
    vec3 rustDark = vec3( 0.07, 0.036, 0.026 );
    vec3 rustLight = vec3( 0.17, 0.07, 0.04 );
    vec3 rust = mix( rustDark, rustLight, smoothstep( 0.3, 0.8, fine * 0.5 + mid * 0.5 ) );
    diffuseColor.rgb = mix( diffuseColor.rgb, rust, amount * 0.9 );
    wxAmount = amount;
    wxMetal = 1.0;
  }
`;

const wood = (e: string): string => /* glsl */ `
  {
    vec3 p = vWxPos;
    float grain = wxNoise( vec3( p.x * 14.0, p.y * 1.3, p.z * 14.0 ) );
    float l = dot( diffuseColor.rgb, vec3( 0.299, 0.587, 0.114 ) );
    diffuseColor.rgb *= 0.93 + 0.14 * grain;
    // Faded: a little of the colour sun and rain have taken out.
    diffuseColor.rgb = mix( diffuseColor.rgb, vec3( l ) * vec3( 1.0, 0.99, 0.96 ), 0.2 );
    float edgeW = 1.0 - smoothstep( 0.0, 0.12, wxEdge );
    float lowWorld = 1.0 - smoothstep( 0.0, 0.35, mod( p.y + 0.02, 4.0 ) );
    float low = max( 1.0 - smoothstep( 0.0, 0.35, wxBase ), lowWorld * 0.6 );
    float dirt = ( 0.5 * edgeW + 0.9 * low ) * ( 0.4 + 0.6 * wxNoise( p * 4.0 ) );
    diffuseColor.rgb *= 1.0 - 0.36 * dirt;
    float mud = smoothstep( 0.6, 0.8, wxNoise( p * 7.0 + 5.0 ) ) * low;
    diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.03, 0.028, 0.025 ), mud * 0.6 );
    float streak = smoothstep( 0.58, 0.8, wxNoise( vec3( p.x * 5.0, p.y * 0.6, p.z * 5.0 ) + 2.0 ) );
    diffuseColor.rgb *= 1.0 - 0.28 * streak * ${e};
    float mould = smoothstep( 0.7, 0.88, wxNoise( p * 2.4 + 11.0 ) ) * ( 0.25 + 0.75 * max( low, edgeW ) );
    diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.045, 0.075, 0.03 ) * ( 0.8 + 0.6 * grain ), mould * 0.42 );
    wxAmount = dirt * 0.4;
  }
`;

/** Concrete, brick and bagged cement: damp, grime and a touch of mould. */
const concrete = (e: string): string => /* glsl */ `
  {
    vec3 p = vWxPos;
    bool wall = abs( vWxNrm.y ) < 0.6;
    float storey = mod( p.y + 0.02, 4.0 );
    float foot = wall ? 1.0 - smoothstep( 0.0, 1.1, storey ) : 0.0;
    float patchN = wxNoise( p * 0.55 + 4.0 ) * 0.65 + wxNoise( p * 1.9 ) * 0.35;
    float damp = smoothstep( 0.54, 0.8, patchN );
    float rise = foot * ( 0.35 + 0.65 * wxNoise( vec3( p.x * 1.7, p.y * 0.4, p.z * 1.7 ) ) );
    float corner = ( 1.0 - smoothstep( 0.0, 0.25, wxEdge ) ) * 0.4;
    float wet = clamp( damp * ( wall ? 0.5 : 0.75 ) * ${e} + rise * 0.65 * ${e} + corner * foot, 0.0, 1.0 );
    float streak = wall
      ? smoothstep( 0.62, 0.86, wxNoise( vec3( p.x * 3.0, p.y * 0.22, p.z * 3.0 ) + 7.0 ) ) * ${e}
      : 0.0;
    diffuseColor.rgb *= 1.0 - 0.2 * wet - 0.11 * streak;
    diffuseColor.rgb *= 1.0 - 0.09 * smoothstep( 0.4, 0.8, wxNoise( p * 0.9 + 13.0 ) );
    float mould = smoothstep( 0.64, 0.86, wxNoise( p * 1.3 + 21.0 ) ) * smoothstep( 0.4, 0.8, wet );
    diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * vec3( 0.74, 0.93, 0.66 ), mould * 0.4 );
    wxAmount = wet;
    wxMasonry = 1.0;
  }
`;

/** Plastic and rubber (cables, coils): dirt, fading and a few scratches, no rust. */
/**
 * Broken concrete and stone: a coarse unevenness, light flecks of aggregate
 * where it has fractured, dark pits and hairline cracks, and dirt in the low
 * places. World-space noise (no texture), faded with distance where it would
 * only shimmer.
 */
const rubble = (): string => /* glsl */ `
  {
    vec3 p = vWxPos;
    float near = 1.0 - smoothstep( 6.0, 18.0, length( vViewPosition ) );
    float coarse = wxNoise( p * 13.0 );
    float agg = smoothstep( 0.6, 0.88, wxNoise( p * 46.0 + vec3( 3.0 ) ) ) * near;
    float pit = smoothstep( 0.72, 0.92, wxNoise( p * 66.0 + vec3( 9.0 ) ) ) * near;
    float crack = ( 1.0 - smoothstep( 0.0, 0.03, abs( wxNoise( p * 8.0 + vec3( 5.0 ) ) - 0.5 ) ) ) * 0.8;
    float low = 1.0 - smoothstep( 0.0, 0.6, mod( p.y + 0.02, 4.0 ) );

    // Old, dirty concrete (darker, warmer, stained) against fresh fracture
    // (lighter, cooler, clean): patches of each, a metre or so across.
    float fresh = smoothstep( 0.5, 0.68, wxNoise( p * 2.1 + vec3( 21.0 ) ) );
    float lum = dot( diffuseColor.rgb, vec3( 0.299, 0.587, 0.114 ) );

    diffuseColor.rgb = mix(
      diffuseColor.rgb * vec3( 0.85, 0.85, 0.86 ),
      vec3( lum * 1.2 ) * vec3( 1.0, 1.0, 1.0 ) + 0.008,
      fresh * 0.4
    );
    diffuseColor.rgb *= 0.84 + 0.3 * coarse;
    diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * 1.4 + 0.01, agg * 0.4 );
    diffuseColor.rgb *= 1.0 - 0.42 * pit;
    diffuseColor.rgb *= 1.0 - 0.3 * crack;
    diffuseColor.rgb *= 1.0 - 0.4 * low * ( 0.5 + 0.5 * wxNoise( p * 3.0 ) );
  }
`;

/** A brick: speckled, chipped, with grey mortar smeared on some faces. */
const brick = (): string => /* glsl */ `
  {
    vec3 p = vWxPos;
    float near = 1.0 - smoothstep( 5.0, 15.0, length( vViewPosition ) );
    float speck = wxNoise( p * 38.0 + vec3( 2.0 ) );
    float mortar = smoothstep( 0.58, 0.82, wxNoise( p * 17.0 + vec3( 7.0 ) ) );
    float chip = smoothstep( 0.74, 0.92, wxNoise( p * 55.0 + vec3( 4.0 ) ) ) * near;
    float tint = wxNoise( p * 2.3 + vec3( 11.0 ) );

    diffuseColor.rgb *= 0.8 + 0.4 * speck;
    // Each brick leans warmer or duskier, by where it lies.
    diffuseColor.rgb *= mix( vec3( 1.1, 0.95, 0.88 ), vec3( 0.92, 0.96, 1.04 ), tint );
    diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.36, 0.35, 0.33 ), mortar * 0.45 );
    diffuseColor.rgb *= 1.0 - 0.4 * chip;
  }
`;

const plastic = (): string => /* glsl */ `
  {
    vec3 p = vWxPos;
    float low = 1.0 - smoothstep( 0.0, 0.3, mod( p.y + 0.02, 4.0 ) );
    float dust = smoothstep( 0.45, 0.85, wxNoise( p * 6.0 + 3.0 ) );
    float scratch = smoothstep( 0.8, 0.95, wxNoise( vec3( p.x * 40.0, p.y * 2.0, p.z * 40.0 ) ) );
    diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.07, 0.065, 0.058 ), 0.22 * dust * ( 0.4 + 0.6 * low ) );
    diffuseColor.rgb += 0.025 * scratch;
  }
`;

/**
 * Diamond tread plate on an upward face, in plates 1.2 m by 2.4 m bolted at
 * their corners, a little scuffed along the middle where feet go. `wxTread` is
 * the height of the pattern, for the bump.
 */
const treadPlate = (): string => /* glsl */ `
  if ( vWxNrm.y > 0.8 ) {
    vec2 q = vWxPos.xz;
    vec2 cell = q * 8.0;
    // The fine pattern fades with distance, where it would only shimmer.
    float near = clamp( 1.6 - length( vViewPosition ) * 0.14, 0.0, 1.0 );
    float d = abs( fract( cell.x + cell.y ) - 0.5 ) + abs( fract( cell.x - cell.y ) - 0.5 );
    float ridge = smoothstep( 0.62, 0.3, d ) * near;
    // Plates 1.2 m x 2.4 m: a seam round each, a bolt at each corner.
    vec2 plate = vec2( q.x / 1.2, q.y / 2.4 );
    vec2 seam = abs( fract( plate + 0.5 ) - 0.5 ) * vec2( 1.2, 2.4 );
    float seamLine = 1.0 - smoothstep( 0.0, 0.018, min( seam.x, seam.y ) );
    float bolt = 1.0 - smoothstep( 0.02, 0.035, length( seam - vec2( 0.06 ) ) );
    float scuff = smoothstep( 0.45, 0.8, wxNoise( vec3( q * 2.2, 3.0 ) ) );
    float tread = ridge * ( 1.0 - seamLine );
    diffuseColor.rgb *= 0.95 + 0.1 * ridge - 0.2 * seamLine - 0.1 * bolt * near;
    diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * 1.25, scuff * 0.35 * ridge );
    wxTread = tread * 0.5 + bolt * 0.9 * near;
  }
`;

/** Colour: runs after the material's own colour (map, vertex colours). */
const color = (kind: WearKind, exposure: number, deck: boolean): string => {
  const e = exposure.toFixed(3);
  const edge = /* glsl */ `
    float wxEdge = vWxEdge;
    float wxBase = vWxBase;
    ${
      kind === "mixed"
        ? `{
      vec3 d = vWxHalf - abs( vWxLocal );
      if ( vWxHalf.y < -1.5 ) {
        wxEdge = 9.0;
        wxBase = 9.0;
      } else if ( vWxHalf.y < 0.0 ) {
        // A cylinder along x: the distance to its nearer end.
        wxEdge = max( d.x, 0.0 );
        wxBase = wxEdge;
      } else {
        // On a box's face one distance is nil and the second smallest is the
        // way to the nearest edge of that face.
        float lo = min( d.x, min( d.y, d.z ) );
        float hi = max( d.x, max( d.y, d.z ) );
        wxEdge = max( d.x + d.y + d.z - lo - hi, 0.0 );
        wxBase = max( vWxLocal.y + vWxHalf.y, 0.0 );
      }
    }`
        : ""
    }
  `;

  const body =
    kind === "metal"
      ? metal(e)
      : kind === "wood"
        ? wood(e)
        : kind === "concrete"
          ? concrete(e)
          : /* glsl */ `
    if ( vWxKind < 0.5 ) {
      ${wood(e)}
    } else if ( vWxKind < 1.5 ) {
      ${metal(e)}
    } else if ( vWxKind < 2.5 ) {
      ${concrete(e)}
    } else if ( vWxKind < 3.5 ) {
      ${plastic()}
    } else if ( vWxKind < 4.5 ) {
      ${rubble()}
    } else {
      ${brick()}
    }
  `;

  const tread = deck ? treadPlate() : "";

  return /* glsl */ `
    float wxAmount = 0.0;
    float wxTread = 0.0;
    float wxMetal = ${kind === "metal" ? "1.0" : "0.0"};
    float wxMasonry = ${kind === "concrete" ? "1.0" : "0.0"};
    ${edge}
    ${tread}
    ${body}
  `;
};

/** After roughness and metalness are known: damp is smoother, rust is matte. */
const surface = (): string => /* glsl */ `
  roughnessFactor = mix( roughnessFactor, 0.93, wxAmount * wxMetal );
  metalnessFactor *= 1.0 - wxAmount * wxMetal;
  roughnessFactor = mix( roughnessFactor, roughnessFactor * 0.55, wxAmount * 0.7 * wxMasonry );
`;

/** Tilts the normal by the slope of `wxTread` on screen, fading with distance. */
const bump = (): string => /* glsl */ `
  {
    vec2 slope = vec2( dFdx( wxTread ), dFdy( wxTread ) ) * 0.18 / ( 1.0 + length( vViewPosition ) * 0.35 );
    vec3 sx = dFdx( - vViewPosition );
    vec3 sy = dFdy( - vViewPosition );
    vec3 r1 = cross( sy, normal );
    vec3 r2 = cross( normal, sx );
    float det = dot( sx, r1 ) * faceDirection;
    vec3 grad = sign( det ) * ( slope.x * r1 + slope.y * r2 );
    normal = normalize( abs( det ) * normal - grad );
  }
`;

/**
 * Weathers a material in place (and returns it). It adds to whatever
 * `onBeforeCompile` and program key the material has, so a material that
 * already warps its own coordinates keeps doing so. Done once per material.
 * A `mixed` material's geometry must carry the `aWearA` (vec4: the piece's
 * scaled local position, then what it is made of) and `aWearB` (vec3: its half
 * size; a negative y says it is a cylinder (-1) or has no known edges (-2))
 * attributes.
 */
export function weather<T extends THREE.MeshStandardMaterial>(
  material: T,
  kind: WearKind,
  { exposure = 0.8, local = false, deck = false }: WearOptions = {},
): T {
  if (material.userData.weathered) {
    return material;
  }

  material.userData.weathered = kind;

  const mixed = kind === "mixed";
  const before = material.onBeforeCompile;
  const beforeKey = material.customProgramCacheKey;
  const key = `${beforeKey.call(material)}|wear:${kind}:${exposure}:${local ? 1 : 0}:${deck ? 1 : 0}`;

  material.onBeforeCompile = (shader, renderer) => {
    before.call(material, shader, renderer);

    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>\n${COMMON(mixed)}${
          mixed ? "attribute vec4 aWearA;\nattribute vec3 aWearB;\n" : ""
        }`,
      )
      .replace(
        "#include <project_vertex>",
        `#include <project_vertex>\n${vertex(local, mixed)}`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>\n${COMMON(mixed)}\n${NOISE}`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>\n${color(kind, exposure, deck)}`,
      )
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
${deck ? bump() : ""}`,
      )
      .replace(
        "#include <metalnessmap_fragment>",
        `#include <metalnessmap_fragment>\n${surface()}`,
      );
  };
  material.customProgramCacheKey = () => key;
  material.needsUpdate = true;

  return material;
}
