# Company Policy: Compliance Traceability Matrix

Audit of `/home/user/Office_Game` against `docs/SPEC.md` (v1.0, 5 Oct 2026), read with `docs/DEV_BRIEF.md` (approved engine deviation: TypeScript + Canvas2D, Electron and Capacitor, instead of Unity). Audited at commit `a2f181a` ("Softlock guard"). Evidence is from reading the implementing code; `npx tsc --noEmit` and `npm run soak` were re-run on this commit.

**Verification run on this commit**

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | Clean (exit 0) |
| `npm run soak` (10,000 floors, all floor types, themes, wings, both platforms, alarm and Hot Desking permutations) | PASSED: 0 failures, 0 softlocks; 638 floors needed `seed+1` regeneration (max 6 attempts); 104/104 determinism re-generations identical; library 170 authored templates (30 shared, 10 per department) |

**Status key:** ✅ Implemented, ⚠️ Partial, ❌ Missing, 🚫 Out of scope or blocked by an external dependency (Steam App ID, Play Billing, patent opinion, voice actors, device lab, legal). "Static" means verified by reading code, not by a play-through.

# Executive summary

Company Policy is a near-complete implementation of the specification: **363 of 452 traceable requirements (80%) are fully implemented**, 50 are partial, 6 are missing and 33 are blocked by external dependencies. Typecheck is clean and the 10,000-floor generator soak passes with zero softlocks, so the release gate in 10.6 is met on this commit. Every gameplay system in sections 2 to 7 (combat, Rage, exits, procedural generation, hazards, executions, breaching, 20 enemy archetypes, 4 three-phase bosses, Benefits, Desk Items, hub, roles, daily run) is in and verified in code. The remaining work is concentrated in four areas: the business model (Android and Steam demo gating), one dead Performance Review modifier, platform services (all stubs), and performance and process evidence that needs real devices.

| Section | Rows | ✅ | ⚠️ | ❌ | 🚫 |
| --- | --- | --- | --- | --- | --- |
| 1. Pillars, premise, tone | 23 | 20 | 2 | 0 | 1 |
| 2. Core combat and controls | 35 | 33 | 2 | 0 | 0 |
| 3. Run structure and exits | 35 | 33 | 2 | 0 | 0 |
| 4. Procedural generation | 55 | 50 | 4 | 0 | 1 |
| 5. Enemies and Promotion | 65 | 56 | 3 | 0 | 6 |
| 6. Bosses | 25 | 22 | 1 | 0 | 2 |
| 7. Player progression | 41 | 37 | 2 | 1 | 1 |
| 8. Economy and business model | 23 | 17 | 2 | 3 | 1 |
| 9. Art, UI and audio | 34 | 28 | 5 | 0 | 1 |
| 10. Technical | 47 | 25 | 15 | 0 | 7 |
| 11. Production plan | 9 | 1 | 2 | 1 | 5 |
| Decision log D1-D36 | 36 | 27 | 6 | 0 | 3 |
| Risk register | 17 | 8 | 3 | 1 | 5 |
| DEV_BRIEF rules | 7 | 6 | 1 | 0 | 0 |
| **Total** | **452** | **363** | **50** | **6** | **33** |

Rows are individual testable requirements extracted from SPEC sections 1.1-11.4, decisions D1-D36, the risk register and the DEV_BRIEF hard rules. 🚫 rows are not defects: they are Steam App ID or SDK work, Play Billing, the patent freedom-to-operate opinion (code for full Promotion is complete behind `PROMOTION_MODE = 'light'`), voice actors, device lab testing, and business or legal items.

## Gap list (every ⚠️ and ❌, prioritised)

Effort: S = under a day, M = a few days, L = a week or more.

### P1: functional gaps that change what ships

| # | Rows | Gap | Suggested fix | Effort |
| --- | --- | --- | --- | --- |
| 1 | 7.4-11, D24 | **Quarterly Targets modifier does nothing.** It appears in the Performance Review UI, costs KPI and is selectable, but no code reads `run.modifiers.quarterly_targets`. | `scenes/gameplay.ts` `update()`: read the rank, start a per-floor timer (for example 150, 120 or 90 s by rank, tuned from `plan.enemy_budget`), and on expiry queue reinforcements via `populateFloor`-style `SpawnQueues` pushes; show a HUD strip like `content/challenge.ts` `hudStrip`. Add timer text to `data/csv/modifiers.csv`. | M |
| 2 | 8.1-2, 8.1-3, 8.1-4, D25, 11.1-5 | **No Android demo gating or paywall.** `isFullGameUnlocked()` is stubbed true and never consulted, so the free build is the full game. | Add a `DEMO` build flag and read `getPlatform().iap.isFullGameUnlocked()` in `gameplay.ts` `depart()` and `rollExits()`: when locked, the Act 1 boss clear ends the run with an "Unlock the full game" CorpOS page that calls `iap.purchase()`; hide Daily Run and Performance Review in `scenes/menu.ts` and `meta/ui/clockin.ts` while locked. Profile is shared so progress carries over. | M |
| 3 | 8.1-1, R17 | **No Steam free Act 1 demo build.** | Reuse the gating in #2 behind `VITE_DEMO=1`; add a `dist:demo` script and a CI artefact. App ID and depot setup remain 🚫. | S (after #2) |
| 4 | 2.6-5 | **`holdToTap` accessibility toggle is dead.** It is listed twice in `scenes/settings.ts:228,258` but never read. | In `player.ts` `handleActions` treat `holdToTap` as `heavyMode = 'button'` plus latch laser pointer fire on press; in `ui/touch.ts` make the right-stick shot fire on tap (aim-assist target) when set. | S |
| 5 | 4.8-1, 10.4-4 | **Summons and boss adds bypass the per-room active cap.** | `enemies/common.ts:499` `summon()` and `bosses/boss.ts:252` `spawnAdd()` should refuse (or queue) when `world.liveEnemies(room) >= MAX_ACTIVE_ENEMIES`. | S |
| 6 | 10.6-3 | **Soak is not a CI gate** though 10.6 makes zero softlocks a release gate; `tsc` is marked non-blocking. | `.github/workflows/build.yml`: add a blocking `npm run soak` job and make the typecheck step blocking. | S |

### P2: spec deviations that are cheap to close

| # | Rows | Gap | Suggested fix | Effort |
| --- | --- | --- | --- | --- |
| 7 | 4.8-2, 9.1-11 | Decal cap drops the oldest 25% abruptly instead of fading oldest first. | `fx.ts:159-168` `Decals.add`: store a timestamp per record, fade (alpha ramp over about 1 s) the oldest N before pruning, redraw the room canvas on a timer. | S |
| 8 | 4.7-16 | Breach debris stuns only enemies within 90 px of the impact; spec says any enemies in the adjacent room. | `world.ts:485-489`: stun every living enemy in `target.enemies` (scale by `breachStunMult`). | S |
| 9 | 5.5-4 | Rooms can hold a single enemy on low floor budgets, so the "at least 2 roles" rule is not guaranteed. | `spawner.ts` `populateFloor`: enforce a minimum share of 2 swarm-plus-other points per combat room, or reduce the number of populated rooms on floors with budget under about 20. | S |
| 10 | 6.1-2 | CEO phase transitions run 3.4 s and 3.6 s; spec caps at 3 s. | `bosses/ceo.ts:428,456`: reduce `dur` to 3.0 and compress the camera key times. | S |
| 11 | 2.2-5 | Rage has no unique execution animations. | `hazards/executions.ts` `Kit`: when `player.raging > 0` add a red-tint puppet, extra `bang` caption and +gore; optionally a Rage-only caption set. | M |
| 12 | 10.2-5, DB-4 | `Math.random()` in cosmetic paths (`pickups.ts:98,106,164`, `projectile.ts:99`, `renderer.ts:117`). | Replace with `fxRng`; no seed impact today but it breaks `DEV_BRIEF` rule 4 and replay tools. | S |
| 13 | 10.6-1 | No in-game debug console (spawn, give items, god mode, replay seed); only `#play&seed&floor&type&role`, `window.__cp` and dev galleries. | New `scenes/dev/console.ts` (dev builds only) bound to the `debug` action (backquote): commands `spawn`, `give benefit|desk|weapon`, `floor N`, `god`, `seed CODE`. | M |
| 14 | 10.3-4 | Save migrations: hook exists but none registered; schema is v1. | Add a `migrations` map for `profile` and `run` as soon as the schema changes; add a unit test that loads a v0 fixture. | S |

### P3: data, localisation and engineering debt

| # | Rows | Gap | Suggested fix | Effort |
| --- | --- | --- | --- | --- |
| 15 | 10.2-1, 8.4-5, R6 | Benefits (112) and Desk Items (40) are TypeScript, not spreadsheet CSV. | Export numeric tuning (`v: [...]` rarity values, tiers, prices) to `data/csv/benefits.csv` and `deskitems.csv`; keep behaviour in code and key by id. | L |
| 16 | 10.1-7 | No localisation layer; many UI and content strings are inline. | Introduce `t(key)` with `en-GB` table; migrate `data/text/*` first, then `scenes/*` and `content/*` literals. | L |
| 17 | 10.2-6 | No entity pooling (only particles are capped and recycled). | Profile first (`scratch/bench*.ts`); pool `Projectile` and `Pickup` if GC spikes appear on the Android device. | M |
| 18 | 9.2-12 | Single bitmap font and two UI scale steps; no separate clean body face. | Add a 1.5x scale and a higher-legibility body glyph set (`render/font.ts`) for mobile body text. | M |
| 19 | 9.3-10 | Visual audio cues cover a subset (`engine.ts:15` `CUE_SFX`) and are off by default. | Audit every audio-only cue against `CUE_SFX`; default `visualAudioCues` on for touch and when subtitles are on. | S |
| 20 | 9.1-6 | The 6-layer cap is not asserted. | Add a dev assertion in `art/chars/bake.ts` counting composited layers. | S |
| 21 | 5.6-10 | Light-mode Termination lacks trophy and unique termination cutscene (full-mode features). | None required while light ships; revisit with the FTO decision. | n/a |

### P4: verification evidence needed (no code change expected)

| # | Rows | Gap | Action | Effort |
| --- | --- | --- | --- | --- |
| 22 | 3.6-1, 3.6-2, 7.3-12, 7.3-13, 8.2-7 | Pacing, unlock rate and Act 1 forgiveness are unmeasured. | Run `tools/bot.mjs` for 50 full runs per role and log time per floor, deaths by floor and Annual Leave per run; compare with the 2-3 min, 50-60 min and 10-20 h targets. | M |
| 23 | 10.0-1, 10.4-3, 10.4-5, 11.1-3, D32, D33, R14 | 60 fps, memory and thermal behaviour unverified on Android hardware. | Device matrix pass (3 phones) with `showFps`; record frame time and heap in a 30-minute soak. | M |
| 24 | 1.6-2, 10.1-3, 10.4-7 | Steam Deck and Steam Input untested. | Run the AppImage on a Deck, test Steam Input templates, then submit for Verified. | S |
| 25 | 4.6-5, 10.5-3, 1.6-4, R8, D13, 5.6-12 | Leaderboards, anti-cheat validation service and cloud sync are stubs. | Needs Steam App ID, Steamworks bridge in `electron/preload.cjs`, a small validation service, and the Play Games plugin; the `services.ts` plug-in points are ready (🚫 external). | L |
| 26 | 10.5-5 | Hosted privacy policy and Play Data safety form missing. | Draft from `scenes/settings.ts:296-303` text. | S |
| 27 | 11.1-4, D19 | Alpha scope note: Directors are built but disabled in light mode. | No action; resolved by the patent decision. | n/a |
| 28 | 9.3-6 | Score is procedural synthesis rather than a commissioned composer with stems (allowed by DEV_BRIEF rule 1). | No action unless the producer wants commissioned audio. | n/a |
| 29 | 10.3-8 | Advisory: `Save & Quit` can recreate a floor-start suspend save on each resume, weakening the anti-save-scum intent of 10.3. | Optionally mark a resumed run `resumed=true` and refuse a second suspend until the next floor transition. | S |

