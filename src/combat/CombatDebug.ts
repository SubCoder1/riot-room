import * as THREE from "three";

import { COMBAT_CONFIG, guardAlignment, guardDotThreshold } from "./CombatConfig";
import type { CombatSystem } from "./CombatSystem";
import { createCapsule, type CapsuleShape } from "./Shapes";

const cylinderGeometry = new THREE.CylinderGeometry(1, 1, 1, 12, 1, true);
const sphereGeometry = new THREE.SphereGeometry(1, 10, 8);
const UP = new THREE.Vector3(0, 1, 0);

/** Wireframe capsule: a cylinder plus a sphere on each end. */
class DebugCapsule {
  public readonly group = new THREE.Group();

  private readonly cylinder: THREE.Mesh;
  private readonly capA: THREE.Mesh;
  private readonly capB: THREE.Mesh;
  private readonly axis = new THREE.Vector3();

  constructor(color: number) {
    const material = new THREE.MeshBasicMaterial({
      color,
      wireframe: true,
      transparent: true,
      opacity: 0.85,
      depthTest: false,
    });

    this.cylinder = new THREE.Mesh(cylinderGeometry, material);
    this.capA = new THREE.Mesh(sphereGeometry, material);
    this.capB = new THREE.Mesh(sphereGeometry, material);

    for (const mesh of [this.cylinder, this.capA, this.capB]) {
      mesh.renderOrder = 999;
      this.group.add(mesh);
    }
  }

  public update(shape: CapsuleShape): void {
    this.axis.subVectors(shape.end, shape.start);

    const length = this.axis.length();

    this.capA.position.copy(shape.start);
    this.capB.position.copy(shape.end);
    this.capA.scale.setScalar(shape.radius);
    this.capB.scale.setScalar(shape.radius);

    this.cylinder.visible = length > 1e-4;

    if (this.cylinder.visible) {
      this.axis.divideScalar(length);
      this.cylinder.position
        .addVectors(shape.start, shape.end)
        .multiplyScalar(0.5);
      this.cylinder.quaternion.setFromUnitVectors(UP, this.axis);
      this.cylinder.scale.set(shape.radius, length, shape.radius);
    }
  }
}

/** Flat translucent fan on the floor showing the frontal guard cone. */
class GuardCone {
  public readonly mesh: THREE.Mesh;

  constructor() {
    const segments = 24;
    const radius = 2.2;
    const half = (COMBAT_CONFIG.blockAngleDegrees / 2) * (Math.PI / 180);
    const positions: number[] = [0, 0, 0];

    // Forward is +z; the fan spans -half .. +half around it.
    for (let i = 0; i <= segments; i++) {
      const angle = -half + (2 * half * i) / segments;

      positions.push(Math.sin(angle) * radius, 0, Math.cos(angle) * radius);
    }

    const indices: number[] = [];

    for (let i = 1; i <= segments; i++) {
      indices.push(0, i, i + 1);
    }

    const geometry = new THREE.BufferGeometry();

    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.setIndex(indices);

    this.mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.28,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    this.mesh.renderOrder = 997;
  }

  public update(position: THREE.Vector3, facing: THREE.Vector3): void {
    this.mesh.position.set(position.x, position.y + 0.04, position.z);
    this.mesh.rotation.y = Math.atan2(facing.x, facing.z);
  }
}

/** Line from a blocking defender to another fighter: green = inside the cone. */
class BearingLine {
  public readonly line: THREE.Line;

  private readonly geometry = new THREE.BufferGeometry();
  private readonly material = new THREE.LineBasicMaterial({
    color: 0x22c55e,
    depthTest: false,
  });

  constructor() {
    this.geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3),
    );
    this.line = new THREE.Line(this.geometry, this.material);
    this.line.renderOrder = 997;
    this.line.frustumCulled = false;
  }

  public update(from: THREE.Vector3, to: THREE.Vector3, inside: boolean): void {
    const positions = this.geometry.getAttribute("position");

    positions.setXYZ(0, from.x, from.y + 0.06, from.z);
    positions.setXYZ(1, to.x, to.y + 0.06, to.z);
    positions.needsUpdate = true;

    this.material.color.setHex(inside ? 0x22c55e : 0xef4444);
  }
}

