# Office Roguelike — Game Design Specification

Oct 5, 2026 · @Kallum Booth

## Summary and status

A top-down 2D action roguelike for PC and Android, rated 18+. Mandatory HR training indoctrinates an entire office into a grotesque corporate cult. The player objects in a meeting, the floor turns on them, and they rage their way up a 20-floor tower to the CEO in the penthouse.

**Working title:** TBC. Candidates are *Accept All*, *Culture Fit* and *Hostile Takeover*. Each needs a Steam, Google Play and trademark check before adoption.

**Hook:** every cleared floor offers a choice of exits (stairs, lift or corridor), each with a previewed reward. Route choice is the core strategic layer, and Rage is the core combat identity.

| Section | Status |
| --- | --- |
| 1. Pillars, premise and tone | Locked v1.0 |
| 2. Core combat and controls | Locked v1.0 |
| 3. Run structure and floor transitions | Locked v1.0 |
| 4. Procedural generation | Locked v1.0 |
| 5. Enemies, generation and Promotion | Locked v1.0 (Promotion: legal gate) |
| 6. Bosses | Locked v1.0 |
| 7. Player progression (in-run and meta) | Locked v1.0 |
| 8. Economy | Locked v1.0 |
| 9. UI/UX, art direction, audio | Locked v1.0 |
| 10. Technical (engine, platforms, saves) | Locked v1.0 |
| 11. Production plan, team and budget | Locked v1.0 (funding open) |

## 1. Pillars, premise and tone

The game is corporate satire escalating into surreal body horror, with stylised gore and an 18+ content scope.

### 1.1 Premise

The CEO orders mandatory HR training: the Culture Realignment Programme (working name). Every employee completes it and comes out indoctrinated into an exaggerated corporate mindset. In a meeting, the player speaks out against the new HR policy. The entire floor turns violent, and the player snaps.

Three framing rules keep this satire rather than a workplace-violence simulator:

1. **Employees attack first.** The opening sequence establishes the player as the target, so the rage is retaliation.
2. **The indoctrination is visibly unreal.** Enemies have glowing lanyards, chant company values in unison, and wear fixed "HR smiles". They read as cultists, not colleagues.
3. **Absurdity escalates by act.** Each act pushes the stereotypes further, until Senior Leadership is a full corporate cult, so the game reads as satire, never realism.

### 1.2 Design pillars

Every feature must serve at least one pillar, or it is cut.

1. **Fast, brutal, readable combat.** Deaths are the player's fault. Gore never obscures telegraphs or hitboxes.
2. **Every floor is a decision.** Route choice, upgrades and risk matter. There is no autopilot.
3. **The office is a weapon.** Environmental kills are core: glass partitions, printers, water coolers, swivel chairs.
4. **Satire with teeth.** Humour comes from the system (jargon, KPIs, mandatory fun), not from punching at individuals.

### 1.3 Tone and violence guide

| Element | Direction |
| --- | --- |
| Humour | Deadpan corporate (memos, emails, loading-screen tips) mixed with escalating surrealism and dark comedy |
| Gore | Stylised pixel gore: dismemberment, persistent blood decals, per-enemy death animations. Benchmark is Hotline Miami, not photorealism |
| Escalation | Satirical escalation. Act 1: junior staff, mild indoctrination. Act 2: synchronised chanting and motivational fervour. Act 3: cult-like policy enforcement and rituals. Act 4: senior leadership as a full corporate cult (ceremonial lanyards, a boardroom like a temple of company values). Enemies always stay recognisable corporate stereotypes, never grotesque |
| Gore toggle | Required: Full, Reduced or Off |

### 1.4 Content scope (18+)

- Gore and violence, stylised, with the toggle
- Profanity and dark humour
- Alcohol and drugs as flavour only. **No gameplay benefit from drug use**, because of Australian classification precedent
- Crude, non-explicit sexual innuendo. **No explicit sexual content**, which Google Play prohibits

### 1.5 Ratings and compliance

- **Expected ratings:** PEGI 18; ESRB M. Google Play uses the IARC questionnaire, and Steam uses its content survey plus a mature-content flag.
- **Germany (USK):** no real-world extremist symbols.
- **Australia:** consumables give buffs only if they are caffeine or fictional items. Real drugs must never grant rewards.

### 1.6 Platforms and controls

- **Platforms:** PC via Steam (primary) and Android (port), with a Steam Deck Verified target.
- **Controls:** full controller support on both platforms. Keyboard and mouse on PC. Touch twin-stick on Android.

* **Online:** a daily seeded run with platform-native leaderboards (see 4.6). Everything else is offline.

### 1.7 Out of scope for v1

Multiplayer and co-op; unified cross-platform leaderboards (separate PC and Android boards at launch; see 4.6); a narrative-heavy story mode; iOS; console ports.

## 2. Core combat and controls

Combat is a hybrid: melee is the primary attack, ranged or thrown items are secondary, and a Rage ability gives the game its signature. Health is HP plus a regenerating shield. Weapons are improvised office items that break.

### 2.1 Core verbs

| Verb | Behaviour |
| --- | --- |
| Move | 8-directional; analogue on sticks |
| Melee (light/heavy) | Depends on the weapon; combo string of up to 3 hits |
| Ranged / throw | Fire the ranged weapon or throw the held item |
| Grab | Seize an enemy who is staggered or below 25% HP, then throw them, use them as a projectile, breach a wall with them, or execute them against a hazard (see 4.7) |
| Dash | Short invulnerability frames; passes through enemies; charge-based cooldown |
| Rage | Activated when the meter is full |
| Interact | Pick up items, trigger environmental kills, choose exits |

### 2.2 Rage system

- **Fills from:** damage taken, kills, and hearing HR jargon. Enemies bark corporate phrases, which literally winds the player up.
- **Effect:** time-limited berserk mode with increased damage, damage resistance and unique execution animations.
- **Constraint:** Rage cannot be stockpiled between floors and decays outside combat. This prevents a "wait for Rage, win" strategy.
- **Build axis:** upgrades in Section 7 modify Rage's duration, add effects on activation, and add healing on kill.

### 2.3 Health

- **HP:** restored only by healing items, stair landings and shops.
- **Wellbeing shield:** regenerates after a short period without taking damage, and absorbs damage before HP. (The name is a deliberate HR joke.)

### 2.4 Weapons

| Class | Examples | Notes |
| --- | --- | --- |
| Blunt | Keyboard, fire extinguisher, laptop | Stagger and knockback |
| Sharp | Guillotine blade, letter opener, broken glass | Bleed and dismemberment |
| Ranged | Stapler, nail gun | Limited ammunition |
| Throwable | Mug, monitor, potted plant | One-shot, high stagger |

- **Durability:** every weapon breaks after N hits (N set per weapon). This forces constant scavenging, which serves pillar 3.
- **Loadout:** one melee slot, one ranged slot, and one thrown item carried.

### 2.5 Control mapping

| Action | Controller | Keyboard and mouse | Touch |
| --- | --- | --- | --- |
| Move | Left stick | WASD | Left virtual stick |
| Aim | Right stick | Mouse | Right virtual stick, with aim assist |
| Melee | X / Square | Left mouse button | Button |
| Ranged / throw | RT / R2 | Right mouse button | Right stick hold and release |
| Grab | B / Circle | F | Contextual button (shown when a grabbable enemy is in range) |
| Dash | A / Cross | Space | Button |
| Rage | LB + RB | R | Button (pulses when ready) |
| Interact | Y / Triangle | E | Contextual pop-up button |

### 2.6 Accessibility (minimum)

- Full input remapping
- Adjustable aim-assist strength (mandatory on touch)
- Screen-shake toggle
- Colourblind-safe telegraph palette
- Hold-to-tap alternatives
- Gore toggle (see 1.3)