## Exceeds spec (summary)

See section 5 for details: 112 Benefits against about 92, 170 templates against about 150, extra challenge floor, extended validator and runtime softlock guard, heavy-attack binding, a wide accessibility set (Rage auto-trigger, UI scale, subtitle size, visual cues, touch layout, shake intensity), checksummed saves with automatic backup fall-back, six QA harnesses, a Linux AppImage CI job with smoke test, and a roughly 70-entry achievement system.


---

# 1. Matrix

Engine-substitution note: spec rows that name Unity packages (10.1) are assessed against the approved TypeScript equivalent; they are not counted as gaps merely for being non-Unity.

## 1. Pillars, premise and tone

| ID | Requirement | Status | Evidence | Note |
| --- | --- | --- | --- | --- |
| 1.1-1 | Opening sequence: HR training, player objects, floor turns violent, player snaps | ✅ | `scenes/intro.ts:1-3,33` | Meeting-room scene with dialogue choices ("every option is a flavour of No"), skippable, plays on first run (`meta/runs.ts:130`) |
| 1.1-2 | Framing rule 1: employees attack first (rage is retaliation) | ✅ | `scenes/intro.ts` phases `turn`, `attack`, `snap` | Attack precedes the snap |
| 1.1-3 | Framing rule 2: glowing lanyards, unison chanting, fixed HR smiles | ✅ | `art/chars/colours.ts:77` (indoctrination glow per act); `enemies/common.ts:816` (room-wide unison chants from Act 2); intro comments | Glow colour never uses TELEGRAPH |
| 1.1-4 | Framing rule 3: absurdity escalates by act to a full cult | ✅ | `enemy.ts:160` (`withAct`), `gen` Act 4 cult dressing (`gameplay.ts:136`), `art/env/skin.ts` | Banners, shrines, candles, ceremonial lanyards |
| 1.2-1 | Pillar 1: fast, readable combat; gore never obscures telegraphs | ✅ | `world.ts:725-776` (decals below actors, telegraph fill below and outline re-drawn on top) | Static |
| 1.2-2 | Pillar 2: every floor is a decision (route choice) | ✅ | `run.ts:182-222`, `gameplay.ts:212-239` | See section 3 |
| 1.2-3 | Pillar 3: the office is a weapon | ✅ | `hazards/hazards.ts`, `hazards/executions.ts` | See 4.5 and 4.7 |
| 1.2-4 | Pillar 4: satire from the system (jargon, KPIs) | ✅ | `data/text/*` (barks, memos, events, announcements), CorpOS UI | Tone review is a writing task, not code |
| 1.3-1 | Stylised pixel gore: dismemberment, persistent decals, per-enemy death animations | ✅ | `enemy.ts:464-495`, `fx.ts:130-218`, `deathAnim` pool death1-3 | |
| 1.3-2 | Act escalation: Act 1 mild to Act 4 temple of values | ✅ | `art/palette.ts:27-32`, `gen/themes.ts`, `data/text/announcements.ts` | |
| 1.3-3 | Enemies remain recognisable corporate stereotypes, never grotesque | ✅ | 20 archetype kits `art/chars/kits.ts` | Content review |
| 1.3-4 | Gore toggle Full / Reduced / Off | ✅ | `core/settings.ts:155`, `fx.ts:222-239` (Off: paper confetti; Reduced: 40% particles; gibs only at Full), `enemy.ts:472-473`, `scenes/settings.ts:263` | Execution gibs also gated (`fx.ts:242`) |
| 1.4-1 | 18+ scope: profanity, dark humour | ✅ | `data/text/*`, `scenes/menu.ts` terms | |
| 1.4-2 | No gameplay benefit from drug use | ✅ | `data/deskitems.ts` (caffeine/fictional only), `pickups.ts:155` espresso | Spot-checked all 40 Desk Items |
| 1.4-3 | No explicit sexual content | ✅ | Text review of `data/text/*` | Static and non-exhaustive; recommend a writer sign-off pass |
| 1.5-1 | PEGI 18 / ESRB M expected ratings; IARC and Steam content surveys | 🚫 | None (store process) | M5 gate; needs store accounts |
| 1.5-2 | USK: no real-world extremist symbols | ✅ | Art and text reviewed by grep; none present | `DEV_BRIEF` rule 5 |
| 1.5-3 | Australia: consumables caffeine or fictional only | ✅ | `pickups.ts:155`, `deskitems.ts` | |
| 1.6-1 | Platforms: PC (Steam primary) and Android | ✅ | `electron/main.cjs`, `capacitor.config.ts`, `.github/workflows/build.yml` (Win NSIS+portable, Linux AppImage, Android APK+AAB) | |
| 1.6-2 | Steam Deck Verified target | ⚠️ | `renderer.ts:44-65` (1280x800 gives 640x400, 16:10), AppImage job | Verification submission is outside code; no Deck hardware test recorded |
| 1.6-3 | Full controller support, KBM on PC, touch twin-stick on Android | ✅ | `core/input.ts`, `ui/touch.ts` | |
| 1.6-4 | Daily seeded run with platform-native leaderboards | ⚠️ | `meta/runs.ts:38-43`, `platform/services.ts:214-294` | Daily logic complete; Steam and Play Games are stubs that fall back to local boards (see 4.6, 10.5) |
| 1.7-1 | Out of scope: multiplayer, unified boards, story mode, iOS, console | ✅ | None implemented | Correctly absent |

## 2. Core combat and controls

| ID | Requirement | Status | Evidence | Note |
| --- | --- | --- | --- | --- |
| 2.1-1 | Move 8-directional, analogue on sticks | ✅ | `core/input.ts:197-217`, `player.ts:184-198` | Deadzone 0.22 with scaled magnitude |
| 2.1-2 | Melee light and heavy, combo string up to 3 hits | ✅ | `player.ts:351-376` (`combo % 3`, third hit x1.35), charge-heavy `player.ts:285-299` | |
| 2.1-3 | Ranged fire / throw held item | ✅ | `player.ts:495-563` | Laser pointer continuous beam, confetti spread |
| 2.1-4 | Grab: staggered or <25% HP enemy; throw, projectile, breach, execute | ✅ | `executions.ts:36-42` (`canGrab`), `player.ts:605-657`, `enemy.ts:374-436` | Threshold from `stats.grabThreshold` (0.25) |
| 2.1-5 | Dash: i-frames, passes through enemies, charge-based cooldown | ✅ | `player.ts:332-346` (`ghost`, `invuln` 0.22), charges `player.ts:138`, `stats.ts:53` | 2 charges, 1.15 s each |
| 2.1-6 | Rage activated when meter full | ✅ | `player.ts:266,671-689` | |
| 2.1-7 | Interact: pickups, environmental kills, exits | ✅ | `player.ts:732-746` | |
| 2.2-1 | Rage fills from damage taken | ✅ | `player.ts:787` | |
| 2.2-2 | Rage fills from kills | ✅ | `gameplay.ts:258` (+6) | |
| 2.2-3 | Rage fills from hearing HR jargon barks | ✅ | `enemy.ts:363-371` (within 200 px, `barkRage`) | Speakerphone quirk doubles it |
| 2.2-4 | Rage effect: time-limited berserk, more damage, damage resistance | ✅ | `player.ts:436,769`, `stats.ts:56` (7 s, x1.6, 40% resist) | |
| 2.2-5 | Unique execution animations in Rage | ⚠️ | `executions.ts`, `hazards/executions.ts` | Executions are the same in and out of Rage; Rage adds speed, throw force and dismember chance only. Suggest a Rage variant caption or animation set |
| 2.2-6 | Rage cannot be stockpiled between floors | ✅ | `gameplay.ts:170`, `persistPlayer` `gameplay.ts:386` | `p.rage = 0` every floor start |
| 2.2-7 | Rage decays outside combat | ✅ | `player.ts:149-156` (12/s after 2 s out of combat) | |
| 2.2-8 | Build axis: duration, on-activate effects, heal on kill | ✅ | `stats.ts:26,43-44`, `content/benefits-biz.ts` (11 `stress_*` Benefits), `rageKillHeal` | |
| 2.3-1 | HP restored only by healing items, stair landings, shops | ✅ | `pickups.ts:154`, `gameplay.ts:361-366`, `content/shop.ts:204` | Also benefit heals (spec 7.1 HR) |
| 2.3-2 | Wellbeing shield regenerates after a short period without damage | ✅ | `player.ts:140-146,779` (3 s delay, 14/s) | |
| 2.3-3 | Shield absorbs damage before HP | ✅ | `combat.ts:216-222` | |
| 2.4-1 | Blunt class: stagger and knockback | ✅ | `data/csv/weapons.csv` (keyboard, laptop, fire extinguisher...) | |
| 2.4-2 | Sharp class: bleed and dismemberment | ✅ | `weapons.csv` bleed and dismember columns; `combat.ts:245-249` | Guillotine blade, letter opener, broken glass present |
| 2.4-3 | Ranged class with limited ammunition | ✅ | `weapons.csv` (stapler, nail gun, calculator...), `player.ts:499,519` | |
| 2.4-4 | Throwable class: one-shot, high stagger | ✅ | `weapons.csv` durability 1, `player.ts:542-563` | Mug, monitor, potted plant |
| 2.4-5 | Every weapon breaks after N hits (per weapon) | ✅ | `weapons.csv` durability, `player.ts:456-472` | Heavy costs 2 |
| 2.4-6 | Loadout: one melee, one ranged, one thrown | ✅ | `run.ts:60`, `weapons.ts:16-19`, `player.ts:749-755` | |
| 2.5-1 | Control map, controller (X, RT, B, A, LB+RB, Y) | ✅ | `core/input.ts:16-35` (pad 2, 7, 1, 0, 4+5, 3) | Heavy attack bound separately (extra) |
| 2.5-2 | Control map, keyboard and mouse (LMB, RMB, F, Space, R, E, WASD) | ✅ | `core/input.ts:16-39` | |
| 2.5-3 | Touch: left stick, right stick with aim assist, buttons, contextual grab and interact | ✅ | `ui/touch.ts`, `gameplay.ts:443` (`grab`, `interact` context) | |
| 2.5-4 | Touch: Rage button pulses when ready | ✅ | `ui/touch.ts:16,42,270-303` (`rageReady` context, pulse state) | Static |
| 2.5-5 | Touch: ranged is right-stick hold and release | ✅ | `ui/touch.ts:148` (aim hold frames while shot pulses) | |
| 2.6-1 | Full input remapping | ✅ | `scenes/settings.ts:228-245`, `core/input.ts:239-248` | Keys, mouse, pad, move keys; reset button |
| 2.6-2 | Adjustable aim-assist strength, mandatory on touch | ✅ | `scenes/settings.ts:245` (touch min 0.2), pad slider; `gameplay.ts:127` | |
| 2.6-3 | Screen-shake toggle | ✅ | `settings.ts:258` (toggle plus intensity), `renderer.ts:105-109` | |
| 2.6-4 | Colourblind-safe telegraph palette | ✅ | `art/palette.ts:7-16`, `combat.ts:166-201` (dashed hatch edge), preview `settings.ts:72-100` | |
| 2.6-5 | Hold-to-tap alternatives | ⚠️ | `settings.ts:227-228,258` | "Heavy attack: separate button" works (`player.ts:278`, `touch.ts:184`), but the `holdToTap` toggle is exposed twice and read nowhere in gameplay (dead setting); laser pointer and touch right-stick still need holds |
| 2.6-6 | Gore toggle | ✅ | See 1.3-4 | |

