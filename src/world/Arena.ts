import * as THREE from "three";

import { buildArena } from "./ArenaBuilder";
import { createFacilityPoster } from "./FacilityPoster";
import { ARENA_HALF_X, ARENA_HALF_Z, type ArenaLayout } from "./ArenaLayout";
import { createFixtureGlow } from "./LightGlow";
import { MAX_LIGHTS, RESERVED_LIGHTS } from "./Rain";
import { createPuddles } from "./Puddles";
import { createSky } from "./Sky";
import { Moths } from "./Moths";
import { NightAtmosphere, type Halogen } from "./NightAtmosphere";
import { FLICKERING, nightLights } from "./NightLights";
import { createRain } from "./Rain";
import { circuitOfLamp, type Circuit } from "./PowerCircuits";
import { ARENA_LAYOUT } from "./UpperFloorMap";

/**
 * The combat arena: graybox geometry built from the shared layout, plus its
 * lights. Collision lives in ArenaCollision and spawn points in SpawnSystem;
 * all three read the same ArenaLayout.
 */
export class Arena {
  public readonly group: THREE.Group;

  private readonly layout: ArenaLayout;
  private atmosphere: NightAtmosphere | null = null;
  private moths: Moths | null = null;
  private rainLights: {
    uPos: { value: THREE.Vector4[] };
    uCol: { value: THREE.Vector4[] };
    uOpen: { value: number };
  } | null = null;
  /** Each map lamp's slot in the rain's light list, and the colour it had. */
  private readonly lampSlots = new Map<string, number>();
  private readonly lampColours = new Map<string, THREE.Vector4>();
  private time = 0;
  private readonly circuitTarget: Record<Circuit, number> = {
    interior: 1,
    exterior: 1,
  };
  private readonly circuitChangedAt: Record<Circuit, number> = {
    interior: 0,
    exterior: 0,
  };
  private readonly circuitLamps: Array<{
    id: string;
    circuit: Circuit;
    light: THREE.Light;
    base: THREE.Color;
    glow: THREE.Object3D | null;
    rainBase: THREE.Vector4 | null;
    /** The level last shown, and the level now (0 out, 1 on). */
    applied: number;
    level: number;
    /** Its turn in the circuit (0 = nearest the generator) and how many there are. */
    rank: number;
    count: number;
  }> = [];

  constructor(layout: ArenaLayout = ARENA_LAYOUT) {
    this.layout = layout;
    this.group = new THREE.Group();
    this.buildArena();
  }

  /**
   * A light carried by the player (a lit Molotov), for the rain to show in as it
   * does in the lamps' light. `null` puts it out. It uses the last slot of the
   * rain's light list, which the map's own lamps never reach.
   */
  public setHeldLight(position: THREE.Vector3 | null, strength: number): void {
    if (!this.rainLights) {
      return;
    }

    const last = MAX_LIGHTS - 1;

    if (!position) {
      this.rainLights.uCol.value[last].set(0, 0, 0, 0);

      return;
    }

    this.rainLights.uPos.value[last].set(
      position.x,
      position.y,
      position.z,
      6.5,
    );
    this.rainLights.uCol.value[last].set(
      strength,
      strength * 0.6,
      strength * 0.25,
      0,
    );
  }

  /**
   * Fires burning in the arena (up to five), for the rain to show in. Each is a
   * position and a strength (0 puts it out); slots beyond the list are cleared.
   */
  public setFireLights(
    fires: ReadonlyArray<{ position: THREE.Vector3; strength: number }>,
  ): void {
    if (!this.rainLights) {
      return;
    }

    const first = MAX_LIGHTS - RESERVED_LIGHTS;

    for (let i = 0; i < RESERVED_LIGHTS - 1; i++) {
      const fire = fires[i];
      const slot = first + i;

      if (!fire || fire.strength <= 0) {
        this.rainLights.uCol.value[slot].set(0, 0, 0, 0);

        continue;
      }

      this.rainLights.uPos.value[slot].set(
        fire.position.x,
        fire.position.y,
        fire.position.z,
        10,
      );
      this.rainLights.uCol.value[slot].set(
        fire.strength,
        fire.strength * 0.5,
        fire.strength * 0.18,
        0,
      );
    }
  }

  /**
   * Switches a lighting circuit on or off (its generator started or stopped).
   * The lamps do not all change at once: going off they die one by one (the
   * nearest the generator first, the farthest last), and coming on they start
   * in the reverse order, the last to die the first back. Each fades over half
   * a second. The lamps stay in the scene (taking one out changes every shader).
   */
  public setCircuitPower(circuit: Circuit, on: boolean): void {
    const target = on ? 1 : 0;

    if (this.circuitTarget[circuit] !== target) {
      this.circuitTarget[circuit] = target;
      this.circuitChangedAt[circuit] = this.time;
    }
  }

  /** 0 to 1: how lit a lamp is now (1 = fully on; 1 for a lamp on no circuit). */
  public lampLevelOf(id: string): number {
    return this.circuitLamps.find((lamp) => lamp.id === id)?.level ?? 1;
  }

