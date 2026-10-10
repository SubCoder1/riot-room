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

| Command                           | What it does                                |
| --------------------------------- | ------------------------------------------- |
| `npm run dev`                     | Start the dev server                        |
| `npm run build`                   | Type-check (`tsc`) and build for production |
| `npm run preview`                 | Serve the production build                  |
| `npm test`                        | Run the automated combat tests once         |
| `npm run test:watch`              | Re-run tests when files change              |
| `npm run lint` / `lint:fix`       | ESLint                                      |
| `npm run format` / `format:check` | Prettier                                    |

---

## Controls

| Input               | Action                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mouse               | Look around (also aims punches)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `W` `A` `S` `D`     | Move forward / left / back / right                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `Shift` + `W` / `S` | Sprint (run) forward / backward                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `Space`             | Jump                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `C` (hold)          | Crouch                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Mouse wheel         | Switch utility: opens the weapon wheel and equips the next / previous slot at once                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Left click          | Punch; with a Grenade, Molotov or Smoke equipped, throw it (quick throw, or aimed while right click is held)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `F` (hold)          | Block                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `E`                 | Grab the ladder you are looking at when you are within about 1.8 m: standing, running or in mid-air after a jump. `E` on a ladder lets go; `Space` jumps off. On a ladder: `W` / `S` climb, `Space` jumps off backward. No punching, guarding or throwing while on a ladder. A ladder that climbs through a roof stops under a shut amber **hatch**: press `E` anywhere on that ladder to open it (it never lets go while the hatch is shut; also from above); it then stays open until the next round (`F10`). The character climbs hand over hand with its feet on the rungs; the pose follows the height climbed, so it stops when you stop and runs backward going down. In third person the camera moves behind the climber |
| Right click (hold)  | Aim a throwable (only with a Grenade, Molotov or Smoke equipped)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `F3`                | Toggle first person / third person camera                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

### Weapon wheel

Scroll the **mouse wheel** at any time (standing, running, punching, blocking) and a small weapon wheel appears in the middle of the screen while the next (scroll down) or previous (scroll up) slot is **equipped in the same moment**. Keep scrolling to keep stepping. About 0.7 seconds after the last scroll the wheel fades away by itself and your choice stays. It never blocks anything: you can keep punching, blocking and moving while it is up. The wheel is a screen overlay, so it works the same in first and third person.

| Slot                  | Quantity                      | Note                                                           |
| --------------------- | ----------------------------- | -------------------------------------------------------------- |
| Grenade (top)         | starts at 3                   | explodes after a fuse; replaces the old Rocks                  |
| Molotov (upper right) | starts at 0 (1 in this build) | bursts into a fire zone                                        |
| Smoke (lower right)   | starts at 2                   | a smoke cloud that hides what is behind it                     |
| Fists (lower left)    | none                          | no utility: you use your fists (shown with a boxing glove)     |
| Empty (upper left)    | none                          | reserved for future equipment: equips nothing and does nothing |

- The five slots are spread evenly round the wheel (72 degrees apart). Scrolling steps GRENADE, MOLOTOV, SMOKE, FISTS, EMPTY and back to GRENADE one way, and the reverse the other way. A slot with none left can still be chosen; it simply shows ×0 and you keep your fists.
- **Fists are the fallback.** You use your fists when Fists is selected or when the selected utility has run out. You start on Fists. The punch, block and movement systems are untouched.
- **The Empty slot is a placeholder.** It can be selected (it is drawn dimmed), but it equips nothing, throws nothing and does not punch: your hands are empty until you pick another slot.
- The centre shows the selected slot's name and quantity and updates with every scroll. Quantities are read from the inventory, so they stay current when it changes, and each kind has its own count: throwing one never touches another, and switching slots never resets any of them.

Each player owns their own inventory and selection ([src/inventory/PlayerUtilities.ts](src/inventory/PlayerUtilities.ts)); there is no shared inventory. A pickup will simply call `add("GRENADE", 1)`, and the wheel will show the new quantity. A new utility is one more entry in `UTILITY_SLOTS` there (name, icon, starting quantity, position on the wheel), or fills the Empty slot. The scroll behaviour is in [src/inventory/WeaponWheel.ts](src/inventory/WeaponWheel.ts) and the drawing in [src/ui/WeaponWheelView.ts](src/ui/WeaponWheelView.ts).

