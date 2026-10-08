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
| Mouse wheel | Switch utility: opens the weapon wheel and equips the next / previous slot at once |
| Left click | Punch; with Rocks equipped, throw a rock (quick throw, or aimed while right click is held) |
| `F` (hold) | Block |
| Right click (hold) | Aim a rock (only with Rocks equipped) |
| `F3` | Toggle first person / third person camera |

### Weapon wheel

Scroll the **mouse wheel** at any time (standing, running, punching, blocking) and a small weapon wheel appears in the middle of the screen while the next (scroll down) or previous (scroll up) slot is **equipped in the same moment**. Keep scrolling to keep stepping. About 0.7 seconds after the last scroll the wheel fades away by itself and your choice stays. It never blocks anything: you can keep punching, blocking and moving while it is up. The wheel is a screen overlay, so it works the same in first and third person.

| Slot | Quantity | Note |
| --- | --- | --- |
| Rocks (top) | starts at 3 | |
| Molotov (right) | starts at 0 | |
| Smoke (left) | starts at 0 | |
| Fists (bottom) | none | no utility: you use your fists (shown with a boxing glove) |

- Scrolling steps ROCKS, MOLOTOV, SMOKE, FISTS and back to ROCKS one way, and the reverse the other way. A slot with none left can still be chosen; it simply shows ×0 and you keep your fists.
- **Fists are the fallback.** Fists is the fourth slot, with a boxing-glove icon and no quantity. You use your fists when it is selected or when the selected utility has run out. You start on Fists. The punch, block and movement systems are untouched.
- The centre shows the selected slot's name and quantity and updates with every scroll. Quantities are read from the inventory, so they stay current when it changes.
- **This is only the selection and inventory foundation.** Nothing is thrown yet: choosing Rocks, Molotov or Smoke changes what is equipped, nothing more.

Each player owns their own inventory and selection ([src/inventory/PlayerUtilities.ts](src/inventory/PlayerUtilities.ts)); there is no shared inventory. A pickup will simply call `add("ROCKS", 1)`, and the wheel will show the new quantity. A new utility is one more entry in `UTILITY_SLOTS` there (name, icon, starting quantity, position on the wheel). The scroll behaviour is in [src/inventory/WeaponWheel.ts](src/inventory/WeaponWheel.ts) and the drawing in [src/ui/WeaponWheelView.ts](src/ui/WeaponWheelView.ts).

### Developer keys

| Key | Action |
| --- | --- |
| `F4` | Show / hide the debug view: combat shapes and guard cone, plus the arena's spawn points (S1-S11), resource sites, the five routes, collision boxes, boundary and platform heights |
| `F6` | Dummy holds / drops its guard |
| `F7` | Dummy turns to face you (off by default, so you can test side and rear hits) |
| `F8` | Dummy crouches (a crouched guard also covers the legs) |
| `F9` | Dummy looks up (its guard aims up too) |
| `F10` | Start a new round: the player and the dummy are given new random spawn points |

---

## Player abilities and movement

### Movement

| Move | How | Notes |
| --- | --- | --- |
| Walk | `W` / `A` / `S` / `D` | Walk, backward walk and strafe animations |
| Run | `Shift` + `W` (or `S` for backward) | Fastest movement; also what powers heavy attacks |
| Strafe | `A` / `D` alone | Side-step animation. Holding `Shift` while strafing is a faster strafe |
| Diagonal run | `W` + `A` / `D` | The body turns about 45Â° toward the direction of travel while the head keeps pointing at the crosshair, so it reads as running rather than gliding sideways |
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

Hold **F** to guard. It works while idle, walking, strafing (including with `Shift`) and crouched. Sprinting (`Shift` + `W` / `S`) takes priority over blocking, and you can't block in the air.

Blocking is **directional and positional**, not a shield on all sides:

