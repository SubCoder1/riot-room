import * as THREE from "three";

import type { LightDefinition } from "./ArenaLayout";
import { WALL_LAMPS } from "./NightLights";

/**
 * What a floodlight looks like when it is on: a glowing lens and a faint
 * cone of light in the night air that fades with distance and at its edges.
 * Purely visual; the real light is the SpotLight made from the same definition.
 */

const MAX_BEAM = 9;

const BEAM_VERTEX = /* glsl */ `
  uniform float uLength;
  varying float vFade;
  varying float vRim;

  void main() {
    vFade = clamp(position.z / uLength, 0.0, 1.0);
    vec4 view = modelViewMatrix * vec4(position, 1.0);
    vec3 n = normalize(normalMatrix * normal);
    vRim = abs(dot(n, normalize(-view.xyz)));
    gl_Position = projectionMatrix * view;
  }
`;

const BEAM_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uStrength;
  varying float vFade;
  varying float vRim;

  void main() {
    float along = pow(1.0 - vFade, 1.6) * smoothstep(0.0, 0.06, vFade);
    float soft = pow(vRim, 1.5);
    gl_FragColor = vec4(uColor, uStrength * along * soft);
  }
`;

let halo: THREE.DataTexture | null = null;

/** A soft round glow, drawn once and shared by every lamp's halo. */
function haloTexture(): THREE.DataTexture {
  if (halo) {
    return halo;
  }

  const size = 32;
  const data = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot((x + 0.5) / size - 0.5, (y + 0.5) / size - 0.5) * 2;
      const a = Math.max(0, Math.exp(-d * d * 5) - Math.exp(-5));
      const o = (y * size + x) * 4;

      data[o] = 255;
      data[o + 1] = 255;
      data[o + 2] = 255;
      data[o + 3] = Math.round(255 * a);
    }
  }

  halo = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  halo.magFilter = THREE.LinearFilter;
  halo.minFilter = THREE.LinearFilter;
  halo.needsUpdate = true;

  return halo;
}

const housing = new THREE.MeshStandardMaterial({
  color: 0x14171b,
  roughness: 0.6,
  metalness: 0.5,
});

export function createFixtureGlow(light: LightDefinition): THREE.Group | null {
  if (!light.target) {
    return null;
  }

  const root = new THREE.Group();
  const group = new THREE.Group();
  const from = new THREE.Vector3(light.x, light.y, light.z);
  const to = new THREE.Vector3(light.target.x, light.target.y, light.target.z);
  const colour = new THREE.Color(light.color);
  const length = Math.min(light.distance * 0.7, MAX_BEAM);
  // (A hanging bulb's visible rays are narrower than its light, so the cone's
  // edge does not show as a pale triangle on the walls.)
  const angle = (light.angle ?? 0.8) * (light.id.startsWith("bulb-") ? 0.5 : 1);

  root.name = `glow-${light.id}`;
  root.position.copy(from);
  root.add(group);
  const aim = to.clone().sub(from).normalize();

  group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), aim);

  // A mast head's lens is wider than it is tall: its width runs level, along
  // the wall, whichever way the head is aimed.
  if (!light.id.startsWith("halogen-") && Math.abs(aim.y) < 0.98) {
    const across = new THREE.Vector3(0, 1, 0).cross(aim).normalize();

    group.quaternion.setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(across, aim.clone().cross(across), aim),
    );
  }

  // A rooftop lamp stands on a short steel mast.
  if (light.id.startsWith("halogen-roof")) {
    const height = light.y - light.target.y;
    const mast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.06, height, 8),
      housing,
    );

    mast.position.y = -height / 2;
    root.add(mast);
  }

  // A wall lamp is held off its wall by an arm and a back plate.
  const wall = WALL_LAMPS[light.id];

  if (wall) {
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.55, 0.45),
      housing,
    );
    const arm = new THREE.Mesh(
      new THREE.BoxGeometry(0.36, 0.08, 0.08),
      housing,
    );
    const mount = new THREE.Group();

    mount.rotation.y = Math.atan2(-wall[1], wall[0]);
    plate.position.x = 0.36;
    arm.position.x = 0.18;
    mount.add(plate, arm);
    root.add(mount);
  }

  // A halogen floodlight head of its own (the map's fixtures are modelled
  // already): a housing, a front rim and a visor.
  if (light.id.startsWith("halogen-") || wall) {
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.38, 0.3),
      housing,
    );
    const rim = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.43, 0.04), housing);
    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.03, 0.22),
      housing,
    );

    body.position.z = 0.05;
    rim.position.z = 0.22;
    visor.position.set(0, 0.22, 0.3);
    group.add(body, rim, visor);
  }

  const lensBase = colour
    .clone()
    .multiplyScalar(1.6)
    .lerp(new THREE.Color(1, 1, 1), 0.45);
  const lensMaterial = new THREE.MeshBasicMaterial({
    color: lensBase.clone(),
    fog: false,
    toneMapped: false,
  });
  // A halogen has its own head drawn here, with the lens at its front. Every
  // other floodlight has its head drawn with its mast (in `PowerGrid`): the
  // lens glow sits in that head's recess, the size of its lens, and not out in
  // front of it, where it floated clear of the fixture, off the wall.
  const ownHead = light.id.startsWith("halogen-");
  const lens = new THREE.Mesh(
    // (A mast head's lens fills the front of its housing, a rectangle wider
    // than it is tall, never a round disc.)
    new THREE.PlaneGeometry(0.5, 0.34),
    lensMaterial,
  );

  lens.position.z = ownHead ? 0.25 : 0.012;

  // A hanging bulb has its own glass (drawn with its room): only the beam here.
  // Any other lamp has a soft halo round its lens, so it reads as a lit fixture
  // on its wall and not as a bare lens hanging in the dark.
  const haloMaterial = new THREE.SpriteMaterial({
    map: haloTexture(),
    color: colour.clone(),
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
    opacity: 0.45,
    fog: false,
  });
  const halo = new THREE.Sprite(haloMaterial);

  halo.scale.setScalar(ownHead ? 1.1 : 0.8);
  halo.position.z = ownHead ? 0.3 : 0.08;
  halo.renderOrder = 6;

  if (!light.id.startsWith("bulb-")) {
    group.add(lens);

    // A soft round glow suits a halogen's own head and would show as a ball
    // round a mast head's rectangular lens: those have the lens and the beam.
    if (ownHead) {
      group.add(halo);
    }
  }

  // The cone: apex at the lamp, widening toward the target.
  const radius = length * Math.tan(angle * 0.85);
  const geometry = new THREE.ConeGeometry(radius, length, 28, 1, true);

  geometry.translate(0, -length / 2, 0);
  geometry.rotateX(-Math.PI / 2);

  // (A hanging bulb's rays are as strong as a halogen's.)
  const beamStrength = light.id.startsWith("bulb-")
    ? 0.14
    : Math.min(0.1 + light.intensity / 700, 0.2);
  const beamMaterial = new THREE.ShaderMaterial({
    vertexShader: BEAM_VERTEX,
    fragmentShader: BEAM_FRAGMENT,
    uniforms: {
      uLength: { value: length },
      uColor: { value: colour },
      uStrength: { value: beamStrength },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: false,
  });
  const beam = new THREE.Mesh(geometry, beamMaterial);

  beam.renderOrder = 4;
  beam.frustumCulled = false;
  group.add(beam);

  // How bright the lamp is right now (1 normal, 0 out): the lens and beam follow.
  // `power` is the circuit's: 0 is dead dark (a black lens, no beam), whatever
  // the night's stutter and sag do to `level`.
  let level = 1;
  let power = 1;
  const apply = (): void => {
    lensMaterial.color
      .copy(lensBase)
      .multiplyScalar((0.25 + 0.75 * level) * power);
    beamMaterial.uniforms.uStrength.value = beamStrength * level * power;
    haloMaterial.opacity = 0.45 * level * power;
  };

  root.userData.setLevel = (value: number): void => {
    level = value;
    apply();
  };
  root.userData.setPower = (value: number): void => {
    power = value;
    apply();
  };

  return root;
}
