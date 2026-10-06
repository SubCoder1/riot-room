# Riot Room

A browser-based 3D boxing / fighting game prototype built with **Three.js**, **TypeScript** and **Vite**. You play a fully animated boxer in a walled arena, in first or third person, with a movement set, a punch system, blocking and a hit-detection combat system. A training dummy is in the arena to practice on.

This is a single-player, local prototype. There is no AI opponent and no multiplayer yet.

---

## Quick start

```bash
npm install
npm run dev        # start the dev server (Vite)
```

Open the URL Vite prints, then **click the game canvas** to capture the mouse (pointer lock). Press `Esc` to release it.

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Type-check (`tsc`) and build for production |
| `npm run preview` | Serve the production build |
| `npm test` | Run the automated combat tests once |
| `npm run test:watch` | Re-run tests when files change |
| `npm run lint` / `lint:fix` | ESLint |
| `npm run format` / `format:check` | Prettier |

---

## Controls

| Input | Action |
| --- | --- |
| Mouse | Look around (also aims punches) |
| `W` `A` `S` `D` | Move forward / left / back / right |
| `Shift` + `W` / `S` | Sprint (run) forward / backward |
| `Space` | Jump |
| `C` (hold) | Crouch |
| Left click | Punch |
| Right click (hold) | Block |
| `F3` | Toggle first person / third person camera |

### Developer keys

| Key | Action |
| --- | --- |
| `F4` | Show / hide the combat debug view (hitboxes, hurtboxes, guard cone) |
| `F6` | Dummy holds / drops its guard |
| `F7` | Dummy turns to face you (off by default, so you can test side and rear hits) |
| `F8` | Dummy crouches (a crouched guard also covers the legs) |
| `F9` | Dummy looks up (its guard aims up too) |

---

## Player abilities and movement

### Movement

| Move | How | Notes |
| --- | --- | --- |
| Walk | `W` / `A` / `S` / `D` | Walk, backward walk and strafe animations |
| Run | `Shift` + `W` (or `S` for backward) | Fastest movement; also what powers heavy attacks |
| Strafe | `A` / `D` alone | Side-step animation. Holding `Shift` while strafing is a faster strafe |
| Diagonal run | `W` + `A` / `D` | The body turns about 45° toward the direction of travel while the head keeps pointing at the crosshair, so it reads as running rather than gliding sideways |
| Jump | `Space` | A moderate jump height, so it doesn't clear an opponent's head |
| Crouch | Hold `C` | Deep crouch. Slower movement, with crouch walk, backward and strafe animations. No crouch sprint |
| Stand from crouch | `Space` while crouched | Stands you up (no jump) until `C` is released |

Approximate speeds: walk 5.5, sprint 8.5, crouch 2.2 (world units per second). Movement is slowed while punching.

### Camera

- **First person** (`F3` to switch): the camera sits at the character's head, so you see your own arms. Looking up and down is limited so the camera doesn't clip into the body.
- **Third person**: the full character is visible. The head and upper body track where you look, and punches follow the crosshair.

---

## Combat

### Punches

Punches are aimed at the crosshair. Looking down lets you hit crouched opponents, and looking up lets you punch upward.

| Attack | Trigger | Damage | Blockable |
| --- | --- | --- | --- |
| **Light punch** | Left click (spam for an alternating right / left combo) | 10 | Yes |
| **Heavy running punch** | Left click while sprinting forward, after a short build-up | 25 | No |
| **Flying light punch** | Left click in the air after a walking / strafing jump | 15 | Yes |
| **Flying heavy punch** | Left click in the air after a sprint-jump with a built-up sprint | 30 | No |

How they behave:

- **Combo:** spamming left click alternates right and left punches. The combo resets when you stop.
- **Heavy running punch:** needs about 0.6 s of sprinting forward first. It always plays out fully, so extra clicks during it are ignored. Afterwards you keep running if you hold `Shift`, or drop into the light combo if you keep spamming.
- **Flying punches:** only the first click in the air counts. After landing, a heavier landing animation plays for the heavy version. Spamming afterwards continues with the normal combo.
- Punches can't be thrown while crouched or while holding a block.
- Each attack has startup, active and recovery phases. Only the active phase can hit, and one attack can hit a given target only once.

### Blocking

Hold **right click** to guard. It works while idle, walking, strafing (including with `Shift`) and crouched. Sprinting (`Shift` + `W` / `S`) takes priority over blocking, and you can't block in the air.