- **Direction:** only attacks from within the guard cone in front of you are blocked (configured in `COMBAT_CONFIG.blockAngleDegrees`, currently 90Â°). Hits from the side or from behind land normally.
- **Height:** the guard covers the body parts your pose actually protects.
  - Standing, looking level: torso only (head and legs are open)
  - Crouched, looking level: torso and legs
  - Looking up (raised guard): head and torso (legs and groin open, even when crouched)
- **Vertical aim:** the guard points where you look, so an attack from above (a jump attack) is only blocked if you are looking up toward it.
- **Light attacks** that meet all of the above are fully blocked (0 damage).
- **Heavy attacks cannot be blocked.** If the guard is correctly placed (right direction, height and part), the hit is reduced to 50%. Otherwise the full damage lands.

### Rocks

Pick **Rocks** on the weapon wheel (you start with 3) and the hand goes to the hip pocket and comes back up with a rock in it (a short equip, no long animation). The rock is a real 3D object in the hand, in first and third person.

- **Quick throw:** with Rocks equipped, a plain **left click** throws straight along the crosshair, no aiming needed (the crosshair stays visible). After every throw, if you have more rocks, the hand reaches into the pocket for the next one.
- **Aim:** hold **right click**. The crosshair gives way to a sharp dashed line showing where the rock will go, with a ring where it ends on scenery or the floor. It follows where you look, goes straight for the first few metres and then bends more and more in a smooth arc (`ROCK_GRAVITY_START`, `ROCK_GRAVITY_RAMP`, `ROCK_GRAVITY`). It is local only: nobody else sees it. The pose is a casual throwing stance: the free arm points at the target and the throwing hand is cocked back beside the shoulder.
- **Throw:** press **left click while still holding right click**. The arm winds back a little and snaps forward, and the rock leaves the hand at the release. You don't have to let go of right click first. That click never also punches.
- **Guard:** blocking is on **F** now (right click is only for aiming). Nothing about how blocking works changed.
- **No rocks left:** the count on the wheel goes down by one per throw, can't go below zero, and at 0 you fall back to Fists and can't aim.
- **Switching away:** the hand goes to the pocket, the rock disappears, then you are back to normal. Scrolling mid-aim cancels the aim cleanly, and a throw already started finishes first.
- **States:** `NORMAL`, `ROCK_EQUIPPING`, `ROCK_EQUIPPED`, `ROCK_AIMING`, `ROCK_THROWING`, `ROCK_UNEQUIPPING` ([src/inventory/RockStance.ts](src/inventory/RockStance.ts)). While aiming or throwing you can't punch or guard, and a second throw can't start until the first is done. Releasing right click without throwing goes back to `ROCK_EQUIPPED`.

**One physics for the preview and the rock.** The aim line and the thrown rock both step the same function ([src/combat/RockFlight.ts](src/combat/RockFlight.ts)) with the same fixed time step, so the rock follows the line (a test checks they agree point for point).

**Damage uses the existing combat numbers** ([src/combat/RockConfig.ts](src/combat/RockConfig.ts) is the one place to tune all of it):

| | Value |
| --- | --- |
| Body hit | The light jump punch's damage (15) |
| Head hit | 85% of the heavy attack's damage (21), so it stays below a heavy attack |
| Guarded hit | The damage above times `ROCK_BLOCK_DAMAGE_MULTIPLIER` (0.35), at least 1: never zero |
| Knockback / stagger | `ROCK_KNOCKBACK`, `ROCK_HITSTUN` |

Guarding a rock uses the same directional guard as melee, measured against the thrower: the guard cone, the vertical aim and the body parts the guard covers. A rock from the side, from behind, or aimed at a part the guard doesn't cover (for example the head over a level guard) does full damage. A guarded rock still lands for the reduced amount, shows that amount as its damage number and the `BLOCKED` tag, and staggers less.

A rock that hits cover, a wall or the floor bounces off (losing most of its speed), drops to the ground and settles, then vanishes after a moment; a bounced rock hurts nobody. One thrown at the sky keeps flying and comes down ( `ROCK_MAX_RANGE` is only a safety limit), and at most `ROCK_MAX_ACTIVE` fly at once (the oldest is dropped).

