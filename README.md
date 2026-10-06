# Company Policy

> *Mandatory HR training has turned the whole office into a corporate cult. You objected in the meeting. The floor turned on you. Now you're going up.*

**Company Policy** is a top-down 2D action roguelike for PC (Windows, Steam Deck via Proton) and Android, rated 18+. You fight up a 20-floor tower in four acts to reach the CEO in the penthouse. On each floor you choose the stairs, the lift or a corridor, each with a previewed reward, while Rage, improvised office weapons and environmental executions turn the office itself into a weapon.

## Install and play

| Platform | Download (GitHub Actions artifacts / Releases) | Notes |
| --- | --- | --- |
| **Windows 10/11 (x64)** | `CompanyPolicy-Setup-<version>.exe` | Installer with Start-menu and desktop shortcuts. The build is unsigned, so on first run SmartScreen may warn: choose **More info → Run anyway**. |
| Windows (no install) | `CompanyPolicy-Portable-<version>.exe` or `…-win-x64.zip` | Run directly. |
| **Android 10+** | `CompanyPolicy-<version>-android.apk` | Sideload: enable *Install unknown apps* for your browser or file manager, then open the APK. The `.aab` is for Google Play upload. |
| Linux / Steam Deck | `CompanyPolicy-<version>-linux-x64.AppImage` | `chmod +x` then run. |
| Browser | `CompanyPolicy-Web` (static `dist/`) | Serve the folder over HTTP. |

Every push to the branch builds all of these in **Actions → Build → Artifacts**. Tagged versions (`v*`) are attached to a GitHub Release.

## Controls

| Action | Controller | Keyboard and mouse | Touch |
| --- | --- | --- | --- |
| Move | Left stick | WASD | Left virtual stick |
| Aim | Right stick | Mouse | Right virtual stick (aim assist) |
| Melee (tap = combo, hold = heavy) | X / Square | Left mouse | Melee button |
| Heavy (alternative) | LT / L2 | Q | Heavy button (when enabled) |
| Ranged / throw | RT / R2 | Right mouse | Release the aim stick |
| Grab (staggered or <25% HP) | B / Circle | F | Contextual button |
| Dash (i-frames) | A / Cross | Space | Dash button |
| Rage (when full) | LB + RB | R | Rage button (pulses) |
| Interact / execute | Y / Triangle | E | Contextual pop-up |
| Pause | Start / Options | Esc | Pause button |

Everything can be remapped in **Control Panel → Controls**. Accessibility options:

- **Gore:** Full / Reduced / Off.
- **Screen:** screen-shake toggle and intensity, hit-stop toggle.
- **Visual:** colourblind-safe telegraphs, subtitles with size options, visual indicators for audio cues.
- **Input:** hold-to-tap alternatives, adjustable aim assist, Rage auto-trigger.
- **Cutscenes:** Always / First time / Off.
- **Workplace Adjustments assist mode:** damage-taken and game-speed sliders.

## What's in the box
- **20 floors in 4 acts**: Ground, Operations, Governance and Senior Leadership. Each floor is generated from 170 hand-authored room templates (638 after rotation and mirroring) across 14 department themes, with room-lock encounters, Alarm floors, breachable walls and exterior windows.
- **20 enemy archetypes**, each with its own behaviour, plus Junior, Senior and Lead tiers that add extra moves. Every individual is procedurally generated: modular pixel characters (2 rigs × 3 builds, 29 animations), UK names, satirical job titles and quirks. Barks fill your Rage.
- **4 three-phase bosses** with arena set pieces and finishers: Facilities Manager, Head of Sales, Head of Compliance and the CEO. Optional Director bosses come from the Promotion system.
- **Environmental combat**:
  - Hazards: glass partitions, printers, electrified water coolers, sprinklers, extinguishers, swivel chairs, filing cabinets.
  - Nine execution mini-cutscenes, including defenestration with an exterior fall shot and a photocopier that prints the victim's face.
  - Body-throw wall breaches that merge two rooms into one fight.
