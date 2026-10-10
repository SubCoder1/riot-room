import * as THREE from "three";

import { Renderer } from "../rendering/Renderer";
import { InputManager } from "../input/InputManager";
import { Player } from "../player/Player";
import { Arena } from "../world/Arena";
import { ArenaCollision } from "../world/ArenaCollision";
import { ArenaDebug } from "../world/ArenaDebug";
import { CLIMB, angleBetween, ladderYaw } from "../player/Climb";
import {
  ARENA_HALF_X,
  ARENA_HALF_Z,
  PERIMETER_WALL_HEIGHT,
} from "../world/ArenaLayout";
import { ARENA_LAYOUT } from "../world/UpperFloorMap";
import {
  inTunnel,
  ventCeilingY,
  ventFloorY,
  type VentBlock,
} from "../world/Vents";
import { assignSpawns } from "../world/SpawnSystem";
import { Character } from "../character/Character";
import type { CharacterMovementState } from "../character/Character";
import { CHARACTER_ASSET_PATH } from "../character/CharacterConfig";
import { CharacterRig } from "../combat/CharacterRig";
import { CombatDebug } from "../combat/CombatDebug";
import { logCombatEvent } from "../combat/CombatLog";
import { CombatSystem } from "../combat/CombatSystem";
import { PlayerCombatant } from "../combat/PlayerCombatant";
import { ProjectileSystem, PROFILES } from "../combat/Projectiles";
import { THROW_CONFIG } from "../combat/ThrowConfig";
import { FireSystem } from "../combat/FireZones";
import { ExplosionSystem } from "../combat/Explosions";
import { SmokeSystem } from "../combat/Smoke";
import { canPerceive } from "../combat/Awareness";
import {
  perimeterClearFraction,
  traceThrowPath,
  type ThrowBounds,
  type ThrowWorld,
} from "../combat/ThrowableFlight";
import { createCapsule, segmentCapsuleEntry } from "../combat/Shapes";
import { TrainingDummy } from "../combat/TrainingDummy";
import { WorldHealthBars } from "../ui/WorldHealthBars";
import { PlayerUtilities } from "../inventory/PlayerUtilities";
import { ThrowStance, type HeldKind } from "../inventory/ThrowStance";
import type { UtilityType } from "../inventory/PlayerUtilities";
import { WeaponWheel } from "../inventory/WeaponWheel";
import { FireZoneView } from "../vfx/FireZoneView";
import { ThrowAimPreview } from "../vfx/ThrowAimPreview";
import { ThrownItemView } from "../vfx/ThrownItemView";
import { ExplosionView } from "../vfx/ExplosionView";
import { SmokeCloudView } from "../vfx/SmokeCloudView";
import { WeaponWheelView } from "../ui/WeaponWheelView";

/** The inventory slot behind each throwable. */
const THROWABLE_TYPE: Record<HeldKind, UtilityType> = {
  grenade: "GRENADE",
  molotov: "MOLOTOV",
  smoke: "SMOKE",
};

/** How far an opened hatch panel swings up on its hinge (radians). */
const HATCH_OPEN_ANGLE = 1.75;

/** How far a block of vent grating swings up on its hinge when it opens (radians). */
const VENT_PANEL_OPEN = 1.85;

export class Game {
  // ============================================================
  // CORE SYSTEMS
  // ============================================================

  private readonly renderer: Renderer;
  private readonly arena: Arena;
  private readonly collision = new ArenaCollision();
  private readonly arenaDebug = new ArenaDebug(ARENA_LAYOUT);
  private readonly input: InputManager;
  private readonly player: Player;
  private crouchCancelled = false;
  private punchTimeLeft = 0;
  /** Flying punch: sprint-jump state, one punch per jump, held until landing. */
  private wasGrounded = true;
  private jumpPunchReady = false;
  private flyPunchUsed = false;
  private flyPunchActive = false;
  /** Heavy landing recovery after a flying punch; early clicks are ignored. */
  private flyLandTimeLeft = 0;
  private readonly flyLandIgnoreClicksTime = 0.35;
  private flyLandDuration = 0;
  /** Walking (not sprinting) jump punch: lighter punch and landing. */
  private flyPunchLight = false;
  /**
   * Heavy attacks need a build-up: you must have been sprinting forward for this
   * long. Starting a sprint (or standing still) and attacking gives the light
   * version instead.
   */
  private sprintBuildTime = 0;
  private readonly heavyBuildUpSeconds = 0.6;
  /** Heavy running punch in progress (first click while sprinting forward). */
  private runPunchTimeLeft = 0;
  /** An early click is remembered this long so fast spamming isn't dropped. */
  private punchBufferLeft = 0;
  private readonly punchBufferTime = 0.2;
  /** Alternating combo survives this long after a punch ends. */
  private comboTimeLeft = 0;
  private readonly comboGraceTime = 0.25;
  private readonly character: Character;

  // ============================================================
  // COMBAT (hit detection, damage, training dummy)
  // ============================================================

  private readonly combat = new CombatSystem();
  private readonly combatDebug = new CombatDebug();
  private readonly dummy: TrainingDummy;
  private readonly playerRig: CharacterRig;
  private readonly playerCombatant: PlayerCombatant;

  /** Last round's spawn assignment (player id -> spawn id), so a new round differs. */
  private lastSpawns: Record<string, string> | undefined;
  private previousF10 = false;

  /** F4 toggles the combat debug overlay, F6 toggles the dummy's guard. */
  private previousF4 = false;

  /** Health bars above enemies' heads and floating damage numbers. */
  private readonly enemyHealthBars: WorldHealthBars;

  /** This player's utilities and what they have selected (not shared). */
  private readonly utilities = new PlayerUtilities();

  /** The hold-TAB weapon wheel and its drawing. */
  private readonly weaponWheel = new WeaponWheel(this.utilities);
  private readonly weaponWheelView: WeaponWheelView;

  // ============================================================
  // THROWABLES (grenade, Molotov, smoke grenade: equip, aim with right
  // click, throw with left click)
  // ============================================================

  private readonly throwStance = new ThrowStance();
  /** The outer wall: not a solid of the collision field, so thrown things check it too. */
  private readonly throwBounds: ThrowBounds = {
    halfX: ARENA_HALF_X,
    halfZ: ARENA_HALF_Z,
    height: PERIMETER_WALL_HEIGHT,
  };
  private readonly throwWorld: ThrowWorld = {
    clearFraction: (from, to) =>
      Math.min(
        this.collision.segmentClearFraction(
          from.x,
          from.y,
          from.z,
          to.x,
          to.y,
          to.z,
        ),
        perimeterClearFraction(from, to, this.throwBounds),
      ),
    // Fires and landed bottles come to rest on real surfaces, not in mid-air.
    surfaceY: (x, z, fromY) => this.collision.groundHeight(x, z, fromY),
  };
  private readonly projectiles: ProjectileSystem;
  private readonly fires: FireSystem;
  private readonly explosions: ExplosionSystem;
  private readonly smoke: SmokeSystem;
  private readonly fireView = new FireZoneView();
  private readonly thrownView: ThrownItemView;
  private readonly explosionView = new ExplosionView();
  private readonly smokeView: SmokeCloudView;
  private readonly throwPreview = new ThrowAimPreview();
  /** The grey tint over the screen while the camera is inside smoke. */
  private smokeOverlay: HTMLElement | null = null;
  private crosshair: HTMLElement | null = null;
  /** The left click of this frame, if the throw stance did not use it. */
  private punchClick = false;

  /** The "E to climb" hint, made on first use. */
  private climbPrompt: HTMLElement | null = null;

  private climbKeyDown = false;

  /** Roof hatches that have been opened this round (they stay open). */
  private readonly openHatches = new Set<string>();
  private readonly throwOrigin = new THREE.Vector3();
  private readonly throwDirection = new THREE.Vector3();
  private readonly throwCameraDirection = new THREE.Vector3();
  private readonly throwTarget = new THREE.Vector3();
  private readonly throwProbe = new THREE.Vector3();
  private readonly explosionPoint = new THREE.Vector3();

  private previousF6 = false;
  private previousF7 = false;
  private previousF8 = false;
  private previousF9 = false;
  /** Body turn (radians, + = left) toward the direction of travel while moving diagonally. */
  private bodyYawOffset = 0;

  private lastFrameTime: number;

  // ============================================================
  // CAMERA MODE
  // ============================================================

  /**
   * false = first person
   * true  = third person
   */
  private isThirdPerson = false;