**Multiplayer-ready.** The thrower only reports "I threw from here, this way". Whether the rock hits, which body part, the guard and the damage are decided in `ProjectileSystem` and `CombatSystem.resolveProjectileHit`, which only use the `Combatant` interface and have no rendering or input code, so a server can run them. Nothing is networked yet (the game has no multiplayer), so only the local throw is wired up.

### Molotov

Pick **Molotov** on the weapon wheel. You start with none (×0), so it can't be equipped until you have one: a pickup is just `utilities.add("MOLOTOV", 1)`. It uses the rock's states, aim line and throw, so the controls are the same: the hand goes to the pocket, the bottle comes up to be lit (a small flame appears), and it is ready. **Hold right click** to aim (the dashed line shows where it lands), then **left click** to throw it. A plain left click is a quick throw. The bottle is spent when it leaves the hand, never when you start aiming; at ×0 you drop back to Fists. Switching away puts it back in the pocket without a flame.

It flies like the rock (straight for a few metres, then an arc, `MOLOTOV_PROFILE`) and breaks on the first thing it meets: the floor, a platform, a wall or a body. On a wall the fire drops to the surface below, so it never floats in mid-air.

**The fire** is an area-denial zone, not an explosion:

| | Value (all in [src/combat/MolotovConfig.ts](src/combat/MolotovConfig.ts)) |
| --- | --- |
| Radius | Spreads from 0.5 m to `MOLOTOV_MAX_RADIUS` (3 m) over `MOLOTOV_SPREAD_TIME` (0.8 s) |
| Duration | `MOLOTOV_DURATION` (7 s) at full size, counted from when it has fully spread |
| Ending | It shrinks and fades over `MOLOTOV_FIRE_FADE_TIME` (0.8 s), then is removed |
| Damage | A tick every `MOLOTOV_TICK_INTERVAL` (0.5 s) for `MOLOTOV_DAMAGE_PER_TICK` (7), growing up to `MOLOTOV_MAX_RAMP` (1.8x) after `MOLOTOV_RAMP_SECONDS` (3 s) of continuous burning, never above `MOLOTOV_MAX_OVERLAP_DAMAGE` (14) |
| Fires at once | At most `MOLOTOV_MAX_ZONES` (8); the oldest goes out first |

Walking through costs about 17 points; standing in it takes about 63 after 3 seconds and kills a full-health character in about 4.5 seconds. The damage goes through the normal health bar and damage numbers (one per tick, so no spam), and holding **F gives no protection**: you have to leave the fire. Overlapping fires never add ticks: a player takes at most one tick per interval. Anyone inside the radius burns, the thrower included.

**One radius.** The flames, the ground glow and the damage all use `fireRadius(age)` ([src/combat/FireZones.ts](src/combat/FireZones.ts)). The visible edge is uneven (flames fall short of it in places, with gaps and flicker), but nothing is ever drawn beyond the radius that burns you. The fire is drawn with a fixed pool of instanced meshes (a glow disc, 40 flames, 10 embers per fire), not a particle system.

**Multiplayer-ready.** The thrower only reports the throw. Where the bottle breaks, creating the fire, the damage ticks and the expiry are all decided in `ProjectileSystem` and `FireSystem` (no rendering or input), which emit `fire-started` and `fire-ended` events with the position, so a server can run them and clients only draw the zones. Nothing is networked yet.

### Hit detection, damage and knockback

- Attackers have a **hitbox** (a capsule from the elbow past the fist, extended along the aim direction) and defenders have **hurtboxes** for head, torso and legs. All shapes follow the animated skeleton.
- When a hitbox touches several body parts, the one it meets most squarely counts as the part hit.
- A hit applies damage, knockback (away from the attacker, along their facing) and a hit reaction.
- A blocked hit only nudges the defender.
- Health can't go below 0, and a dead fighter can't be hit again.

### Enemy health bars and damage numbers