### Developer keys

| Key   | Action                                                                                                                                                                 |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `F4`  | Show / hide the debug view: combat shapes and guard cone, plus the map's spawn points (S1-S8), ladder start and end spots, collision boxes, boundary and floor heights |
| `F6`  | Dummy holds / drops its guard                                                                                                                                          |
| `F7`  | Dummy turns to face you (off by default, so you can test side and rear hits)                                                                                           |
| `F8`  | Dummy crouches (a crouched guard also covers the legs)                                                                                                                 |
| `F9`  | Dummy looks up (its guard aims up too)                                                                                                                                 |
| `F10` | Start a new round: the player and the dummy are given new random spawn points                                                                                          |

---

## Player abilities and movement

### Movement

| Move              | How                                 | Notes                                                                                                                                                       |
| ----------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Walk              | `W` / `A` / `S` / `D`               | Walk, backward walk and strafe animations                                                                                                                   |
| Run               | `Shift` + `W` (or `S` for backward) | Fastest movement; also what powers heavy attacks                                                                                                            |
| Strafe            | `A` / `D` alone                     | Side-step animation. Holding `Shift` while strafing is a faster strafe                                                                                      |
| Diagonal run      | `W` + `A` / `D`                     | The body turns about 45° toward the direction of travel while the head keeps pointing at the crosshair, so it reads as running rather than gliding sideways |
| Jump              | `Space`                             | A moderate jump height, so it doesn't clear an opponent's head                                                                                              |
| Crouch            | Hold `C`                            | Deep crouch. Slower movement, with crouch walk, backward and strafe animations. No crouch sprint                                                            |
| Stand from crouch | `Space` while crouched              | Stands you up (no jump) until `C` is released                                                                                                               |

Approximate speeds (metres per second): run 6.0, sprint 8.0, crouch 2.2. Strafing alone is 75% of those. Movement is slowed while punching.

### Camera

- **First person** (`F3` to switch): the camera sits at the character's head, so you see your own arms. Looking up and down is limited so the camera doesn't clip into the body.
- **Third person**: the full character is visible. The head and upper body track where you look, and punches follow the crosshair.

---

## Combat

### Punches

Punches are aimed at the crosshair. Looking down lets you hit crouched opponents, and looking up lets you punch upward.

| Attack                  | Trigger                                                          | Damage | Blockable |
| ----------------------- | ---------------------------------------------------------------- | ------ | --------- |
| **Light punch**         | Left click (spam for an alternating right / left combo)          | 10     | Yes       |
| **Heavy running punch** | Left click while sprinting forward, after a short build-up       | 25     | No        |
| **Flying light punch**  | Left click in the air after a walking / strafing jump            | 15     | Yes       |
| **Flying heavy punch**  | Left click in the air after a sprint-jump with a built-up sprint | 30     | No        |

How they behave:

- **Combo:** spamming left click alternates right and left punches. The combo resets when you stop.
- **Heavy running punch:** needs about 0.6 s of sprinting forward first. It always plays out fully, so extra clicks during it are ignored. Afterwards you keep running if you hold `Shift`, or drop into the light combo if you keep spamming.
- **Flying punches:** only the first click in the air counts. After landing, a heavier landing animation plays for the heavy version. Spamming afterwards continues with the normal combo.
- Punches can't be thrown while crouched or while holding a block.
- Each attack has startup, active and recovery phases. Only the active phase can hit, and one attack can hit a given target only once.

### Blocking

Hold **F** to guard. It works while idle, walking, strafing (including with `Shift`) and crouched. Sprinting (`Shift` + `W` / `S`) takes priority over blocking, and you can't block in the air.

Blocking is **directional and positional**, not a shield on all sides:

- **Direction:** only attacks from within the guard cone in front of you are blocked (configured in `COMBAT_CONFIG.blockAngleDegrees`, currently 90°). Hits from the side or from behind land normally.
- **Height:** the guard covers the body parts your pose actually protects.
  - Standing, looking level: torso only (head and legs are open)
  - Crouched, looking level: torso and legs
  - Looking up (raised guard): head and torso (legs and groin open, even when crouched)