- **Build variety**:
  - 112 department Benefits with three rarities and 12 dual-department synergies.
  - 40 Desk Items and 11 Stress Modifiers.
  - 34 breakable improvised weapons.
- **Economy and floors**: Petty Cash with the Canteen intranet shop and vending machines, 23 events, the Stationery Cupboard, and challenge floors (Fire Drill, Quiet Carriage).
- **Meta**: the staff car park hub (vending-machine unlocks, Car Boot roles, Internal Announcements noticeboard, Dashboard, Car Radio), 5 starting roles, Annual Leave (kept on death), 72 achievements, and Performance Review difficulty modifiers with cosmetic KPI rewards.
- **Daily run**: seed from the UTC date, one scored attempt per day, a published modifier set, and local leaderboards. A platform-service layer is ready for Steam and Play Games leaderboards.
- **Presentation**:
  - CorpOS corporate-software parody UI.
  - A fully synthesised adaptive score: muzak in exploration, house or techno in combat, plus a Rage layer and escalating boss phases. Sixteen original tracks.
  - 139 SFX and formant-synthesised gibberish voices with subtitles.
  - 554 voiced-style barks, 130 loading memos and 72 achievements.

Every sprite, tile, icon, font glyph, sound and note is generated by the game's own code. There are no third-party art or audio assets.

## Development
```bash
npm ci                 # (ELECTRON_SKIP_BINARY_DOWNLOAD=1 on machines that can't fetch Electron)
npm run dev            # http://localhost:5173
npm run typecheck
npm run soak           # generate and validate 10,000 floors (release gate: zero softlocks)
```
- **Quick-play:** `http://localhost:5173/#play&seed=1234&floor=7&type=elite&role=temp`
- **Galleries:** `#dev=chars`, `#dev=floor`, `#dev=props`, `#dev=items`, `#dev=icons`, `#dev=ui-menu`, `#dev=bosses`, `#dev=audio`
- **QA tools (`tools/`):**
  - `bot.mjs`: an automated player that runs whole floors.
  - `reach-test.mjs`: softlock sweep.
  - `ai-test.mjs`, `boss-test.mjs`, `hazard-test.mjs`, `content-test.mjs`, `meta-test.mjs`: module tests.
  - `audio-check.mjs`: loudness, clipping and clicks.
  - `shot.mjs`: screenshots.
- **Balancing:** edit `src/data/csv/*.csv` (weapons, archetypes, prices, rewards, modifiers, roles, acts) in any spreadsheet.
- **Further reading:** architecture and conventions in `docs/DEV_BRIEF.md`, building and signing in `docs/BUILD.md`, the design spec in `docs/SPEC.md`, spec traceability in `docs/COMPLIANCE.md`.

## Owner actions before commercial release
These need accounts, legal opinions or people, so they can't be done in code:
1. **Steam:** pay the Steam Direct fee, get an App ID, and wire Steamworks into `src/platform/services.ts` (stub provided).
2. **Google Play:**
   - Create the Play Console listing.
   - Configure Play Games Services and Play Billing; the one-time unlock is stubbed as unlocked.
   - Create your own upload key; the committed key is for sideloading only.
3. **Patent freedom-to-operate opinion** on Promotion (spec 5.6). The full system is built but ships in the spec's *light* fallback until cleared: set `PROMOTION_MODE` in `src/game/flags.ts`.
4. **Legal checks:**
   - Trademark and store search on the title "Company Policy".
   - PEGI/IARC and Steam content surveys.
   - Privacy policy (telemetry is opt-in and local-only by default).
5. **Signing:** code-sign the Windows build to remove the SmartScreen warning.
6. **Voice:** optional voice acting. The spec's fallback, subtitled barks with synthesised grunts, ships now.

© Kallum Booth. All rights reserved.
