import * as THREE from "three";

import { ladderMaterial } from "./ArenaBuilder";
import { weather } from "./materials/SurfaceWear";
import {
  ARMORY,
  type ChainShutter,
  type OneWayHatch,
  LEVER,
} from "./ArmoryMechanisms";

/**
 * What moves in the Armory: the shutter's slats, the hand-chain wheel and its
 * chain loop, and the steel hatch with its latch and release lever. Everything is drawn from the
 * state of the two mechanisms each frame (the chain and the wheel from the
 * shutter's own lift, never on their own clock), with nothing created per
 * frame. The fixed parts (rails, housing, gearbox, shaft, hinges' brackets)
 * are drawn with the room, in Armory.ts.
 */

const SLATS = 26;
const SLAT_HEIGHT = ARMORY.SHUTTER_HEIGHT / SLATS;
const LINKS = 112;
/** The roller: a drum along z over the opening, half sunk in the wall, with a wheel at each end. */
const DRUM_X = -20.27;
const DRUM_Y = ARMORY.FLOOR + 2.9;
const DRUM_Z0 = 6.84;
const DRUM_Z1 = 9.16;
const DRUM_RADIUS = 0.17;
const WHEEL_RADIUS = 0.26;
/** The latch bar: its length, where its centre is when shot, and how far it draws. */
const BAR_LENGTH = 0.95;
const BAR_ENGAGED = 1.45;
const BAR_TRAVEL = 0.34;
/** How far the lever is thrown (radians) as the latch draws. */
const LEVER_SWING = 1.25;

// (The shutter, its chain and wheels move: the rust is laid on each part.)
const steel = (color: number, roughness = 0.65, metalness = 0.55) =>
  weather(
    new THREE.MeshStandardMaterial({ color, roughness, metalness }),
    "metal",
    {
      exposure: 0.8,
      local: true,
    },
  );

export class ArmoryMechanismView {
  public readonly group = new THREE.Group();

  private readonly slats: THREE.InstancedMesh;
  private readonly lips: THREE.InstancedMesh;
  private readonly bottomBar: THREE.Mesh;
  private readonly wheel = new THREE.Group();
  /** The drum and its two end wheels: one body, turning with the curtain. */
  private readonly roller = new THREE.Group();
  private readonly links: THREE.InstancedMesh;
  private readonly leaf = new THREE.Group();
  private readonly latchBar = new THREE.Mesh();
  private readonly lever = new THREE.Group();
  private readonly disposables: Array<{ dispose(): void }> = [];

  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly roll = new THREE.Quaternion();
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3(1, 1, 1);
  private readonly tangent = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly rollAxis = new THREE.Vector3();
  private readonly hide = new THREE.Matrix4().makeScale(0, 0, 0);
  private lastLift = Number.NaN;
  private lastTravel = Number.NaN;