  /**
   * Used so F3 toggles only once per key press.
   */
  private previousF3 = false;

  // ============================================================
  // FIRST PERSON CAMERA
  // ============================================================

  /**
   * Move camera slightly down from the center of the Polyfork Head bone. A small
   * value keeps the eye high, so the fists sit lower in the view.
   */
  private readonly firstPersonHeadDownOffset = 0.04;

  /**
   * Move camera slightly forward from the head.
   *
   * This prevents the camera from being inside the character's head. Pulled
   * back a little (0.18 to 0.10) so the fists and forearms sit farther away and
   * look smaller; closer than about 0.05 the hair shows at the top of the view.
   */
  private readonly firstPersonForwardOffset = 0.1;

  /** Extra eye distance (m) eased in during a running or airborne punch. */
  private readonly leaningPunchMargin = 0.12;
  private punchCameraMargin = 0;

  // ============================================================
  // THIRD PERSON CAMERA
  // ============================================================

  private readonly thirdPersonDistance = 3.2;

  private readonly thirdPersonHeight = 1.25;

  private readonly thirdPersonLookHeight = 1.0;

  // ============================================================
  // REUSABLE VECTORS
  // ============================================================

  private readonly headWorldPosition = new THREE.Vector3();

  private readonly playerForward = new THREE.Vector3();

  private readonly firstPersonCameraPosition = new THREE.Vector3();
  private readonly cameraOffsetDirection = new THREE.Vector3();
  private readonly cameraUp = new THREE.Vector3(0, 1, 0);
  private readonly cameraHeadQuat = new THREE.Quaternion();
  private readonly cameraHipsQuat = new THREE.Quaternion();
  private headLocalEye: THREE.Vector3 | null = null;

  private readonly characterFeet = new THREE.Vector3();

  private readonly thirdPersonCameraPosition = new THREE.Vector3();

  private readonly thirdPersonLookTarget = new THREE.Vector3();

  private headBone: THREE.Bone | null = null;

  private headBoneSearched = false;

  // ============================================================
  // CONSTRUCTOR
  // ============================================================

  constructor(container: HTMLElement) {
    // ----------------------------------------------------------
    // Renderer
    // ----------------------------------------------------------

    this.renderer = new Renderer(container);

    // ----------------------------------------------------------
    // Arena
    // ----------------------------------------------------------

    this.arena = new Arena();

    // ----------------------------------------------------------
    // Input
    // ----------------------------------------------------------

    this.input = new InputManager(this.renderer.renderer.domElement);

    // ----------------------------------------------------------
    // Player controller
    // ----------------------------------------------------------

    this.player = new Player();
    this.player.setWorld(this.collision);
    this.player.setLadders(ARENA_LAYOUT.ladders);
    this.player.setVents([ARENA_LAYOUT.vents, ARENA_LAYOUT.upperVents]);
    this.player.isHatchShut = (id) => !this.openHatches.has(id);

    // ----------------------------------------------------------
    // Complete Polyfork character
    // ----------------------------------------------------------

    this.character = new Character();

    // ----------------------------------------------------------
    // Combat: player combatant, training dummy, debug overlay
    // ----------------------------------------------------------

    this.playerRig = new CharacterRig(this.character.group);

    this.playerCombatant = new PlayerCombatant(
      this.playerRig,
      () => this.player.yaw,
      () => this.player.isBlocking,
      () => this.getAimDirection(),
      () => this.getPlayerFeet(),
      () => this.player.isCrouching,
      () => this.player.pitch,
    );

    this.combat.register(this.playerCombatant);

    // TEMP (testing): one Molotov to start with. Remove once pickups exist.
    this.utilities.add("MOLOTOV", 1);

    this.projectiles = new ProjectileSystem(this.combat, this.throwWorld);
    this.thrownView = new ThrownItemView(this.projectiles);
    this.fires = new FireSystem(this.combat, this.throwWorld);
    this.explosions = new ExplosionSystem(this.combat, this.throwWorld);
    this.smoke = new SmokeSystem(this.combat, this.throwWorld);
    this.smokeView = new SmokeCloudView(this.smoke);
    // A Molotov that breaks starts a fire where it landed.
    this.projectiles.onBurst = (item, point) => {
      this.fires.ignite(item.ownerId, point);
    };
    // A grenade whose fuse ran out explodes; a smoke grenade starts to emit.
    // Each item is gone before this is called, so it goes off exactly once.
    this.projectiles.onDetonate = (item, point) => {
      if (item.kind === "grenade") {
        this.explosions.detonate(item.ownerId, point);
      } else if (item.kind === "smoke") {
        this.smoke.emit(item.ownerId, point);
      }
    };
    // The picture of an explosion follows the combat event, never the throw.
    this.combat.events.subscribe((event) => {
      if (event.type === "explosion") {
        this.explosionView.spawn(
          this.explosionPoint.set(event.x, event.y, event.z),
        );
      }
    });

    this.dummy = new TrainingDummy(
      this.combat.events,
      new THREE.Vector3(0, 0, 4),
      ARENA_HALF_X - 0.6,
    );

    // Knockback can't push the dummy through cover, platforms or walls.
    this.dummy.constrain = (fromX, fromZ, toX, toZ) =>
      this.collision.moveHorizontal(
        fromX,
        fromZ,
        toX - fromX,
        toZ - fromZ,
        0,
        0.4,
      );

    this.combat.register(this.dummy);

    this.enemyHealthBars = new WorldHealthBars(
      document.body,
      this.combat.events,
      () => this.combat.getCombatants(),
      this.playerCombatant.id,
    );

    // The old floating dev label is only for debugging now (F4).
    this.dummy.setLabelVisible(false);

    // Cover, pillars and platforms stop punches.
    this.combat.lineOfSight = (from, to) =>
      !this.collision.segmentBlocked(from.x, from.y, from.z, to.x, to.y, to.z);

    // Bars hide behind cover like anything else, and in thick smoke: what
    // can't be seen through smoke can't be seen at all.
    this.enemyHealthBars.lineOfSight = (from, to) =>
      canPerceive(from, to, this.combat.lineOfSight, this.smoke);

    this.weaponWheelView = new WeaponWheelView(
      document.body,
      this.utilities,
      this.weaponWheel,
    );

    // Arms and fists stop at cover and walls instead of sinking into them.
    this.character.armProbe = (from, to) => this.armClearFraction(from, to);

    this.startRound();
    this.combat.events.subscribe(logCombatEvent);

    // ----------------------------------------------------------
    // Frame timing
    // ----------------------------------------------------------

    this.lastFrameTime = performance.now();

    // ----------------------------------------------------------
    // Add arena to scene
    // ----------------------------------------------------------

    this.renderer.scene.add(this.arena.group);

    // ----------------------------------------------------------
    // Add complete character
    // ----------------------------------------------------------
    //
    // IMPORTANT:
    //
    // We are NOT using:
    //
    // FirstPersonArms
    // ViewModel
    // Separate fists
    // Hidden character body
    //
    // The complete Polyfork character stays active.
    //

    this.renderer.scene.add(this.character.group);
    this.renderer.scene.add(this.dummy.root);
    this.renderer.scene.add(this.combatDebug.group);
    this.renderer.scene.add(this.thrownView.group);
    this.renderer.scene.add(this.fireView.group);
    this.renderer.scene.add(this.explosionView.group);
    this.renderer.scene.add(this.smokeView.group);
    this.renderer.scene.add(this.throwPreview.group);
    this.renderer.scene.add(this.arenaDebug.group);

    void this.dummy.load();

    // ----------------------------------------------------------
    // Load character
    // ----------------------------------------------------------

    void this.loadCharacter();

    // ----------------------------------------------------------
    // Start game loop
    // ----------------------------------------------------------

    this.animate = this.animate.bind(this);

    requestAnimationFrame(this.animate);
  }

  // ============================================================
  // LOAD CHARACTER
  // ============================================================

  private async loadCharacter(): Promise<void> {
    const loaded = await this.character.load(CHARACTER_ASSET_PATH);

    if (!loaded) {
      console.error("Game: failed to load player character.");

      return;
    }

    this.findHeadBone();

    // ----------------------------------------------------------
    // Character visibility
    // ----------------------------------------------------------

    this.character.group.visible = true;

    // ----------------------------------------------------------
    // Initial character position
    // ----------------------------------------------------------

    this.updateCharacterTransform();

    // ----------------------------------------------------------
    // Initial camera position
    // ----------------------------------------------------------

    this.updateCamera();
  }