  /** The lamps on each circuit, found once the night's lamps are built. */
  private registerCircuitLamps(lights: ReadonlyArray<{ id: string }>): void {
    for (const { id } of lights) {
      const circuit = circuitOfLamp(id);
      const light = this.group.getObjectByName(id);

      if (!circuit || !(light instanceof THREE.Light)) {
        continue;
      }

      this.circuitLamps.push({
        id,
        circuit,
        light,
        base: light.color.clone(),
        glow: this.group.getObjectByName(`glow-${id}`) ?? null,
        rainBase: this.lampColours.get(id)?.clone() ?? null,
        applied: 1,
        level: 1,
        rank: 0,
        count: 1,
      });
    }

    // Each circuit's order: nearest its generator first.
    for (const circuit of ["interior", "exterior"] as const) {
      const generator = this.layout.generators.find(
        (g) => g.circuit === circuit,
      );
      const lamps = this.circuitLamps.filter((l) => l.circuit === circuit);
      const distance = (l: (typeof lamps)[number]): number =>
        generator
          ? Math.hypot(
              l.light.position.x - generator.panel.x,
              l.light.position.z - generator.panel.z,
            )
          : 0;

      lamps.sort((a, b) => distance(a) - distance(b));
      lamps.forEach((lamp, i) => {
        lamp.rank = i;
        lamp.count = lamps.length;
      });
    }
  }

  /** Seconds between one lamp's change and the next's. */
  private static readonly STAGGER = 0.35;

  /** Fades each lamp toward its circuit's target once its turn has come. */
  private updateCircuits(dt: number): void {
    for (const lamp of this.circuitLamps) {
      const target = this.circuitTarget[lamp.circuit];
      const turn = target === 0 ? lamp.rank : lamp.count - 1 - lamp.rank;
      const due =
        this.time - this.circuitChangedAt[lamp.circuit] >= turn * Arena.STAGGER;

      if (lamp.level !== target && due) {
        lamp.level += (target - lamp.level) * (1 - Math.exp(-7 * dt));

        if (Math.abs(target - lamp.level) < 0.004) {
          lamp.level = target;
        }
      }

      const level = lamp.level;

      // Fully on and already shown so: the night's own flicker rules.
      if (level === 1 && lamp.applied === 1) {
        continue;
      }

      // The lamp's colour carries the level (the flicker works on intensity).
      lamp.light.color.copy(lamp.base).multiplyScalar(level);
      // The head's lens goes black and its beam out (see `createFixtureGlow`).
      lamp.glow?.userData.setPower?.(level);

      const slot = this.lampSlots.get(lamp.id);

      if (this.rainLights && slot !== undefined && lamp.rainBase) {
        this.rainLights.uCol.value[slot]
          .copy(lamp.rainBase)
          .multiplyScalar(level);
      }

      this.moths?.setLampOut(lamp.id, level < 0.05);
      lamp.applied = level;
    }
  }

  /** The wooden slab over the Generator Room is broken: the rain falls through its opening. */
  public setRainOpening(open: boolean): void {
    if (this.rainLights) {
      this.rainLights.uOpen.value = open ? 1 : 0;
    }
  }

  /**
   * Puts a map lamp out for good (its bulb broke), or back (a new round): its
   * light and its visible beam, and its light in the rain.
   */
  public setLampBroken(id: string, broken: boolean): void {
    const light = this.group.getObjectByName(id);
    const glow = this.group.getObjectByName(`glow-${id}`);

    // (Kept in the scene at no intensity: dropping a light would change every
    // material's shader, a hitch the moment the bulb breaks.)
    if (light instanceof THREE.Light) {
      this.atmosphere?.setOut(light, broken);
    }

    if (glow) {
      glow.visible = !broken;
    }

    this.moths?.setLampOut(id, broken);

    const slot = this.lampSlots.get(id);
    const colour = this.lampColours.get(id);

    if (this.rainLights && slot !== undefined && colour) {
      this.rainLights.uCol.value[slot].copy(
        broken ? new THREE.Vector4() : colour,
      );
    }
  }

  /** Advances the night's flicker and lightning. */
  public update(dt: number): void {
    this.time += dt;
    this.atmosphere?.update(dt);
    this.updateCircuits(dt);
    this.moths?.update(this.time);
  }

  /** Puts the lights back to their base values. */
  public dispose(): void {
    this.atmosphere?.dispose();
    this.moths?.dispose();
  }