- **Vertical aim:** the guard points where you look, so an attack from above (a jump attack) is only blocked if you are looking up toward it.
- **Light attacks** that meet all of the above are fully blocked (0 damage).
- **Heavy attacks cannot be blocked.** If the guard is correctly placed (right direction, height and part), the hit is reduced to 50%. Otherwise the full damage lands.

### Throwables (grenade, Molotov, smoke grenade)

All three share one throwing framework: the same stance, aim line, throw and flight ([src/inventory/ThrowStance.ts](src/inventory/ThrowStance.ts), [src/combat/ThrowableFlight.ts](src/combat/ThrowableFlight.ts), [src/combat/Projectiles.ts](src/combat/Projectiles.ts)). The Rocks weapon is gone.

- **Equip:** pick it on the weapon wheel and the hand goes to the hip pocket and comes back up with it (a short equip). It is a real 3D object in the hand, in first and third person.
- **Quick throw:** a plain **left click** throws straight along the crosshair, no aiming needed (the crosshair stays visible). After every throw, if you have more, the hand reaches into the pocket for the next one.
- **Aim:** hold **right click**. The crosshair gives way to a sharp dashed line showing where it will go, with a ring where it first meets scenery or the floor (the landing indicator). It is local only: nobody else sees it.
- **Throw:** press **left click while still holding right click**. The arm winds back and snaps forward, and the item leaves the posed hand at the release (never from the camera or the feet). That click never also punches.
- **Guard:** blocking is on **F** (right click is only for aiming), and is off while aiming or throwing.
- **No ammo:** the count on the wheel goes down by one per throw, can't go below zero, and at 0 you fall back to Fists and can't aim or throw.
- **Switching away:** the hand goes to the pocket, the item disappears, then you are back to normal. A throw already started finishes first.
- **States:** `NORMAL`, `THROW_EQUIPPING`, `THROW_EQUIPPED`, `THROW_AIMING`, `THROW_THROWING`, `THROW_UNEQUIPPING`.

**One physics for the preview and the real throw.** The aim line and the thrown item both step the same function with the same fixed time step, so the item follows the line (a test checks they agree point for point). Each kind has its own flight profile (speed, gravity, range, radius) in its own config file, on top of the shared values in [src/combat/ThrowConfig.ts](src/combat/ThrowConfig.ts) (step, how many at once, bounce, roll).

**Bouncing and rolling** (grenade and smoke grenade): they hit walls, railings, roofs and the floor, bounce off with part of their speed, and a soft landing on something level turns into a roll that slows down (`THROW_ROLL_DRAG`) until it comes to rest. They glance off bodies and fall; they hurt nobody by hitting. They wait out their fuse wherever they lie. A Molotov instead breaks on the first thing it meets.

### Normal grenade

Starts with `GRENADE_START_QUANTITY` (3). All tuning is in [src/combat/GrenadeConfig.ts](src/combat/GrenadeConfig.ts):

| Setting                          | Value                                                                         |
| -------------------------------- | ----------------------------------------------------------------------------- |
| `GRENADE_FUSE`                   | 2.5 s from the throw to the explosion                                         |
| `GRENADE_BLAST_RADIUS`           | 6.5 m: the one radius for the explosion you see and the area that hurts       |
| `GRENADE_MAX_DAMAGE`             | 65 at the centre                                                              |
| `GRENADE_EDGE_DAMAGE_SHARE`      | 10% of that left at the very edge; `GRENADE_FALLOFF_EXPONENT` shapes the drop |
| `GRENADE_KNOCKBACK` / `HITSTUN`  | 2.2 m push and 0.6 s stagger at the centre, scaled by the same falloff        |
| `GRENADE_GUARD_MULTIPLIER`       | 0.5: a raised guard halves the damage, never to zero                          |
| `GRENADE_SELF_DAMAGE_MULTIPLIER` | 0: the thrower is not hurt by their own grenade (raise it to allow that)      |