  // ============================================================
  // MAIN GAME LOOP
  // ============================================================

  private animate(): void {
    const currentTime = performance.now();

    const elapsedSeconds = (currentTime - this.lastFrameTime) / 1000;

    this.lastFrameTime = currentTime;

    /**
     * Prevent a huge physics step if
     * the browser tab was inactive.
     */
    const dt = Math.min(elapsedSeconds, 0.05);

    // ----------------------------------------------------------
    // Camera toggle
    // ----------------------------------------------------------

    this.updateCameraToggle();

    // ----------------------------------------------------------
    // PLAYER PHYSICS
    // ----------------------------------------------------------
    //
    // Player handles:
    //
    // W/A/S/D
    // Sprint
    // Jump
    // Gravity
    // Ground collision
    // Arena bounds
    //

    this.updateCrouchState();
    this.duckThroughVent();

    // The weapon wheel and the throw stance come first: whether the player is
    // aiming a throwable decides if they can guard or punch this frame.
    this.updateWeaponWheel(dt);
    this.updateClimb();
    this.updateHatches(dt);
    this.updateGrates(dt);
    this.updateThrowStance(dt);

    // Holding F guards. Sprinting wins only when it changes the
    // animation to a run: Shift + W / S while standing. Fast strafing keeps the
    // guard, and Shift does nothing special while crouched.
    const sprintRequested =
      (this.input.isPressed("ShiftLeft") ||
        this.input.isPressed("ShiftRight")) &&
      (this.input.isPressed("KeyW") || this.input.isPressed("KeyS")) &&
      !this.player.isCrouching;

    this.player.isBlocking =
      this.isBlockHeld() && this.player.isGrounded && !sprintRequested;

    this.updatePunchState(dt);

    this.player.update(dt, this.input);

    this.resolveDummyCollision();

    // ----------------------------------------------------------
    // CHARACTER ANIMATION
    // ----------------------------------------------------------
    //
    // IMPORTANT:
    //
    // We DO NOT calculate airborne state from
    // player.position.y.
    //
    // Player already knows whether it is grounded.
    //

    const movementState = this.getCharacterMovementState();

    // Turn the body toward the direction of travel on forward diagonals; the
    // head keeps pointing at the crosshair.
    const sideInput =
      (this.input.isPressed("KeyA") ? 1 : 0) -
      (this.input.isPressed("KeyD") ? 1 : 0);
    const diagonalForward =
      sideInput !== 0 &&
      this.input.isPressed("KeyW") &&
      !this.input.isPressed("KeyS") &&
      (movementState === "walk" ||
        movementState === "run" ||
        movementState === "runPunch");

    const ladder = this.player.climbLadder;

    if (ladder) {
      // On a ladder the body stays facing it; only the head turns.
      this.bodyYawOffset = angleBetween(ladderYaw(ladder), this.player.yaw);
    } else {
      this.bodyYawOffset +=
        ((diagonalForward ? sideInput * (Math.PI / 4) : 0) -
          this.bodyYawOffset) *
        (1 - Math.exp(-10 * dt));
    }

    this.character.setBodyYawOffset(this.bodyYawOffset, !this.isThirdPerson);

    this.character.setAim(
      this.player.pitch,
      this.punchTimeLeft > 0 ||
        this.runPunchTimeLeft > 0 ||
        this.flyPunchActive ||
        this.player.isBlocking ||
        this.throwStance.pointsAtCrosshair,
      !this.player.isGrounded && !this.player.isClimbing,
      (this.punchTimeLeft > 0 || this.runPunchTimeLeft > 0) &&
        this.player.isGrounded,
    );

    // The hands stay on the rails (which end a metre above the top) and the
    // feet on the rungs (never below the foot of the ladder).
    const climbing = this.player.climbLadder;

    this.character.setClimb(
      this.player.isClimbing,
      this.player.position.y - this.player.eyeHeight,
      climbing
        ? { topHand: climbing.topY + 0.85, bottomFoot: climbing.bottomY + 0.1 }
        : undefined,
    );

    this.character.setVault(this.player.vaultPose);
    this.character.setVentMove(this.player.ventPose);
    this.character.setLegsHidden(this.player.isInVent && !this.isThirdPerson);
    this.updateVentArms();

    this.character.setThrowable(
      this.throwStance.pose,
      this.throwStance.itemVisible ? this.throwStance.heldKind : null,
      this.throwStance.lit,
      this.throwStance.lighting,
      this.throwStance.pinPull,
    );

    this.character.update(
      dt,
      movementState,
      this.punchTimeLeft > 0 &&
        movementState !== "punch" &&
        movementState !== "runPunch",
      this.flyPunchActive,
      this.player.isBlocking &&
        this.flyLandTimeLeft <= 0 &&
        this.punchTimeLeft <= 0 &&
        this.runPunchTimeLeft <= 0 &&
        (movementState === "block" ||
          movementState === "crouch" ||
          movementState === "crouchWalk" ||
          movementState === "crouchWalkBackwards" ||
          movementState === "crouchStrafeLeft" ||
          movementState === "crouchStrafeRight" ||
          movementState === "walk" ||
          movementState === "walkBackwards" ||
          movementState === "strafeLeft" ||
          movementState === "strafeRight"),
    );

    // ----------------------------------------------------------
    // Character world transform
    // ----------------------------------------------------------

    this.updateCharacterTransform();

    // ----------------------------------------------------------
    // Combat (after animation, so hitboxes follow the posed skeleton)
    // ----------------------------------------------------------

    this.updateCombat(dt);

    // ----------------------------------------------------------
    // Camera
    // ----------------------------------------------------------

    this.updateCamera();

    // Throwables: the throw (from the posed hand), the aim line, the items in
    // flight, the explosions and the smoke.
    this.updateThrowables(dt);

    // Health bars and damage numbers follow the heads, from the final camera.
    this.enemyHealthBars.update(dt, this.renderer.camera);

    // ----------------------------------------------------------
    // Render
    // ----------------------------------------------------------

    this.renderer.render();

    // ----------------------------------------------------------
    // Next frame
    // ----------------------------------------------------------

    requestAnimationFrame(this.animate);
  }

  // ============================================================
  // CROUCH
  // ============================================================
  //
  // Holding C crouches. Pressing Space while crouched stands the
  // player up instead of jumping, and stays standing until C is
  // released.
  //
  // ============================================================

  private isCrouching(): boolean {
    // In the vents (and climbing in or out) the vigilante is always crouched.
    if (this.player.isInVent) {
      return true;
    }

    return (
      this.player.isGrounded &&
      !this.crouchCancelled &&
      this.input.isPressed("KeyC")
    );
  }

  private updateCrouchState(): void {
    if (!this.input.isPressed("KeyC")) {
      this.crouchCancelled = false;
      this.player.isCrouching = false;
      return;
    }

    // Consuming the jump here keeps Player from jumping on the same press.
    if (this.isCrouching() && this.input.consumeJump()) {
      this.crouchCancelled = true;
    }

    this.player.isCrouching = this.isCrouching();
  }

  /** In the vents (and on the way in or out) the vigilante is always crouched. */
  private duckThroughVent(): void {
    if (this.player.isInVent) {
      this.player.isCrouching = true;
    }
  }

  // ============================================================
  // PUNCH
  // ============================================================
  //
  // Left click throws a punch while standing on the ground. Clicking again
  // near the end of a punch chains the next one. Movement is slowed while
  // the punch plays; jumping or crouching cancels it.
  //
  // ============================================================

  // ============================================================
  // WEAPON WHEEL
  // ============================================================
  //
  // Scrolling the mouse wheel at any time brings it up and equips the next
  // (or previous) slot at once; it fades out by itself a moment after the last
  // scroll. It never blocks anything: punching, blocking and moving carry on.
  //
  // ============================================================

  private updateWeaponWheel(dt: number): void {
    this.weaponWheel.scroll(this.input.consumeWheelSteps());
    this.weaponWheel.update(dt);
    this.weaponWheelView.render();
  }

  /** The selected slot as something to throw, or null (fists, the reserved slot). */
  private selectedThrowable(): HeldKind | null {
    const selected = this.utilities.selected;

    return selected === "GRENADE"
      ? "grenade"
      : selected === "MOLOTOV"
        ? "molotov"
        : selected === "SMOKE"
          ? "smoke"
          : null;
  }