## 3. Run structure and floor transitions

| ID | Requirement | Status | Evidence | Note |
| --- | --- | --- | --- | --- |
| 3.0-1 | 20 floors: 4 acts x 5, 4 combat/event floors then a boss | ✅ | `data/tables.ts:89-91`, `csv/floors.csv` | Boss floors 5, 10, 15, 20 |
| 3.1-1 | Act department pools (Reception/Post Room/Facilities/IT; Sales/Marketing/Customer Service; Finance/Legal/Compliance/Procurement; HR HQ/Executive/Boardroom) | ✅ | `data/ids.ts:6-11` | |
| 3.1-2 | Bosses per act: Facilities Manager, Head of Sales, Head of Compliance, CEO | ✅ | `game/bosses/*.ts` | |
| 3.2-1 | Floor cleared when every enemy defeated | ✅ | `world.ts:458-465` | |
| 3.2-2 | Exits stay locked until clear | ✅ | `gameplay.ts:234` (`enabled: w.floorCleared`) | |
| 3.2-3 | Challenge floors may vary the rule | ✅ | `content/challenge.ts:46-130` | Fire Drill, Quiet Carriage, No-Damage |
| 3.3-1 | Stairs: next floor, small heal on landing | ✅ | `gameplay.ts:361-367` (12% max HP) | |
| 3.3-2 | Lift: skip a floor (+2) | ✅ | `run.ts:200-201`, `gameplay.ts:368-378` | |
| 3.3-3 | Lift: lose skipped floor's reward, arrive under-levelled | ✅ | Difficulty by floor number `run.ts:172`, `data/tables.ts:92` | Emergent |
| 3.3-4 | Lift: about 25% lift-ambush chance | ✅ | `csv/floors.csv` 0.25, `gameplay.ts:369-371` | Visitor Pass halves it |
| 3.3-5 | Lift ambush: tight arena, bonus reward | ✅ | `gen/arena.ts` (`buildLiftAmbush`), `gameplay.ts:296-302` | Cash plus weapon, then continue to destination |
| 3.3-6 | Corridor: lateral move to adjacent wing at the same floor number | ✅ | `run.ts:202-211`, `gameplay.ts:201` ("WEST WING") | |
| 3.3-7 | Corridor reward: shop, event, treasure or challenge | ✅ | `run.ts:205-208` (40/30/12/18%) | |
| 3.3-8 | Corridor: no upward progress | ✅ | `run.ts:209` (same floor number) | |
| 3.3-9 | Game rolls 2-3 of the three exits per floor | ✅ | `run.ts:213-218` | Stairs always present. Floor 5/10/15 (boss) offer only stairs because lift and corridor are barred after a boss; arguably intended, but contradicts "2-3" literally |
| 3.3-10 | Lift can never skip a boss floor | ✅ | `run.ts:187,200` (`!nextIsBoss`) | |
| 3.3-11 | Corridors limited to 2 per act | ✅ | `run.ts:202` (`corridorsThisAct < 2`), reset on act change `gameplay.ts:355` | |
| 3.3-12 | Corridors never two in a row | ✅ | `run.ts:202` (`!lastWasCorridor && wing === 0`) | |
| 3.3-13 | Every exit shows a reward-preview icon | ✅ | `gameplay.ts:212-229`, `ui/hud.ts:270-285` | Icon plus label plus ELITE/ALARM/dept tag; shown once the floor is cleared and exits unlock; unavailable exits read "OUT OF ORDER" |
| 3.3-14 | Preview categories: weapon/upgrade, currency, healing, Rage modifier, shop/event/elite marker | ✅ | `gameplay.ts:502-507` (`rewardIcon`) | |
| 3.4-1 | Standard floor: clear every enemy, via stairs | ✅ | `gameplay.ts:187` | |
| 3.4-2 | Elite floor: fewer enemies, at least one elite, better reward | ✅ | `run.ts:172` (budget x0.8), `spawner.ts:107-109`, `rewards.ts:18-65` | |
| 3.4-3 | Shop floor: Canteen via corridor | ✅ | `content/shop.ts:221-232` | |
| 3.4-4 | Treasure floor: Stationery Cupboard, guaranteed upgrade, no combat, rare | ✅ | `content/treasure.ts`, 12% of corridor rolls | |
| 3.4-5 | Event floor: narrative or gamble (photocopier fortune, team-building) | ✅ | `content/events.ts`, `data/text/events.ts` (23 events) | |
| 3.4-6 | Challenge floor: Fire Drill (timed) and Quiet Carriage (no Rage) | ✅ | `content/challenge.ts:68-120` | |
| 3.4-7 | Boss floor fixed at 5, 10, 15, 20 | ✅ | `run.ts:167`, `data/tables.ts:90` | |
| 3.5-1 | Enemy power and density scale with floor number, not rooms visited | ✅ | `data/tables.ts:92`, `enemy.ts:144-149` | |
| 3.5-2 | Enemy pools unlock by act | ✅ | `spawner.ts:42-47` | |
| 3.6-1 | Per-floor target 2-3 min (standard), 4-6 min (boss) | ⚠️ | `floors.csv`, `tools/bot.mjs` | Pacing not measured on this commit; no recorded timing data. Needs a telemetry or bot-run measurement |
| 3.6-2 | Full run 50-60 min | ⚠️ | None | As above; unverified |
| 3.6-3 | Mid-run suspend save between floors, mandatory | ✅ | `gameplay.ts:397`, `core/storage.ts` | |
| 3.6-4 | On death return to the car park hub | ✅ | `gameplay.ts:416-430` | |
| 3.6-5 | After a win: Performance Review modifiers | ✅ | `meta/progression.ts:143-147` | |
| 3.7-1 | Floor data object (floor_number, act, floor_type, department_theme, available_exits, reward_preview, enemy_budget, lift_ambush_chance) | ✅ | `run.ts:12-26` (`FloorPlan`), `ExitOption` `run.ts:29` | Spreadsheet-driven fields in `csv/floors.csv` |

## 4. Procedural generation

