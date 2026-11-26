import * as THREE from "three";

import { LAMP } from "./NightLights";
import { CHAMBER_TUBES, TUBE_LENGTH } from "./RuinsChamber";

/**
 * What lights up in the Ruins' chamber, drawn like the Armory's tubes: small
 * emissive meshes (not lit, so they read as lit in the dark) at the fixtures
 * RuinsChamber hangs, with the lamps in NightLights doing the real lighting.
 * Always on (the chamber's lamps are on neither generator circuit).
 */
export interface ChamberGlow {
  group: THREE.Group;
  /** How lit the Power Room's emergency lamp is (0 out, 1 on). */
  setEmergency(level: number): void;
  /**
   * Moves the chamber's water, drips and tube flicker on to `time` (seconds)
   * and returns how lit each red tube is now (1 steady; the odd tube stutters
   * now and then), for the lamps over them to follow.
   */
  update(time: number): readonly number[];
  dispose(): void;
}

export function createChamberGlow(): ChamberGlow {
  const group = new THREE.Group();
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  const material = (color: number): THREE.MeshBasicMaterial => {
    const m = new THREE.MeshBasicMaterial({
      color,
      toneMapped: false,
      fog: false,
    });

    materials.push(m);

    return m;
  };
  const add = (
    geometry: THREE.BufferGeometry,
    color: number,
    parent: THREE.Object3D,
    x: number,
    y: number,
    z: number,
  ): void => {
    geometries.push(geometry);

    const mesh = new THREE.Mesh(geometry, material(color));

    mesh.position.set(x, y, z);
    mesh.frustumCulled = false;
    parent.add(mesh);
  };

  // The red tubes: two bare fluorescent tubes in each fixture RuinsChamber
  // hangs (the channel, straps and end caps are drawn there), glowing a deep,
  // dull red.
  const RED_TUBE = new THREE.Color(0xd02818);
  const tubeMaterials = CHAMBER_TUBES.map(() => {
    const m = new THREE.MeshBasicMaterial({
      color: RED_TUBE.clone(),
      toneMapped: false,
      fog: false,
    });

    materials.push(m);

    return m;
  });
  // A frosted diffuser across each fixture's open underside: translucent
  // (the tubes show through it as a soft red bar), a faint red of its own
  // where the tubes light it.
  const diffuserMaterials = CHAMBER_TUBES.map(() => {
    const m = new THREE.MeshStandardMaterial({
      color: 0x8a5a56,
      emissive: new THREE.Color(0x4a0c06),
      roughness: 0.85,
      metalness: 0,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    });

    materials.push(m);

    return m;
  });
  // Fat tubes (0.032 radius, 1.6 m between the holders) with rounded ends.
  const tubeGeometry = new THREE.CapsuleGeometry(
    0.032,
    TUBE_LENGTH - 0.1,
    4,
    12,
  );

  tubeGeometry.rotateX(Math.PI / 2);

  const diffuserGeometry = new THREE.BoxGeometry(
    0.34,
    0.012,
    TUBE_LENGTH + 0.1,
  );

  geometries.push(tubeGeometry, diffuserGeometry);

  CHAMBER_TUBES.forEach((t, i) => {
    // (The fixture's pan is 0.55 m under the slab; the tubes hang in it.)
    for (const dx of [-0.075, 0.075]) {
      const tube = new THREE.Mesh(tubeGeometry, tubeMaterials[i]);

      tube.position.set(t.x + dx, 3.7 - 0.55 - 0.1, t.z);
      tube.frustumCulled = false;
      group.add(tube);
    }

    const diffuser = new THREE.Mesh(diffuserGeometry, diffuserMaterials[i]);

    diffuser.position.set(t.x, 3.7 - 0.55 - 0.205, t.z);
    diffuser.frustumCulled = false;
    diffuser.renderOrder = 4;
    group.add(diffuser);
  });

  // The Power Room's emergency lamp: a steel plate on the ceiling, a six-bar
  // wire guard and a red bulb. It glows only while the interior circuit is out
  // (see `setEmergency`, driven by the lamp's level in Arena).
  const bulbMaterial = material(LAMP.red);
  const bulbGeometry = new THREE.SphereGeometry(0.09, 14, 10);
  const steel = new THREE.MeshStandardMaterial({
    color: 0x2a2e34,
    roughness: 0.6,
    metalness: 0.5,
  });
  const plate = new THREE.CylinderGeometry(0.17, 0.17, 0.06, 16);
  const bar = new THREE.BoxGeometry(0.02, 0.5, 0.02);

  geometries.push(bulbGeometry, plate, bar);
  materials.push(steel);

  const px = 6.0;
  const pz = -21.4;
  const ceilingTop = 7.8;
  const bulb = new THREE.Mesh(bulbGeometry, bulbMaterial);

  bulb.position.set(px, 7.2, pz);
  bulb.frustumCulled = false;
  group.add(bulb);

  const cap = new THREE.Mesh(plate, steel);

  cap.position.set(px, ceilingTop - 0.03, pz);
  group.add(cap);

  for (let k = 0; k < 6; k++) {
    const angle = (k / 6) * Math.PI * 2;
    const b = new THREE.Mesh(bar, steel);

    b.position.set(
      px + Math.cos(angle) * 0.13,
      ceilingTop - 0.31,
      pz + Math.sin(angle) * 0.13,
    );
    group.add(b);
  }

  // ---------------------------------------------------------------- water
  // Standing water on the floor: irregular pools (a noisy outline, each
  // different), thin streams running from the leaks toward them, one mesh and
  // one shader. The water is dark and takes its look from the tubes: each pixel
  // reflects the ceiling (a ray off the floor, up to the tubes' height) and
  // shows the tubes' red where the ray meets one, broken up by drips' ripples.
  // It sits 1 cm over the floor and is flat, so it is walked through.
  const pools: Array<[number, number, number, number]> = [
    [24.25, -10.5, 0.9, 0.6],
    [24.6, -5.2, 1.15, 0.8],
    [23.0, -2.2, 0.9, 0.7],
    [25.0, 0.2, 1.1, 0.8],
    [24.0, 3.0, 1.5, 1.0],
    [22.4, 5.0, 0.95, 0.6],
    [24.5, 6.9, 1.0, 0.7],
    [27.3, 7.4, 0.7, 0.5],
  ];
  const streams: Array<Array<[number, number]>> = [
    [
      [24.25, -10.9],
      [24.3, -9.8],
      [23.9, -8.6],
      [23.6, -7.5],
    ],
    [
      [24.0, 2.9],
      [23.3, 3.7],
      [22.7, 4.4],
    ],
  ];
  const wp: number[] = [];
  const wl: number[] = [];
  const wi: number[] = [];
  const Y = 0.011;
  const pushVertex = (x: number, z: number, lx: number, lz: number): number => {
    wp.push(x, Y, z);
    wl.push(lx, lz);

    return wp.length / 3 - 1;
  };

  pools.forEach(([cx, cz, rx, rz], n) => {
    const seed = n * 2.7 + 1.3;
    const segments = 28;
    const centre = pushVertex(cx, cz, 0, 0);

    for (let k = 0; k <= segments; k++) {
      const t = (k / segments) * Math.PI * 2;
      // An irregular outline, a lobe or two and a bay.
      const r =
        1 +
        0.3 * Math.sin(2 * t + seed) +
        0.2 * Math.sin(3 * t + seed * 1.7) +
        0.12 * Math.sin(5 * t + seed * 0.6);

      pushVertex(
        cx + Math.cos(t) * rx * r,
        cz + Math.sin(t) * rz * r,
        Math.cos(t) * 1.0,
        Math.sin(t) * 1.0,
      );
    }

    for (let k = 0; k < segments; k++) {
      wi.push(centre, centre + 1 + k, centre + 2 + k);
    }
  });

  for (const line of streams) {
    // A ribbon along the path: its width wanders, tapering at both ends.
    let prev: [number, number] | null = null;

    line.forEach(([x, z], k) => {
      const next = line[Math.min(k + 1, line.length - 1)];
      const back = line[Math.max(k - 1, 0)];
      const dx = next[0] - back[0];
      const dz = next[1] - back[1];
      const len = Math.hypot(dx, dz) || 1;
      const nx = -dz / len;
      const nz = dx / len;
      const along = k / (line.length - 1);
      const w =
        0.11 *
        (0.55 + 0.45 * Math.sin(Math.PI * Math.min(along * 1.3 + 0.1, 1))) *
        (1 + 0.3 * Math.sin(k * 2.3));
      const a = pushVertex(x + nx * w, z + nz * w, 1, 0);
      const b = pushVertex(x - nx * w, z - nz * w, -1, 0);

      if (prev) {
        wi.push(prev[0], prev[1], a, prev[1], b, a);
      }

      prev = [a, b];
    });
  }

  const waterGeometry = new THREE.BufferGeometry();

  waterGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(wp, 3),
  );
  waterGeometry.setAttribute("local", new THREE.Float32BufferAttribute(wl, 2));
  waterGeometry.setIndex(wi);
  geometries.push(waterGeometry);

  const tubePos = CHAMBER_TUBES.map((t) => new THREE.Vector3(t.x, 2.95, t.z));
  const drips = [
    { x: 24.25, y: 2.84, z: -11.1, period: 1.9, offset: 0.2 },
    { x: 24.0, y: 2.78, z: 2.9, period: 2.4, offset: 1.1 },
  ];
  const waterUniforms = {
    uTime: { value: 0 },
    uTube: { value: tubePos },
    uLevel: { value: CHAMBER_TUBES.map(() => 1) },
    uDrip: { value: drips.map(() => new THREE.Vector3(0, 0, 99)) },
  };
  const waterMaterial = new THREE.ShaderMaterial({
    uniforms: waterUniforms,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
    vertexShader: /* glsl */ `
      attribute vec2 local;
      varying vec2 vLocal;
      varying vec3 vWorld;
      void main() {
        vLocal = local;
        vec4 w = modelMatrix * vec4( position, 1.0 );
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uTube[${CHAMBER_TUBES.length}];
      uniform float uLevel[${CHAMBER_TUBES.length}];
      uniform vec3 uDrip[${drips.length}];
      varying vec2 vLocal;
      varying vec3 vWorld;
      void main() {
        float d = length( vLocal );
        // Streams carry their across-width in x (and nothing in y): the edge is |x|.
        float edge = vLocal.y == 0.0 ? abs( vLocal.x ) : d;
        float shape = 1.0 - smoothstep( 0.82, 1.0, edge );
        if ( shape < 0.01 ) discard;

        vec3 view = normalize( vWorld - cameraPosition );
        vec3 r = vec3( view.x, -view.y, view.z );
        // Ripples from the drips: rings spreading from where each lands.
        float ripple = 0.0;
        for ( int i = 0; i < ${drips.length}; i ++ ) {
          float age = uDrip[ i ].z;
          float dist = distance( vWorld.xz, uDrip[ i ].xy );
          float ring = ( 1.0 - smoothstep( 0.0, 0.035, abs( dist - age * 0.28 ) ) ) * ( 1.0 - clamp( age / 1.3, 0.0, 1.0 ) );
          ripple += ring * step( 0.0, age );
        }
        // A faint steady shimmer, so the water is never a mirror.
        float wob = sin( vWorld.x * 9.0 + uTime * 0.7 ) * sin( vWorld.z * 8.0 - uTime * 0.5 ) * 0.012;
        vec3 col = vec3( 0.0035, 0.0013, 0.0009 );
        float fres = 0.18 + 0.82 * pow( 1.0 - clamp( -view.y, 0.0, 1.0 ), 3.0 );
        float shine = 0.0;
        for ( int i = 0; i < ${CHAMBER_TUBES.length}; i ++ ) {
          float t = ( uTube[ i ].y - vWorld.y ) / max( r.y, 0.02 );
          vec3 hit = vWorld + r * t;
          float dx = abs( hit.x - uTube[ i ].x + wob + ripple * 0.05 );
          float dz = abs( hit.z - uTube[ i ].z + wob );
          // The tube's mirror image (sharp core) in a wider, softer glow: wet
          // concrete is never a perfect mirror.
          float core = ( 1.0 - smoothstep( 0.06, 0.2, dx ) ) * ( 1.0 - smoothstep( ${(TUBE_LENGTH / 2 - 0.2).toFixed(2)}, ${(TUBE_LENGTH / 2 + 0.15).toFixed(2)}, dz ) );
          float soft = ( 1.0 - smoothstep( 0.15, 0.9, dx ) ) * ( 1.0 - smoothstep( ${(TUBE_LENGTH / 2).toFixed(2)}, ${(TUBE_LENGTH / 2 + 1.4).toFixed(2)}, dz ) );
          float inX = 1.0;
          float inZ = core + 0.35 * soft;
          shine += inX * inZ * uLevel[ i ];
        }
        // (Streams are thin: no mirror image in them, only in the pools.)
        col += vec3( 0.5, 0.04, 0.02 ) * shine * fres * ( vLocal.y == 0.0 ? 0.0 : 1.0 );
        col += vec3( 0.35, 0.06, 0.04 ) * ripple * 0.5;
        // Darker, wetter rim where the water is shallow.
        col *= 0.55 + 0.45 * ( 1.0 - smoothstep( 0.5, 0.95, edge ) );
        gl_FragColor = vec4( col, shape * 0.8 );
        #include <colorspace_fragment>
      }
    `,
  });

  materials.push(waterMaterial);

  const waterMesh = new THREE.Mesh(waterGeometry, waterMaterial);

  waterMesh.frustumCulled = false;
  waterMesh.renderOrder = 3;
  group.add(waterMesh);

  // The drops: a small bright bead falling from each leak, once every couple
  // of seconds, and the ripple it makes where it lands.
  const dropGeometry = new THREE.SphereGeometry(0.014, 6, 6);

  dropGeometry.scale(1, 2.2, 1);
  geometries.push(dropGeometry);

  // (A dull red: the drops catch the tubes' light, not a white of their own.)
  const dropMaterial = material(0x6a1e14);
  const dropMeshes = drips.map(() => {
    const m = new THREE.Mesh(dropGeometry, dropMaterial);

    m.visible = false;
    m.frustumCulled = false;
    group.add(m);

    return m;
  });
  const levels = CHAMBER_TUBES.map(() => 1);

  const dark = new THREE.Color(0x1a0907);
  const lit = new THREE.Color(LAMP.red);

  bulbMaterial.color.copy(dark);

  // The transformer's indicator lamps, and one on each of two cabinets.
  for (const [x, color] of [
    [23.5, 0x3aff8a],
    [23.7, 0x3aff8a],
    [24.1, 0xffa030],
    [24.5, 0xff3a2a],
  ] as const) {
    add(new THREE.BoxGeometry(0.07, 0.07, 0.02), color, group, x, 1.28, 10.17);
  }

  add(
    new THREE.BoxGeometry(0.02, 0.07, 0.07),
    0xffa030,
    group,
    36.84,
    1.19,
    -5.63,
  );
  add(
    new THREE.BoxGeometry(0.02, 0.07, 0.07),
    0xff3a2a,
    group,
    36.84,
    1.19,
    -3.43,
  );

  // Cyan tube fixtures over the collapsed floor inside the Ruins: three
  // two-tube fluorescent fixtures screwed flat to the roof, a steel channel
  // with a painted reflector and end caps (like the Armory's), along x.
  for (const x of [24.4, 27.5, 30.4]) {
    const top = 10.5;
    const z = -19.8;
    const length = 1.5;
    const channel = new THREE.BoxGeometry(length + 0.1, 0.05, 0.26);
    const reflector = new THREE.BoxGeometry(length, 0.006, 0.22);
    const cap = new THREE.BoxGeometry(0.04, 0.07, 0.26);

    geometries.push(channel, reflector, cap);

    const steel = new THREE.MeshStandardMaterial({
      color: 0x30353b,
      roughness: 0.6,
      metalness: 0.5,
    });

    materials.push(steel);

    const body = new THREE.Mesh(channel, steel);

    body.position.set(x, top - 0.025, z);
    group.add(body);

    for (const dx of [-length / 2 - 0.03, length / 2 + 0.03]) {
      const c = new THREE.Mesh(cap, steel);

      c.position.set(x + dx, top - 0.04, z);
      group.add(c);
    }

    add(reflector, 0x2c3a40, group, x, top - 0.054, z);

    for (const dz of [-0.065, 0.065]) {
      const tube = new THREE.CylinderGeometry(0.018, 0.018, length - 0.1, 8);

      tube.rotateZ(Math.PI / 2);
      add(tube, 0x9fe6ff, group, x, top - 0.078, z + dz);
    }
  }

  return {
    group,
    update(time: number): readonly number[] {
      waterUniforms.uTime.value = time;

      // Two tubes now and then stutter (a quick run of dips), the rest burn
      // steady; each stutter is rare and short.
      CHAMBER_TUBES.forEach((_, i) => {
        // The fourth fixture is dead (its tubes out, the diffuser dark).
        let level = i === 3 ? 0 : 1;

        if (i === 2 || i === 4) {
          const k =
            Math.sin(time * (0.29 + i * 0.03) + i * 2.1) *
            Math.sin(time * 0.17 + i);

          if (k > 0.86) {
            level = Math.sin(time * 41 + i * 3) > -0.1 ? 0.8 : 0.12;
          }
        }

        levels[i] = level;
        waterUniforms.uLevel.value[i] = level;
        tubeMaterials[i].color
          .copy(RED_TUBE)
          .multiplyScalar(0.25 + 0.75 * level);
        diffuserMaterials[i].emissive
          .setRGB(0.42, 0.05, 0.03)
          .multiplyScalar(0.3 + 0.7 * level);
      });

      drips.forEach((d, i) => {
        const fall = Math.sqrt((2 * (d.y - 0.02)) / 9.8);
        const t = (time + d.offset) % d.period;
        const m = dropMeshes[i];

        if (t < fall) {
          m.visible = true;
          m.position.set(d.x, d.y - 0.5 * 9.8 * t * t, d.z);
          waterUniforms.uDrip.value[i].set(d.x, d.z, -1);
        } else {
          m.visible = false;
          waterUniforms.uDrip.value[i].set(d.x, d.z, t - fall);
        }
      });

      return levels;
    },
    setEmergency(level: number): void {
      bulbMaterial.color.copy(dark).lerp(lit, Math.min(Math.max(level, 0), 1));
    },
    dispose(): void {
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
      group.removeFromParent();
    },
  };
}
