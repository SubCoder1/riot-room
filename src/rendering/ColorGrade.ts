import * as THREE from "three";

/**
 * The game's one colour grade, applied where every lit and unlit material
 * writes its final colour (three's `colorspace_fragment` chunk), so there is no
 * extra render pass or target and nothing to apply twice. It works on the
 * display (sRGB) value, after the lighting is done:
 *
 *  - shadows are lifted a touch toward a cold blue-grey instead of pure black,
 *    so geometry in the dark stays legible;
 *  - midtones are cooled a little and desaturated, more so the less saturated
 *    the colour already is: strong colours (warning lamps, emergency red,
 *    fire, the ladders' yellow) keep their full colour;
 *  - highlights go neutral to slightly warm;
 *  - a gentle S-curve adds contrast without crushing the blacks.
 *
 * Install it once, before the first material is drawn.
 */
const GRADE = /* glsl */ `
  {
    vec3 c = gl_FragColor.rgb;
    float l = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
    float chroma = max( c.r, max( c.g, c.b ) ) - min( c.r, min( c.g, c.b ) );
    // Strong colours are intentional: leave them.
    float keep = smoothstep( 0.28, 0.6, chroma );
    float sat = mix( 0.86, 1.0, keep );

    c = mix( vec3( l ), c, sat );
    // Cool midtones, neutral to warm highlights.
    c *= mix( vec3( 0.975, 0.995, 1.035 ), vec3( 1.025, 1.0, 0.975 ), smoothstep( 0.3, 0.85, l ) );
    // A cold lift in the deepest shadows.
    c += vec3( 0.004, 0.007, 0.015 ) * ( 1.0 - smoothstep( 0.0, 0.22, l ) );
    // Moderate contrast: an S-curve, kept off the blacks.
    vec3 s = c * c * ( 3.0 - 2.0 * c );
    c = mix( c, s, 0.22 * smoothstep( 0.04, 0.2, l ) );

    gl_FragColor.rgb = clamp( c, 0.0, 1.0 );
  }
`;

let installed = false;

export function installColorGrade(): void {
  if (installed) {
    return;
  }

  installed = true;

  const chunks = THREE.ShaderChunk as unknown as Record<string, string>;

  chunks.colorspace_fragment = `${chunks.colorspace_fragment}\n${GRADE}`;
}