- **Look and pin:** an olive egg with a yellow band, a dark fuse, steel collar and spoon and a pin ring, drawn larger than before. Its pin stays in while you equip and aim; the pin is pulled only when you click to throw, as a quick (`grenadePin`, 0.2 s) pull with the other hand before the throw itself.
- **Walls:** grenades and smoke grenades bounce off walls, railings, roofs and the tall outer wall (which is not a collision solid, so flights check it separately in `perimeterClearFraction`). Standing against a wall, the throw leaves from the last clear point between your eye and your hand, never from behind the wall.
- **Detonation:** when the fuse runs out the grenade is removed first and then goes off, so it can never explode twice. The explosion is a white-hot flash and core, a layered fireball that cools from yellow to red, sparks that fall back under gravity, a shock ring and a skirt of dust along the floor, rising dark smoke and a scorch mark that fades after a few seconds. The grenade itself no longer pulses before it goes off.
- **Cover works:** the blast only hurts through the body parts it has a clear line to (the same world check the flight uses). A wall between the grenade and a fighter stops all of it. Each fighter is hurt at most once per explosion.
- **Damage** goes through the normal health bar, damage numbers, hit reaction and knockback, as a `grenade-blast` source ([src/combat/Explosions.ts](src/combat/Explosions.ts)).

### Smoke grenade

Starts with `SMOKE_START_QUANTITY` (2). All tuning is in [src/combat/SmokeConfig.ts](src/combat/SmokeConfig.ts):

| Setting                                                    | Value                                                              |
| ---------------------------------------------------------- | ------------------------------------------------------------------ |
| `SMOKE_FUSE`                                               | 1.2 s from the throw until it starts to emit (with a bright flash) |
| `SMOKE_START_RADIUS` / `SMOKE_MAX_RADIUS`                  | 0.8 m growing to 5 m                                               |
| `SMOKE_EXPAND_TIME` / `SMOKE_DURATION` / `SMOKE_FADE_TIME` | 1.8 s to grow, 14 s at full size, 5 s thinning away                |
| `SMOKE_PARTICLE_COUNT` / `SMOKE_OPACITY`                   | 90 puffs per cloud, each up to 68% opaque                          |
| `SMOKE_EXTINCTION` / `SMOKE_SIGHT_THRESHOLD`               | how fast smoke swallows sight, and when a look counts as blind     |
| `SMOKE_MAX_CLOUDS`                                         | 4 at once (the oldest disperses first)                             |

- **What it is:** a cloud of soft, slowly turning puffs (sprites sharing one generated texture, so a cloud is cheap) that swells out, holds and thins away. From inside, the screen tints grey in proportion to how deep you are; puffs close to the lens fade so nothing fills the view with one flat disc.
- **What it does:** it hides things. Looking through it, sight falls off exponentially with the smoke along the line ([src/combat/Smoke.ts](src/combat/Smoke.ts)); across the middle of a cloud you see almost nothing. Enemy health bars hide behind it like behind cover.
- **What it does not do:** damage anyone, block movement, punches or guards, or make anyone invulnerable. Melee, movement, collision and health all work inside smoke.
- **Awareness:** [src/combat/Awareness.ts](src/combat/Awareness.ts) has the one sight rule (`canPerceive`: nothing solid in the way and no thick smoke) and `SightMemory`, which keeps where a target was last seen, so an enemy that loses someone in smoke searches the place he vanished instead of tracking him through the cloud. There is no enemy AI in the game yet (only a training dummy), so today only the health bars use it.

### Multiplayer readiness

Nothing is networked yet (the game has no multiplayer), so only the local throw is wired up. The design is ready for it: the thrower only reports "I threw from here, this way". Where it goes, bounces, goes off and who is hurt are decided in `ProjectileSystem`, `ExplosionSystem` and `SmokeSystem`, which only use the `Combatant` interface and have no rendering or input code, so a server can run them. The combat event bus carries `explosion`, `smoke-started`, `smoke-ended`, `fire-started` and `fire-ended` events with positions for clients to draw. What is still to do when multiplayer exists: send throws to the server, validate the inventory there, replicate projectile positions or the throw (origin, direction, tick) so clients simulate the same bounces, and send the smoke and explosion events. Inventory counts are currently local to the client.

### Molotov