Blocking is **directional and positional**, not a shield on all sides:

- **Direction:** only attacks from within the guard cone in front of you are blocked (configured in `COMBAT_CONFIG.blockAngleDegrees`, currently 90°). Hits from the side or from behind land normally.
- **Height:** the guard covers the body parts your pose actually protects.
  - Standing, looking level: torso only (head and legs are open)
  - Crouched, looking level: torso and legs
  - Looking up (raised guard): head and torso (legs and groin open, even when crouched)
- **Vertical aim:** the guard points where you look, so an attack from above (a jump attack) is only blocked if you are looking up toward it.
- **Light attacks** that meet all of the above are fully blocked (0 damage).
- **Heavy attacks cannot be blocked.** If the guard is correctly placed (right direction, height and part), the hit is reduced to 50%. Otherwise the full damage lands.

### Hit detection, damage and knockback

- Attackers have a **hitbox** (a capsule from the elbow past the fist, extended along the aim direction) and defenders have **hurtboxes** for head, torso and legs. All shapes follow the animated skeleton.
- When a hitbox touches several body parts, the one it meets most squarely counts as the part hit.
- A hit applies damage, knockback (away from the attacker, along their facing) and a hit reaction.
- A blocked hit only nudges the defender.
- Health can't go below 0, and a dead fighter can't be hit again.

All attack numbers (damage, timing, knockback, reach, blockability) live in [src/combat/AttackDefinitions.ts](src/combat/AttackDefinitions.ts). Guard rules live in [src/combat/CombatConfig.ts](src/combat/CombatConfig.ts).

---

## Training dummy

A character with **100 HP** stands at the centre of the arena. It never attacks and has no AI. It takes damage and knockback, plays hit reactions, dies at 0 HP, and **respawns after 2.5 seconds** with full health at its spawn point. A label above it shows its HP and what its guard did with the last hit (for example `BLOCKED`, `BLOCK FAILED: REAR`, `GUARD REDUCED`). The dummy is solid, so you can't walk through it.

Use `F6` to `F9` to put it into different guard states and `F4` to see the shapes.

### Hiding or removing the training dummy

There is no in-game key to hide the dummy, so it has to be done in code. In [src/game/Game.ts](src/game/Game.ts):

**Fully remove it (not visible, not hittable, not solid)** by commenting out these four lines:

```ts
this.combat.register(this.dummy);          // in the constructor: stops it being hit
this.renderer.scene.add(this.dummy.root);  // in the constructor: stops it being drawn
void this.dummy.load();                    // in the constructor: skips loading its model
this.resolveDummyCollision();              // in animate(): removes its invisible collision
```

**Only hide it visually** (it stays hittable and solid, which is useful for checking the combat debug view on its own): add this line after `this.renderer.scene.add(this.dummy.root);`:

```ts
this.dummy.root.visible = false;
```

The rest of the code can stay as it is: the dummy's per-frame update is harmless without it registered.

---

## Console output

Combat events are printed to the browser console as `[Combat] ...` lines (attack started / active, hit, damage, blocked, died, respawned). Set `COMBAT_LOGGING` to `false` in [src/combat/CombatLog.ts](src/combat/CombatLog.ts) to silence them.

---

## Project structure

```
src/
  main.ts                 Entry point
  game/Game.ts            Game loop, input -> state, punch state machine, combat wiring
  player/Player.ts        Movement, jump, gravity, crouch/sprint speeds, camera angles
  input/InputManager.ts   Keyboard, mouse, pointer lock
  character/              Character model, animations, procedural aim/IK layers
  combat/                 Combat system, attack definitions, guard rules, dummy, debug view
  rendering/Renderer.ts   Three.js renderer, scene and camera
  world/Arena.ts          The arena
public/assets/            Character model and animation .glb files
tests/combat/             Automated combat tests (Vitest)
```

Combat logic (`CombatSystem`) has no rendering or input code. It talks to fighters through the `Combatant` interface, which keeps it testable and reusable for networked play later.

---

## Tests

```bash
npm test
```

The suite (Vitest, 104 tests, under a second) covers the real combat code: attack definitions, directional blocking and guard rotation, light and heavy attacks against blocks, hit-once registration, attack timing, damage, health limits, death, respawn, knockback and the full hit pipeline. It deliberately doesn't test animations, camera or input, so those remain manual checks.

---

## Tech

Three.js 0.186, TypeScript 6, Vite 8, Vitest, ESLint and Prettier.