  /** Guard is the F key, and is off while a throwable is being aimed or thrown. */
  private isBlockHeld(): boolean {
    return this.input.isPressed("KeyF") && this.throwStance.canBlock;
  }

  /**
   * Throw states. Right click aims, left click while aiming throws (and is never
   * also a punch), and switching to another slot puts the item back.
   */
  /**
   * E grabs the ladder you are looking at (close, from its foot or from the top
   * edge) and lets go again. While on a ladder the player cannot punch, guard
   * or throw: the clicks are thrown away and the held item is put away.
   */
  private updateClimb(): void {
    const key = this.input.isPressed("KeyE");
    const pressed = key && !this.climbKeyDown;

    this.climbKeyDown = key;

    if (pressed && this.player.isInVent) {
      // Underground: E climbs out through the grate overhead (any grate).
      this.player.leaveVent();
    } else if (pressed && !this.player.isClimbing && this.player.enterVent()) {
      // Standing on the grating wins over a ladder that happens to be in view.
      // E on a grate: the vigilante climbs down into the vents.
      this.throwStance.reset();
    } else if (pressed) {
      if (this.player.isClimbing) {
        const hatch = this.player.climbLadder?.hatch;

        // With a hatch still shut above, E opens it (from anywhere on the
        // ladder, so it never lets go by mistake); Space jumps off instead.
        if (hatch && this.player.hasShutHatch) {
          this.setHatchOpen(hatch.id, true);
        } else {
          this.player.releaseLadder();
        }
      } else {
        const ladder = this.player.ladderInReach();

        if (ladder && this.player.grabLadder()) {
          this.throwStance.reset();
          this.input.yaw = ladderYaw(ladder);
        }
      }
    }

    // Looking round is limited: the head turns, the body does not.
    const onLadder = this.player.climbLadder;

    if (onLadder) {
      const turn = angleBetween(this.input.yaw, ladderYaw(onLadder));

      if (Math.abs(turn) > CLIMB.LOOK_RANGE) {
        this.input.yaw =
          ladderYaw(onLadder) + Math.sign(turn) * CLIMB.LOOK_RANGE;
      }
    }

    if (!this.climbPrompt) {
      this.climbPrompt = document.createElement("div");
      this.climbPrompt.className = "climb-prompt";
      document.body.appendChild(this.climbPrompt);
    }

    const text = this.player.isClimbing
      ? this.player.atShutHatch
        ? "E  Open hatch"
        : this.player.hasShutHatch
          ? "W / S climb  ·  E open hatch  ·  Space jump off"
          : "W / S climb  ·  Space jump off  ·  E let go"
      : this.player.isInVent
        ? this.player.ventExitInReach()
          ? "E  Climb out"
          : this.player.isUnderground
            ? "W A S D crawl  ·  find a grate"
            : ""
        : this.player.ventEntryInReach()
          ? "E  Enter vent"
          : this.player.ladderInReach()
            ? "E  Climb"
            : "";

    if (this.climbPrompt.textContent !== text) {
      this.climbPrompt.textContent = text;
    }

    this.climbPrompt.style.visibility = text ? "visible" : "hidden";
  }

  /** Opens or shuts a roof hatch: its solid goes (or comes back) and its panel is hidden (or shown). */
  private setHatchOpen(id: string, open: boolean): void {
    if (open) {
      this.openHatches.add(id);
    } else {
      this.openHatches.delete(id);
    }

    this.collision.setOpen(id, open);

    const panel = this.arena.group.getObjectByName(`hatch:${id}`);

    // The panel swings up on its hinge (see updateHatches) and stays in view.
    if (panel) {
      panel.userData.target = open ? HATCH_OPEN_ANGLE : 0;
    }
  }

  private ventArmFade = 1;

  /**
   * Underground, the hands draw in as a tunnel wall, the ceiling or the floor
   * comes within reach along the view (and 35 degrees either side), so they
   * never poke through solid surfaces. Outside the vents they are untouched.
   */
  private updateVentArms(): void {
    let wanted = 1;

    if (this.player.isUnderground && !this.isThirdPerson) {
      const vents = this.player.ventNetwork ?? ARENA_LAYOUT.vents;
      // The camera, at the head (the crouched head is well below the body's
      // eye point).
      const eye = this.renderer.camera.position;
      let nearest = Number.POSITIVE_INFINITY;

      for (const turn of [0, 0.6, -0.6]) {
        const yaw = this.player.yaw + turn;
        const pitch = this.player.pitch;
        const dx = -Math.sin(yaw) * Math.cos(pitch);
        const dy = Math.sin(pitch);
        const dz = -Math.cos(yaw) * Math.cos(pitch);

        for (let s = 0.1; s <= 1.2; s += 0.05) {
          const x = eye.x + dx * s;
          const y = eye.y + dy * s;
          const z = eye.z + dz * s;

          if (
            y > ventCeilingY(vents) - 0.05 ||
            y < ventFloorY(vents) + 0.05 ||
            !inTunnel(vents, x, z)
          ) {
            nearest = Math.min(nearest, s);

            break;
          }
        }
      }

      // Full size with 1.2 m clear, gone by 0.55 m.
      wanted = THREE.MathUtils.clamp((nearest - 0.55) / 0.65, 0, 1);
    }

    this.ventArmFade += (wanted - this.ventArmFade) * 0.3;
    this.character.setVentArmFade(this.ventArmFade);
  }

  private ventBlockObjects: THREE.Object3D[] | null = null;

  /**
   * Only the blocks of grating under (and touching) the body swing open on
   * their hinges while the vigilante climbs in or out, fast, and drop shut
   * after; the rest of the path stays put.
   */
  private updateGrates(dt: number): void {
    if (!this.ventBlockObjects) {
      this.ventBlockObjects = [];
      this.arena.group.traverse((object) => {
        if (object.name.startsWith("ventblock:")) {
          this.ventBlockObjects?.push(object);
        }
      });
    }

    const point = this.player.ventTransitionPoint;

    for (const object of this.ventBlockObjects) {
      const block = object.userData.block as VentBlock;
      const touched =
        point !== null &&
        Math.abs(block.y - point.y) < 0.05 &&
        point.x + 0.45 >= block.minX &&
        point.x - 0.45 <= block.maxX &&
        point.z + 0.45 >= block.minZ &&
        point.z - 0.45 <= block.maxZ;
      // Swings up fast to open, and drops shut faster still.
      const target = touched ? VENT_PANEL_OPEN : 0;
      const rate = touched ? 26 : 22;

      object.rotation.z +=
        (target - object.rotation.z) * (1 - Math.exp(-rate * dt));
    }
  }

  /** Swings every hatch panel toward its open or shut angle. */
  private updateHatches(dt: number): void {
    for (const hatch of ARENA_LAYOUT.hatches) {
      const panel = this.arena.group.getObjectByName(`hatch:${hatch.id}`);

      if (panel) {
        const target = (panel.userData.target as number | undefined) ?? 0;

        panel.rotation.z +=
          (target - panel.rotation.z) * (1 - Math.exp(-9 * dt));
      }
    }
  }

  private updateThrowStance(dt: number): void {
    if (
      this.player.isClimbing ||
      this.player.isVaulting ||
      this.player.isInVent
    ) {
      // Both hands are on the ladder (or the obstacle being vaulted).
      this.input.consumeAttack();
      this.punchClick = false;

      return;
    }

    const click = this.input.consumeAttack();
    const armBusy =
      this.punchTimeLeft > 0 ||
      this.runPunchTimeLeft > 0 ||
      this.flyPunchActive ||
      this.flyLandTimeLeft > 0 ||
      this.player.isBlocking;

    const kind = this.selectedThrowable();
    const heldType = THROWABLE_TYPE[this.throwStance.heldKind];

    this.throwStance.update(dt, {
      selected: kind !== null,
      kind: kind ?? "grenade",
      count: kind ? (this.utilities.quantityOf(THROWABLE_TYPE[kind]) ?? 0) : 0,
      heldCount: this.utilities.quantityOf(heldType) ?? 0,
      aimHeld: this.input.isMouseDown(2),
      throwPressed: click,
      armBusy,
    });

    // The click goes to a punch only when the throwable did not take it, the
    // player is not mid-aim and the reserved (empty) slot is not selected:
    // that slot holds nothing, so there is nothing to do with a click.
    this.punchClick =
      click &&
      !this.throwStance.consumedClick &&
      this.throwStance.canPunch &&
      !this.utilities.reservedSelected;
  }