| ID | Requirement | Status | Evidence | Note |
| --- | --- | --- | --- | --- |
| 4.1-1 | Floor is 4-7 connected rooms (room-lock multi-room) | ✅ | `gen/rules.ts:7-18` | 4 early, up to 7 in Act 4 |
| 4.1-2 | Doors seal on entry, stay sealed until every enemy in the room is dead | ✅ | `world.ts:412-432,440-452` | |
| 4.1-3 | Floor clear when every room clear | ✅ | `world.ts:458` | |
| 4.1-4 | About 1 in 5 floors is an Alarm floor, all doors open, every enemy hunts | ✅ | `run.ts:169` (`alarmChance` 0.2), `world.ts:419,456`, `spawner.ts:116` | Floor 1 and boss floors excluded |
| 4.2-1 | Fixed building core (lift lobby, stairwell, corridor link) holds the exits | ✅ | `gen/core.ts`, `gen/floorgen.ts:122,375-386`, `validate.ts:209-212` | Validator asserts 3 exits |
| 4.3-1 | Room template library: open-plan, cubicle maze, meeting, kitchen, print, server, manager's office, toilets | ✅ | `gen/templates/*.ts`, `gen/themes.ts` | `RoomKind` set |
| 4.3-2 | Template sizes are multiples of a base unit; door sockets N/E/S/W; placed where sockets match | ✅ | `gen/template.ts` (`CELL`, `socketsFit`), `floorgen.ts:149-157` | |
| 4.3-3 | Department skin variants and Act 4 cult dressing | ✅ | `gen/themes.ts`, `art/env/skin.ts`, `floorgen.ts:375-386,413-415` | |
| 4.3-4 | Content budget about 150 templates (8-12 per department plus about 20 shared) | ✅ | Soak output: 170 authored (140 department, 30 shared), 638 orientations | Exceeds |
| 4.3-5 | Vertical slice about 30 Act 1 templates | ✅ | 40 Act 1 department templates + 30 shared | Exceeds |
| 4.4-1 | Pipeline 1: seed from run seed and floor number | ✅ | `floorgen.ts:47` | |
| 4.4-2 | Pipeline 2: theme from the act pool, no repeats within an act | ✅ | `run.ts:145-151`, `gameplay.ts:355-356,pickTheme` | Resets when pool exhausted (Act 1 has 4 pool entries for 4 non-boss floors, so exact) |
| 4.4-3 | Pipeline 3: critical path of 4-7 plus 0-2 optional side rooms | ✅ | `floorgen.ts:197-240` | |
| 4.4-4 | Pipeline 4: place matching templates | ✅ | `floorgen.ts:249-265` | |
| 4.4-5 | Pipeline 5: apply theme skin, randomise prop variants | ✅ | `floorgen.ts:353,404-420` | |
| 4.4-6 | Pipeline 6: hazards per template slot rules | ✅ | `floorgen.ts:419-430` (entrance exclusion) | |
| 4.4-7 | Pipeline 7: spend the enemy budget across rooms | ✅ | `spawner.ts:96-118` | |
| 4.4-8 | Pipeline 8: place rewards and exit previews | ✅ | `gameplay.ts:211-239`, `computeReward` | |
| 4.4-9 | Pipeline 9: validate; regenerate with seed + 1 on failure | ✅ | `floorgen.ts:46-57,validate.ts` | Reachability, softlocks, critical-path bounds, hazard clusters, 2-tile corridors, spawn points |
| 4.5-1 | Glass partition: shatters on damage or thrown body; cut damage and bleed adjacent | ✅ | `hazards/hazards.ts:69-99` | |
| 4.5-2 | Printer: heavy hit, short fuse, area explosion | ✅ | `hazards.ts:103-176` (1.2 s fuse, telegraphed) | |
| 4.5-3 | Water cooler: hit then electrified by cable or socket; puddle becomes electrified area; stun | ✅ | `hazards.ts:179-230`, `hazards/core.ts` (`electrifyPuddle`, `nearElectric`) | |
| 4.5-4 | Fire extinguisher: burst of knockback plus vision-blocking smoke | ✅ | `hazards.ts:234-269` (blind 2.5 s, cloud) | |
| 4.5-5 | Swivel chair: kick, rolling projectile, knocks enemies down | ✅ | `hazards.ts:273-345` | |
| 4.5-6 | Filing cabinet: heavy hit, topples, crush damage plus new cover line | ✅ | `hazards.ts:420-512` | |
| 4.5-7 | Sprinklers: fire or alarm, room-wide slow, conduct electricity | ✅ | `hazards.ts:517-545`, `hazards/core.ts:206,273-274` | |
| 4.5-8 | Enemies take hazard damage and can be lured | ✅ | `hazards/core.ts` (`hurt`), `enemy.ts:253-255` | |
| 4.6-1 | Every run has a visible seed; shareable and enterable from setup | ✅ | `core/rng.ts:120-145` (8-char code with checksum), `scenes/menu.ts:98-126,225`, `scenes/pause.ts:70`, `meta/ui/clockin.ts:110` | Entry from main menu; shown on pause, summary and clock-in |
| 4.6-2 | Daily run: one global seed per 24 h, 00:00 UTC reset | ✅ | `core/rng.ts:156-161`, `meta/runs.ts:38-43` | |
| 4.6-3 | One scored attempt per player; practice attempts do not count | ✅ | `meta/runs.ts:79,126`, `progression.ts:189` | |
| 4.6-4 | Platform-native leaderboards (Steam, Google Play Games) | 🚫 | `platform/services.ts:214-294` | Interfaces and plug-in points exist; needs Steam App ID, Steamworks and Play Games plugin. Local boards work |
| 4.6-5 | Anti-cheat minimum: seed, duration, checksum of key events; server-side sanity checks | ⚠️ | `run.ts:224-229` (hash chain), `services.ts:57-102` | Client builds and locally validates the submission; the server-side validation service does not exist (🚫 backend), so the checks are not enforced against a hostile client |
| 4.7-1 | Destruction combat-relevant only; scripted states intact, damaged, destroyed | ✅ | `world.ts:516-533`, `hazards/destructibles.ts` | |
| 4.7-2 | Defenestration: exterior window, camera follows the fall, ground-floor short drop | ✅ | `hazards/executions.ts:277-369` (fall 0.34 s on floor 1, 0.58 s otherwise) | |
| 4.7-3 | Photocopier: head slammed, 4 printouts scatter as decals | ✅ | `executions.ts:372-422` (4 sprite particles, `toDecal: true`) | |
| 4.7-4 | Server rack: electrocution, sparks, lights flicker | ✅ | `executions.ts:482`, `Kit.lights0` | |
| 4.7-5 | Shredder (Finance and Legal only), gore toggle applies | ✅ | `floorgen.ts:390,397` (`shredOk`), `executions.ts:541`, `fx.ts:242` | Replaced by filing cabinet elsewhere |
| 4.7-6 | Microwave: head slam and door slam | ✅ | `executions.ts:597` | |
| 4.7-7 | Hand dryer: comedic face-blast | ✅ | `executions.ts:641` | |
| 4.7-8 | Cutscenes last 1-1.5 s | ✅ | `executions.ts` `base()` 1.35-1.45 s (defenestration 1.45 s) | Static; Off mode 0.5 s |
| 4.7-9 | Others and timers pause; player invulnerable | ✅ | `world.ts:617-622`, `combat.ts:209`, `executions.ts:49` | |
| 4.7-10 | Cutscene setting Always / First time only / Off (Off plays brief in-world animation) | ✅ | `executions.ts:44-48`, `settings.ts:263` | |
| 4.7-11 | Executions grant bonus Rage and count toward execution upgrades | ✅ | `gameplay.ts:311-321` (+20 Rage, heal, Rage extend), `stats.ts` | |
| 4.7-12 | Each execution object single-use | ✅ | `executions.ts:55`, `world.ts:555-558` | |
| 4.7-13 | Act 4 sealed curtain walls need a weakened panel hit first | ✅ | `player.ts:414-428`, `world.ts:567` | |
| 4.7-14 | Interior partitions destructible; core and structural walls not | ✅ | `world-types.ts` `BREACHABLE_TILES`, `validate.ts:176-207` | |
| 4.7-15 | Body breach: thrown enemy smashes partition into adjacent room | ✅ | `enemy.ts:385-398` | |
| 4.7-16 | Breach debris stuns enemies there briefly, then they aggro | ⚠️ | `world.ts:485-489` | All enemies in the target room aggro, but only those within 90 px of the impact are stunned; "any enemies there" is not met. Fix: stun all in the adjacent room |
| 4.7-17 | Breach merges the two rooms into one sealed encounter | ✅ | `world.ts:480-496,439-453` | |
| 4.7-18 | Breach bonus: extra currency and Rage | ✅ | `enemy.ts:391-393` | Facilities benefit scales |
| 4.7-19 | Templates flag breachable walls; validator prevents core breach, softlocks, merging more than two rooms | ✅ | `validate.ts:176-207` | 3,871 breach segments in soak |
| 4.7-20 | Alarm floors: breaches open new lines of attack | ✅ | `world.ts:419` (no locking on alarm) | |
| 4.8-1 | Max active enemies per room: 12 PC, 8 Android | ⚠️ | `core/app.ts:28`, `spawner.ts:129,145`, `spawning.ts:37` | Placement and reinforcements respect the cap, but summons (`enemies/common.ts:499` `summon`, Procurement orders, Team Leader, boss `spawnAdd`) do not check the room count, so a room can exceed it. Fix: gate `summon` and `spawnAdd` on `world.liveEnemies(room) < MAX_ACTIVE_ENEMIES` |
| 4.8-2 | Per-room decal cap, oldest faded first | ⚠️ | `fx.ts:135,159-168` (220 Android / 420 PC) | Cap exists per room; on overflow the oldest 25% are dropped and the texture redrawn, not faded. Fix: alpha-ramp the oldest records over a second before pruning |
| 4.8-3 | Rooms outside current room and neighbours fully suspended | ✅ | `world.ts:404-410,627-632` | Alarm floors deliberately keep all active |

## 5. Enemies and Promotion

| ID | Requirement | Status | Evidence | Note |
| --- | --- | --- | --- | --- |
| 5.0-1 | 20 archetypes (16 base + 4 elites) | ✅ | `csv/archetypes.csv` (20 rows; 16 non-elite, 4 elite) | Fire Warden, Employee of the Month, Auditor, Culture Champion |
| 5.0-2 | Each individual procedurally generated from the archetype kit | ✅ | `enemy.ts:160`, `art/chars/kits.ts` | |
| 5.0-3 | Enemies drop their weapons | ✅ | `enemy.ts:486-490` | |
| 5.0-4 | Enemies who kill the player are promoted and return | ✅ | `promotion.ts` (light mode) | See 5.6 |
| 5.1-1 | Combat roles swarmer, bruiser, ranged, support, disruptor, elite | ✅ | `data/ids.ts:45`, `archetypes.csv` | |
| 5.2-1 | Roster stats: act, role, cost, from-floor | ✅ | `csv/archetypes.csv` | Matches all 20 rows of the spec table |
| 5.2-2 | Intern: packs of 3-5, flees at low HP | ✅ | `spawner.ts:81`, `enemies/act1.ts:37-50` | |
| 5.2-3 | Receptionist: throws staplers and desk phones | ✅ | `act1.ts:99-135` | |
| 5.2-4 | Caretaker: wide mop sweep, wet floors slip the player | ✅ | `act1.ts:139-184` | |
| 5.2-5 | IT Technician: cable trip-traps, electrifies water coolers | ✅ | `act1.ts:189-281` | |
| 5.2-6 | Fire Warden: extinguisher blast, whistle rallies | ✅ | `act1.ts:286-338`; Elite floors only from floor 3 (`spawner.ts:50`) | |
| 5.2-7 | Sales Rep: dash attacks, never stops talking | ✅ | `act2.ts:16` | |
| 5.2-8 | Marketing Exec: rebrands an ally with buff and new name | ✅ | `act2.ts:83`, `enemy.ts` (`status.rebranded`) | |
| 5.2-9 | Call Centre Agent: headset scream cone, hold music slows | ✅ | `act2.ts:123` | |
| 5.2-10 | Team Leader: delegates, sends Interns in | ✅ | `act2.ts:183-204` | Max 2 summoned |
| 5.2-11 | Employee of the Month: enrages per ally death | ✅ | `act2.ts:254` | |
| 5.2-12 | Accountant: calculator turret, slow precise projectiles | ✅ | `act3.ts:77` | |
| 5.2-13 | Lawyer: injunction field disables player ranged weapon | ✅ | `act3.ts:139`, `player.ts:309-314` | |
| 5.2-14 | Compliance Officer: front-facing binder shield, flank or grab | ✅ | `act3.ts:186` | |
| 5.2-15 | Procurement Buyer: orders Interns until killed | ✅ | `act3.ts:258` | Cap 4 |
| 5.2-16 | Auditor: marks player, enemies deal more damage | ✅ | `act3.ts:305`, `player.ts:770` (x1.25 marked) | |
| 5.2-17 | HR Business Partner: restores enemy shields | ✅ | `act4.ts:16` | |
| 5.2-18 | Senior Vice President: golf swings, power-pose armour | ✅ | `act4.ts:79` | |
| 5.2-19 | Executive Assistant: calendar-invite teleport, backstab | ✅ | `act4.ts:183` | |
| 5.2-20 | Management Consultant: laser beams, billing-by-the-hour ramp | ✅ | `act4.ts:221-232` | |
| 5.2-21 | Culture Champion: re-onboards intact bodies; dismembered or executed cannot revive | ✅ | `act4.ts:303`, `enemy.ts:503` (dismembered bodies removed) | AI test asserts this |
| 5.2-22 | Anchor items always present | ✅ | `csv/archetypes.csv` anchor column, `art/chars/kits.ts` | Static; anchor rendering by kit |
| 5.3-1 | Base rig: 2 rigs, 3 builds each, shared animations | ✅ | `art/chars/rig.ts:14-23` (`RigId` A/B x slim/average/heavy), `types.ts:9-10` | |
| 5.3-2 | Appearance layers: heads 8-12 per rig | ✅ | `art/chars/kits.ts:299-334` (`HEADS`: 20 presets, 10 per rig) | |
| 5.3-3 | Hairstyles 10+ | ✅ | `art/chars/types.ts:34-38` (20 styles) | |
| 5.3-4 | Outfit sets 3-5 per archetype | ✅ | `art/chars/kits.ts:1,61-116` | |
| 5.3-5 | Accessories and palette swaps | ✅ | `art/chars/look.ts`, `colours.ts` | |
| 5.3-6 | Identity: UK name pools, title grammar | ✅ | `enemy.ts:78-87`, `data/text/names.ts` | |
| 5.3-7 | Variance: stats +/-10%, one quirk from a pool | ✅ | `enemy.ts:143,165-166,30-43` (12 quirks incl. Speakerphone, Gym Bro, Caffeine-Dependent) | |
| 5.3-8 | Seniority tiers Junior/Senior/Lead by act distance | ✅ | `spawner.ts:26-29`, `data/ids.ts:53-54` | |
| 5.3-9 | Each tier adds HP, faster telegraphs, one extra behaviour | ✅ | `enemy.ts:144,151`, `enemies/act*.ts` `tiers:` blocks (all 20) | |
| 5.3-10 | Visual upgrade by tier (suits, gold lanyards, watch) | ✅ | `kits.ts:27` (tier prefers sharper outfits), `look.ts` | Static |
| 5.4-1 | Every attack telegraphed, minimum 0.4 s Act 1 falling to 0.25 s Act 4 | ✅ | `csv/floors.csv` (0.40/0.35/0.30/0.25), `enemy.ts:179`, `bosses/boss.ts:197-199`, `enemies/common.ts` (all `wu = e.windup`) | Hazard printer fuse 1.2 s. AI test asserts telegraph precedes damage |
| 5.4-2 | Telegraph uses one reserved colour with colourblind alternative | ✅ | `art/palette.ts:7-16`; grep shows no other use | |
| 5.4-3 | Enemies bark HR jargon which fills Rage | ✅ | `enemy.ts:216-218,363-371` | |
| 5.4-4 | Enemies avoid hazards when alert, can be lured or knocked in | ✅ | `enemy.ts:253-255` | |
| 5.4-5 | Every non-boss enemy grabbable when staggered or <25% HP | ✅ | `executions.ts:36-42` | `ungrabbable` flag exists for exceptions |
| 5.4-6 | Weapon drops with remaining durability; ranged partial ammo | ✅ | `enemy.ts:169-170,486-490` | |
| 5.4-7 | Elites drop a rare-tier weapon | ✅ | `enemy.ts:171`, `gameplay.ts:251-257` | |
| 5.5-1 | enemy_budget = 8 + floor x 3 | ✅ | `data/tables.ts:92` | |
| 5.5-2 | Budget split across rooms by template size | ✅ | `spawner.ts:103,114` (`sizeWeight`) | |
| 5.5-3 | Alarm floors: budget x1.3, every enemy aware | ✅ | `run.ts:172`, `spawner.ts:116` | |
| 5.5-4 | Every room has at least 2 different roles | ⚠️ | `spawner.ts:75-91` | Enforced only when a room has 2+ enemies; low floor budgets (11 pts across 4+ rooms) yield single-enemy rooms. Fix: reserve a 2-role minimum share per room or merge budget |
| 5.5-5 | Supports capped at 2 per room | ✅ | `spawner.ts:66,70,79` | |
| 5.5-6 | At most 1 elite per room | ✅ | `spawner.ts:61-64`, `spawning.ts:98` | Pool excludes elite-only |
| 5.5-7 | Elites: Act 1 only on Elite floors; Act 2+ 10% per standard room | ✅ | `spawner.ts:107-112`, `csv/floors.csv` elite_room_chance | Restructure adds Act 1 chance as opt-in |
| 5.5-8 | Pool blending 70% current act / 30% earlier at higher tier | ✅ | `spawner.ts:68`, `floors.csv`, `tierFor` | |
| 5.5-9 | Lift ambush: budget x0.6, swarmers and rushers only | ✅ | `spawner.ts:102`, `spawning.ts:45-86` | |
| 5.6-1 | Legal gate honoured: full Promotion not shipped until FTO opinion | ✅ | `game/flags.ts` (`PROMOTION_MODE = 'light'`) | Correct process |
| 5.6-2 | Fallback light version: killers return once with title, no persistent memory | ✅ | `promotion.ts:1-8,211-235` | Leaves roster on reinsertion |
| 5.6-3 | Trigger: killing-blow enemy promoted; hazard death credits nearest enemy damaging in last 5 s | ✅ | `gameplay.ts:323-335`, `enemy.ts:125` | |
| 5.6-4 | Already-promoted killer promoted again (4 ranks) | 🚫 | `promotion.ts:118-160` | Code complete behind `'full'`; disabled pending patent opinion |
| 5.6-5 | Promotion gives title, stat tier, strength from kill method, one random weakness | 🚫 | `promotion.ts:55-91,237-265` (7 strengths, 7 weaknesses) | As above |
| 5.6-6 | Memory of each kill; barks reference history | 🚫 | `promotion.ts:266-275,517`, `data/text/barks.ts` `PROMOTED_BARKS` | As above |
| 5.6-7 | Intel: HR filing cabinets reveal a weakness | 🚫 | `promotion.ts:411-440` | As above |
| 5.6-8 | Roster max 10 active; shown on Internal Announcements noticeboard | 🚫 | `promotion.ts:49,106-114`, `meta/ui/noticeboard.ts` | Noticeboard live in light mode, cap in full |
| 5.6-9 | 1-3 promoted per normal run in the act matching rank; announced by Company Announcement card; Director in own arena | 🚫 | `promotion.ts:183-235,286-298`, `bosses/director.ts` | Light mode inserts 1-2 in their own archetype's act |
| 5.6-10 | Resolution: Terminated reward and trophy; executed gives unique cutscene and bonus | ⚠️ | `promotion.ts:299-410`, `meta/ui/dashboard.ts:76` | Light mode pays cash and marks Terminated; trophy and unique termination cutscene belong to full mode |
| 5.6-11 | Exclusions: disabled in daily and seed-entered runs; never on boss floors | ✅ | `promotion.ts:102,120,189-205` | |
| 5.6-12 | Persistence: roster in save, synced via Steam Cloud and Play Games | ⚠️ | `profile.ts`, `services.ts:179,246-252,284-286` | Saved locally; cloud sync is stubbed (🚫 external SDKs) |