## 3. Run structure and floor transitions

A run is 20 floors: 4 acts of 5 floors each, with 4 floors of combat or events followed by a boss. Every cleared floor offers 2–3 exits with previewed rewards.

### 3.1 Building layout

| Act | Floors | Department pool | Escalation | Boss (placeholder; see Section 6) |
| --- | --- | --- | --- | --- |
| 1. Ground | 1–5 | Reception, Post Room, Facilities, IT Helpdesk | Mundane; freshly trained staff | Facilities Manager |
| 2. Operations | 6–10 | Sales, Marketing, Customer Service | Uncanny; synchronised behaviour, chanting | Head of Sales |
| 3. Governance | 11–15 | Finance, Legal, Compliance, Procurement | Cult-like; rituals, policy enforcement squads | Head of Compliance |
| 4. Senior Leadership | 16–20 | HR HQ, Executive Suite, Boardroom | Full corporate cult; executive excess and ceremony | CEO (final) |

### 3.2 Floor clear rule

A floor is cleared when every enemy is defeated, and exits stay locked until then. Challenge floors may vary this rule (see 3.4).

### 3.3 Exits

| Exit | Effect | Reward | Risk |
| --- | --- | --- | --- |
| Stairs | Next floor (+1) | Small heal on the landing; standard floor reward | None; the reliable option |
| Lift | Skip a floor (+2) | Faster progress; avoids an unwanted floor | Lose the skipped floor's reward and arrive under-levelled. About 25% chance of a lift ambush: a tight-arena fight with a bonus reward |
| Corridor | Lateral move to an adjacent wing at the same floor number | Shop, event, treasure or challenge room | No upward progress |

Exit rules:

- The game rolls 2–3 of the three exits per floor, so not every exit is always available.
- The lift can never skip a boss floor.
- Corridors are limited to 2 per act, and never two in a row.
- Every exit shows a reward-preview icon (Hades model): weapon or upgrade, currency, healing, Rage modifier, or a shop, event or elite marker.

### 3.4 Floor types

| Type | Description | Usually reached via |
| --- | --- | --- |
| Standard | Clear every enemy | Stairs |
| Elite | Fewer enemies, at least one elite; better reward | Stairs or lift |
| Shop | Canteen or vending machines; spend in-run currency | Corridor |
| Treasure | Stationery Cupboard; a guaranteed upgrade, no combat | Corridor (rare) |
| Event | Narrative or gamble encounter (for example, a photocopier fortune or a team-building exercise) | Corridor |
| Challenge | Optional objectives such as Fire Drill (a timed clear) or Quiet Carriage (no Rage) | Corridor |
| Boss | Floors 5, 10, 15 and 20 | Fixed |

### 3.5 Difficulty scaling

- Enemy power and density scale with the **floor number**, not the number of rooms visited. This is what makes the lift a genuine trade-off.
- Enemy pools unlock by act, as defined in Section 5.

### 3.6 Pacing targets

- **Per floor:** 2–3 minutes for a standard floor; 4–6 minutes for a boss.
- **Full run:** 50–60 minutes. This is longer than the genre's typical 30–45 minutes. Because of that, **a mid-run suspend save between floors is mandatory**, especially on Android (see Section 10).
- **On death:** the player returns to the hub, the car park (see Section 7).
- **After a win:** Performance Review difficulty modifiers (see Section 7).

### 3.7 Floor data model

Each floor is a data object, so that balancing is spreadsheet work rather than code changes:

- `floor_number`, `act`
- `floor_type`, `department_theme`
- `available_exits[]`, `reward_preview` per exit
- `enemy_budget` (difficulty points spent on spawns; see Section 5)
- `lift_ambush_chance`

## 4. Procedural generation (locked v1.0)

Each floor is assembled from hand-authored room templates on a seeded grid, around a fixed building core that holds the exits. Rooms lock during combat, about 1 in 5 floors is an Alarm floor, destruction is combat-relevant, and enemies can be executed against the environment or thrown through walls.

### 4.1 Floor structure: room-lock multi-room

A floor is 4–7 connected rooms. When the player enters a room its doors seal, and they stay sealed until every enemy in that room is dead (the Hades or Isaac model). The floor is clear when every room is clear. Single-arena and free-roam structures were rejected (see the decision log).

About 1 in 5 floors becomes an **Alarm floor**, where all doors open and every enemy hunts the player. This keeps the original fantasy as a spike event without making it the default.

### 4.2 The building core

Every floor shares a fixed structural core: the lift lobby, stairwell and corridor link. The player arrives in the core and the exits unlock there once the floor is clear. This mirrors real office architecture and gives developers one reusable, hand-polished space.

### 4.3 Room template library

| Room type | Role in combat | Typical hazards and props |
| --- | --- | --- |
| Open-plan | Main arena; mixed cover | Desks, swivel chairs, monitors |
| Cubicle maze | Ambush, close quarters | Partitions, filing cabinets |
| Meeting room | Small arena; glass walls | Glass partitions, projector, whiteboard |
| Kitchen | Hazard-rich | Microwave, kettle, water cooler, knife block |
| Print room | Explosive hazards | Printers, franking machine, paper stacks |
| Server room | Electrical hazards, low light | Server racks, cable runs, cooling vents |
| Manager's office | Elite room or reward room | Desk, executive chair, minibar |
| Toilets | Narrow chokepoint, event room | Hand dryers, cubicle doors |

- **Template rules:** sizes are multiples of a base tile unit, with door sockets on the N/E/S/W edges. A template is placed only where its sockets match the room graph.
- **Theming:** every template has department skin variants (props, decals, palette) and an Act 4 "cult" dressing set (banners of company values, shrines to the CEO, ceremonial lighting).
- **Content budget:** 8–12 templates per department plus a shared pool of about 20, for about 150 in total at launch. The vertical slice needs about 30 (Act 1 only).

### 4.4 Generation pipeline

1. Seed the RNG from the run seed and floor number.
2. Select the department theme from the act's pool, with no repeats within an act.
3. Build the room graph: a critical path from the core of 4–7 rooms, plus 0–2 optional side rooms for loot.
4. Place templates that match the door sockets.
5. Apply the theme skin and randomise prop variants.
6. Place environmental hazards (see 4.5) according to per-template slot rules.
7. Spend the floor's `enemy_budget` across rooms (see Section 5).
8. Place rewards and the exit reward previews.
9. Validate: every room is reachable, there are no softlocks, the critical-path length is within bounds, and there are no hazard clusters at room entrances. If validation fails, regenerate with seed + 1.

### 4.5 Environmental hazards (pillar 3)

| Hazard | Trigger | Effect |
| --- | --- | --- |
| Glass partition | Damage or a thrown body | Shatters; cut damage and bleed to anyone adjacent |
| Printer | Heavy hit | Explodes after a short fuse; area damage |
| Water cooler | Hit, then electrified by a cable or socket | Puddle becomes an electrified area; stun |
| Fire extinguisher | Hit or thrown | Burst of knockback plus a smoke cloud that blocks vision |
| Swivel chair | Kick | Rolling projectile; knocks enemies down |
| Filing cabinet | Heavy hit | Topples; crush damage plus a new cover line |
| Sprinklers | Fire or alarm | Room-wide slow; conducts electricity |

Enemies take hazard damage too, and can be lured into hazards; this underpins the environmental-kill rewards in Section 7.

### 4.6 Seeds and the daily run