  /**
   * Where a throwable would leave the hand and which way it would go: from the
   * hand toward the crosshair line (so it heads for what you are looking at,
   * not parallel to it). The preview and the real throw both use this.
   */
  private computeThrow(): boolean {
    const camera = this.renderer.camera;
    // The look direction and eye are the player's, not the camera's: the third
    // person camera sits in front of the character, looking back at them.
    const eye = this.player.position;
    const aim = this.throwCameraDirection.copy(this.getAimDirection());

    if (!this.character.getThrowReleasePoint(this.throwOrigin)) {
      return false;
    }

    // Never start behind scenery: standing right up to a wall puts the hand
    // beyond it, so the throw leaves from the last clear point on the way
    // from the eye to the hand.
    const clearToHand = this.throwWorld.clearFraction(eye, this.throwOrigin);

    if (clearToHand < 1) {
      this.throwOrigin
        .sub(eye)
        .multiplyScalar(Math.max(clearToHand - 0.05, 0))
        .add(eye);
    }

    // Never start inside the lens (first person): use a point just ahead of it.
    if (
      !this.isThirdPerson &&
      this.throwOrigin.distanceTo(camera.position) < 0.35
    ) {
      this.throwOrigin.copy(camera.position).addScaledVector(aim, 0.35);
    }

    const converge = THROW_CONFIG.THROW_CONVERGE_DISTANCE;

    this.throwProbe.copy(eye).addScaledVector(aim, converge);

    const clear = this.throwWorld.clearFraction(eye, this.throwProbe);
    const distance = THREE.MathUtils.clamp(clear * converge, 6, converge);

    this.throwTarget.copy(eye).addScaledVector(aim, distance);

    this.throwDirection.subVectors(this.throwTarget, this.throwOrigin);

    if (this.throwDirection.lengthSq() < 1e-6) {
      this.throwDirection.copy(aim);
    }

    this.throwDirection.normalize();

    return true;
  }

  private updateThrowables(dt: number): void {
    // The throw: the item leaves the hand at the release point of the animation.
    if (this.throwStance.consumeRelease() && this.computeThrow()) {
      const kind = this.throwStance.heldKind;
      const type = THROWABLE_TYPE[kind];

      // Spent when it actually leaves the hand, never when aiming starts, and
      // never below zero: an empty inventory does not throw.
      if (this.utilities.remove(type)) {
        this.projectiles.throwProjectile(
          kind,
          this.playerCombatant.id,
          this.throwOrigin,
          this.throwDirection,
        );

        // Out of them: back to fists.
        if (
          (this.utilities.quantityOf(type) ?? 0) <= 0 &&
          this.utilities.selected === type
        ) {
          this.utilities.select("FISTS");
        }
      }
    }

    // The aim line and landing ring (local only), from the same numbers the
    // throw uses.
    if (this.throwStance.isAiming && this.computeThrow()) {
      traceThrowPath(
        this.throwOrigin,
        this.throwDirection,
        this.throwWorld,
        this.throwPreview.path,
        1,
        PROFILES[this.throwStance.heldKind],
      );
      this.throwPreview.show(this.renderer.camera);
    } else if (this.throwPreview.isVisible) {
      this.throwPreview.hide();
    }

    // The crosshair gives way to the aim line while aiming a throwable; a
    // quick throw (no right click) keeps it, since that is what it follows.
    const aimingThrow =
      this.throwStance.isAiming ||
      (this.throwStance.state === "THROW_THROWING" &&
        this.input.isMouseDown(2));

    this.crosshair ??= document.querySelector<HTMLElement>(".crosshair");

    if (this.crosshair) {
      this.crosshair.style.visibility = aimingThrow ? "hidden" : "";
    }

    this.thrownView.update();
    this.fireView.update(this.fires.zones, performance.now() / 1000);
    this.explosionView.update(dt);
    this.smokeView.update(this.renderer.camera, performance.now() / 1000);
    this.updateSmokeOverlay();
  }

  /** The screen greys out as the camera goes into smoke (thick smoke hides almost everything). */
  private updateSmokeOverlay(): void {
    if (!this.smokeOverlay) {
      if (this.smoke.clouds.length === 0) {
        return;
      }

      this.smokeOverlay = document.createElement("div");
      this.smokeOverlay.className = "smoke-overlay";
      this.smokeOverlay.setAttribute("aria-hidden", "true");
      document.body.appendChild(this.smokeOverlay);
    }

    const inside = this.smokeView.interior(this.renderer.camera);

    this.smokeOverlay.style.opacity = String(Math.min(inside * 0.9, 0.88));
  }

  private updatePunchState(dt: number): void {
    // The click was read in updateThrowStance: a throw click is not a punch.
    const attackClick = this.punchClick;
    const grounded = this.player.isGrounded;
    const sprintingForward =
      this.player.isSprinting && this.input.isPressed("KeyW");

    // Build-up for heavy attacks: time spent sprinting forward on the ground.
    // It holds while airborne (so a sprint jump keeps its build-up) and drops
    // as soon as the sprint stops.
    if (grounded) {
      this.sprintBuildTime = sprintingForward ? this.sprintBuildTime + dt : 0;
    }

    const builtUp = this.sprintBuildTime >= this.heavyBuildUpSeconds;

    // Sprint-jump -> one flying punch on the first click in the air; every
    // other click while airborne is ignored.
    if (this.wasGrounded && !grounded) {
      // Sprint-jump = heavy; jumping while walking/strafing = light version.
      this.jumpPunchReady = sprintingForward || this.isMovementInputActive();
      // Heavy only with a built-up sprint; otherwise the light version.
      this.flyPunchLight = !(sprintingForward && builtUp);
      this.flyPunchUsed = false;
    }
    this.wasGrounded = grounded;

    this.flyLandTimeLeft = Math.max(0, this.flyLandTimeLeft - dt);

    if (!grounded || this.player.isCrouching) {
      this.flyLandTimeLeft = 0;
    }

    let landingClick = attackClick;

    if (this.flyLandTimeLeft > 0 && attackClick) {
      const elapsed = this.flyLandDuration - this.flyLandTimeLeft;
      const ignoreFor = this.flyPunchLight
        ? this.flyLandIgnoreClicksTime * 0.5
        : this.flyLandIgnoreClicksTime;

      if (elapsed < ignoreFor) {
        landingClick = false;
      } else {
        // Spamming again once the impact has settled breaks out of the landing.
        this.flyLandTimeLeft = 0;
      }
    }

    if (!grounded) {
      if (attackClick && this.jumpPunchReady && !this.flyPunchUsed) {
        this.flyPunchUsed = true;
        this.flyPunchActive = true;
        this.character.startFlyingPunch(this.flyPunchLight);
        this.combat.startAttack(
          "player",
          this.flyPunchLight ? "flying-light-punch" : "flying-heavy-punch",
          "right",
        );
      }
      this.punchBufferLeft = 0;
    } else {
      if (this.flyPunchActive) {
        // Landed: spamming now continues with the normal combo (left hook first).
        this.flyPunchActive = false;
        this.combat.cancelAttack("player");
        this.character.setFlyLandLight(this.flyPunchLight);
        this.flyLandDuration = this.character.flyLandDuration;
        this.flyLandTimeLeft = this.flyLandDuration;
        this.comboTimeLeft = this.flyLandDuration + this.comboGraceTime;
        landingClick = false;
      }
      this.jumpPunchReady = false;

      // Clicks are ignored while holding a block (standing still).
      const blocking = this.player.isBlocking;

      if (landingClick && !blocking) {
        this.punchBufferLeft = this.punchBufferTime;
      }
    }

    // The heavy running punch always plays out in full: clicks during it are dropped.
    if (this.runPunchTimeLeft > 0) {
      this.punchBufferLeft = 0;
    }

    const canPunch =
      grounded && !this.player.isCrouching && !this.player.isInVent;
    const duration = this.character.punchDuration;
    const runDuration = this.character.runPunchDuration;

    if (!canPunch || (this.runPunchTimeLeft > 0 && !sprintingForward)) {
      this.runPunchTimeLeft = 0;
    }

    // A cancelled punch (jump, crouch, sprint released) can no longer hit.
    if (
      this.runPunchTimeLeft <= 0 &&
      this.combat.getAttackId("player") === "heavy-run-punch"
    ) {
      this.combat.cancelAttack("player");
    }

    if (!canPunch) {
      if (!this.flyPunchActive) {
        this.combat.cancelAttack("player");
      }

      this.punchTimeLeft = 0;
      this.punchBufferLeft = 0;
      this.comboTimeLeft = 0;
      if (!this.flyPunchActive) {
        this.character.resetPunchCombo();
      }
    } else if (
      this.punchBufferLeft > 0 &&
      sprintingForward &&
      builtUp &&
      runDuration > 0 &&
      this.punchTimeLeft <= 0 &&
      this.runPunchTimeLeft <= 0 &&
      this.comboTimeLeft <= 0
    ) {
      // First click of a sprint: one heavy right-hand punch, then keep running.
      this.character.startRunPunch();
      this.combat.startAttack("player", "heavy-run-punch", "right");
      this.runPunchTimeLeft = runDuration;
      this.punchBufferLeft = 0;
      this.comboTimeLeft = runDuration + this.comboGraceTime;
    } else if (
      this.punchBufferLeft > 0 &&
      this.punchTimeLeft <= duration * 0.35 &&
      this.runPunchTimeLeft <= 0
    ) {
      // Clicks after the heavy punch has finished: normal alternating combo.
      this.character.startPunch();
      this.combat.startAttack(
        "player",
        "light-punch",
        this.character.lastPunchWasLeft ? "left" : "right",
      );
      this.punchTimeLeft = duration;
      this.runPunchTimeLeft = 0;
      this.punchBufferLeft = 0;
      this.comboTimeLeft = duration + this.comboGraceTime;
    } else {
      this.punchTimeLeft = Math.max(0, this.punchTimeLeft - dt);
      this.runPunchTimeLeft = Math.max(0, this.runPunchTimeLeft - dt);
      this.punchBufferLeft = Math.max(0, this.punchBufferLeft - dt);
      if (this.comboTimeLeft > 0) {
        this.comboTimeLeft -= dt;
        if (this.comboTimeLeft <= 0) {
          this.character.resetPunchCombo();
        }
      }
    }

    this.player.isPunching = this.punchTimeLeft > 0 || this.flyLandTimeLeft > 0;
    this.player.punchSpeedFactor =
      this.flyLandTimeLeft > 0
        ? this.flyPunchLight
          ? 0.55
          : 0.2
        : this.isThirdPerson
          ? 0.8
          : 0.3;
  }