Enemies within about 16 m show a solid red health bar above their head. It is a plain rectangle (no outline, gloss or background), left aligned: as health drops it gets shorter from the right. It is anchored to the head in the 3D world and follows the enemy, but it is always the same size on screen. Beyond the distance limit it simply isn't shown. It is also hidden behind cover, when the enemy is behind you, and when the enemy is dead.

- **Damage numbers:** when you land a hit, the real damage (`-10`, `-25`...) pops in beside the enemy's body, floats up toward the bar with a slight sideways drift, shrinks and fades, and is removed after about 0.9 s. Each hit gets its own number, started on a randomly chosen side, so quick combos don't stack. They are large and outlined: yellow for light attacks, red for heavy ones (a flying punch takes the colour of its light or heavy version), and bigger for heavy hits, flying hits and a killing blow (always red).
- **Blocked hits** show no number and don't touch the bar; a small `BLOCKED` tag appears under it.
- The bar reads each combatant's health every frame, so the UI is never the source of truth. Damage, hit detection and health are unchanged. The old floating label above the dummy is now shown only with `F4`.

The look is in [src/style.css](src/style.css) (`.enemy-hp`), the logic in [src/ui/WorldHealthBars.ts](src/ui/WorldHealthBars.ts) (distance limit `MAX_DISTANCE`, bar width `BAR_WIDTH`).

All attack numbers (damage, timing, knockback, reach, blockability) live in [src/combat/AttackDefinitions.ts](src/combat/AttackDefinitions.ts). Guard rules live in [src/combat/CombatConfig.ts](src/combat/CombatConfig.ts).

---

## The arena

A graybox **Free-For-All** arena, 40 m x 40 m with 4 m outer walls, built from basic Three.js geometry (no external assets). There are no teams: every fighter is an individual opponent. It is designed around one rule: **every strong position has a weakness**, so no spot, route or platform wins on its own. A top view is in [map-top-view.png](map-top-view.png).

### Layout

| Part | What it is | Its weakness |
| --- | --- | --- |
| Centre | Open floor around a 2 m monolith and a pinwheel of 0.8 m low walls. A place fights happen, not a hill to hold | Visible from far more of the arena than anywhere else |
| Corner columns | Four columns (2.2 m radius, 2.4 m tall, too tall to climb) fill the corners | (They remove the camping spots: no two-wall pockets, no endless run round the edge) |
| North walkway (2.0 m) | Long and narrow, a ramp at one end and stairs at the other | Exposed along its whole length; a hit can knock you off |
| East tower (2.6 m) | Small, with one long open staircase, or a jump up from the 1.3 m step beside it | Open on three sides; the staircase is a long exposed approach |
| West terrace (1.5 m) | A ramp, stairs and open drops; the lane behind it is open at both ends | Can be reached from every side |
| 2 m blocks | Stop punches and block the view; must be walked around | A flanker can use the open side |
| 0.8 m low walls | Can be hopped; a punch goes over them | Give no real cover |
| Pillars | Single sight-breakers | Easy to circle |

Only about 9% of the floor is high ground, and none of it is in the middle. Every high position has at least two ways up.

### Routes

Five routes cross the arena between the north-west and south-east lanes, and none is better at everything ([src/world/ArenaRoutes.ts](src/world/ArenaRoutes.ts), drawn in the debug view):