  private buildArena(): void {
    this.group.add(buildArena(this.layout));

    // A pitch-black night: only a trace of sky light, so rooms and shadowed
    // corners stay dark and the halogen lamps carry the scene.
    const ambientLight = new THREE.HemisphereLight(0x24304a, 0x030509, 0.5);
    ambientLight.position.set(0, 8, 0);
    this.group.add(ambientLight);

    // A faint cold sky glow with shadows, so it never leaks through roofs.
    // The map is 64 x 48 m, so the shadow box has to cover it.
    const keyLight = new THREE.DirectionalLight(0x7487ad, 0.22);
    keyLight.position.set(18, 40, 22);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(4096, 4096);
    keyLight.shadow.camera.left = -42;
    keyLight.shadow.camera.right = 42;
    keyLight.shadow.camera.top = 36;
    keyLight.shadow.camera.bottom = -36;
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 110;
    // One 4096 map over 84 m: without a bias the flat tops of ducts and
    // roofs shimmer (shadow acne), worst when a flash brightens the light.
    keyLight.shadow.bias = -0.0004;
    keyLight.shadow.normalBias = 0.06;
    this.group.add(keyLight);

    const flickering: THREE.Light[] = [];
    const halogens: Halogen[] = [];
    const mothLamps: Array<{
      position: THREE.Vector3;
      aim: THREE.Vector3;
      id: string;
    }> = [];

    // The site plans on the spawn-area walls.
    for (const poster of this.layout.posters) {
      const mesh = createFacilityPoster(this.layout, poster);

      if (mesh) {
        this.group.add(mesh);
      }
    }

    // Task lights and pendants over work areas: short range, no shadows.
    const lights = nightLights(this.layout);

    for (const light of lights) {
      if (light.target) {
        // A floodlight: a cone aimed at its target, with a soft edge.
        const spot = new THREE.SpotLight(
          light.color,
          light.intensity,
          light.distance,
          light.angle ?? 0.8,
          0.65,
          2,
        );

        spot.name = light.id;
        spot.position.set(light.x, light.y, light.z);
        spot.target.position.set(
          light.target.x,
          light.target.y,
          light.target.z,
        );
        spot.castShadow = light.castShadow === true;

        if (spot.castShadow) {
          spot.shadow.mapSize.set(512, 512);
          spot.shadow.camera.near = 0.5;
          spot.shadow.camera.far = light.distance;
          spot.shadow.bias = -0.0005;
        }

        this.group.add(spot);
        this.group.add(spot.target);

        if (FLICKERING.has(light.id)) {
          flickering.push(spot);
        }

        // A tube light is a lamp in a fixture of its own (drawn with its room):
        // no halogen head, no beam, no moths.
        if (light.id.startsWith("tube-")) {
          continue;
        }

        // Bugs only gather round the lamps inside a room, not the floodlights
        // out on the walkways and roofs.
        const inRoom = this.layout.rooms.some(
          (r) =>
            light.x > r.minX &&
            light.x < r.maxX &&
            light.z > r.minZ &&
            light.z < r.maxZ &&
            light.y > r.floorY &&
            light.y < r.floorY + 6.6,
        );

        if (inRoom) {
          mothLamps.push({
            id: light.id,
            position: spot.position.clone(),
            aim: spot.target.position.clone(),
          });
        }

        const glow = createFixtureGlow(light);

        if (glow) {
          this.group.add(glow);
          halogens.push({ light: spot, glow });
        }

        continue;
      }

      const lamp = new THREE.PointLight(
        light.color,
        light.intensity,
        light.distance,
        2,
      );

      lamp.name = light.id;

      if (FLICKERING.has(light.id)) {
        flickering.push(lamp);
      }

      lamp.position.set(light.x, light.y, light.z);

      // A room lamp with shadows: its light stops at the walls (and at the
      // racks and the pile), so it does not shine out through them onto the
      // floors and walls of the next room.
      if (light.castShadow === true) {
        lamp.castShadow = true;
        lamp.shadow.mapSize.set(512, 512);
        lamp.shadow.camera.near = 0.3;
        lamp.shadow.camera.far = light.distance;
        lamp.shadow.bias = -0.002;
        lamp.shadow.normalBias = 0.03;
      }

      this.group.add(lamp);
    }

    const rain = createRain(this.layout, lights, ARENA_HALF_X, ARENA_HALF_Z);

    this.group.add(rain);
    this.rainLights = (rain.material as THREE.ShaderMaterial)
      .uniforms as unknown as typeof this.rainLights;
    const rainColours = (this.rainLights as NonNullable<typeof this.rainLights>)
      .uCol.value;

    lights.slice(0, MAX_LIGHTS - RESERVED_LIGHTS).forEach((light, i) => {
      this.lampSlots.set(light.id, i);
      this.lampColours.set(light.id, rainColours[i].clone());
    });
    this.group.add(
      createPuddles(
        this.layout,
        lights,
        (rain.material as THREE.ShaderMaterial).uniforms,
        ARENA_HALF_X,
        ARENA_HALF_Z,
      ),
    );
    const sky = createSky();

    this.group.add(sky.mesh);
    this.moths = new Moths(mothLamps);
    this.group.add(this.moths.group);
    this.atmosphere = new NightAtmosphere(
      keyLight,
      ambientLight,
      (rain.material as THREE.ShaderMaterial).uniforms.uFlash,
      flickering,
      halogens,
      undefined,
      sky,
    );
    this.registerCircuitLamps(lights);
  }
}