  // ============================================================
  // CHARACTER MOVEMENT STATE
  // ============================================================
  //
  // Priority:
  //
  // 1. Jump
  // 2. Crouch (hold C), crouch walk forward / backwards
  // 3. Punch
  // 4. Strafe left
  // 5. Strafe right
  // 6. Walk / run / backwards
  // 7. Idle
  //
  // ============================================================

  private getCharacterMovementState(): CharacterMovementState {
    /**
     * --------------------------------------------------------
     * JUMP
     * --------------------------------------------------------
     *
     * Jump has highest priority.
     *
     * We use the REAL physics state from Player.
     *
     * No Y-position guessing.
     */
    // On a ladder: stepping while climbing, still when holding on.
    if (this.player.isClimbing) {
      return this.input.isPressed("KeyW") || this.input.isPressed("KeyS")
        ? "walk"
        : "idle";
    }

    if (!this.player.isGrounded) {
      return "jump";
    }

    /**
     * --------------------------------------------------------
     * CROUCH
     * --------------------------------------------------------
     *
     * Plays for as long as C is held, unless Space was pressed
     * to stand up (see updateCrouchState). Moves slower while crouched.
     */

    if (this.isCrouching()) {
      // W/S net input picks the crouch walk; otherwise A/D pick the crouch strafe.
      const crouchForward =
        (this.input.isPressed("KeyW") ? 1 : 0) -
        (this.input.isPressed("KeyS") ? 1 : 0);

      if (crouchForward > 0) {
        return "crouchWalk";
      }

      if (crouchForward < 0) {
        return "crouchWalkBackwards";
      }

      const crouchSide =
        (this.input.isPressed("KeyA") ? 1 : 0) -
        (this.input.isPressed("KeyD") ? 1 : 0);

      if (crouchSide > 0) {
        return "crouchStrafeLeft";
      }

      if (crouchSide < 0) {
        return "crouchStrafeRight";
      }

      return "crouch";
    }

    /**
     * --------------------------------------------------------
     * PUNCH
     * --------------------------------------------------------
     */

    // Idle block: hold F while standing still.
    if (
      this.isBlockHeld() &&
      this.flyLandTimeLeft <= 0 &&
      this.punchTimeLeft <= 0 &&
      this.runPunchTimeLeft <= 0 &&
      !this.isMovementInputActive()
    ) {
      return "block";
    }

    // Heavy landing after a flying punch.
    if (this.flyLandTimeLeft > 0) {
      return "flyLand";
    }

    // Standing punches use the full-body clip. In third person, a moving punch
    // only drives the upper body so the legs keep their locomotion cycle. In
    // first person the camera rides the head bone, so the steady full-body
    // clip is kept to avoid walk-bob jitter.
    if (
      this.punchTimeLeft > 0 &&
      (!this.isThirdPerson || !this.isMovementInputActive())
    ) {
      return "punch";
    }

    if (this.runPunchTimeLeft > 0) {
      return "runPunch";
    }

    /**
     * --------------------------------------------------------
     * STRAFE LEFT
     * --------------------------------------------------------
     */

    // Diagonal movement (W/S together with A/D) uses the walk/run animations,
    // with the body turned toward the direction of travel; only pure sideways
    // movement plays a strafe.
    const straightAhead =
      (this.input.isPressed("KeyW") ? 1 : 0) -
      (this.input.isPressed("KeyS") ? 1 : 0);

    if (straightAhead === 0 && this.input.isPressed("KeyA")) {
      return "strafeLeft";
    }

    /**
     * --------------------------------------------------------
     * STRAFE RIGHT
     * --------------------------------------------------------
     */

    if (straightAhead === 0 && this.input.isPressed("KeyD")) {
      return "strafeRight";
    }

    /**
     * --------------------------------------------------------
     * WALK / RUN / BACKWARDS
     * --------------------------------------------------------
     *
     * W = forward walk (Shift + W = run)
     * S = backward walk (Shift + S = backward run)
     *
     * Matches Player movement: W and S together cancel out.
     */
    const forwardInput =
      (this.input.isPressed("KeyW") ? 1 : 0) -
      (this.input.isPressed("KeyS") ? 1 : 0);

    if (forwardInput > 0) {
      // Holding Shift (sprint) turns the forward walk into a run.
      return this.player.isSprinting ? "run" : "walk";
    }

    if (forwardInput < 0) {
      return this.player.isSprinting ? "runBackwards" : "walkBackwards";
    }

    /**
     * --------------------------------------------------------
     * IDLE
     * --------------------------------------------------------
     */

    return "idle";
  }

  private isMovementInputActive(): boolean {
    return (
      this.input.isPressed("KeyW") ||
      this.input.isPressed("KeyA") ||
      this.input.isPressed("KeyS") ||
      this.input.isPressed("KeyD")
    );
  }

  // ============================================================
  // COMBAT
  // ============================================================

  private updateCombat(dt: number): void {
    const f4 = this.input.isPressed("F4");
    const f6 = this.input.isPressed("F6");

    if (f4 && !this.previousF4) {
      this.combatDebug.toggle();
      this.arenaDebug.toggle();
      this.dummy.setLabelVisible(this.combatDebug.isEnabled);
    }

    if (f6 && !this.previousF6) {
      this.dummy.blockHeld = !this.dummy.blockHeld;
    }

    // F7: make the dummy turn to face you (off = it keeps its facing, so you
    // can attack it from the side and from behind).
    // F10: start a new round (everyone is re-assigned a random spawn point).
    const f10 = this.input.isPressed("F10");

    if (f10 && !this.previousF10) {
      this.startRound();
    }

    this.previousF10 = f10;

    const f7 = this.input.isPressed("F7");

    if (f7 && !this.previousF7) {
      this.dummy.trackPlayer = !this.dummy.trackPlayer;
    }

    this.previousF7 = f7;

    // F8: crouch the dummy (a crouched guard also protects the legs).
    const f8 = this.input.isPressed("F8");

    if (f8 && !this.previousF8) {
      this.dummy.crouched = !this.dummy.crouched;
    }

    this.previousF8 = f8;

    // F9: the dummy looks up (its guard aims up with it).
    const f9 = this.input.isPressed("F9");

    if (f9 && !this.previousF9) {
      this.dummy.lookUp = !this.dummy.lookUp;
    }

    this.previousF9 = f9;

    this.previousF4 = f4;
    this.previousF6 = f6;

    this.characterFeet.set(
      this.player.position.x,
      this.player.position.y - this.player.eyeHeight,
      this.player.position.z,
    );

    this.dummy.update(dt, this.characterFeet);
    this.playerRig.refresh();

    this.updatePunchReach();

    this.combat.update(dt);
    this.projectiles.update(dt);
    this.fires.update(dt);
    this.smoke.update(dt);
    this.combatDebug.update(this.combat);
  }