## 6. Bosses

| ID | Requirement | Status | Evidence | Note |
| --- | --- | --- | --- | --- |
| 6.0-1 | Four fixed bosses, 3 phases each, arena changes every phase | ✅ | `bosses/boss.ts:30-47`, four boss modules | HP 900 / 1300 / 1700 / 2200 |
| 6.1-1 | Health bar with phase markers at 66% and 33% | ✅ | `boss.ts:171`, `ui/hud.ts:257-268` | |
| 6.1-2 | Phase transitions: 2-3 s arena-change set piece, player invulnerable, timers paused | ⚠️ | `facilities-manager.ts:460` 2.7 s, `head-of-sales.ts:349` 2.7 s, `head-of-compliance.ts:400` 2.9 s, `ceo.ts:428,456` 3.4 s and 3.6 s | CEO transitions exceed the 3 s ceiling. Trim to 3.0 s |
| 6.1-3 | Grab only in end-of-phase stagger window; triggers 1-1.5 s phase-transition execution | ✅ | `executions.ts:39`, `boss.ts:310-351` (window 2.6 s, execution 1.3 s) | |
| 6.1-4 | Final phase ends in a unique boss execution | ✅ | `boss.ts:303,finisher()` per boss | Boiler, window, shredder, rotor/roof |
| 6.1-5 | Fairness: no unavoidable damage, no one-shots, telegraphs per 5.4 | ✅ | `boss.ts:197-199,213-215` (`hitShape` only after telegraph) | Max hit values below 100 HP; static |
| 6.1-6 | Adds: at most 4 at a time, from the act's archetypes | ✅ | `boss.ts:252-263` | |
| 6.1-7 | Intro card: name, title, satirical tagline | ✅ | `boss.ts:525-600` (`IntroCard`) | |
| 6.1-8 | Rewards: major upgrade, meta currency, full heal | ✅ | `boss.ts:458-486` (Enhanced+ Benefit, guaranteed Desk Item, +5 Annual Leave, full heal) | Hiring Freeze r2 removes heal |
| 6.1-9 | Promoted enemies never appear on boss floors | ✅ | `promotion.ts:120,200` | |
| 6.2-1 | Facilities Manager P1: wet patches, wrench swings, whistles Caretakers | ✅ | `facilities-manager.ts` | Static |
| 6.2-2 | P2: fire alarm sprinklers, sparking panels, toolboxes, electrified puddles | ✅ | `facilities-manager.ts:360,677` | |
| 6.2-3 | P3: lights out, ride-on scrubber charges, boiler execution | ✅ | `facilities-manager.ts:454+`, `world.forcedDarkness` | |
| 6.3-1 | Head of Sales P1: dash charges, gong summons Sales Reps, destroy gong | ✅ | `head-of-sales.ts:63` (`boss_gong` hp 70) | |
| 6.3-2 | P2: leaderboard screens, commission meter, contract projectiles, smash screens | ✅ | `head-of-sales.ts:64` (`boss_screen`) | |
| 6.3-3 | P3: smashed windows, wind pull, lunging grabs, window-throw finisher | ✅ | `head-of-sales.ts`, `bosses/fall.ts` | |
| 6.4-1 | Head of Compliance P1: timed policies ban a verb, breaking causes damage and stun, HUD shows policy | ✅ | `head-of-compliance.ts:2-3,118-126`, `hud.ts:129-135`, `player.ts:253-256` | Verb is not blocked, punished |
| 6.4-2 | P2: shutter walls, compartments, Lawyer/Auditor adds, breach to reach her | ✅ | `head-of-compliance.ts:63,393-410` | |
| 6.4-3 | P3: conveyors, shredder, rapid policy rotation, shredder execution | ✅ | `head-of-compliance.ts:6,125` | |
| 6.5-1 | CEO P1: boardroom screen, board member fights, slide beam patterns, clear board | ✅ | `ceo.ts:168` | |
| 6.5-2 | P2: office, speeches drain Rage, power poses, interrupt by throwing | ✅ | `ceo.ts:4,134,207-211` | |
| 6.5-3 | P3: rooftop, wind, escape attempt, golden-parachute shield, thrown off roof or rotor | ✅ | `ceo.ts:6,456-470` | Gore toggle applies |
| 6.5-4 | Ending: all-staff email cancels programme | ✅ | `scenes/ending.ts:1` | |
| 6.6-1 | Optional Director bosses: 50% per act, labelled Director's Office, counts toward corridor limit, 2 phases | 🚫 | `bosses/director.ts`, `gen` `director` floor type, `promotion.ts:505-516` | Built but dropped in light mode per spec |
| 6.6-2 | Director reward, Terminated, never mandatory | 🚫 | `director.ts` | As above |

## 7. Player progression