/**
 * Toggleable overlay: green = hurtboxes, red = attack hitboxes. A hitbox is only
 * drawn during its attack's ACTIVE phase, so what you see is what can hit.
 */
export class CombatDebug {
  public readonly group = new THREE.Group();

  private readonly hurtboxes = new Map<string, DebugCapsule>();
  private readonly hitboxes: DebugCapsule[] = [];
  private readonly shape = createCapsule();
  private readonly cones = new Map<string, GuardCone>();
  private readonly bearings = new Map<string, BearingLine>();
  private readonly facing = new THREE.Vector3();
  private readonly position = new THREE.Vector3();
  private readonly otherPosition = new THREE.Vector3();

  private enabled = false;

  constructor() {
    this.group.visible = false;
  }

  public get isEnabled(): boolean {
    return this.enabled;
  }

  public toggle(): void {
    this.enabled = !this.enabled;
    this.group.visible = this.enabled;
  }

  /** Guard cone + bearing lines for every fighter that is currently blocking. */
  private updateGuards(combat: CombatSystem): void {
    for (const defender of combat.getCombatants()) {
      let cone = this.cones.get(defender.id);

      if (!cone) {
        cone = new GuardCone();
        this.cones.set(defender.id, cone);
        this.group.add(cone.mesh);
      }

      const blocking = defender.isBlocking();

      cone.mesh.visible = blocking;

      for (const other of combat.getCombatants()) {
        if (other === defender) {
          continue;
        }

        const key = `${defender.id}->${other.id}`;
        let bearing = this.bearings.get(key);

        if (!bearing) {
          bearing = new BearingLine();
          this.bearings.set(key, bearing);
          this.group.add(bearing.line);
        }

        bearing.line.visible = blocking;
      }

      if (!blocking) {
        continue;
      }

      defender.getFacing(this.facing);
      defender.getPosition(this.position);
      cone.update(this.position, this.facing);

      for (const other of combat.getCombatants()) {
        if (other === defender) {
          continue;
        }

        other.getPosition(this.otherPosition);

        const inside =
          guardAlignment(
            this.facing.x,
            this.facing.z,
            this.position.x,
            this.position.z,
            this.otherPosition.x,
            this.otherPosition.z,
          ) >= guardDotThreshold();

        this.bearings
          .get(`${defender.id}->${other.id}`)
          ?.update(this.position, this.otherPosition, inside);
      }
    }
  }

  public update(combat: CombatSystem): void {
    if (!this.enabled) {
      return;
    }

    for (const combatant of combat.getCombatants()) {
      for (const hurtbox of combatant.getHurtboxes()) {
        const key = `${combatant.id}:${hurtbox.id}`;
        let capsule = this.hurtboxes.get(key);

        if (!capsule) {
          capsule = new DebugCapsule(0x22c55e);
          this.hurtboxes.set(key, capsule);
          this.group.add(capsule.group);
        }

        capsule.group.visible = hurtbox.getShape(this.shape);

        if (capsule.group.visible) {
          capsule.update(this.shape);
        }
      }
    }

    this.updateGuards(combat);

    const active = combat
      .getAttacks()
      .filter((attack) => attack.phase === "active");

    while (this.hitboxes.length < active.length) {
      const capsule = new DebugCapsule(0xef4444);

      this.hitboxes.push(capsule);
      this.group.add(capsule.group);
    }

    this.hitboxes.forEach((capsule, index) => {
      const attack = active[index];

      capsule.group.visible =
        attack !== undefined &&
        attack.attacker.getAttackShape(
          attack.hand,
          attack.definition,
          this.shape,
        );

      if (capsule.group.visible) {
        capsule.update(this.shape);
      }
    });
  }
}