- Every run has a visible seed. Players can share and enter seeds from the run-setup menu.
- **Daily run at launch:** one global seed per 24 hours (00:00 UTC reset), one scored attempt per player, and practice attempts that don't count.
- **Leaderboards:** platform-native at launch, using Steam leaderboards and Google Play Games Services. That means separate PC and Android boards. A unified cross-platform board would need a custom backend, so it's post-launch at the earliest.
- **Anti-cheat (minimum):** the score submission includes the seed, the run duration and a checksum of the key run events. Implausible results are rejected by server-side sanity checks.

### 4.7 Destruction, executions and breaching

Destruction is combat-relevant only: objects that change a fight break through scripted states (intact, damaged, destroyed). There is no free physics destruction.

**Grab (new core verb; see Section 2).** The player can grab an enemy who is staggered or below 25% HP. A grabbed enemy can be thrown, used as a projectile, or executed against a nearby hazard.

**Environmental executions.** These are context-sensitive finishers triggered by grabbing an enemy next to an execution object:

| Execution | Object | Presentation |
| --- | --- | --- |
| Defenestration | Exterior window | Mini cutscene: the enemy is hurled through the glass and the camera follows the fall. Ground-floor windows give a comedic short drop |
| Photocopier | Photocopier or printer | The enemy's head is slammed into the glass; the copier spits out 4 printouts of the battered face, which scatter as floor decals |
| Server rack | Server rack | Electrocution with sparks, and the room lights flicker |
| Shredder | Industrial shredder (Finance and Legal) | The tie is fed into the shredder (gore toggle applies) |
| Microwave | Kitchen microwave | Head slam and door slam |
| Hand dryer | Toilets | Comedic face-blast |

Execution rules:

- **Mini cutscenes last 1–1.5 seconds.** Other enemies and timers pause during a cutscene, and the player is invulnerable for its duration.
- **Cutscene setting:** Always, First time only, or Off (Off plays a brief in-world animation instead).
- Executions grant bonus Rage and count towards execution-based upgrades (see Section 7).
- Each execution object is single-use for executions: a used photocopier is wrecked, which also stops players repeating the same spot.
- The window type depends on the floor: the sealed curtain walls of Act 4 need a weakened panel, created by hitting it first.

**Destructible walls and breaching.**

- Interior partition walls (plasterboard, glass, cubicle walls) are destructible. The building core and structural walls are not.
- **Body breach:** throwing an enemy through a partition wall smashes it and lands them in the adjacent room. Debris stuns any enemies there briefly, then that room's enemies aggro immediately.
- **Breach merge:** breaching merges the two rooms into one sealed encounter, so every enemy in both rooms is now fighting the player.
- **Risk and reward:** a breach creates a harder combined fight but gives a breach bonus (extra currency and Rage), along with the debris stun as an opening.
- **Generation rules:** templates flag which walls are breachable. The validator (step 9 in 4.4) ensures a breach can't open into the core, create softlocks, or merge more than two rooms at once.
- On Alarm floors, every room is already aggroed, so breaches simply open new lines of attack.

### 4.8 Performance limits

- Maximum active enemies per room: 12 on PC and 8 on Android (to be tuned in Section 10).
- A per-room decal cap, with the oldest decals faded first.
- Rooms outside the current room and its neighbours are fully suspended.

## 5. Enemies (locked v1.0, Promotion subject to a legal gate)

Enemies are satirical corporate stereotypes, never grotesque. Each of the 20 archetypes (16 base plus 4 elites) defines behaviour. Every individual enemy is procedurally generated from that archetype's asset kit, so no two Interns look alike. Enemies drop their weapons. Enemies who kill the player are promoted and come back.

### 5.1 Combat roles

| Role | Job in a fight | Player answer |
| --- | --- | --- |
| Swarmer | Cheap, numerous, surrounds the player | Area attacks, hazards |
| Bruiser | Slow, heavy, high HP | Dodge, then punish; grab when staggered |
| Ranged | Pressures at distance | Close the gap; cover |
| Support | Buffs or heals other enemies | Kill priority |
| Disruptor | Traps, debuffs, area denial | Positioning |
| Elite | A mini-boss archetype with a unique mechanic | Full kit |

### 5.2 Archetype roster

| Act | Archetype | Role | Cost | From floor | Signature behaviour | Anchor item (always present) |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Intern | Swarmer | 1 | 1 | Packs of 3–5; panics and flees at low HP | Oversized lanyard, coffee run tray |
| 1 | Receptionist | Ranged | 2 | 1 | Throws staplers and desk phones | Headset |
| 1 | Caretaker | Bruiser | 3 | 2 | Wide mop sweep; wet floors slip the player | Mop, hi-vis |
| 1 | IT Technician | Disruptor | 3 | 3 | Lays cable trip-traps; electrifies water coolers | Cable reel, "have you tried turning it off" T-shirt |
| 1 | **Fire Warden** | Elite | 6 | 3 (Elite floors only) | Extinguisher blast; whistle rallies nearby enemies | Hi-vis vest, whistle |
| 2 | Sales Rep | Swarmer and rusher | 2 | 6 | Dash attacks; never stops talking | Gilet, energy drink |
| 2 | Marketing Exec | Support | 3 | 6 | "Rebrands" an ally with a temporary buff and a new name | Branded tote, oat latte |
| 2 | Call Centre Agent | Ranged | 3 | 7 | Headset scream cone; hold music slows the player | Headset, script binder |
| 2 | Team Leader | Bruiser | 4 | 8 | Delegates: sends Interns in while hanging back | Clipboard, lanyard with badges |
| 2 | **Employee of the Month** | Elite | 7 | 6 | Enrages each time an ally dies | Framed certificate |
| 3 | Accountant | Ranged | 3 | 11 | Calculator turret; precise, slow projectiles | Calculator, cardigan |
| 3 | Lawyer | Disruptor | 4 | 11 | Injunction field that disables the player's ranged weapon | Briefcase |
| 3 | Compliance Officer | Bruiser | 4 | 12 | Front-facing policy-binder shield; must be flanked or grabbed | Giant policy binder |
| 3 | Procurement Buyer | Support | 4 | 13 | "Orders" reinforcements, spawning Interns until killed | Purchase-order pad |
| 3 | **Auditor** | Elite | 8 | 11 | Marks the player; all enemies deal more damage to a marked player | Magnifying glass, red pen |
| 4 | HR Business Partner | Support | 5 | 16 | Restores enemy shields with a "wellbeing check-in" | Wellbeing lanyard, mindfulness app |
| 4 | Senior Vice President | Bruiser | 5 | 16 | Golf-club swings; power poses grant temporary armour | Golf club, quarter-zip |
| 4 | Executive Assistant | Disruptor and assassin | 5 | 17 | Teleports via calendar invites; backstabs | Tablet, two phones |
| 4 | Management Consultant | Ranged | 4 | 16 | Laser-pointer beams; bills by the hour, so damage rises the longer the fight runs | Laser pointer, slide clicker |
| 4 | **Culture Champion** | Elite | 10 | 16 | "Re-onboards" fallen colleagues: intact bodies get up again with a fresh lanyard. Dismembered or executed enemies can't be revived | Company values sash |

### 5.3 Procedural enemy generation

Every spawned enemy is assembled from its archetype's kit:

1. **Base rig:** 2 rigs, each with 3 builds (slim, average, heavy). All animations are shared per rig, which keeps art cost manageable.
2. **Appearance layers:** head and face (8–12 per rig), hairstyle (10+), outfit (3–5 sets per archetype), accessories (glasses, facial hair, mug, earbuds and so on), and palette swaps.
3. **Anchor items:** each archetype's anchor items (see 5.2) are always present, so the role reads instantly by silhouette whatever else is randomised. This rule is mandatory for readability (pillar 1).
4. **Identity:** a generated name from UK-flavoured name pools, plus a job title from a "\[Seniority\] \[Buzzword\] \[Function\]" grammar (for example, "Senior Synergy Lead" or "Head of Vibes").
5. **Variance:** stats vary by ±10%, plus one quirk from a pool. Examples: Speakerphone (louder barks, so more Rage for the player), Gym Bro (+HP, slower), Caffeine-Dependent (slows down if their mug is destroyed).