| ID | Requirement | Status | Evidence | Note |
| --- | --- | --- | --- | --- |
| 7.0-1 | Unlocks only between runs; no permanent stat boosts | ✅ | `meta/catalogue.ts`, `weapons.ts:29-31`, `progression.ts` | Only pool and role unlocks |
| 7.1-1 | Eight departments as Benefit providers | ✅ | `data/ids.ts:28-29` | |
| 7.1-2 | Benefit exit reward offers 1 of 3 from one department | ✅ | `content/benefits.ts:218-250` (`rollOffers`, count 3) | |
| 7.1-3 | Example Benefits per department (IT chain-shock, etc.) | ✅ | `content/benefits-it-fac.ts:14-40`, `benefits-biz.ts`, `benefits-sales-mkt.ts` | |
| 7.1-4 | Rarity Standard, Enhanced, Executive; duplicates offered as upgrades | ✅ | `benefits.ts:102-120` | |
| 7.1-5 | About 12 dual-department synergies, available when holding both | ✅ | `benefits-synergy.ts` (12), `benefits.ts:96-101`; includes "Smart Building" | |
| 7.1-6 | Content target about 10 per department plus 12 synergies, about 92 | ✅ | 89 base (11 per department, 12 Executive) + 12 synergies + 11 stress modifiers = 112 | Exceeds |
| 7.1-7 | Slice: 3 departments x 6 | ✅ | Exceeded | |
| 7.2-1 | Desk Items: rare passives, unique per run, no carry limit | ✅ | `content/deskitems.ts`, `data/deskitems.ts` | Reserved set `rewards.ts:88` |
| 7.2-2 | Sources: elite kills, treasure, boss rewards, occasionally shops | ✅ | `gameplay.ts:256`, `treasure.ts`, `boss.ts:472`, `shop.ts:113-119` | |
| 7.2-3 | Spec examples (Stress Ball, Out-of-Office, Credit Card, Gold Lanyard, Handbook, Cushion, Lucky Mug) | ✅ | `data/deskitems.ts:7-13` | |
| 7.2-4 | About 40 Desk Items | ✅ | 40 entries | |
| 7.3-1 | Hub: vending machine unlocks | ✅ | `meta/ui/vending.ts`, `catalogue.ts:125-139` | |
| 7.3-2 | Hub: car boot role and loadout | ✅ | `meta/ui/carboot.ts`, `meta/runs.ts:88-100` | |
| 7.3-3 | Hub: noticeboard | ✅ | `meta/ui/noticeboard.ts` | |
| 7.3-4 | Hub: dashboard (trophies, run stats) | ✅ | `meta/ui/dashboard.ts` | |
| 7.3-5 | Hub: car radio, soundtrack unlocks | ✅ | `meta/ui/radio.ts`, `catalogue.ts:192-208` | |
| 7.3-6 | Role Office Worker (keyboard, 2 throwables) | ✅ | `csv/roles.csv` | |
| 7.3-7 | Role Temp (letter opener, lower HP, Rage +50%, reach floor 6) | ✅ | `roles.csv`, `catalogue.ts:155` | |
| 7.3-8 | Role Night Cleaner (mop, hazard damage up, Facilities Benefit, 100 hazard kills) | ✅ | `roles.csv`, `economy.ts:34-42`, `catalogue.ts:156` | |
| 7.3-9 | Role Contractor (nail gun, no shield regen, extra ammo, beat Act 2 boss) | ✅ | `roles.csv`, `catalogue.ts:157` | |
| 7.3-10 | Role Ex-Employee (fists, starts in Rage every floor, no shops, beat CEO) | ✅ | `roles.csv`, `gameplay.ts:171`, `shop.ts:166-171` | |
| 7.3-11 | Feat-based unlocks (defenestrate 50 enemies unlocks a weapon) | ✅ | `catalogue.ts:43` | |
| 7.3-12 | Unlock pacing: first CEO kill in 10-20 h | ⚠️ | `catalogue.ts` prices | Cannot be verified without playtest telemetry; needs balancing data |
| 7.3-13 | Act 1 tuned forgiving | ⚠️ | `enemy.ts:145`, `csv/floors.csv` | Floor scaling is shallow, but no recorded difficulty tuning evidence |
| 7.3-14 | Workplace Adjustments assist: damage-taken slider and slower game speed | ✅ | `settings.ts:279-291`, `player.ts:771`, `gameplay.ts:457` | |
| 7.3-15 | Assist excluded from daily submissions; marked on stats screen | ✅ | `services.ts:76`, `progression.ts:188,177`, `dashboard.ts` | |
| 7.4-1 | Performance Review unlocks after first CEO kill | ✅ | `progression.ts:143-147` | |
| 7.4-2 | Modifier ranks as spec (3/3/3/2/2/2/1/3/1/2) | ✅ | `csv/modifiers.csv` | |
| 7.4-3 | KPI points unlock cosmetics only, never power | ✅ | `progression.ts:147`, `meta/cosmetics.ts` | |
| 7.4-4 | Budget Cuts: prices up, fewer shop items | ✅ | `shop.ts:83-85,128-136` | |
| 7.4-5 | Restructure: higher elite chance | ✅ | `spawner.ts:111`, `spawning.ts:108-121` | |
| 7.4-6 | Micromanagement: shorter telegraphs | ✅ | `gameplay.ts:183`; clamped at act minimum | Rank 3 saturates at the minimum in Acts 1-2 |
| 7.4-7 | Mandatory Fun: Rage decays faster | ✅ | `run.ts:134-135` | |
| 7.4-8 | Hiring Freeze: no stair heals, then no boss-clear heal | ✅ | `gameplay.ts:363`, `boss.ts:473` | |
| 7.4-9 | Zero Tolerance: grab threshold 25% to 15% to 10% | ✅ | `run.ts:136-137` | |
| 7.4-10 | Hot Desking: less cover | ✅ | `gameplay.ts:136`, `floorgen.ts:404-405,417` | |
| 7.4-11 | Quarterly Targets: floor timer; exceeding it spawns reinforcements | ❌ | `csv/modifiers.csv` row only; no consumer (`grep quarterly_targets` finds nothing in code) | Selectable and costs KPI but does nothing. Implement in `gameplay.ts` update: timer per rank and `populate` reinforcements |
| 7.4-12 | Board Pressure: bosses enrage at 15% HP | ✅ | `boss.ts:581-590` | |
| 7.4-13 | Promotion Season only if Promotion clears legal gate | 🚫 | `promotion.ts:189`, `clockin.ts:142`, `progression.ts:111` | Hidden in light mode; correct |
| 7.4-14 | Daily run applies fixed published modifiers | ✅ | `meta/runs.ts:29-36` | Derived from date |

## 8. Economy and business model

| ID | Requirement | Status | Evidence | Note |
| --- | --- | --- | --- | --- |
| 8.1-1 | Steam premium, paid upfront; free Act 1 demo for Next Fest | ❌ | None | No demo build flag or Steam demo packaging. Needs Steam App ID for store; the demo cap itself is codeable (see 8.1-3) |
| 8.1-2 | Android free download with Act 1 (floors 1-5 plus boss) | ❌ | `platform/services.ts:184-186,289-293` | `isFullGameUnlocked()` stubbed true and never consulted by gameplay, so no floor cap exists |
| 8.1-3 | One-time IAP unlocks full game via Play Billing | 🚫 | `services.ts:289-293` (plug-in point) | Needs Play Console product; paywall UI and gating logic are also absent (❌ part) |
| 8.1-4 | Demo includes Act 1, hub, Act 1 unlocks; daily and Performance Review full game only; demo progress carries over | ❌ | None | Gate daily, PR and floors > 5 on `isFullGameUnlocked()`; profile is shared so carry-over works once gating exists |
| 8.1-5 | No cross-buy; saves per platform | ✅ | Per-device storage `core/storage.ts` | |
| 8.1-6 | Ethics: no pay-to-win, loot boxes, premium currency, energy timers, ads | ✅ | No such code exists | |
| 8.2-1 | Petty Cash resets each run; earned from kills, clears, breaches, executions, Terminations, rewards | ✅ | `pickups.ts:202-210`, `enemy.ts:491`, `enemy.ts:391`, `gameplay.ts:319` | |
| 8.2-2 | Petty Cash spent on shops: Benefits, Desk Items, heals, repairs, rerolls | ✅ | `shop.ts:106-141` | |
| 8.2-3 | Annual Leave permanent, 100% kept on death | ✅ | `progression.ts:137` | |
| 8.2-4 | Annual Leave earned: floors, bosses, feats, Terminations, discoveries | ✅ | `progression.ts:80-106` | |
| 8.2-5 | Annual Leave spent at hub vending machine | ✅ | `catalogue.ts:125-138` | |
| 8.2-6 | Expense claim: unspent Petty Cash to Annual Leave at 10:1, tunable | ✅ | `economy.ts:11,44-55` | Debt netted off |
| 8.2-7 | Earn-rate targets 10-20 h to first CEO kill, 40-60 h all unlocked | ⚠️ | `catalogue.ts` prices | Unverified without playtest data |
| 8.3-1 | Canteen: 1 Benefit, 1-2 Desk Items, 1 weapon, full heal, repair, reroll | ✅ | `shop.ts:106-141` | |
| 8.3-2 | Vending machine: snacks and a throwable, occasional in-room | ✅ | `shop.ts:236-290` | |
| 8.3-3 | Prices: Benefit 120-180 by rarity | ✅ | `csv/prices.csv` | |
| 8.3-4 | Desk Item 150-250, weapon 60-120, full heal 90, repair 40 | ✅ | `prices.csv`, `shop.ts:118,126,137-138` | |
| 8.3-5 | Reroll 30 then +30 each | ✅ | `shop.ts:148-151` | |
| 8.4-1 | Reward weights (30/25/15/15/10/5) | ✅ | `csv/rewards.csv`, `run.ts:153-159` | |
| 8.4-2 | Elite floors: reward rarity up a tier plus Petty Cash bonus | ✅ | `rewards.ts:18,38-42`, `gameplay.ts:306` | |
| 8.4-3 | Boss floors: Enhanced+ Benefit, guaranteed Desk Item, Annual Leave bonus, full heal | ✅ | `boss.ts:458-486` | |
| 8.4-4 | Annual Leave per run: 1 per floor, 5 per boss, 10 per Terminated, first-time bonuses | ✅ | `progression.ts:62,80-106` | |
| 8.4-5 | All values data-driven in tables | ⚠️ | `data/csv/*`, `data/tables.ts` | Weights, prices, floors, archetypes, roles, modifiers are CSV; Benefit and Desk Item numbers are in TypeScript (see 10.2-1) |

## 9. Art, UI/UX and audio