Pick **Molotov** on the weapon wheel. You start with none (×0), so it can't be equipped until you have one: a pickup is just `utilities.add("MOLOTOV", 1)`. It uses the shared throwing stance, aim line and throw, so the controls are the same: the hand goes to the pocket, the bottle comes up to be lit (a small flame appears), and it is ready. **Hold right click** to aim (the dashed line shows where it lands), then **left click** to throw it. A plain left click is a quick throw. The bottle is spent when it leaves the hand, never when you start aiming; at ×0 you drop back to Fists. Switching away puts it back in the pocket without a flame.

It flies like the other throwables (straight for a few metres, then an arc, `MOLOTOV_PROFILE`) and breaks on the first thing it meets: the floor, a platform, a wall or a body. On a wall the fire drops to the surface below, so it never floats in mid-air.

**The fire** is an area-denial zone, not an explosion:

|               | Value (all in [src/combat/MolotovConfig.ts](src/combat/MolotovConfig.ts))                                                                                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Radius        | Spreads from 0.5 m to `MOLOTOV_MAX_RADIUS` (3 m) over `MOLOTOV_SPREAD_TIME` (0.8 s)                                                                                                                                             |
| Duration      | `MOLOTOV_DURATION` (7 s) at full size, counted from when it has fully spread                                                                                                                                                    |
| Ending        | It shrinks and fades over `MOLOTOV_FIRE_FADE_TIME` (0.8 s), then is removed                                                                                                                                                     |
| Damage        | A tick every `MOLOTOV_TICK_INTERVAL` (0.5 s) for `MOLOTOV_DAMAGE_PER_TICK` (7), growing up to `MOLOTOV_MAX_RAMP` (1.8x) after `MOLOTOV_RAMP_SECONDS` (3 s) of continuous burning, never above `MOLOTOV_MAX_OVERLAP_DAMAGE` (14) |
| Fires at once | At most `MOLOTOV_MAX_ZONES` (8); the oldest goes out first                                                                                                                                                                      |

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

## The map (stage one: the upper floor and the roofs)

A graybox, enclosed, multi-level industrial complex, 64 m x 48 m with 13.5 m outer walls, built from basic Three.js geometry. A dense ring of rooms, corridors, walkways, balconies and covered yards surrounds a central open arena that every side looks down into. The **upper floor** is 4 m up, and above it are three **roof layers** that can be walked on. The ground level is deliberately unfinished: the central arena is bare floor, and the structure under the upper floor is solid for now. There are no hidden or special-role parts; this is the map every fighter sees. (North is up, west is left.) Pictures: [top view](docs/map-top-view.png), [roof layers](docs/map-roof-view.png), and [3D views](docs/map-3d-arena-view.png).