**Seniority tiers** replace the earlier "trained variants". Any archetype can spawn as Junior (its introduction act), Senior (one act later) or Lead (two or more acts later). Each tier adds HP, faster telegraphs and one extra behaviour, and the visual upgrade is corporate status: sharper suits, gold lanyards, a better watch. The escalation is the satire.

### 5.4 Behaviour standards (all enemies)

- Every attack is telegraphed, with a minimum of 0.4 seconds in Act 1, falling to 0.25 seconds in Act 4.
- Enemies bark HR and corporate jargon, which fills the player's Rage (see 2.2).
- Enemies react to hazards: they avoid hazards when alert, and can be lured or knocked into them.
- Every non-boss enemy is grabbable when staggered or below 25% HP (see 4.7).
- **Weapon drops:** every enemy drops its held weapon on death, with its remaining durability. Ranged weapons drop with partial ammunition. Elites drop a rare-tier weapon.

### 5.5 Spawn rules

- **Floor budget:** `enemy_budget = 8 + (floor_number × 3)`. That's 11 points on floor 1 and 68 on floor 20, split across rooms by template size. These are initial values, to be tuned.
- **Alarm floors:** budget × 1.3, with every enemy aware from the start.
- **Composition:** every room has at least 2 different roles. Supports are capped at 2 per room, and there's at most 1 elite per room.
- **Elites:** in Act 1, elites appear only on Elite floors. From Act 2 onwards, a standard room has a 10% chance of containing one.
- **Pool blending:** each act's pool is 70% current-act archetypes and 30% earlier archetypes at a higher seniority tier.
- **Lift ambush:** budget × 0.6 in the lift arena, with swarmers and rushers only.

### 5.6 Promotion system (full)

**Legal gate: do not build this until a patent check is complete.** WB Games holds US patent US2016279522A1, "Nemesis characters, nemesis forts, social vendettas and followers in computer games", which runs to August 2036. It covers procedurally generated NPCs that remember the player and are promoted or demoted. Steam sales into the US are in scope. A freedom-to-operate opinion from a patent attorney is required before implementation. The design below deliberately avoids NPC-versus-NPC hierarchy, power struggles, followers and forts, but that is not legal clearance. Fallback if it isn't cleared: a light version, where killers return once with a title and no persistent memory or traits.

**Promotion triggers**

- The enemy that lands the killing blow on the player is promoted. If the player dies to a hazard, the nearest enemy that damaged them in the last 5 seconds gets the credit.
- An already-promoted enemy that kills the player again is promoted again.

**What promotion gives an enemy**

- A new title, one rank up a ladder of 4 ranks: Associate, Manager, Senior Manager, Director.
- A stat tier increase.
- A **strength** derived from how they killed the player. For example: a kill by throw gives Ballistic; a ranged kill gives Sharpshooter; a kill while the player was in Rage gives Calm Under Pressure (resistance to Rage damage).
- One randomly assigned **weakness**. For example: Fear of Heights (defenestration triggers at higher HP) or Paper Allergy (photocopier executions are instant).

**Memory**

- A promoted enemy records the floor, the weapon and the method of each kill, plus how many times it has killed the player.
- Barks reference that history, for example: "Floor 7. You went down to a stapler. Classic."

**Intel**

- Weaknesses are hidden until discovered. HR filing cabinets found during runs reveal one weakness of a promoted enemy.

**Roster**

- At most 10 promoted enemies are active at once.
- They're shown on the **Internal Announcements** noticeboard in the car park hub (see Section 7).

**Return**

- 1–3 promoted enemies are inserted into each normal run, in the act that matches their rank.
- Each is announced by a "Company Announcement" intro card.
- A Director spawns in their own arena room as a mini-boss.

**Resolution**

- Killing a promoted enemy marks them **Terminated**: a large reward, and their anchor item goes in the hub as a trophy.
- Executing one plays a unique termination cutscene and gives a bonus.
- Either way, they're removed from the roster.

**Exclusions**

- Promotion is disabled in daily runs and in seed-entered runs. Inserting promoted enemies would break seed determinism and leaderboard fairness.

**Persistence**

- The promoted roster is stored in the save file and synced through Steam Cloud and Google Play Games saved games.