| ID | Requirement | Status | Evidence | Note |
| --- | --- | --- | --- | --- |
| 9.1-1 | Internal resolution 640x360, integer scaling (x3 1080p, x4 1440p, x6 4K) | ✅ | `render/renderer.ts:44-65` | |
| 9.1-2 | Steam Deck 1280x800 at 2x with extended vertical view (16:10) | ✅ | `renderer.ts:53-54` (H up to 400) | |
| 9.1-3 | Top-down 3/4 perspective, 16x16 tiles | ✅ | `world-types.ts` `TILE`, `art/env/tiles.ts` | |
| 9.1-4 | Characters about 32x48, bosses up to 96x96 | ✅ | `art/chars`, `art/bosses/bake.ts` | |
| 9.1-5 | 4 directions with left/right mirrored; rotating weapon and arm layer for 360 aim | ✅ | `entity.ts:123` (`dir4`), `player.ts:829-835` | |
| 9.1-6 | Max 6 modular layers per character | ⚠️ | `art/chars/bake.ts` | Layer set (body, outfit, head, hair, accessory, anchor) appears consistent but is not asserted in code; verify count |
| 9.1-7 | Animation set: idle, walk, run, 3 attacks, hit, stagger, grabbed, thrown, 3 deaths, execution poses | ✅ | `player.ts:206-211`, `enemy.ts:468`, `art/chars/poses.ts` (AnimName set incl. `exec_*`, `victim_*`) | |
| 9.1-8 | Act palettes (beige, brand neon, navy and archive brown, gold marble reds) | ✅ | `art/palette.ts:27-32` | |
| 9.1-9 | 1 px dark outline on enemies | ✅ | `art/palette.ts:13` (`OUTLINE`), `render/canvas.ts` `withOutline` | |
| 9.1-10 | Reserved telegraph colour appears nowhere else | ✅ | Repo grep for `ff2bd6`/`ffe600` (palette and settings preview only) | |
| 9.1-11 | Gore decals below gameplay layer and fade | ⚠️ | `world.ts:725`, `fx.ts:159-168` | Below: yes. Fade: pruned abruptly (see 4.8-2) |
| 9.1-12 | Dynamic 2D lights used sparingly; reduced-lights mode on Android | ✅ | `world.ts:798-853`, `settings.ts:194`, default on mobile `settings.ts:207` | |
| 9.2-1 | Main menu: CorpOS login, accept updated HR terms, Decline starts the game | ✅ | `scenes/menu.ts:1,202-252,331` | |
| 9.2-2 | HUD: Wellbeing score, Stress KPI gauge, expenses, lift-panel floor number | ✅ | `ui/hud.ts:53-104` | |
| 9.2-3 | Benefit choice: email "Re: Your Benefits Package" with 3 attachments | ✅ | `benefits.ts:218-250` | |
| 9.2-4 | Canteen as intranet catalogue page | ✅ | `shop.ts:189` (`IntranetPage`) | |
| 9.2-5 | Boss policies and Promotion as pop-ups and all-staff emails | ✅ | `ui/corpos.ts` `notify`, `hud.ts:129-135`, `promotion.ts:286` | |
| 9.2-6 | Run summary: Performance Review deck with charts, exportable | ✅ | `scenes/summary.ts:56-118`, `ui/slides.ts:312-325` | PNG download or share sheet |
| 9.2-7 | Settings as Control Panel parody | ✅ | `scenes/settings.ts` | |
| 9.2-8 | Loading tips as internal memos | ✅ | `data/text/memos.ts`, `scenes/transition.ts` | Static |
| 9.2-9 | All software parody invented; no real product names | ✅ | `DEV_BRIEF` rule; grep for real brands finds none | |
| 9.2-10 | Every menu navigable by controller, KBM and touch | ✅ | `ui/widgets.ts`, `ui/window.ts`, `input.injectTap` | `tools/meta-test.mjs` has controller and touch passes |
| 9.2-11 | Touch HUD reserves both thumb zones; elements in top corners | ✅ | `hud.ts:84,87` (touch loadout under Wellbeing), `ui/touch.ts` | |
| 9.2-12 | Pixel font for headers, clean body font, mobile-suitable minimum size, UI scaling | ⚠️ | `render/font.ts`, `settings.ts:193` (1x or 2x) | One bitmap font used throughout; no separate clean body face. UI scale limited to two steps |
| 9.3-1 | Adaptive two-state score per act: muzak and combat arrangements | ✅ | `audio/tracks/acts.ts:26-130` | |
| 9.3-2 | Transitions on bar boundaries; drops on room lock, returns on clear | ✅ | `audio/sequencer.ts:286-290` (latched to next bar), `gameplay.ts:176,277` | |
| 9.3-3 | Rage adds a layer: filter sweep and heavier kick | ✅ | `engine.ts:263`, `player.ts:677` | Static |
| 9.3-4 | Boss themes escalate across 3 phases | ✅ | `audio/tracks/bosses.ts:2`, `boss.ts:setPhase` | |
| 9.3-5 | Act themes: lounge/bossa and deep house; smooth jazz and tech house; classical hold and minimal techno; corporate anthem and hard techno; CEO finale | ✅ | `acts.ts:26,73,106-126`, `bosses.ts:93,122` | |
| 9.3-6 | Original score; no real melodies; stems for vertical layering | ⚠️ | `audio/*` (procedural synthesis) | Original, no licensing risk; commissioned composer and stems per spec are replaced by generated audio under `DEV_BRIEF` rule 1 |
| 9.3-7 | SFX: hit-stop, heavy impacts, office foley, lift chime, cue for every telegraph | ✅ | `world.ts:589-591`, `audio/sfxdefs.ts:168`, `lift_chime` | |
| 9.3-8 | Barks and voice: 300-500 voiced lines from UK actors | 🚫 | `audio/voice.ts` | Needs actors. Fallback specified by spec (subtitled barks plus short vocal grunts) is implemented |
| 9.3-9 | Synthetic voice only with licensed tools and consent | ✅ | `voice.ts` (own formant synth) | No third-party voice model |
| 9.3-10 | Subtitles for barks; visual indicator for every audio-only cue | ⚠️ | `world.ts:606-613`, `hud.ts:34,152-174`, `audio/engine.ts:15` (`CUE_SFX` subset) | Subtitles on by default; cue indicators cover a defined subset of sounds, off by default; verify every audio-only cue |

## 10. Technical

| ID | Requirement | Status | Evidence | Note |
| --- | --- | --- | --- | --- |
| 10.0-1 | 60 fps on PC and Android | ⚠️ | `core/app.ts:105-128`, `docs/BUILD.md`, `scratch/bench*.ts` | Fixed 60 Hz step; no recorded measurement on Android hardware |
| 10.0-2 | Android target: 2020 mid-range, 4 GB, Android 10+ | ✅ | `android/variables.gradle` minSdk 29 | |
| 10.1-1 | Engine: Unity LTS URP 2D | 🚫 | `DEV_BRIEF` | Approved deviation (TypeScript, Canvas2D) |
| 10.1-2 | Input system: controller, KBM, touch, runtime rebinding, prompt switching Xbox/PS/generic | ✅ | `core/input.ts:147,259-277`, `art/items/prompts.ts` | |
| 10.1-3 | Steam Input compatible | ⚠️ | `core/input.ts` (standard Gamepad API) | Works via Steam's gamepad emulation in principle; untested |
| 10.1-4 | Baked runtime atlas for composited enemies | ✅ | `art/chars/bake.ts`, `world.ts:193-201` (incremental prewarm, 4 ms budget) | |
| 10.1-5 | Steamworks: achievements, leaderboards, Cloud | 🚫 | `services.ts:214-253` | Stub; needs Steam App ID and steamworks bridge |
| 10.1-6 | Google Play Games plugin and Play Billing | 🚫 | `services.ts:257-294` | Stub |
| 10.1-7 | Localisation: English at launch; all strings in tables from day one | ⚠️ | `data/text/*`, `settings.ts` `language: 'en-GB'` | Large text tables exist, but no lookup layer, and many UI and content strings are inline in code (`content/benefits*.ts`, `scenes/*`). Fix: key-based `t()` helper |
| 10.2-1 | Data-driven content: floors, archetypes, Benefits, Desk Items, prices, weights, modifiers in spreadsheets (CSV) | ⚠️ | `data/tables.ts`, `data/csv/*` (7 CSV files) | Benefits (112) and Desk Items (40) are defined in TypeScript, not CSV |
| 10.2-2 | Deterministic seeded RNG (PCG-class), not the platform RNG | ✅ | `core/rng.ts:34-95` (sfc32) | |
| 10.2-3 | Separate RNG streams: layout, spawns, loot, cosmetic | ✅ | `rng.ts:98-115` | Plus combat and events |
| 10.2-4 | Daily seed = hash(UTC date + salt) | ✅ | `rng.ts:155-161` | |
| 10.2-5 | Cosmetic randomness cannot desync a seed | ⚠️ | `rng.ts:118` (`fxRng`) | A few cosmetic paths use `Math.random()` (`pickups.ts:98,106,164`, `projectile.ts:99`, `renderer.ts:117`); pickup scatter is position-only so seeds are unaffected, but contravenes `DEV_BRIEF` rule 4. Swap to `fxRng` |
| 10.2-6 | Object pooling for enemies, projectiles, pickups, effects | ⚠️ | `fx.ts:29,36-41` (particle cap and recycle) | Only particles are capped/recycled; entities are allocated per spawn. Profile before investing |
| 10.2-7 | Gore decals in per-room render texture | ✅ | `fx.ts:133-168` | |
| 10.2-8 | Only current room and neighbours simulated | ✅ | `world.ts:627-632` | |
| 10.3-1 | Profile save: unlocks, Annual Leave, roster, KPI, settings, statistics, written after every run and unlock | ✅ | `profile.ts`, `progression.ts:183`, `catalogue.ts:125` | |
| 10.3-2 | Run suspend save: seed, floor, HP, shield, Rage, inventory, Benefits, Desk Items, Petty Cash, RNG states | ✅ | `run.ts:44-84` (`RunState`), `gameplay.ts:397` | Rage stored as 0 by design (no stockpiling) |
| 10.3-3 | Suspend written between floors and when Android goes to background | ✅ | `gameplay.ts:397,402-405`, `app.ts:56-59`, `platform/android.ts` | Background save restores to floor start |
| 10.3-4 | Versioned schema with migrations | ⚠️ | `storage.ts:256-303` | Version envelope and migration hook exist; no migrations registered (only v1) |
| 10.3-5 | Atomic write via temp file then swap, one backup kept | ✅ | `storage.ts:269-278`, `electron/main.cjs` (`writeFileAtomic`) | localStorage backend is not truly atomic |
| 10.3-6 | Checksum and fall-back to backup on corruption | ✅ | `storage.ts:284-303` | Extra |
| 10.3-7 | Cloud sync Steam Cloud and Play saved games | 🚫 | `services.ts:179,246,284` | Stub |
| 10.3-8 | Suspend saves deleted on resume | ✅ | `gameplay.ts:66`, `runs.ts:110-116` | `Save & Quit` can recreate a floor-start save each time, a mild retry exploit (advisory) |
| 10.4-1 | PC: 60 fps locked, unlocked option for high refresh | ✅ | `app.ts:126`, `settings.ts:198` | |
| 10.4-2 | Android: no drops below 55 fps in 30-minute sustained thermal test | 🚫 | None | Needs physical devices |
| 10.4-3 | Minimum hardware PC and Android builds | ⚠️ | `package.json`, `android/` | Builds configured; not tested against minimum hardware |
| 10.4-4 | Active enemies per room 12 / 8 | ⚠️ | See 4.8-1 | |
| 10.4-5 | Draw calls 150 or fewer; memory 1.5 GB or less (Android) | ⚠️ | None | Canvas2D draw calls are not directly comparable; no memory budget measurement recorded |
| 10.4-6 | Dynamic lights per room 8 PC / 4 reduced | ✅ | `world.ts:816` | |
| 10.4-7 | Steam Deck verified at native 1280x800 60 fps; Windows build via Proton or native; no macOS | ⚠️ | `build.yml` AppImage and Windows jobs | Native Windows and Linux AppImage both built; Deck submission pending |
| 10.4-8 | Android: safe areas, 16:9 to 21:9 | ✅ | `renderer.ts:67-81,8-9` | |
| 10.4-9 | Android: AAB meeting current target API | ✅ | `android/variables.gradle` target 36, `package.json` `android:build` (`bundleRelease`) | |
| 10.4-10 | Android: Bluetooth and USB gamepad support | ✅ | `AndroidManifest.xml` gamepad feature, Gamepad API | |
| 10.5-1 | Daily run generated on device from date seed | ✅ | `runs.ts:38-43` | |
| 10.5-2 | Steam leaderboard through validation service and Steam Web API | 🚫 | `services.ts:230-244` | Needs backend and Steam App ID |
| 10.5-3 | Android: client submission with score-range limits | ⚠️ | `services.ts:67-73,269-276` | Range limit coded; plugin not installed |
| 10.5-4 | Telemetry opt-in only (UK GDPR) | ✅ | `services.ts:122-161`, `settings.ts:293-303` | Off by default; no endpoint by default |
| 10.5-5 | Privacy policy and Play Data safety form | ⚠️ | In-game privacy text `settings.ts:296-303` | Hosted privacy policy and store form not in repo (🚫 legal) |
| 10.5-6 | Integrated crash reporter on both platforms | ✅ | `platform/crash.ts` | Local ring buffer; forwarding needs an endpoint |
| 10.6-1 | Debug console: spawn, give items, jump to floor, god mode, replay a seed | ⚠️ | `scenes/boot.ts:88-101` (`#play&seed&floor&type&role`), `main.ts:42` (`window.__cp`), `scenes/dev/*` galleries, `enemies/debug.ts` | Quick-play URL covers floor, seed, type and role; no in-game console, no give-item or god-mode command |
| 10.6-2 | Generator soak test 10,000+ floors; zero softlocks is release gate | ✅ | `tools/soak.ts`, `npm run soak` | Passed on this commit (0 failures); also `tools/reach-test.mjs` |
| 10.6-3 | Soak enforced in CI | ⚠️ | `.github/workflows/build.yml:40` | CI runs `tsc --noEmit` marked non-blocking and no soak step. Add `npm run soak` as a blocking job |
| 10.6-4 | Source control Git | ✅ | Repository | |
| 10.6-5 | CI builds Windows and Android on merge to main | ✅ | `.github/workflows/build.yml` | Runs on every push, superset; plus Linux AppImage |
| 10.6-6 | Test device matrix (3 Android phones, Steam Deck) | 🚫 | None | Hardware |