  constructor() {
    this.group.name = "armory-mechanisms";

    const track = <T extends { dispose(): void }>(item: T): T => {
      this.disposables.push(item);

      return item;
    };

    // ------------------------------------------------------------ slats
    const slatMaterial = track(steel(0x6a7078, 0.7, 0.6));
    const lipMaterial = track(steel(0x2c3036, 0.8, 0.5));
    const slatGeometry = track(
      new THREE.BoxGeometry(0.05, SLAT_HEIGHT - 0.006, 1.92),
    );
    const lipGeometry = track(new THREE.BoxGeometry(0.066, 0.016, 1.92));

    this.slats = new THREE.InstancedMesh(slatGeometry, slatMaterial, SLATS);
    this.lips = new THREE.InstancedMesh(lipGeometry, lipMaterial, SLATS);

    // Each slat is its own shade: wear, grime and the odd rust-brown.
    const color = new THREE.Color();

    for (let i = 0; i < SLATS; i++) {
      const wear =
        0.78 + 0.22 * Math.abs((Math.sin(i * 12.9898) * 43758.5453) % 1);

      color.setRGB(0.41 * wear, 0.44 * wear, 0.47 * wear);

      if (i % 7 === 3) {
        color.lerp(new THREE.Color(0x6a4a38), 0.35);
      }

      if (i < 4) {
        // The foot of the curtain is the grubbiest.
        color.multiplyScalar(0.7);
      }

      this.slats.setColorAt(i, color);
    }

    this.slats.instanceColor!.needsUpdate = true;
    this.slats.frustumCulled = false;
    this.lips.frustumCulled = false;
    this.group.add(this.slats, this.lips);

    // The bottom bar: a heavy angle with a lifting handle at each end.
    const barMaterial = track(steel(0x3a3f46, 0.75, 0.6));

    this.bottomBar = new THREE.Mesh(
      track(new THREE.BoxGeometry(0.09, 0.1, 1.96)),
      barMaterial,
    );
    this.group.add(this.bottomBar);

    // ------------------------------------------------------ chain wheel
    // The ladders' own yellow metal (shared, so it is not disposed here).
    const wheelMaterial = ladderMaterial;
    const r = ARMORY.CHAIN_WHEEL_RADIUS;
    const rim = new THREE.Mesh(
      track(new THREE.TorusGeometry(r, 0.016, 8, 28)),
      wheelMaterial,
    );
    const hub = new THREE.Mesh(
      track(new THREE.CylinderGeometry(0.045, 0.045, 0.06, 12)),
      track(steel(0x2c3036)),
    );

    // The disc lies in the y-z plane: its axis is x.
    rim.rotation.y = Math.PI / 2;
    hub.rotation.z = Math.PI / 2;
    this.wheel.add(rim, hub);

    for (let k = 0; k < 6; k++) {
      const spoke = new THREE.Mesh(
        track(new THREE.BoxGeometry(0.012, r * 1.9, 0.012)),
        wheelMaterial,
      );

      spoke.rotation.x = (k / 6) * Math.PI;
      this.wheel.add(spoke);
    }

    // Pockets round the rim, where the chain links sit.
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2;
      const tooth = new THREE.Mesh(
        track(new THREE.BoxGeometry(0.03, 0.02, 0.02)),
        wheelMaterial,
      );

      tooth.position.set(0, Math.sin(a) * (r + 0.01), Math.cos(a) * (r + 0.01));
      tooth.rotation.x = -a;
      this.wheel.add(tooth);
    }

    this.wheel.position.set(
      ARMORY.CHAIN_X,
      ARMORY.FLOOR + ARMORY.CHAIN_TOP_Y,
      ARMORY.CHAIN_Z,
    );
    this.group.add(this.wheel);

    // ------------------------------------------------------- the chain
    // Oval links of heavy round stock, long along the chain; every other one
    // turned a quarter, so they read as a chain and not as a cable.
    const linkGeometry = track(new THREE.TorusGeometry(0.026, 0.0095, 7, 14));

    linkGeometry.scale(1, 1.45, 1);
    this.links = new THREE.InstancedMesh(linkGeometry, ladderMaterial, LINKS);
    this.links.frustumCulled = false;
    this.group.add(this.links);

    this.buildRoller(track);
    this.buildHatch(track);