| Route | Length | Trade-off |
| --- | --- | --- |
| **A** Open lane (east side) | 60 m | Fast and wide open, so heavy punches are easy to land |
| **B** Covered route (west and south) | 66 m | Most hidden, but the longest ground route, which gives a chaser time to cut across |
| **C** Elevated route (walkway, then the step) | 78 m | Best view, but narrow and the most exposed |
| **D** Shortcut (straight across the middle) | 47 m | Shortest, but visible from everywhere and easy to intercept |
| **E** Central route (through the pinwheel's gaps) | 56 m | Direct, with cover to dodge behind, but the most contested ground |

### Movement on it

You can walk and sprint up ramps and stairs (steps up to 0.45 m are taken automatically), walk off edges and fall, and jump onto 0.8 m cover. Walls and solid scenery stop you and let you slide along them. Your body stays 0.5 m from scenery, so the camera and fists don't clip into it. Cover and walls also stop punches: a hit needs a clear line to the target, and fists stop at contact.

### Spawning

There are 11 predefined spawn points (S1 to S11) on open floor, clear of walls, obstacles and platform edges, and none within 8 m of the middle. Each round every fighter gets one **unique** point chosen at random (the list is shuffled each time), preferring points at least 10 m apart and relaxing that when the arena is full. Nothing about a fighter decides where it starts, and a new round avoids repeating the previous assignment. Spawns face a mix of directions, not all toward the centre, and two spawns that are close together cannot see each other, so the start is a search, not an instant fight.

The game currently has one player and the training dummy, so it spawns both. `F10` starts a new round. The dummy still respawns by itself 2.5 s after dying (training behaviour); in a real Last Man Standing round the dead would stay out until the next round.

### Ready for later (not implemented)

Three **resource sites** (R1 to R3) mark open, contestable ground for future pickups such as rock piles: each is visible from high ground, well away from every spawn, and never in a protected corner. The mix of open sightlines, 2 m cover and elevated positions is meant to suit future ranged attacks and throwables, but none exist yet.

The layout lives in [src/world/ArenaLayout.ts](src/world/ArenaLayout.ts) (one description used by the meshes, the collision and the spawn system), collision in [src/world/ArenaCollision.ts](src/world/ArenaCollision.ts) and spawn logic in [src/world/SpawnSystem.ts](src/world/SpawnSystem.ts). Press `F4` to see spawn points, resource sites, the five routes, collision boxes and platform heights.

---

## Training dummy

A character with **100 HP** stands on one of the arena's spawn points. It never attacks and has no AI. It takes damage and knockback, plays hit reactions, dies at 0 HP, and **respawns after 2.5 seconds** with full health at its spawn point. A label above it shows its HP and what its guard did with the last hit (for example `BLOCKED`, `BLOCK FAILED: REAR`, `GUARD REDUCED`). The dummy is solid, so you can't walk through it.

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
  combat/                 Combat system, attack definitions, guard rules, rock physics and projectiles, dummy, debug view
  rendering/Renderer.ts   Three.js renderer, scene and camera
  ui/                     Enemy health bars, damage numbers and the weapon wheel drawing
  inventory/              Per-player utilities (rocks, molotov, smoke), the weapon wheel's state and the rock stance
  vfx/                    Rock aim line and rocks in flight
  world/                  Arena layout, meshes, collision, spawn system, debug overlay
public/assets/            Character model and animation .glb files
tests/combat/             Automated combat tests (Vitest)
  tests/world/              Arena layout, collision, player-on-arena and spawn tests
```

Combat logic (`CombatSystem`) has no rendering or input code. It talks to fighters through the `Combatant` interface, which keeps it testable and reusable for networked play later.

---

## Tests

```bash
npm test
```

The suite (Vitest, a few seconds) covers the real combat code (attack definitions, directional blocking and guard rotation, light and heavy attacks against blocks, hit-once registration, attack timing, damage, health limits, death, respawn, knockback and the full hit pipeline) and the arena: layout, collision, ramps and stairs walked by the real `Player`, spawn assignment, and the map's design rules (no pockets, no corridor over 10 m, a broken outer ring, five distinct routes with trade-offs, small and open high ground, spawns that are spread out and hidden from each other). It deliberately doesn't test animations, camera or input, so those remain manual checks.

---

## Tech

Three.js 0.186, TypeScript 6, Vite 8, Vitest, ESLint and Prettier.

- **Font:** all text (HUD, damage numbers, weapon wheel, in-world labels) uses Bebas Neue, bundled with the game through `@fontsource/bebas-neue` (SIL Open Font License), so it needs no network. It has a single weight, and it is set in one place ([src/fonts.ts](src/fonts.ts) and the `--font-ui` variable in [src/style.css](src/style.css)).