  /**
   * Straighten the striking arm as the attack goes live (eases in over the
   * last part of the startup, holds through the active window, relaxes during
   * recovery).
   */
  private updatePunchReach(): void {
    const attack = this.combat.getAttack("player");

    if (!attack) {
      this.character.setPunchReach("right", 0);

      return;
    }

    const { startup, active, recovery } = attack.definition;
    const t = attack.elapsed;
    const smooth = (x: number): number => {
      const c = THREE.MathUtils.clamp(x, 0, 1);

      return c * c * (3 - 2 * c);
    };

    // The arm stays as authored while the punch is being loaded (bent, drawn
    // back) and only straightens/aims during the last part of the startup.
    const amount =
      t < startup
        ? smooth((t - startup * 0.6) / (startup * 0.4))
        : t < startup + active
          ? 1
          : 1 - smooth((t - startup - active) / recovery);

    this.character.setPunchReach(attack.hand, amount);
  }

  private readonly aimDirection = new THREE.Vector3();
  private readonly playerFeet = new THREE.Vector3();

  private getPlayerFeet(): THREE.Vector3 {
    return this.playerFeet.set(
      this.player.position.x,
      this.player.position.y - this.player.eyeHeight,
      this.player.position.z,
    );
  }
  private readonly pitchLimitEuler = new THREE.Euler();
  private readonly pitchLimitGroupQuat = new THREE.Quaternion();

  /**
   * The head pitches with your look direction, which swings an eye point fixed
   * in the head frame down toward the chest when you look straight down (and
   * the camera ends up inside the body). The camera therefore only follows a
   * few degrees of that pitch; yaw and roll still follow the head.
   */
  private limitHeadPitch(headQuat: THREE.Quaternion): void {
    const limit = 0.3;

    this.character.group.getWorldQuaternion(this.pitchLimitGroupQuat);

    // Head orientation in the character's own frame; x is pitch there.
    headQuat.premultiply(this.pitchLimitGroupQuat.clone().invert());
    this.pitchLimitEuler.setFromQuaternion(headQuat, "YXZ");
    this.pitchLimitEuler.x = THREE.MathUtils.clamp(
      this.pitchLimitEuler.x,
      -limit,
      limit,
    );
    headQuat.setFromEuler(this.pitchLimitEuler);
    headQuat.premultiply(this.pitchLimitGroupQuat);
  }

  /** Unit vector from the camera through the crosshair. */
  private getAimDirection(): THREE.Vector3 {
    const { yaw, pitch } = this.player;
    const horizontal = Math.cos(pitch);

    return this.aimDirection.set(
      -Math.sin(yaw) * horizontal,
      Math.sin(pitch),
      -Math.cos(yaw) * horizontal,
    );
  }

  private readonly armBodyShape = createCapsule();

  /**
   * How much of the line from `from` to `to` an arm can travel before it meets
   * something: cover, walls and platforms, or another fighter's body. Used so
   * fists stop at contact instead of passing through.
   */
  private armClearFraction(from: THREE.Vector3, to: THREE.Vector3): number {
    let fraction = this.collision.segmentClearFraction(
      from.x,
      from.y,
      from.z,
      to.x,
      to.y,
      to.z,
    );

    for (const other of this.combat.getCombatants()) {
      if (other === this.playerCombatant || other.isDead()) {
        continue;
      }

      for (const hurtbox of other.getHurtboxes()) {
        if (!hurtbox.getShape(this.armBodyShape)) {
          continue;
        }

        const entry = segmentCapsuleEntry(from, to, this.armBodyShape);

        if (entry !== null) {
          fraction = Math.min(fraction, entry);
        }
      }
    }

    return fraction;
  }

  /**
   * Starts a round: every active fighter (the player and the dummy for now)
   * is given its own randomly chosen spawn point, full health and a clean
   * state. Free-for-all: nothing about a fighter decides where it starts.
   */
  private startRound(): void {
    // Every roof hatch is shut again for a new round.
    for (const id of [...this.openHatches]) {
      this.setHatchOpen(id, false);
    }

    const spawns = assignSpawns(["player", "dummy"], {
      previous: this.lastSpawns,
    });

    this.lastSpawns = Object.fromEntries(
      Object.entries(spawns).map(([id, point]) => [id, point.id]),
    );

    const own = spawns.player;
    const foe = spawns.dummy;

    this.combat.cancelAttack("player");
    this.projectiles.clear();
    this.fires.clear();
    this.smoke.clear();
    this.throwStance.reset();
    this.playerCombatant.health.reset();

    this.player.teleport(own.x, own.y, own.z);
    this.input.yaw = own.yaw;
    this.input.pitch = -0.1;

    // The dummy faces the way its spawn point faces (its yaw convention is the
    // opposite of the camera's).
    this.dummy.startRound(
      new THREE.Vector3(foe.x, foe.y, foe.z),
      foe.yaw + Math.PI,
    );
  }

  /** The dummy is solid: the player can't walk through it. */
  private resolveDummyCollision(): void {
    const dummyPosition = this.dummy.getPosition();
    const minimumDistance = 0.55;

    // Standing on a platform above (or below) the dummy is not touching it.
    const feetY = this.player.position.y - this.player.eyeHeight;

    if (Math.abs(feetY - dummyPosition.y) > 1) {
      return;
    }

    const dx = this.player.position.x - dummyPosition.x;
    const dz = this.player.position.z - dummyPosition.z;
    const distance = Math.hypot(dx, dz);

    if (distance >= minimumDistance) {
      return;
    }

    if (distance < 1e-4) {
      this.player.position.z += minimumDistance;

      return;
    }

    const push = (minimumDistance - distance) / distance;

    this.player.position.x += dx * push;
    this.player.position.z += dz * push;

    // Being shoved must never put the player inside cover or a wall.
    const free = this.collision.pushOut(
      this.player.position.x,
      this.player.position.z,
      feetY,
    );

    this.player.position.x = free.x;
    this.player.position.z = free.z;
  }

  // ============================================================
  // CAMERA TOGGLE
  // ============================================================

  private updateCameraToggle(): void {
    const f3Pressed = this.input.isPressed("F3");

    /**
     * Toggle only when F3 changes
     * from released -> pressed.
     */
    if (f3Pressed && !this.previousF3) {
      this.isThirdPerson = !this.isThirdPerson;
    }

    this.previousF3 = f3Pressed;
  }

  // ============================================================
  // CHARACTER PRESENTATION
  // ============================================================

  private updatePresentation(): void {
    /**
     * The complete character is always visible.
     */
    this.character.group.visible = true;
  }

  // ============================================================
  // CHARACTER TRANSFORM
  // ============================================================

  private updateCharacterTransform(): void {
    /**
     * Player position represents the eyes.
     *
     * Character position represents the feet.
     *
     * Therefore:
     *
     *     feetY = eyeY - eyeHeight
     */
    this.characterFeet.set(
      this.player.position.x,

      this.player.position.y - this.player.eyeHeight - this.player.stepLag,

      this.player.position.z,
    );

    /**
     * Keep the character upright.
     *
     * Only rotate around Y.
     */
    this.character.setTransform(
      this.characterFeet,
      this.player.yaw + Math.PI + this.bodyYawOffset,
    );
  }

  // ============================================================
  // CAMERA
  // ============================================================

  /**
   * The camera never enters a wall, platform or block that is taller than it
   * is, so you can't see the inside of scenery (or through it).
   */
  private keepCameraOutOfScenery(position: THREE.Vector3): void {
    // In the vents the tunnel walls are the bounds; the solid block of the upper
    // floor around an upper tunnel must not push the camera out of it.
    if (this.player.isInVent) {
      return;
    }

    const free = this.collision.pushOut(
      position.x,
      position.z,
      0,
      0.15,
      position.y - 0.05,
      // Only what is at the camera's height gets in its way, not a roof above.
      position.y + 0.1,
    );

    position.x = free.x;
    position.z = free.z;
  }