| Part              | What it is                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rooms (12)        | Each with its own graybox props: **Control room** (raised console dais and monitor banks, taller roof), **Archive** (shelf aisles), **Switch room** (switchgear), **Cargo office** (crate lanes, high roof), **Server room** (rack rows with 1.5 m lanes), **Break room**, **Warehouse** (crate stacks with 2 m lanes, high roof), **Workshop** (benches and machines), **Store** (shelving), **Hall** (columns and a podium), **Barracks** (bunks and a locker wall), **Armory** (racks and a cage). Doorways are 2 m. Rooms join each other through shared doors (Archive - Switch room, Server room - Cargo office, Break room - Warehouse, Workshop - Warehouse, Hall - Armory, Hall - Store)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Walkways          | Four widths: wide east (4 m), medium north and south (3 m), a narrower west end (2.2 m) and a 1.5 m service corridor in the north-west. The ring is broken at the south-west corner: the west and south walkways only meet through rooms (the Hall), so there is no endless loop on the walkways alone                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Yards and decks   | Loading dock and south plaza (covered yards with skylight gaps), east deck and west terrace (open courts), and a roofed north alcove                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Balconies (4)     | **North overlook** (12 m wide, 4.5 m out, with cover), **south balcony** (lower, 2.8 m, narrow), **east corner balcony** (joins the east and south walkways) and **north-west balcony** (raised 5.2 m, long and narrow). They all hang in the air, so the ground under them stays open. A **maintenance platform** (2.8 m) hangs under the north edge                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Stairs (2)        | **South-west** (bottom-left): 4 m wide, 16 steps of 25 cm, starts at the south end of the arena's west side and climbs north to a landing on the west walkway, so it serves the west and north sides. **North-east** (top-right): 5 m wide, 20 steps of 20 cm, starts at the north end of the east side and climbs south to a landing on the east walkway, so it serves the east and south sides. Either one alone reaches every room                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Ladders (7)       | **One on the arena's north face** (up to the north walkway; the other ways up are the two staircases), **three to the roofs** (the Server room roof from the east walkway, the Workshop roof from the south walkway, and from there the Warehouse's high roof), and **two secret ones** (magenta) in nooks: behind the alcove's wall under a roof hatch you open with `E`, and on the west terrace behind a screen wall. A third, on the maintenance platform, is only less obvious. The Barracks roof and the service corridor's roof have no way up by foot (they are for the grapple). Anyone can use them. Press `E` to climb                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Ledges (14)       | Six solid ones (1.2 m ledges you can jump onto on the east deck, west terrace, south plaza and loading dock, a 2.4 m one beside a 1.2 m one, and a 0.75 m housing on the dock roof) and eight that mark an edge you climb: the south balcony and the maintenance platform up to the walkway, the north-west balcony up from the floor, and roof-to-roof steps. They are tan                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Open sky          | There is no main roof: the arena is open to the sky inside a perimeter wall 13.2 m high (it never looks jumpable). The **Control room**, the **Hall** and the **Cargo office** have no ceiling of their own (open top) for entry from above; the other rooms keep their roofs, which are the lower levels                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Roofs (3 layers)  | **Low 8.1 m** over most rooms and the alcove, **medium 9.3 m** over the Control room and the two covered yards, **high 10.8 m** over the Cargo office and the Warehouse. Each is a jump or a short climb above the last, every roof can be reached from another, and a steel **catwalk** joins the Server room's roof to the Break room's across the east court                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Rooftop machinery | Water tanks, ventilation units, service huts, skylight housings, a duct run, and raised roof walls (1.9 m) and parapets (1 m) along roof edges. Each one is a landmark, cover, or breaks a long sightline: from any roof, a good share of the other roofs is hidden, and a roof looks out through gaps in its walls                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Hang points (9)   | Nine places for the vigilante to observe and strike from: four **observation ledges**, each a long steel rail (a 6 m I-beam with a 50 cm top plate, 7 cm thick) running out of the side of a tall narrow steel pillar near its top, on one bracket, round the middle of the arena and each at its own height: north-west 6.8 m (low), east 8.5 m (mid), west 10.5 m (high) and south 14.6 m (highest, 3.8 m above the highest roof); four **light posts** against the perimeter wall (arm at 13 m): a tall steel pole on the floor with a slim arm out of its top, a knee brace and a lamp hood at the tip, two on the east wall, one in the middle of the west wall and one on the north wall; and the south plaza's skylight beam (mid-south). No ladders or rails: they are for a grapple. Recorded as data (`hangZones`); hanging, grappling and gliding are not implemented yet                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Vents             | A ventilation system under the arena floor, grated over along its whole path: narrow metal grating (3 cm bars, 9 cm gaps, in framed blocks of at most 1.2 m, each hinged and swinging open on its own) lies flush in the floor over a T-shaped route of tunnels 1.8 m wide and 1.3 m high (so they can only be crawled crouched): a long one at z = -8.7 from x = -13.2 to 13.2 and a branch south at each end. **Only the vigilante** can use it: stand anywhere on the grating and press `E` (prompt: Enter vent) to hop in (0.28 s: one hand pushes the block open and the body ducks through), crawl with `W A S D` (always crouched), and press `E` anywhere along the path to climb out (both hands push up through the opening), so the way out is never the way in unless you want it to be. The floor stays solid for everyone, a thug is refused whatever it does (`Player.role`), and nobody can punch inside. In first person the hands draw in when a tunnel wall is close. Helpers in `src/world/Vents.ts`; the layout is `layout.vents`. **Upper-floor vents** (`layout.upperVents`, a single narrow 1.2 m block wide, in the 4 m floor, crouch only, entered and left the same way, vigilante only): a straight tunnel from inside the Store north through its door onto the south walkway, and an L from the north walkway west along it to the Archive's south door, then north through the door into the Archive (the walkway leg runs along the arena edge of the north walkway) |

Railings are drawn 1.1 m high and you can shoot over them, but they stop a body like a wall: nobody walks, runs or jumps over one, and nobody can stand on top of one (nor on any wall or post). The way off an edge is a gap in the railing, a stair or a ladder. A body needs 1.8 m of headroom, so props are at most 2 m tall, and anything solid is either touching its neighbour or at least 1.4 m away from it, so nobody can be wedged in a gap.

The sides have their own character: the **west** is service and maintenance (a 1.5 m corridor, tight rooms, a screened secret ladder on the terrace), the **north** is operations (the Control room, the widest walkway and the big overlook, with the arena's one public ladder), the **east** is loading and machinery (the Cargo office, Warehouse, a generator on the east deck, the catwalk and the high roofs) and the **south** is workshop and storage (the Workshop, Store and plaza, the Workshop's roof ladder, and mixed-width walkways).

### Wear, damage and building material

A light pass of dirt and repair work on the outside of the finished map (nothing was moved or resized). **The insides of the rooms are not dressed here:** no piles, stains or marks are put inside a room, and the room dressing is a separate pass.

- **Surfaces** ([src/world/materials/](src/world/materials/)): the concrete floor has soft stains, worn patches, scuffs and a few oil spots; painted walls have water runs, damp patches and chipped paint; brick has chipped corners, the odd missing brick and dirtier mortar; steel, railings, catwalks and machinery share one scratch-and-rust texture. The textures are big tiles (floor 8 m, brick 4 m, painted walls 7.5 m, metal 6 m) with the same grain as before, so far more of the detail is different from place to place, and a slow patchy variation in world space is laid over them so no tile shows. Walls are grimier low down.
- **Floor marks** ([src/world/Weathering.ts](src/world/Weathering.ts)): worn dirt just outside doorways, oil under the generator on the east deck and dust round each pile. Flat, soft, drawn only, never over a vent grating and never inside a room.
- **Broken walls** (`breakSolid` in [MapParts.ts](src/world/MapParts.ts)): the Barracks' south wall has a corner down, the Archive's south partition and the Hall's north wall have uneven tops, the west-terrace screen wall has collapsed in the middle and the warehouse parapet is chipped. A broken wall is cut into slices that are never lower than 1.7 m (0.5 m for the 1 m parapet and the cover blocks), so it is still too high to vault and nothing opens through it; the collision is the slices.
- **Cover:** two of the three cover blocks on the overlook and corner balcony have a corner gone; the third is whole.
- **Piles of building material** ([PileShapes.ts](src/world/PileShapes.ts), [PileMeshes.ts](src/world/PileMeshes.ts)): bricks at the foot of two broken walls and one on the south plaza, where a plain crate stood. Cement bags, rubble, boards and a brick barricade are built and tested too (deterministic from an id, merged into four meshes for the whole map) and are ready for the room dressing. A pile's collision is a set of hidden boxes that enclose its pieces, so what you see is what stops you.
- **Concrete variety:** floors and walls each use three different texture sets (different seeds, tile sizes of 5 to 9 m, and amounts of staining, hairline cracks and damp), spread by id so neighbouring surfaces never show the same marks. Railings and low barriers are concrete too, in three looks of their own ([BarrierMaterial.ts](src/world/materials/BarrierMaterial.ts)).
- **Exterior barriers:** most railings stay concrete. Three are re-dressed as stacks of steel pipes (end to end with small gaps, the odd pipe missing, upright posts at the ends) and three as brick with gaps and a ragged top (`restyleBarrier` in [MapParts.ts](src/world/MapParts.ts)). They keep their footprint and body-blocking height (a railing still cannot be vaulted); where bricks are missing the drawn height is lower, so shots, grenades and sight follow the real gap. Beside them: a stack of pipes by the east-deck generator and two scatters of rubble that you simply walk over (low mounds under 0.3 m, each its own shape, each mound with a collision box exactly as high as its chunks). Nothing was added inside a room.
- The arena floor stays bare: nothing was added to the ground level, the central area, the stairs' feet, the doorways, the ladders or the vent routes (tests check this).

### Movement on it

You can walk and sprint up stairs (steps up to 0.45 m are taken automatically), walk off edges and fall, jump onto 1.2 m ledges, climb ladders (`E`), vault railings and boxes (hold `W`, or `A` or `D` for a sideways vault, and press `Space` at one: a one-handed vault, the body rolling over the planted hand), walk across roofs and the catwalk, and walk on the ground right under a balcony. Walls and solid scenery stop you and let you slide along them, and so do ladders: each has a slim solid body against its face, so nobody walks through the rails. Thin walls, railings and posts are solid at any height (a body cannot wade into even a low one), and crashing into a wall in mid-air stops the jump's run; only the slide along the wall is left. Your body stays 0.5 m from scenery, so the camera and fists don't clip into it. Walls also stop punches: a hit needs a clear line to the target, and fists stop at contact.

Collision is a height field over (x, z) in which every solid has an underside: most things are columns from the ground up, while balconies, roofs, catwalks and rooftop machinery start higher, so you can pass underneath them. Room roofs are real surfaces: you can stand on them, and a roof overhead does not block the room below. Thrown grenades and Molotovs stop at roofs and walls like anything else.

### Spawning

There are 8 predefined spawn points (S1 to S8) on bare ground in the central arena, at least 7 m apart, none in a corner and none under a balcony. Each round every fighter gets one **unique** point chosen at random (the list is shuffled each time), preferring points at least 10 m apart and relaxing that when the arena is full. A new round avoids repeating the previous assignment. S1 and S6 face the foot of the two staircases.

The game currently has one player and the training dummy, so it spawns both. `F10` starts a new round. The dummy still respawns by itself 2.5 s after dying (training behaviour); in a real Last Man Standing round the dead would stay out until the next round.

### Where it lives

The map is built from named parts ([src/world/MapParts.ts](src/world/MapParts.ts): floor sections, rooms, corridors, balconies, walkways, decks, staircases, ladders, railings, ledges, roof sections, catwalks, columns, industrial props, tanks, overhead beams and hang zones) and placed in [src/world/UpperFloorMap.ts](src/world/UpperFloorMap.ts), which gives one plain description ([src/world/ArenaLayout.ts](src/world/ArenaLayout.ts), with the heights as named constants) used by the meshes, the collision ([src/world/ArenaCollision.ts](src/world/ArenaCollision.ts)) and the spawn system ([src/world/SpawnSystem.ts](src/world/SpawnSystem.ts)). The ground level will replace the bare floor in the next stage. Press `F4` to see spawn points, the ladder start and end spots, collision boxes and floor heights.

---

## Training dummy

A character with **100 HP** stands on one of the arena's spawn points. It never attacks and has no AI. It takes damage and knockback, plays hit reactions, dies at 0 HP, and **respawns after 2.5 seconds** with full health at its spawn point. A label above it shows its HP and what its guard did with the last hit (for example `BLOCKED`, `BLOCK FAILED: REAR`, `GUARD REDUCED`). The dummy is solid, so you can't walk through it.

Use `F6` to `F9` to put it into different guard states and `F4` to see the shapes.

### Hiding or removing the training dummy

There is no in-game key to hide the dummy, so it has to be done in code. In [src/game/Game.ts](src/game/Game.ts):

**Fully remove it (not visible, not hittable, not solid)** by commenting out these four lines:

```ts
this.combat.register(this.dummy); // in the constructor: stops it being hit
this.renderer.scene.add(this.dummy.root); // in the constructor: stops it being drawn
void this.dummy.load(); // in the constructor: skips loading its model
this.resolveDummyCollision(); // in animate(): removes its invisible collision
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
  combat/                 Combat system, attack definitions, guard rules, throwable flight, projectiles, explosions, smoke and awareness, fire zones, dummy, debug view
  rendering/Renderer.ts   Three.js renderer, scene and camera
  ui/                     Enemy health bars, damage numbers and the weapon wheel drawing
  inventory/              Per-player utilities (grenade, molotov, smoke, fists, reserved), the weapon wheel's state and the throw stance
  vfx/                    Throw aim line, thrown items in flight, explosions, smoke clouds and the fire view
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