## 11. Production plan (process requirements; assessed for artefact evidence only)

| ID | Requirement | Status | Evidence | Note |
| --- | --- | --- | --- | --- |
| 11.1-1 | M0 gates: FTO opinion, trademark, funding | 🚫 | None | External legal and business |
| 11.1-2 | M1 greybox playable: combat, Grab, Rage, room-lock, 2 floors plus Facilities Manager | ✅ | Exceeded by full build | |
| 11.1-3 | M2 vertical slice (Act 1 final quality, PC and Android builds at 60 fps) | ⚠️ | Builds exist; 60 fps on Android unmeasured | |
| 11.1-4 | M3 alpha: all 4 acts and systems | ⚠️ | Complete except Quarterly Targets, demo gating, Steam/Play integrations | |
| 11.1-5 | M4 beta: Steam Next Fest demo, Android demo, telemetry balancing, localisation-ready | ❌ | See 8.1; localisation 10.1-7 | |
| 11.1-6 | M5 RC: zero softlocks, budgets met, store certification, IARC, Deck Verified | 🚫 | Softlock gate met; rest external | |
| 11.2-1 | Team structure and roles | 🚫 | None | Organisational |
| 11.3-1 | Budget plan | 🚫 | None | Organisational |
| 11.4-1 | Open items: funding, FTO, trademark, company/IP, designer capacity, Act 3 boss choice | 🚫 | None | Head of Compliance retained in code |

---

# 2. Decision log D1-D36

| ID | Decision | Status | Evidence | Note |
| --- | --- | --- | --- | --- |
| D1 | Top-down 2D action | ✅ | `world.ts` top-down 3/4 | |
| D2 | Satire plus surreal dark comedy, 18+ | ✅ | `data/text/*` | |
| D3 | Premise: CEO orders mandatory HR training | ✅ | `intro.ts`, `ending.ts` | |
| D4 | Content: gore, profanity, drug and alcohol flavour, non-explicit innuendo | ✅ | See 1.4 | |
| D5 | PC and Android; controller, KBM, touch | ✅ | See 1.6, 2.5 | |
| D6 | Hybrid melee, ranged and Rage | ✅ | `player.ts` | |
| D7 | HP plus Wellbeing shield | ✅ | `player.ts:140-146`, `combat.ts:216` | |
| D8 | Breakable weapons | ✅ | `player.ts:456-472` | |
| D9 | 20 floors, 4 acts x 5 | ✅ | `tables.ts` | |
| D10 | Lift skip with ambush risk | ✅ | `gameplay.ts:368-378` | |
| D11 | Exit rewards previewed | ✅ | `hud.ts:270-285` | |
| D12 | Room-lock multi-room plus Alarm floors | ✅ | `world.ts:412-456` | |
| D13 | Shareable seeds plus daily at launch with native boards | ⚠️ | `services.ts` | Local boards only; native boards are 🚫 |
| D14 | Combat-relevant destruction, Grab, executions, breaching | ✅ | See 4.7 | |
| D15 | Satirical stereotypes, never grotesque | ✅ | See 1.3-3 | |
| D16 | 20 archetypes, modular kits, seniority tiers | ✅ | See 5.2, 5.3 | |
| D17 | Enemies drop weapons | ✅ | `enemy.ts:486` | |
| D18 | Promotion full, subject to FTO; light fallback | ✅ | `flags.ts`, `promotion.ts` | Fallback shipping |
| D19 | 4 fixed bosses plus optional Directors | ⚠️ | `bosses/*.ts` | Directors built but dropped in light mode (per spec 6.6) |
| D20 | Final boss CEO | ✅ | `bosses/ceo.ts` | |
| D21 | 3 phases with arena change (Directors 2) | ✅ | `boss.ts:46-47` (markers 2 or 1) | |
| D22 | Benefits (pick 1 of 3) plus Desk Items | ✅ | See 7.1, 7.2 | |
| D23 | Unlocks only | ✅ | `catalogue.ts` | |
| D24 | Stackable Performance Review modifiers with cosmetic rewards | ⚠️ | `csv/modifiers.csv` | 9 of 10 modifiers work; Quarterly Targets is inert |
| D25 | Premium Steam; free Act 1 on Android with unlock; no ads or loot boxes | ⚠️ | See 8.1 | Business model gating missing |
| D26 | Petty Cash plus Annual Leave | ✅ | See 8.2 | |
| D27 | All Annual Leave kept on death | ✅ | `progression.ts:137` | |
| D28 | Hi-bit pixel art, 640x360 | ✅ | `renderer.ts` | |
| D29 | Adaptive muzak and house/techno score | ✅ | `audio/tracks` | |
| D30 | CorpOS parody UI | ✅ | `ui/*` | |
| D31 | Engine Unity LTS | 🚫 | `DEV_BRIEF` | Approved deviation |
| D32 | Android minimum spec 2020 mid-range, 4 GB, Android 10+ | ⚠️ | `variables.gradle` | Config met; hardware validation outstanding |
| D33 | 60 fps on PC and Android | ⚠️ | See 10.0-1 | |
| D34 | Small in-house team plus outsourced audio, legal, QA | 🚫 | None | Organisational |
| D35 | Full game with internal gates | ✅ | Full 20-floor game present | |
| D36 | Funding open | 🚫 | None | Business decision |

# 3. Risk register mitigations

| ID | Risk and mitigation | Status | Evidence | Note |
| --- | --- | --- | --- | --- |
| R1 | In-house payroll with funding undecided: no hires until funded | 🚫 | None | Business |
| R2 | Building before proving fun: M1 and M2 gates | 🚫 | None | Process |
| R3 | Designer-producer capacity | 🚫 | None | Business |
| R4 | WB Games Nemesis patent: FTO, design-around, light fallback | ✅ | `flags.ts`, `promotion.ts` | Light fallback is what ships; FTO opinion itself is 🚫 |
| R5 | Workplace-violence optics: enemies attack first, visibly unreal, escalation, gore toggle | ✅ | `intro.ts`, `settings.ts:263` | |
| R6 | Scope overrun: milestone gates, data-driven content | ⚠️ | `data/csv/*` | Data-driven for most; see 10.2-1 |
| R7 | Modular sprite layering: 2 rigs, 6 layers, runtime baking | ✅ | `rig.ts:14`, `bake.ts` | Layer-count assertion missing (9.1-6) |
| R8 | Daily at launch: platform-native boards, Steam validation only, Android higher risk accepted | ⚠️ | `services.ts` | Design met; services are stubs |
| R9 | Promotion breaking determinism: disabled in daily and seeded runs | ✅ | `promotion.ts:102` | |
| R10 | 50-60 minute runs: mandatory suspend saves | ✅ | `gameplay.ts:397-405` | |
| R11 | Rage too strong: no stockpiling, decays outside combat | ✅ | See 2.2-6, 2.2-7 | |
| R12 | Execution cutscenes interrupt flow: 1-1.5 s cap and setting | ✅ | See 4.7-8, 4.7-10 | |
| R13 | Breaching exploits: flags, 2-room merge cap, 10,000-floor soak | ✅ | `validate.ts:196`, soak passed | |
| R14 | Android performance: budgets, render-texture decals, device testing | ⚠️ | `fx.ts`, `world.ts` | Decals and caps done; device testing outstanding |
| R15 | Low Android conversion: PC primary | 🚫 | None | Business |
| R16 | Title collision: Steam, Play, trademark check | 🚫 | None | Legal |
| R17 | Saturated genre: marketing and Next Fest demo | ❌ | None | Demo build missing (8.1-1) |

---

# 4. DEV_BRIEF hard-rule conformance (additional checks)

| ID | Rule | Status | Evidence | Note |
| --- | --- | --- | --- | --- |
| DB-1 | No external assets; all art and audio generated at runtime | ✅ | `src/art/*`, `src/audio/*`; `index.html`; no image or audio files in `src` | `public/` contains only icons for packaging |
| DB-2 | Pixel discipline, no anti-aliasing | ✅ | `imageSmoothingEnabled = false` throughout `renderer.ts` | |
| DB-3 | Telegraph colour reserved | ✅ | See 9.1-10 | |
| DB-4 | Determinism: gameplay via `Rng`, never `Math.random()` | ⚠️ | See 10.2-5 | Cosmetic-only offenders |
| DB-5 | UK English, no real brands | ✅ | `data/text/*` | Spot-checked |
| DB-6 | Typecheck clean | ✅ | `tsc --noEmit` exit 0 | |
| DB-7 | Performance: bake and cache sprites, no per-frame `getImageData` | ✅ | `bake.ts`, `world.ts:193-201` | Grep: no per-frame `getImageData` |

---

# 5. "Exceeds spec" (implemented beyond the specification)

1. **Content scale:** 112 Benefits (89 base + 12 synergies + 11 Stress Modifiers) against about 92; 170 authored room templates (638 orientations) against about 150; 23 events; 12 enemy quirks; 20 hairstyles.
2. **Generator hardening:** validator checks 2-tile-wide walkable corridors between every door pair, door-apron prop exclusion, 12 spawn points per combat room, and reward reachability by a 2x2 body; soak is deterministic and gated on 10,000 floors; a runtime softlock guard relocates stuck enemies (`world.ts`, `tools/reach-test.mjs`).
3. **Separate heavy-attack binding** with a hold-to-charge mode (`player.ts:285-299`), in addition to the spec's single melee button.
4. **Extra accessibility:** Rage auto-trigger, UI scale 2x, subtitle size, visual audio cues, touch layout (stick size, button size, opacity, left-handed), hit-stop toggle, screen-shake intensity slider, reduced-lights default on mobile.
5. **Extra challenge floor:** No-Damage Audit alongside Fire Drill and Quiet Carriage.
6. **Save robustness:** FNV checksum on every envelope, fall-back to `.tmp` and `.bak` (`storage.ts:284-303`).
7. **Weakened-window mechanic** for Act 4 sealed curtain walls and a stagger-window UI marker for boss grabs.
8. **Boss tooling and QA:** `tools/boss-test.mjs`, `ai-test.mjs`, `hazard-test.mjs`, `content-test.mjs`, `meta-test.mjs`, `reach-test.mjs`; the AI test asserts "every damage was telegraphed" and act minimums.
9. **Linux AppImage job with Xvfb smoke test** in CI (Steam Deck testing), beyond the Windows and Android builds specified.
10. **Achievements system** (about 70 achievements with local and platform hooks) and a KPI cosmetics track with hub decor and car customisation.
11. **Lore and UX flourishes:** per-department email bodies, CorpOS notifications, Annual Leave breakdown on the summary deck, run history, local daily boards, car-park hub with moods.
12. **Anti-exploit extra:** summoned enemies drop at most 1 Petty Cash so summoners cannot be farmed (`enemies/common.ts:506`).

---

# 6. Notes for the Lead

* Several gameplay-relevant flags are `as any` casts (`wetZones`, `breachStunMult`, `weakened`, `injunctionT`). They work but weaken the typechecker; consider typing them on `World` and `Player` (S).
* The dev brief says exits are previewed; previews appear when the floor is cleared. If you want Hades-style pre-clear previews on locked exits, `hud.ts:197` gates on `w.floorCleared` (S).