  /** Underground the camera stays under the floor slab (so it never pokes out of the vent). */
  private keepUndergroundCameraBelowFloor(position: THREE.Vector3): void {
    if (this.player.isUnderground) {
      const net = this.player.ventNetwork;

      if (net) {
        position.y = Math.min(
          Math.max(position.y, ventFloorY(net) + 0.2),
          ventCeilingY(net) - 0.15,
        );

        // Never outside the tunnel, the same on both sides: the camera is slid
        // sideways into the nearest tunnel (15 cm off its walls) and stays in the
        // head. (It is not pulled back toward the body: that put the camera
        // inside the torso and the legs.)
        let bestX = position.x;
        let bestZ = position.z;
        let bestD = Infinity;

        for (const tun of net.tunnels) {
          const x = Math.min(
            Math.max(position.x, tun.minX + 0.15),
            tun.maxX - 0.15,
          );
          const z = Math.min(
            Math.max(position.z, tun.minZ + 0.15),
            tun.maxZ - 0.15,
          );
          const d = Math.hypot(x - position.x, z - position.z);

          if (d < bestD) {
            bestD = d;
            bestX = x;
            bestZ = z;
          }
        }

        position.x = bestX;
        position.z = bestZ;
      }
    }
  }

  private updateCamera(): void {
    this.updatePresentation();

    if (this.isThirdPerson) {
      this.updateThirdPersonCamera();

      return;
    }

    this.updateFirstPersonCamera();
  }

  // ============================================================
  // FIRST PERSON CAMERA
  // ============================================================

  private updateFirstPersonCamera(): void {
    const head = this.findHeadBone();

    // Player forward direction (horizontal).
    this.playerForward.set(
      -Math.sin(this.player.yaw),

      0,

      -Math.cos(this.player.yaw),
    );

    this.playerForward.normalize();

    if (head) {
      // Make sure all skeleton transforms are current before reading the head.
      this.character.group.updateMatrixWorld(true);

      head.getWorldPosition(this.headWorldPosition);
      head.getWorldQuaternion(this.cameraHeadQuat);
      this.limitHeadPitch(this.cameraHeadQuat);

      // Eye point: slightly forward of and below the head bone. It is stored
      // in the head's own frame, so however the head leans, twists or pitches
      // during punches, the camera stays in front of the face.
      if (!this.headLocalEye) {
        const punching =
          this.punchTimeLeft > 0 ||
          this.runPunchTimeLeft > 0 ||
          this.flyPunchActive;

        // Calibrate once, from a neutral (non-punching) pose.
        if (!punching) {
          this.headLocalEye = this.cameraOffsetDirection
            .copy(this.playerForward)
            .multiplyScalar(this.firstPersonForwardOffset)
            .addScaledVector(this.cameraUp, -this.firstPersonHeadDownOffset)
            .applyQuaternion(
              this.cameraHipsQuat.copy(this.cameraHeadQuat).invert(),
            )
            .clone();
        }
      }

      this.firstPersonCameraPosition.copy(this.headWorldPosition);

      if (this.headLocalEye) {
        this.firstPersonCameraPosition.add(
          this.cameraOffsetDirection
            .copy(this.headLocalEye)
            .applyQuaternion(this.cameraHeadQuat),
        );
      } else {
        this.firstPersonCameraPosition.y -= this.firstPersonHeadDownOffset;
        this.firstPersonCameraPosition.addScaledVector(
          this.playerForward,
          this.firstPersonForwardOffset,
        );
      }

      // Small extra margin while looking up, where the forehead/brow sweeps
      // closest to the camera.
      this.firstPersonCameraPosition.addScaledVector(
        this.playerForward,
        0.05 * THREE.MathUtils.clamp(this.player.pitch / 1.0, 0, 1),
      );

      // A running or airborne punch pitches the head and chest forward and the
      // chin comes up toward the camera: ease the eye out while one is in
      // progress (and back in after it).
      const leaning =
        this.runPunchTimeLeft > 0 ||
        this.flyPunchActive ||
        (this.punchTimeLeft > 0 && !this.player.isGrounded);

      this.punchCameraMargin +=
        ((leaning ? this.leaningPunchMargin : 0) - this.punchCameraMargin) *
        0.3;
      this.firstPersonCameraPosition.addScaledVector(
        this.playerForward,
        this.punchCameraMargin,
      );

      // Looking down tips the head forward and the forehead sweeps toward the
      // camera, so move the eye out a little as the pitch increases.
      this.firstPersonCameraPosition.addScaledVector(
        this.playerForward,
        0.1 * THREE.MathUtils.clamp(-Math.sin(this.player.pitch), 0, 1),
      );
    } else {
      // Fallback: Polyfork normally always has a Head bone.
      this.firstPersonCameraPosition.copy(this.player.position);
    }

    // ----------------------------------------------------------
    // Apply camera position
    // ----------------------------------------------------------

    this.keepUndergroundCameraBelowFloor(this.firstPersonCameraPosition);
    this.keepCameraOutOfScenery(this.firstPersonCameraPosition);
    this.renderer.camera.position.copy(this.firstPersonCameraPosition);
    this.character.aimEye = this.firstPersonCameraPosition;

    // ----------------------------------------------------------
    // Apply FPS look
    // ----------------------------------------------------------

    this.renderer.camera.rotation.set(
      this.player.pitch,
      this.player.yaw,
      0,
      "YXZ",
    );
  }

  // ============================================================
  // FIND HEAD BONE
  // ============================================================

  private findHeadBone(): THREE.Bone | null {
    if (!this.character.isLoaded || this.headBoneSearched) {
      return this.headBone;
    }

    this.headBoneSearched = true;

    this.character.group.traverse((object) => {
      if (this.headBone) {
        return;
      }

      if (
        object.name.toLowerCase() === "head" &&
        (object instanceof THREE.Bone || object.type === "Bone")
      ) {
        this.headBone = object as THREE.Bone;
      }
    });

    if (!this.headBone) {
      console.warn(
        "Game: Head bone not found; using player position for FPP camera.",
      );
    }

    return this.headBone;
  }

  // ============================================================
  // THIRD PERSON CAMERA
  // ============================================================

  private updateThirdPersonCamera(): void {
    this.character.aimEye = null;

    // ----------------------------------------------------------
    // Character feet
    // ----------------------------------------------------------

    this.characterFeet.set(
      this.player.position.x,

      this.player.position.y - this.player.eyeHeight - this.player.stepLag,

      this.player.position.z,
    );

    // ----------------------------------------------------------
    // Player forward
    // ----------------------------------------------------------

    this.playerForward.set(
      -Math.sin(this.player.yaw),

      0,

      -Math.cos(this.player.yaw),
    );

    this.playerForward.normalize();

    // ----------------------------------------------------------
    // Start at character feet
    // ----------------------------------------------------------

    this.thirdPersonCameraPosition.copy(this.characterFeet);

    // ----------------------------------------------------------
    // Raise camera
    // ----------------------------------------------------------

    this.thirdPersonCameraPosition.y += this.thirdPersonHeight;

    // ----------------------------------------------------------
    // Put camera in front of character
    // ----------------------------------------------------------

    // On a ladder the wall is straight ahead, so the camera goes to the other
    // side: behind the climber, looking at their back.
    this.thirdPersonCameraPosition.addScaledVector(
      this.playerForward,
      this.player.isClimbing
        ? -this.thirdPersonDistance
        : this.thirdPersonDistance,
    );

    // ----------------------------------------------------------
    // Apply camera position
    // ----------------------------------------------------------

    this.keepUndergroundCameraBelowFloor(this.thirdPersonCameraPosition);
    this.keepCameraOutOfScenery(this.thirdPersonCameraPosition);
    this.renderer.camera.position.copy(this.thirdPersonCameraPosition);

    // ----------------------------------------------------------
    // Look at upper body
    // ----------------------------------------------------------

    this.thirdPersonLookTarget.copy(this.characterFeet);

    this.thirdPersonLookTarget.y += this.thirdPersonLookHeight;

    this.renderer.camera.lookAt(this.thirdPersonLookTarget);
  }

  // ============================================================
  // DISPOSE
  // ============================================================

  public dispose(): void {
    this.input.dispose();

    this.thrownView.dispose();
    this.explosionView.dispose();
    this.smokeView.dispose();
    this.throwPreview.dispose();
    this.smokeOverlay?.remove();

    this.character.dispose();

    this.renderer.dispose();
  }
}