    this.update(
      { lift: 0, chainTravel: 0 } as ChainShutter,
      { angle: 0, dir: -1, latch: 0, rattle: 0 },
      0,
    );
  }

  /** Draws both mechanisms as they stand now. `time` is the game clock (seconds). */
  public update(
    shutter: Pick<ChainShutter, "lift" | "chainTravel">,
    door: Pick<OneWayHatch, "angle" | "dir" | "latch" | "rattle">,
    time: number,
  ): void {
    if (shutter.lift !== this.lastLift) {
      this.lastLift = shutter.lift;
      this.placeSlats(shutter.lift);
      // Winding the curtain up turns the drum so its curtain side rises; the
      // wheels are on the same axis and turn with it.
      this.roller.rotation.z = -shutter.lift / DRUM_RADIUS;
    }

    if (shutter.chainTravel !== this.lastTravel) {
      this.lastTravel = shutter.chainTravel;
      this.placeChain(shutter.chainTravel);
    }

    this.placeDoor(door, time);
  }

  /**
   * The roller: a thick steel drum along z with eight ribs along it, and a heavy
   * wheel at each end (a thick rim, a hub and six spokes) on the same axis, all
   * one body, so it turns as one.
   */
  private buildRoller(
    track: <T extends { dispose(): void }>(item: T) => T,
  ): void {
    const drumMaterial = track(steel(0x2f333a, 0.62, 0.65));
    const ribMaterial = track(steel(0x4a4f56, 0.55, 0.7));
    const wheelMaterial = track(steel(0x353a41, 0.7, 0.6));
    const hubMaterial = track(steel(0x1d2024, 0.8, 0.5));
    const length = DRUM_Z1 - DRUM_Z0;
    const drumGeometry = track(
      new THREE.CylinderGeometry(DRUM_RADIUS, DRUM_RADIUS, length, 28),
    );

    // (The cylinder's axis is y: turn it to lie along z.)
    drumGeometry.rotateX(Math.PI / 2);

    const drum = new THREE.Mesh(drumGeometry, drumMaterial);

    drum.position.z = (DRUM_Z0 + DRUM_Z1) / 2;
    this.roller.add(drum);

    // Ribs along the drum: they show it turning.
    const ribGeometry = track(new THREE.BoxGeometry(0.03, 0.03, length - 0.1));

    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const rib = new THREE.Mesh(ribGeometry, ribMaterial);

      rib.position.set(
        Math.cos(a) * (DRUM_RADIUS + 0.008),
        Math.sin(a) * (DRUM_RADIUS + 0.008),
        (DRUM_Z0 + DRUM_Z1) / 2,
      );
      rib.rotation.z = a;
      this.roller.add(rib);
    }

    // A wheel at each end of the drum.
    const rimGeometry = track(
      new THREE.TorusGeometry(WHEEL_RADIUS - 0.025, 0.026, 10, 32),
    );
    const hubGeometry = track(
      new THREE.CylinderGeometry(0.075, 0.075, 0.12, 16),
    );
    const spokeGeometry = track(
      new THREE.BoxGeometry(0.045, (WHEEL_RADIUS - 0.03) * 2, 0.04),
    );
    const boltGeometry = track(new THREE.BoxGeometry(0.03, 0.03, 0.03));

    hubGeometry.rotateX(Math.PI / 2);

    for (const z of [DRUM_Z0, DRUM_Z1]) {
      const rim = new THREE.Mesh(rimGeometry, wheelMaterial);

      rim.position.z = z;
      this.roller.add(rim);

      const hub = new THREE.Mesh(hubGeometry, hubMaterial);

      hub.position.z = z;
      this.roller.add(hub);

      for (let k = 0; k < 3; k++) {
        const spoke = new THREE.Mesh(spokeGeometry, wheelMaterial);

        spoke.position.z = z;
        spoke.rotation.z = (k / 3) * Math.PI;
        this.roller.add(spoke);
      }

      // Bolt heads round the rim, so the turning reads from the side.
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 + 0.3;
        const bolt = new THREE.Mesh(boltGeometry, ribMaterial);

        bolt.position.set(
          Math.cos(a) * (WHEEL_RADIUS - 0.025),
          Math.sin(a) * (WHEEL_RADIUS - 0.025),
          z + (z < 8 ? -0.03 : 0.03),
        );
        bolt.rotation.z = a;
        this.roller.add(bolt);
      }
    }

    for (const part of this.roller.children) {
      part.frustumCulled = false;
    }

    this.roller.position.set(DRUM_X, DRUM_Y, 0);
    this.group.add(this.roller);
  }

  /** The curtain rises as one: slats that pass the housing roll up out of sight. */
  private placeSlats(lift: number): void {
    const top = ARMORY.FLOOR + ARMORY.SHUTTER_HEIGHT;

    for (let i = 0; i < SLATS; i++) {
      const y = ARMORY.FLOOR + (i + 0.5) * SLAT_HEIGHT + lift;

      if (y + SLAT_HEIGHT / 2 > top + 0.02) {
        this.slats.setMatrixAt(i, this.hide);
        this.lips.setMatrixAt(i, this.hide);

        continue;
      }

      this.p.set(
        ARMORY.SHUTTER_X,
        y,
        (ARMORY.SHUTTER_Z0 + ARMORY.SHUTTER_Z1) / 2,
      );
      this.m.compose(this.p, this.q.identity(), this.s);
      this.slats.setMatrixAt(i, this.m);
      this.p.y = y - SLAT_HEIGHT / 2 + 0.004;
      this.m.compose(this.p, this.q.identity(), this.s);
      this.lips.setMatrixAt(i, this.m);
    }

    this.slats.instanceMatrix.needsUpdate = true;
    this.lips.instanceMatrix.needsUpdate = true;
    this.bottomBar.position.set(
      ARMORY.SHUTTER_X,
      ARMORY.FLOOR + lift - 0.04,
      (ARMORY.SHUTTER_Z0 + ARMORY.SHUTTER_Z1) / 2,
    );
    // The bar rolls up with it and is gone once it is at the housing.
    this.bottomBar.visible = ARMORY.FLOOR + lift - 0.04 < top + 0.02;
  }

  /**
   * The wheel turns and the chain runs round it by exactly what the shutter has
   * moved: haul and the near strand rises, fall and it runs back.
   */
  private placeChain(travel: number): void {
    const r = ARMORY.CHAIN_WHEEL_RADIUS;
    const drop = ARMORY.CHAIN_TOP_Y - ARMORY.CHAIN_BOTTOM_Y;
    const arc = Math.PI * r;
    const total = 2 * arc + 2 * drop;
    // The links share the loop out evenly, so it has no gap.
    const spacing = total / LINKS;
    const cy = ARMORY.FLOOR + ARMORY.CHAIN_TOP_Y;
    const cz = ARMORY.CHAIN_Z;

    this.wheel.rotation.x = travel / r;

    for (let i = 0; i < LINKS; i++) {
      let s = (i * spacing + travel) % total;

      if (s < 0) {
        s += total;
      }

      let y: number;
      let z: number;
      let ty: number;
      let tz: number;

      if (s < arc) {
        // Over the top of the wheel, left to right.
        const a = Math.PI - s / r;

        y = cy + r * Math.sin(a);
        z = cz + r * Math.cos(a);
        ty = -Math.cos(a);
        tz = Math.sin(a);
      } else if (s < arc + drop) {
        // Down the right strand.
        y = cy - (s - arc);
        z = cz + r;
        ty = -1;
        tz = 0;
      } else if (s < 2 * arc + drop) {
        // Round the bottom, right to left.
        const a = (s - arc - drop) / r;

        y = cy - drop - r * Math.sin(a);
        z = cz + r * Math.cos(a);
        ty = -Math.cos(a);
        tz = -Math.sin(a);
      } else {
        // Up the left strand.
        y = cy - drop + (s - 2 * arc - drop);
        z = cz - r;
        ty = 1;
        tz = 0;
      }

      this.tangent.set(0, ty, tz).normalize();
      this.q.setFromUnitVectors(this.up, this.tangent);
      // Every other link is turned a quarter about the chain's own length.
      this.rollAxis.copy(this.tangent);
      this.roll.setFromAxisAngle(this.rollAxis, (i % 2) * (Math.PI / 2));
      this.q.premultiply(this.roll);
      this.p.set(ARMORY.CHAIN_X + 0.03, y, z);
      this.m.compose(this.p, this.q, this.s);
      this.links.setMatrixAt(i, this.m);
    }

    this.links.instanceMatrix.needsUpdate = true;
  }

  /** The latch bar draws back, the lever swings down, and the leaf turns on its hinge. */
  private placeDoor(
    door: Pick<OneWayHatch, "angle" | "dir" | "latch" | "rattle">,
    time: number,
  ): void {
    // The bar slides back out of the jamb as the lever is pulled down.
    this.latchBar.position.x = BAR_ENGAGED - BAR_TRAVEL * door.latch;
    this.lever.rotation.z = LEVER_SWING * door.latch;

    // A try at the hatch from the Hall rattles the leaf in its frame.
    const shake =
      door.rattle > 0 ? Math.sin(time * 90) * 0.005 * door.rattle : 0;

    this.leaf.rotation.y = door.angle * door.dir + shake;
  }

  /**
   * The hatch door: an old, rusted sheet-steel door, plain and a little uneven,
   * with a few welded patches and a seam, three simple hinges on the Hall face,
   * a pull bar on the Hall face, and on the Armory face a sliding bolt in two
   * keepers with a release lever that draws it. Local x runs from the hinge
   * along the leaf, y from its centre, and the Armory face is -z.
   */
  private buildHatch(
    track: <T extends { dispose(): void }>(item: T) => T,
  ): void {
    const W = ARMORY.DOOR_WIDTH;
    const H = ARMORY.DOOR_HEIGHT;
    const T = ARMORY.DOOR_THICKNESS;
    const cx = 0.02 + W / 2;
    // Aged dark-brown steel, charcoal paint, rust, and old worn metal.
    const plate = track(steel(0x3a2d26, 0.92, 0.35));
    const paint = track(steel(0x2b2e32, 0.9, 0.3));
    const frame = track(steel(0x2a2420, 0.9, 0.4));
    const rust = track(steel(0x56321e, 0.95, 0.2));
    const rustDark = track(steel(0x3a2316, 0.95, 0.2));
    const worn = track(steel(0x55524c, 0.8, 0.5));
    const bright = track(steel(0x77746c, 0.6, 0.7));
    const stain = track(steel(0x1d1a18, 0.95, 0.2));
    const box = (
      w: number,
      h: number,
      d: number,
      material: THREE.Material,
      x: number,
      y: number,
      z: number,
      parent: THREE.Object3D = this.leaf,
    ): THREE.Mesh => {
      const mesh = new THREE.Mesh(
        track(new THREE.BoxGeometry(w, h, d)),
        material,
      );

      mesh.position.set(x, y, z);
      parent.add(mesh);

      return mesh;
    };

    // Built like a real steel door, not a flat plate with a skin: a core sheet,
    // a welded frame of stiles and rails that stands proud of it on both faces
    // (two stiles, a top, a lock and a bottom rail, and a mullion above and
    // below the lock rail), so there are four recessed panels, each with its
    // own wear. Rivets run along the frame, braces cross two panels on the Hall
    // face, and heavy strap hinges carry it.
    const x0 = 0.02;
    const x1 = 0.02 + W;
    const top = H / 2;
    const bot = -H / 2;
    const STILE = 0.14;
    const RAIL = 0.14;
    const FOOT = 0.2;
    const LOCK_Y = -0.21;
    const LOCK = 0.13;
    const PANEL_Z = 0.02;
    const noise = (k: number, face: number): number =>
      Math.abs(Math.sin(k * 12.9898 + face * 3.1) * 43758.5453) % 1;

    // The core sheet: thin, so the frame is deep over it.
    box(W - 0.04, H - 0.04, 0.036, plate, cx, 0, 0);

    // The frame: members as deep as the door, so they stand proud on both faces.
    box(STILE, H, T, frame, x0 + STILE / 2, 0, 0);
    box(STILE, H, T, frame, x1 - STILE / 2, 0, 0);
    box(W - 2 * STILE, RAIL, T, frame, cx, top - RAIL / 2, 0);
    box(W - 2 * STILE, FOOT, T, frame, cx, bot + FOOT / 2, 0);
    box(W - 2 * STILE, LOCK, T, frame, cx, LOCK_Y, 0);

    const upperLow = LOCK_Y + LOCK / 2;
    const upperHigh = top - RAIL;
    const lowerLow = bot + FOOT;
    const lowerHigh = LOCK_Y - LOCK / 2;
    const MULL = 0.1;

    box(
      MULL,
      upperHigh - upperLow,
      T,
      frame,
      cx,
      (upperHigh + upperLow) / 2,
      0,
    );
    box(
      MULL,
      lowerHigh - lowerLow,
      T,
      frame,
      cx,
      (lowerHigh + lowerLow) / 2,
      0,
    );

    // The four panels (x range, y range) and what finish each has had.
    const panels = [
      [x0 + STILE, cx - MULL / 2, upperLow, upperHigh, paint],
      [cx + MULL / 2, x1 - STILE, upperLow, upperHigh, plate],
      [x0 + STILE, cx - MULL / 2, lowerLow, lowerHigh, rustDark],
      [cx + MULL / 2, x1 - STILE, lowerLow, lowerHigh, paint],
    ] as const;

    for (const face of [-1, 1]) {
      const zz = face * (PANEL_Z + 0.0015);

      panels.forEach(([ax, bx, ay, by, finish], n) => {
        const w = bx - ax;
        const h = by - ay;
        const px = (ax + bx) / 2;
        const py = (ay + by) / 2;

        // The panel's finish: paint worn off at its edges, bare steel showing.
        box(w - 0.02, h - 0.02, 0.003, finish, px, py, zz);

        // A stamped rib round the inside of each panel (a raised bead).
        for (const [dx, dy, ww, hh] of [
          [0, h / 2 - 0.05, w - 0.12, 0.018],
          [0, -h / 2 + 0.05, w - 0.12, 0.018],
          [-w / 2 + 0.05, 0, 0.018, h - 0.12],
          [w / 2 - 0.05, 0, 0.018, h - 0.12],
        ] as const) {
          box(ww, hh, 0.008, plate, px + dx, py + dy, face * (PANEL_Z + 0.005));
        }

        // Rust creeping up from the foot of each panel in ragged tongues.
        for (let k = 0; k < 5; k++) {
          const tw = (w - 0.1) / 5;
          const tongue =
            0.04 + 0.2 * noise(k + n * 7, face) * (n > 1 ? 1.6 : 1);

          box(
            tw * 0.8,
            tongue,
            0.004,
            noise(k + 3, n) > 0.5 ? rust : rustDark,
            ax + 0.05 + tw * (k + 0.5),
            ay + 0.03 + tongue / 2,
            zz + face * 0.002,
          );
        }

        // Streaks run down from the rib, under the rivets.
        for (let k = 0; k < 3; k++) {
          const len = 0.15 + 0.4 * noise(k + n * 11, face);

          box(
            0.03 + 0.03 * noise(k + 40, n),
            len,
            0.003,
            stain,
            ax + 0.1 + (w - 0.2) * noise(k + n * 5, face),
            by - 0.08 - len / 2,
            zz + face * 0.0015,
          );
        }
      });

      // Rivets down both stiles and along the rails and the lock rail.
      const rz = face * (T / 2 + 0.004);

      for (let y = bot + 0.12; y < top - 0.1; y += 0.22) {
        box(0.026, 0.026, 0.012, bright, x0 + STILE / 2, y, rz);
        box(0.026, 0.026, 0.012, bright, x1 - STILE / 2, y, rz);
      }

      for (let x = x0 + STILE + 0.1; x < x1 - STILE - 0.05; x += 0.24) {
        box(0.026, 0.026, 0.012, bright, x, top - RAIL / 2, rz);
        box(0.026, 0.026, 0.012, bright, x, bot + FOOT / 2, rz);
        box(0.026, 0.026, 0.012, bright, x, LOCK_Y, rz);
      }

      // Rust blooming on the frame itself: the foot rail and the lower stiles.
      box(W - 0.04, 0.09, 0.004, rust, cx, bot + 0.07, face * (T / 2 + 0.001));
      box(
        0.07,
        0.6,
        0.004,
        rustDark,
        x1 - 0.08,
        bot + 0.4,
        face * (T / 2 + 0.001),
      );
      box(
        0.07,
        0.45,
        0.004,
        rust,
        x0 + 0.08,
        bot + 0.3,
        face * (T / 2 + 0.001),
      );
    }

    // Diagonal braces across two panels on the Hall face: angle iron welded on.
    for (const [ax, bx, ay, by] of [
      [panels[0][0], panels[0][1], panels[0][2], panels[0][3]],
      [panels[3][0], panels[3][1], panels[3][2], panels[3][3]],
    ] as const) {
      const w = bx - ax - 0.12;
      const h = by - ay - 0.12;
      const brace = box(
        Math.hypot(w, h),
        0.05,
        0.022,
        frame,
        (ax + bx) / 2,
        (ay + by) / 2,
        PANEL_Z + 0.014,
      );

      brace.rotation.z = Math.atan2(h, w) * (ax < cx ? 1 : -1);
    }

    // A weld bead along the foot of every panel's frame, in short uneven runs.
    for (const [ax, bx, ay] of panels) {
      for (let x = ax + 0.04; x < bx - 0.1; x += 0.13) {
        box(
          0.1,
          0.014 + 0.008 * noise(x * 9, 1),
          0.012,
          rustDark,
          x + 0.05,
          ay + 0.007,
          PANEL_Z + 0.008,
        );
      }
    }

    // Scratches where hands and knees have been, and a few chips of bare steel.
    for (let k = 0; k < 8; k++) {
      const r = noise(k, 1);
      const q = noise(k + 50, 1);
      const scratch = box(
        0.15 + 0.25 * r,
        0.006,
        0.003,
        worn,
        0.3 + (W - 0.6) * q,
        -1.0 + 1.9 * r,
        T / 2 + 0.006,
      );

      scratch.rotation.z = (q - 0.5) * 0.9;
    }

    // Three heavy strap hinges on the Hall face: a long strap bolted to the
    // door, a big barrel knuckle on the hinge axis with its pin, washers,
    // bolts and rust.
    for (const y of [-0.85, 0.0, 0.85]) {
      box(0.62, 0.13, 0.024, frame, x0 + 0.31, y, T / 2 + 0.014);

      for (const x of [0.2, 0.36, 0.52]) {
        box(0.03, 0.03, 0.014, bright, x, y, T / 2 + 0.03);
      }

      const knuckle = new THREE.Mesh(
        track(new THREE.CylinderGeometry(0.045, 0.045, 0.22, 12)),
        frame,
      );

      knuckle.position.set(-0.005, y, 0.045);
      this.leaf.add(knuckle);

      const pin = new THREE.Mesh(
        track(new THREE.CylinderGeometry(0.016, 0.016, 0.27, 8)),
        bright,
      );

      pin.position.set(-0.005, y, 0.045);
      this.leaf.add(pin);

      for (const dy of [-0.125, 0.125]) {
        const washer = new THREE.Mesh(
          track(new THREE.CylinderGeometry(0.052, 0.052, 0.02, 12)),
          worn,
        );

        washer.position.set(-0.005, y + dy, 0.045);
        this.leaf.add(washer);
      }

      box(0.07, 0.014, 0.014, rust, 0.05, y - 0.075, 0.05);
    }

    // The pull bar on the Hall face: two posts and a horizontal bar, worn
    // bright where hands go.
    const handleY = ARMORY.FLOOR + 1.05 - (ARMORY.FLOOR + H / 2 + 0.02);

    for (const x of [1.3, 1.62]) {
      box(0.035, 0.035, 0.07, frame, x, handleY, T / 2 + 0.04);
    }

    box(0.42, 0.04, 0.04, worn, 1.46, handleY, T / 2 + 0.085);

    // The latch: a bar in two keepers on the Armory face, at the height of the
    // lever. Shot, it runs 7 cm into the east jamb; drawn, it is clear of it.
    const centreY = ARMORY.FLOOR + H / 2 + 0.02;
    const barY = ARMORY.FLOOR + 1.05 - centreY;
    const leverY = ARMORY.FLOOR + 0.45 - centreY;
    const barZ = -(T / 2 + 0.05);

    for (const x of [1.05, 1.66]) {
      box(0.1, 0.11, 0.06, frame, x, barY, -(T / 2 + 0.03));
    }

    this.latchBar.geometry = track(
      new THREE.BoxGeometry(BAR_LENGTH, 0.045, 0.04),
    );
    this.latchBar.material = bright;
    this.latchBar.position.set(BAR_ENGAGED, barY, barZ);
    this.leaf.add(this.latchBar);

    // The release lever: a boss, an arm and a yellow knob, below the bar. Shot,
    // it points up; pulled, it is thrown down toward the hinge as the bar draws.
    const boss = new THREE.Mesh(
      track(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 12)),
      frame,
    );

    this.lever.position.set(LEVER.along, leverY, -(T / 2 + 0.05));
    boss.rotation.x = Math.PI / 2;
    this.lever.add(boss);

    const arm = box(0.04, 0.4, 0.03, bright, 0, 0.2, -0.01, this.lever);

    arm.name = "lever-arm";
    box(0.07, 0.07, 0.06, ladderMaterial, 0, 0.42, -0.01, this.lever);
    this.leaf.add(this.lever);

    // On the Hall face, a small stencilled plate marks the release as inside only.
    box(
      0.2,
      0.05,
      0.004,
      ladderMaterial,
      LEVER.along,
      leverY + 0.3,
      T / 2 + 0.014,
    );

    this.leaf.position.set(
      ARMORY.DOOR_HINGE_X,
      ARMORY.FLOOR + H / 2 + 0.02,
      ARMORY.DOOR_Z,
    );
    this.group.add(this.leaf);
  }

  public dispose(): void {
    for (const item of this.disposables) {
      item.dispose();
    }

    this.slats.dispose();
    this.lips.dispose();
    this.links.dispose();
    this.group.removeFromParent();
  }
}
