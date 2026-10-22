import * as THREE from "three";

/**
 * The night sky is black; this dome is invisible until lightning flashes. For
 * the length of a flash it shows a pale glow with thin cloud torn across it,
 * so looking up during a strike shows clouds and the sky lights, then it goes
 * dark again. Drawn behind everything (nothing in the map is hidden by it), no
 * lights, one small shader.
 */

const VERTEX = /* glsl */ `
  varying vec3 vDir;

  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  uniform float uFlash;
  uniform float uTime;
  varying vec3 vDir;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);

    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  float clouds(vec2 p) {
    float sum = 0.0;
    float amp = 0.5;

    for (int i = 0; i < 5; i++) {
      sum += noise(p) * amp;
      p = p * 2.03 + vec2(7.3, 2.9);
      amp *= 0.5;
    }

    return sum;
  }

  void main() {
    float up = vDir.y;

    if (up < 0.0 || uFlash < 0.004) {
      discard;
    }

    // Flat cloud layer seen from below: the farther toward the horizon, the
    // more squashed the clouds.
    vec2 plane = vDir.xz / (up + 0.2) * 1.3 + vec2(uTime * 0.012, 0.0);
    float cover = clouds(plane);
    // Thin, broken clouds: only the denser parts show.
    float body = smoothstep(0.42, 0.78, cover);
    // The flash lights the cloud from inside, brighter in patches.
    float blotch = 0.55 + 0.45 * clouds(plane * 0.6 + 11.0);
    vec3 cold = vec3(0.62, 0.7, 0.84);
    float sky = 0.1 + 0.9 * body * blotch;
    float fade = smoothstep(0.0, 0.22, up);

    gl_FragColor = vec4(cold * sky * uFlash * 0.85, 1.0) * fade;
  }
`;

export interface Sky {
  mesh: THREE.Mesh;
  uniforms: { uFlash: { value: number }; uTime: { value: number } };
}

export function createSky(radius = 170): Sky {
  const uniforms = { uFlash: { value: 0 }, uTime: { value: 0 } };
  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms,
    side: THREE.BackSide,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 32, 16),
    material,
  );

  mesh.name = "sky";
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  mesh.visible = false;
  mesh.onBeforeRender = () => {
    uniforms.uTime.value = performance.now() / 1000;
  };

  return { mesh, uniforms };
}