[Patent coverage source](https://blog.kowatek.com/?p=99923)

## 6. Bosses (locked v1.0)

There are four fixed bosses, one per act. Each has 3 phases, and the arena changes at every phase transition. Promoted Directors (see 5.6) can also appear as optional bosses behind a corridor exit. Boss names are placeholders, to be finalised with art direction.

### 6.1 Rules for all bosses

- **Health bar:** shows phase markers at 66% and 33%.
- **Phase transitions:** each is a 2–3 second arena-change set piece. The player is invulnerable and the timers pause.
- **Grab:** bosses can't be grabbed, except during a **stagger window** at the end of each phase. Grabbing then triggers a phase-transition execution (a 1–1.5 second mini-cutscene). The final phase ends in a unique boss execution.
- **Fairness:** no unavoidable damage and no one-shot attacks. Every attack follows the telegraph standards in 5.4.
- **Adds:** a boss can summon at most 4 add enemies at a time, drawn from its act's archetypes.
- **Intro card:** each boss is introduced with their name, job title and a satirical tagline.
- **Rewards:** a major upgrade choice, meta currency (see Section 8) and a full heal before the next act.
- **Exclusions:** promoted enemies never appear on boss floors.

### 6.2 Act 1 boss: Facilities Manager (floor 5)

Tagline: "Your ticket has been logged." The arena is the basement plant room.

| Phase | Arena state | Boss behaviour | Player opportunity |
| --- | --- | --- | --- |
| 1 (100–66%) | Plant room; wet patches on the floor | Giant-wrench swings; whistles in Caretakers | Slip him on his own wet floors |
| 2 (66–33%) | Fire alarm: sprinklers on (room-wide slow; water conducts), sparking electrical panels | Hurls toolboxes; kicks panels to electrify puddles | Bait him into the electrified water |
| 3 (33–0%) | Lights out; emergency lighting only | Charges on a ride-on floor scrubber | Dodge so he crashes into walls. Finisher: boiler execution |

### 6.3 Act 2 boss: Head of Sales (floor 10)

Tagline: "Always be closing." The arena is the sales floor, with a sales gong.

| Phase | Arena state | Boss behaviour | Player opportunity |
| --- | --- | --- | --- |
| 1 | Open-plan sales floor | Dash charges; every gong strike summons Sales Reps | Destroy the gong to stop the summons |
| 2 | Quarter-end: leaderboard screens on every wall, plus a commission meter | Throws contract projectiles; gains speed as the commission meter fills | Smash the screens to drain the meter |
| 3 | President's Club: he smashes the floor-to-ceiling windows, and the wind pulls everyone towards the edge | Lunging grabs that try to throw the player out | Finisher: throw him out of the window (a boss defenestration) |

### 6.4 Act 3 boss: Head of Compliance (floor 15)

Tagline: "This conversation is being recorded." The arena is the records archive.

| Phase | Arena state | Boss behaviour | Player opportunity |
| --- | --- | --- | --- |
| 1 | Archive stacks | Posts timed "policies" that ban a player verb (no dashing, no ranged, no Rage). Breaking the active policy causes damage and a stun | Read the active policy on the HUD and adapt |
| 2 | Audit: shutter walls seal the arena into compartments | Moves between compartments with Lawyer and Auditor adds | Breach the walls to reach her (see 4.7) |
| 3 | Shredding floor: conveyor belts run towards an industrial shredder | Rotates policies rapidly; tries to push the player onto the belts | Finisher: shredder execution |

### 6.5 Final boss: the CEO (floor 20)

Tagline: "We're a family here." The CEO ordered the Culture Realignment Programme. The arena is the penthouse, ending on the rooftop helipad.

| Phase | Arena state | Boss behaviour | Player opportunity |
| --- | --- | --- | --- |
| 1 | Boardroom: the CEO addresses the room from a giant screen while board members (SVPs and Executive Assistants) fight | Presentation slides projected as beam patterns across the floor | Clear the board to force the CEO out in person |
| 2 | CEO's office: trophy cabinet, a golf putting green, panoramic glass | Fights in person. **Motivational speeches drain the player's Rage** (the inverse of every other enemy); power poses give armour | Interrupt speeches with thrown objects to keep Rage |
| 3 | Rooftop helipad: wind, open edges, a helicopter waiting | Tries to escape; deploys a "golden parachute" shield | Break the shield, Rage, then finish. Finisher: thrown off the roof or into the rotor (gore toggle applies) |

**Ending:** an all-staff email cancels the Culture Realignment Programme and the staff snap out of the indoctrination. This hands over to the post-win loop and the Performance Review modifiers (see Section 7).

### 6.6 Optional Director bosses

These depend on Promotion clearing its legal gate (5.6). If Promotion falls back to the light version, they're dropped.

- **Spawn:** if at least one Director-rank promoted enemy exists, there's a 50% chance per act that one corridor exit becomes a labelled **Director's Office**. At most one appears per act, and it counts towards the corridor limit.
- **Structure:** 2 phases rather than 3, assembled from the Director's archetype behaviours, promoted traits and memory barks. The arena is an upgraded Manager's Office template. Two phases keep the procedural assembly reliable and the cost bounded.
- **Reward:** a rare weapon, a large currency payout and the Director's trophy. Defeat marks the Director as Terminated (see 5.6).
- **Never mandatory:** fighting a Director never blocks act progression.

## 7. Player progression (locked v1.0)

Within a run, the player builds power from department **Benefits** (pick 1 of 3) and rare **Desk Items**. Between runs, progression is **unlocks only**: no permanent stat boosts, so every run is won on skill and build. After the first win, stackable **Performance Review** modifiers raise the difficulty.

### 7.1 In-run: Benefits

Each department is a Benefits provider with its own themed perk pool. The "Benefit" exit reward (see 3.3) offers 1 of 3 perks from one department.

| Department | Build theme | Example Benefits |
| --- | --- | --- |
| IT | Electricity and tech | Melee chain-shocks nearby enemies; hazards stay electrified longer |
| Facilities | Environment | Hazard damage +; breaches stun longer and pay more |
| Sales | Speed and aggression | Dash deals damage; critical hits on the first hit after a dash |
| Marketing | Crowd control | Thrown enemies "rebrand" whoever they hit, confusing them briefly |
| Finance | Economy | Earns interest on held currency; damage scales with cash held |
| Legal | Debuffs | Hits apply an "Injunction": the target takes increased damage |
| HR | Sustain | Faster Wellbeing shield regeneration; heal on room clear |
| Executive | Rage and executions | Longer Rage; executions heal; executions extend Rage |

- **Rarity:** Standard, Enhanced or Executive. A Benefit you already hold can be offered again as an upgrade.
- **Synergies:** about 12 dual-department perks become available once you hold Benefits from both departments. For example, IT + Facilities gives "Smart Building", where hazards trigger themselves when an enemy is near. These are deliberately named for the joke.
- **Content target:** about 10 Benefits per department plus 12 Synergies, roughly 92 in total. The vertical slice needs 3 departments with 6 each.

### 7.2 In-run: Desk Items

Desk Items are rare passive items. Each is unique per run, with no carry limit.

- **Sources:** elite kills, Treasure rooms, boss rewards, and occasionally shops.
- **Examples:**
  - Stress Ball: Rage fills faster.
  - Out-of-Office Auto-Reply: auto-dodges the first hit on each floor.
  - Company Credit Card: lets you go into debt at shops.
  - Gold Lanyard: shop discount.
  - Employee Handbook: reveals a promoted enemy's weakness.
  - Ergonomic Cushion: a larger Wellbeing shield.
  - Lucky Mug: better weapon drops.
- **Content target:** about 40 Desk Items at launch, and 10 for the vertical slice.

### 7.3 Between runs: the car park hub (unlocks only)

After death or victory, the player sits in their car in the staff car park. That's the hub.

| Hub element | Function |
| --- | --- |
| Vending machine | Spend meta currency (see Section 8) to unlock new weapons, Benefits, Desk Items and events into the run pools |
| Car boot | Choose your starting role and loadout |
| Internal Announcements noticeboard | The promoted-enemy roster and known weaknesses (see 5.6) |
| Dashboard | Trophies from Terminated Directors; run statistics |
| Car radio | Music player and soundtrack unlocks |

**Starting roles (unlockable).** These change your starting kit, not your power level:

| Role | Starting kit | Twist | Unlock condition |
| --- | --- | --- | --- |
| Office Worker | Keyboard, 2 throwables | Balanced | Default |
| Temp | Letter opener | Lower HP, but Rage fills 50% faster | Reach floor 6 |
| Night Cleaner | Mop | Hazard damage +; starts with a Facilities Benefit | Kill 100 enemies with hazards |
| Contractor | Nail gun | No Wellbeing regeneration, extra ammunition | Beat the Act 2 boss |
| Ex-Employee | Bare fists | Starts in Rage on every floor; no shops | Beat the CEO |

**Unlock pacing:**

- Target a first CEO kill at 10–20 hours of play for an average player.
- Some unlocks come from feats rather than currency, for example: defenestrate 50 enemies to unlock a weapon.

**Honest constraint:** with no permanent stat boosts, the game must be beatable at base power. That makes early runs harder for casual and mobile players. Mitigation:

- Act 1 is tuned forgiving.
- An optional **Workplace Adjustments** assist mode adds a damage-taken slider and slower game speed.
- Assist mode is excluded from daily leaderboard submissions, and runs played with it are marked on the stats screen.

### 7.4 After the first win: Performance Review

Performance Review unlocks after the first CEO kill. The player stacks modifiers before a run, and each rank adds KPI points. Higher KPI totals unlock cosmetic outfits, player titles and hub décor. There is never any power reward.

| Modifier | Ranks | Effect per rank |
| --- | --- | --- |
| Budget Cuts | 3 | Shop prices up; fewer shop items |
| Restructure | 3 | Higher elite spawn chance |
| Micromanagement | 3 | Enemy telegraphs shortened |
| Mandatory Fun | 2 | Rage decays faster |
| Hiring Freeze | 2 | No stair-landing heals; then no heal on boss clear |
| Zero Tolerance | 2 | Grab threshold lowered from 25% to 15% HP, then 10% |
| Hot Desking | 1 | Rooms have less cover |
| Quarterly Targets | 3 | Floor timer; exceeding it spawns reinforcements |
| Board Pressure | 1 | Bosses gain an enrage at 15% HP |
| Promotion Season | 2 | More promoted enemies per run (only if Promotion clears its legal gate) |

The **daily run** applies a fixed, published set of modifiers each day, which gives daily runs their character.

## 8. Economy and business model (locked v1.0)

The game is sold as a premium title on Steam. On Android it's a free download that includes Act 1, with a one-time unlock for the full game. There are two currencies: **Petty Cash**, which resets every run, and **Annual Leave**, which is permanent and fully kept on death. There are no ads, no loot boxes and no premium currency.

### 8.1 Business model

| Platform | Model | Indicative price | Notes |
| --- | --- | --- | --- |
| Steam (PC and Steam Deck) | Premium, paid upfront | £14.99–£19.99 (US$19.99) | Default Steam regional pricing; 10–15% launch discount; a free Act 1 demo for Steam Next Fest |
| Android (Google Play) | Free download with Act 1 (floors 1–5 plus boss); one-time in-app purchase unlocks the full game | £7.99–£9.99 | Uses Play Billing; demo progress and unlocks carry over to the full game |

- **Demo scope:** the Android demo includes Act 1, the hub and Act 1 unlocks. The daily run and Performance Review are only in the full game.
- **Store fees:** check the current terms before setting prices. At the time of writing, Steam's standard revenue share is 30%, and Google Play charges 15% on the first US$1M of yearly revenue.
- **Revenue expectation:** PC is the primary revenue platform. Mobile unlock conversion on premium-unlock games is typically low (low single-digit percent of installs; an approximate industry benchmark, not verified data). Treat Android as reach first and revenue second.
- **No cross-buy:** Steam and Google Play purchases are separate, and saves sync per platform.

**Ethics commitments (binding):**

- No pay-to-win
- No loot boxes (UK and EU regulatory scrutiny, plus Belgium's restrictions)
- No premium currency
- No energy timers
- No ads
- Post-launch content is free updates or clearly priced expansions

### 8.2 Currencies

| Currency | Scope | Earned from | Spent on |
| --- | --- | --- | --- |
| Petty Cash | In-run; resets at run end | Kills, room clears, breaches, executions, Terminated enemies, Petty Cash floor rewards | Canteen and vending-machine shops: Benefits, Desk Items, heals, weapon repairs, rerolls |
| Annual Leave (in days) | Permanent; **100% kept on death** | Floors reached, boss kills, feats, Terminating promoted enemies, first-time discoveries | The hub vending machine: unlocks of weapons, Benefits, Desk Items, events and starting roles |

- **Expense claim:** at the end of a run, unspent Petty Cash converts to Annual Leave at 10:1. This rewards Finance builds without making hoarding the optimal strategy. The rate is tunable.
- **Earn-rate targets:** a first CEO kill at 10–20 hours of play (see 7.3), and everything unlocked at 40–60 hours. Cosmetic Performance Review rewards come from KPI thresholds, not currency.

### 8.3 Shops

| Shop | Where | Inventory |
| --- | --- | --- |
| Canteen | Corridor Shop rooms | 1 Benefit, 1–2 Desk Items, 1 weapon, a full heal, a weapon repair, a reroll |
| Vending machine | Occasional in-room placement | Snacks (small heals), a single throwable |

Indicative Canteen prices (data-driven, to be tuned):

| Item | Price (Petty Cash) |
| --- | --- |
| Benefit | 120–180 (by rarity) |
| Desk Item | 150–250 |
| Weapon | 60–120 |
| Full heal | 90 |
| Weapon repair | 40 |
| Reroll | 30, then +30 per reroll in the same shop |

### 8.4 Reward tables

Indicative weights for exit reward previews on standard floors:

| Reward | Weight |
| --- | --- |
| Benefit | 30% |
| Petty Cash | 25% |
| Weapon | 15% |
| Heal | 15% |
| Rage modifier | 10% |
| Desk Item | 5% |

- **Elite floors:** the reward rarity rises one tier, and a Petty Cash bonus is added.
- **Boss floors:** an Enhanced-or-better Benefit, a guaranteed Desk Item, an Annual Leave bonus and a full heal (see 6.1).
- **Annual Leave per run (indicative):** 1 day per floor reached, 5 per boss, 10 per Terminated Director, plus first-time feat bonuses.
- **Data-driven:** all values live in data tables (see 3.7) for spreadsheet balancing.

## 9. Art direction, UI/UX and audio (locked v1.0)

The look is hi-bit pixel art in the style of Katana Zero and Enter the Gungeon. Menus are framed as parody corporate software, and the music is elevator muzak that drops into house and techno when combat starts. **Readability always beats parody:** the combat HUD stays minimal, and every gag lives in menus and transitions.

### 9.1 Art direction

**Technical baseline (art bible):**

| Spec | Value |
| --- | --- |
| Internal render resolution | 640 × 360, integer-scaled: 1080p ×3, 1440p ×4, 4K ×6 |
| Steam Deck (1280 × 800) | 2× scale, with an extended vertical view (16:10) |
| Perspective | Top-down 3/4 |
| Tile size | 16 × 16 px |
| Character sprites | About 32 × 48 px; bosses up to 96 × 96 px |
| Directions | 4 directions, with left/right mirrored; aiming uses a rotating weapon and arm layer for 360° aim |
| Modular layers per character | 6 maximum (body, outfit, head, hair, accessory, anchor item) to control animation cost (see 5.3) |

**Animation set per rig (minimum):** idle, walk, run, 3 attacks, hit, stagger, grabbed, thrown, 3 death variants, and execution poses for each execution type in 4.7.

**Act palettes:** the colour story is the escalation.

- Act 1: beige, grey and flickering fluorescent light
- Act 2: loud brand colours and neon sales screens
- Act 3: cold navy and archive brown
- Act 4: gold, marble and ceremonial reds

**Readability rules:**

- Enemies have a 1 px dark outline.
- Attack telegraphs use one reserved high-contrast colour that appears nowhere else. A colourblind alternative is provided (see 2.6).
- Gore decals sit below the gameplay layer and fade (see 4.8).

**Lighting:** dynamic 2D lights, used sparingly (server rooms, emergency lighting, Act 4 ceremony), with a reduced-lights mode on Android.

### 9.2 UI/UX: corporate-software parody

| Screen | Parody framing |
| --- | --- |
| Main menu | Desktop login screen on the fictional "CorpOS". It asks the player to accept the updated HR terms; selecting Decline starts the game |
| HUD | Health as a "Wellbeing score", Rage as a "Stress level" KPI gauge, Petty Cash as an expenses total, and the floor number on a lift-panel display |
| Benefit choice | An email, "Re: Your Benefits Package", with 3 attachments |
| Canteen shop | An intranet catalogue page |
| Boss policies (6.4) and Promotion | Pop-up notifications and all-staff emails |
| Run summary | A Performance Review slide deck with charts (kills, executions, defenestrations), exportable as a shareable screenshot |
| Settings | A Control Panel parody |
| Loading tips | Internal memos |

UI rules:

- **Legal:** all software parody is invented ("CorpOS"). No real product names, logos or close copies of trade dress (for example Microsoft Outlook, Excel or PowerPoint).
- **Navigation:** every menu is fully navigable by controller, by keyboard and mouse, and by touch.
- **Touch:** the touch HUD reserves both thumb zones; HUD elements sit in the top corners.
- **Fonts:** a pixel font for headers and a clean, readable font for body text, with a minimum text size suitable for mobile, plus UI scaling options.

### 9.3 Audio

**Music: adaptive two-state score**

- Each act has one theme in two arrangements: an exploration version as muzak, and a combat version as house or techno.
- Transitions happen on bar boundaries: the music "drops" when a room locks and returns to muzak when the room clears.
- Rage adds a layer: a filter sweep and a heavier kick.
- Boss themes escalate across the 3 phases.

| Act | Exploration (muzak) | Combat |
| --- | --- | --- |
| 1 | Lounge or bossa-nova lobby music | Deep house |
| 2 | Smooth jazz | Tech house |
| 3 | Classical hold music | Minimal techno |
| 4 | Corporate anthem | Hard techno; a CEO finale track |

- **Licensing:** the score is original and commissioned. No real hold-music or library melodies, because many well-known hold tunes are copyrighted. Stems are delivered for vertical layering.

**Sound effects:** hit-stop and heavy impact sounds, office foley (printers, keyboards, the lift chime), and sound cues for every telegraph.

**Barks and voice:**

- Corporate-jargon barks power Rage (see 2.2). The target is about 300–500 voiced lines from UK-accented actors.
- If the budget is tight, the fallback is subtitled barks with short vocal grunts.
- Synthetic voice is used only with properly licensed tools and the consent of any voice it is based on.

**Audio accessibility:** subtitles for barks, plus a visual indicator for every audio-only cue.

## 10. Technical (locked v1.0)

The game is built in Unity (a pinned LTS release), runs at 60 fps on both PC and Android, and targets 2020-or-newer mid-range Android phones (4 GB RAM, Android 10+). The architecture is data-driven, seeds are deterministic, and there are two save layers.

### 10.1 Engine and core packages

| Area | Choice |
| --- | --- |
| Engine | Unity LTS, pinned for the whole project. Check the current Unity licence tier and thresholds before commercial release |
| Rendering | URP 2D renderer, 2D lights, Pixel Perfect Camera (640 × 360) |
| Input | Unity Input System: controller, keyboard and mouse, and touch, with runtime rebinding (2.6) and automatic button-prompt switching for Xbox, PlayStation and generic pads; Steam Input compatible |
| Characters | 2D Animation package with sprite library layers (see 5.3). Composited enemies are **baked into a runtime atlas at room load** to cut draw calls |
| Steam | Steamworks.NET: achievements, leaderboards, Steam Cloud |
| Android | Google Play Games plugin (leaderboards, saved games) and Unity IAP with Play Billing (the one-time unlock) |
| Localisation | Unity Localization package. English at launch; all strings in tables from day one so the game can be localised later |

### 10.2 Architecture

- **Data-driven content:** floors, archetypes, Benefits, Desk Items, shop prices, reward weights and Performance Review modifiers live in spreadsheets. They're exported to CSV and imported as ScriptableObjects, so designers balance in a spreadsheet, never in code.
- **Deterministic seeding:** use a custom seeded RNG (for example, PCG), not UnityEngine.Random. Separate RNG streams handle layout, spawns, loot and cosmetic effects, so visual randomness can't desync a seed. Daily seed = hash(UTC date + salt), so the daily run needs no server to generate.
- **Pooling:** enemies, projectiles, pickups and effects all use object pools.
- **Gore decals:** blood is rendered into a per-room render texture, not stored as individual sprite objects. This is the main performance safeguard for Android (see 4.8).
- **Room streaming:** only the current room and its neighbours are simulated (see 4.8).

### 10.3 Saves

| Layer | Contents | When it's written |
| --- | --- | --- |
| Profile save | Unlocks, Annual Leave, the promoted roster, KPI progress, settings, statistics | After every run and every unlock |
| Run suspend save | Seed, floor, HP and shield, Rage, inventory, Benefits, Desk Items, Petty Cash, RNG stream states | Between floors, and automatically when the Android app goes into the background |

- **Safety:** the save schema is versioned with migrations. Saves are written to a temporary file and then swapped in, and one backup is kept.
- **Cloud sync:** Steam Cloud and Google Play saved games, each per platform (see 8.1).
- **Suspend saves** are deleted when the run resumes, so players can't save-scum.

### 10.4 Performance budgets

| Budget | PC | Android (minimum spec) |
| --- | --- | --- |
| Frame rate | 60 fps locked; unlocked option for high-refresh monitors | 60 fps, no drops below 55 fps in 30-minute sustained thermal tests |
| Minimum hardware | Integrated graphics (Intel Iris Xe class), 8 GB RAM, Windows 10/11 64-bit | 2020 mid-range chipset, 4 GB RAM, Android 10+, 64-bit ARM |
| Active enemies per room | 12 | 8 |
| Draw calls | No hard cap; profile | 150 or fewer |
| Memory | No hard cap; profile | 1.5 GB or less |
| Dynamic 2D lights per room | 8 | 4, with a reduced-lights mode |

- **Steam Deck:** target Deck Verified, running at a native 1280 × 800 at 60 fps (see 9.1). Linux runs through Proton, with no native Linux build. macOS is out of scope.
- **Android requirements:**
  - Respect safe areas on notched screens; support aspect ratios from 16:9 to 21:9.
  - Ship as an AAB, meeting Google Play's current target API level at submission.
  - Gamepad support for Bluetooth and USB controllers.

### 10.5 Online services

- **Daily run:** generated on the device from a date-based seed (see 4.6).
- **Leaderboards on Steam:** submitted through a small validation service. It checks the seed, the run duration and the event checksum, then writes to a trusted Steam leaderboard through the Steam Web API.
- **Leaderboards on Android:** client submissions to Play Games, with score-range limits. **Accept a higher cheating risk on Android** rather than building a custom backend for it.
- **Telemetry:** opt-in only (UK GDPR), covering run outcomes and deaths by floor for balancing. Requires a privacy policy and the Google Play Data safety form.
- **Crash reporting:** an integrated crash reporter on both platforms.

### 10.6 Tooling, QA and builds

- **Debug console:** spawn, give items, jump to a floor, toggle god mode, replay a seed.
- **Generator soak test:** generate 10,000 or more floors offline and run them through the 4.4 validator. Zero softlocks is a release gate.
- **Source control:** Git with LFS, or Unity Version Control.
- **Continuous integration:** builds for Windows and Android on every merge to the main branch (for example, GameCI or Unity Build Automation).
- **Test devices:** a physical device matrix with a minimum of 3 Android phones covering the minimum spec, a mid-range phone and a flagship, plus a Steam Deck.

## 11. Production plan (locked v1.0, funding open)

The deliverable is the full game, built by a small in-house team. The plan runs through internal gates (prototype, vertical slice, alpha, beta), because they are how a full game gets built safely, not an alternative to building it. Each gate is a go/no-go decision. The total is about 30 months, and every duration and cost here is an approximate planning estimate, not a quote.

### 11.1 Milestones

| Milestone | Duration (approx.) | Exit criteria (gate) |
| --- | --- | --- |
| M0 Pre-production | 2 months | Company and IP set up; patent freedom-to-operate opinion received (5.6); title and trademark cleared; art bible and tech spike done; funding route confirmed |
| M1 Greybox prototype | 3 months | Combat, Grab, Rage and room-lock playable in grey boxes. 2 floors plus the Facilities Manager. **Fun gate:** blind playtesters choose to replay |
| M2 Vertical slice | 4 months | Act 1 at final quality: 5 floors, Act 1 roster, boss, 3 Benefit departments, hub, PC and Android builds at 60 fps. This is the pitch and marketing asset |
| M3 Alpha | 9 months | All 4 acts and all systems in, at greybox-plus quality: Promotion (if cleared), daily run, Performance Review, economy |
| M4 Beta / content complete | 8 months | All content at final quality; Steam Next Fest demo; Android demo; balancing using telemetry; localisation-ready |
| M5 Release candidate | 3 months | Zero known softlocks (10.6), performance budgets met (10.4), store certification, IARC and Steam content surveys, Deck Verified submission |
| Launch | — | Steam and Google Play together; post-launch patch cadence planned |

### 11.2 In-house team

| Role | Count | Notes |
| --- | --- | --- |
| Lead gameplay programmer (Unity) | 1 | Combat, AI, bosses |
| Systems and tools programmer | 1 | Procedural generation, saves, data pipeline, online, platform SDKs |
| Pixel artist and animator | 2 | **Animation is the critical path:** modular layers, executions, 4 bosses |
| Game designer and producer | 1 | Owns this spec, balancing data, schedule and gates. Must be full-time (see 11.4) |
| Outsourced | — | Composer, sound designer, voice actors, QA test pass, legal (patent and trademark), localisation (post-launch) |

### 11.3 Budget (approximate)

Five salaried UK staff at about £35k–£55k each, plus employer on-costs (employer National Insurance, pension auto-enrolment; check current HMRC rates), comes to roughly £250k–£350k per year. Over about 30 months, with equipment, software, outsourcing, legal and marketing on top, the plausible total is **£700k–£1.1M**. This is a rough planning range to be replaced by a bottom-up budget in M0.

### 11.4 Open items and next steps

In priority order:

- [ ] **Funding route (open).** Options to evaluate: self-funding, a publisher deal (usually needs the M2 slice), UK Games Fund rounds, and the Video Games Expenditure Credit (claimed by a UK company on qualifying UK spend; check eligibility and the BFI cultural test). The decision is needed before any hiring.
- [ ] **Patent freedom-to-operate opinion** on the Promotion system (5.6), before any Promotion code is written.
- [ ] **Title and trademark search** on the shortlisted titles.
- [ ] **Company and IP structure:** employment contracts with IP assignment, and contractor agreements with IP assignment.
- [ ] **Designer-producer capacity:** decide who fills the full-time designer and producer role.
- [ ] **Act 3 boss:** keep the Head of Compliance, or swap in the Chief People Officer as HR's figurehead (6.4).

## Decision log and risks

### Decision log

| # | Decision | Chosen | Rejected alternatives |
| --- | --- | --- | --- |
| D1 | Perspective | Top-down 2D action | 3D action; turn-based tactical |
| D2 | Tone | Corporate satire plus surreal dark comedy, 18+ | Grounded and gritty |
| D3 | Premise | The CEO orders mandatory HR training that indoctrinates staff | AI hivemind (SYNERGY) |
| D4 | Content | Gore, profanity, drug and alcohol flavour, non-explicit innuendo | — |
| D5 | Platforms | PC and Android; controller, keyboard and mouse, touch | Controller-only Android |
| D6 | Combat | Hybrid melee and ranged plus Rage | Melee-only; twin-stick shooter |
| D7 | Health | HP plus Wellbeing shield | One-hit deaths |
| D8 | Weapons | Breakable | Permanent |
| D9 | Run length | 20 floors (4 acts × 5) | 12 or 15 floors |
| D10 | Lift | Skip a floor, with ambush risk | Pure skip; random destination |
| D11 | Exits | Rewards previewed | Blind choice |
| D12 | Floor structure | Room-lock multi-room plus Alarm floors | Single arena; free-roam |
| D13 | Seeds | Shareable seeds plus a daily run at launch, with platform-native leaderboards | Daily run after launch; hidden seeds |
| D14 | Destruction | Combat-relevant, with Grab, environmental executions and wall breaching | Cosmetic only; full physics |
| D15 | Enemy art direction | Satirical corporate stereotypes, never grotesque | Body-horror escalation |
| D16 | Enemy generation | 20 archetypes; individuals procedurally generated from modular asset kits; seniority tiers | Fixed hand-made enemies; trained variants |
| D17 | Weapon drops | Enemies drop their weapons | Environment-only weapons |
| D18 | Promotion | Full persistent system, subject to a patent freedom-to-operate check; light version as fallback | Post-launch or none |
| D19 | Boss variety | 4 fixed bosses plus optional Director bosses | Randomised pool of 8 |
| D20 | Final boss | CEO | Chief People Officer; CPO with a CEO twist |
| D21 | Boss phases | 3 phases each, with an arena change per phase (Directors have 2) | 2 phases; scaling phase counts |
| D22 | In-run upgrades | Department Benefits (pick 1 of 3) plus rare Desk Items | Benefits only; items only |
| D23 | Meta-progression | Unlocks only (pool content and starting roles); no permanent stats | Capped stats; large permanent stats |
| D24 | Post-win difficulty | Stackable Performance Review modifiers with cosmetic rewards | Fixed difficulty levels |
| D25 | Business model | Premium on Steam; free Act 1 on Android with a one-time unlock; no ads or loot boxes | Premium on both; free-to-play with cosmetics |
| D26 | Currencies | Petty Cash (in-run) plus Annual Leave (meta) | Single currency; three currencies |
| D27 | Death penalty | All Annual Leave kept on death | Partial loss; banking at checkpoints |
| D28 | Art style | Hi-bit pixel art, 640 × 360 internal resolution | Low-res retro pixel; hand-drawn 2D |
| D29 | Music | Adaptive score: muzak in exploration, house or techno in combat | Synthwave; orchestral parody |
| D30 | UI style | Invented corporate-software parody ("CorpOS") | Clean minimal UI |
| D31 | Engine | Unity LTS (URP 2D) | Godot 4; GameMaker |
| D32 | Android minimum spec | 2020 mid-range, 4 GB RAM, Android 10+ | 2018 budget; flagship-only |
| D33 | Frame rate | 60 fps on PC and Android | 30 fps on Android; high-refresh-first |
| D34 | Team model | Small in-house team (5 core) plus outsourced audio, legal and QA | Contractors; an indie studio end-to-end |
| D35 | Deliverable | Full game, with internal go/no-go gates (prototype, slice, alpha, beta) | Slice-only first deliverable |
| D36 | Funding | **Open**; must be decided before any hiring | — |

### Risk register

| Risk | Impact | Mitigation |
| --- | --- | --- |
| In-house payroll with funding undecided | Cash runs out mid-production; redundancies | No hires until funding covers at least M0–M2 plus 6 months' contingency; gates are go/no-go points for spend |
| Building the full game before proving the fun | The most expensive possible way to discover the core loop doesn't work | M1 fun gate and M2 slice gate are mandatory go/no-go decisions; budget is released per milestone |
| Designer-producer capacity | A part-time lead stalls a full-time team | Full-time designer and producer in place before hiring the team |
| WB Games Nemesis patent (US, expires August 2036) | Infringement claim, forced removal, damages | Freedom-to-operate opinion from a patent attorney in M0; design-around (no NPC hierarchy, followers or forts); light-version fallback |
| Workplace-violence optics | Store, press and streamer friction | Enemies attack first; visibly unreal indoctrination; satirical escalation; gore toggle |
| Scope: 4 acts, 4 bosses, procedural generation, 3 input methods, daily run, Promotion | Schedule overrun | Milestone gates; animation as the tracked critical path; data-driven content |
| Modular sprite layering | Animation cost multiplies with every layer | 2 base rigs with shared animations; 6 layers maximum; runtime atlas baking |
| Daily run at launch | Backend, anti-cheat and live-ops cost from day one | Platform-native leaderboards; Steam validation service only; Android accepts a higher cheating risk |
| Promotion breaking seed determinism | Unfair or irreproducible seeded runs | Promotion disabled in daily and seed-entered runs |
| 50–60 minute runs | Mobile session fatigue; churn | Mandatory suspend saves between floors |
| Rage too strong | Degenerate "wait for Rage" play | No stockpiling; decays outside combat |
| Execution cutscenes interrupt flow | Pacing drag on repeat runs | 1–1.5 second cap; Always, First time only or Off setting |
| Breaching enables exploits or softlocks | Broken floors | Breachable-wall flags; validator caps merges at two rooms; 10,000-floor soak test |
| Android performance | Frame drops; poor reviews | Budgets in 10.4; render-texture decals; device matrix testing |
| Low Android conversion | Weak mobile revenue | Treat PC as the primary revenue platform; Android as reach |
| Title collision | Rebrand cost | Steam, Play and trademark check in M0 |
| Saturated genre | Low visibility | Lead marketing with route choice, Rage, executions and Promotion; Steam Next Fest demo |
