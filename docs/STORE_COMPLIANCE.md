# Store Compliance Documentation

**Game:** Company Policy  
**Platforms:** Steam (PC/Deck), Google Play (Android)  
**Publisher:** [TBC: Kallum Booth / IntelliDrift Ltd]  
**Prepared:** 6 October 2026

---

## 1. Google Play Data Safety Form

### 1.1 Data Types Collected or Shared

**Answer the Data Safety questionnaire as follows:**

| Data Type | Collected | Shared | Purpose | Retention |
| --- | --- | --- | --- | --- |
| App activity (gameplay events, floors reached, run duration) | ✓ Optional only | ✗ No | Game balancing and analytics | Local queue only; 90 days if sent (future) |
| Crash logs | ✓ Optional only | ✗ No | Crash debugging | Local buffer (25 entries); not sent by default |
| Device or other IDs | ✓ No | ✗ No | — | — |
| Name | ✗ No | ✗ No | — | — |
| Email | ✗ No | ✗ No | — | — |
| Location | ✗ No | ✗ No | — | — |
| Photos or videos | ✗ No | ✗ No | — | — |
| Audio files | ✗ No | ✗ No | — | — |
| Calendar | ✗ No | ✗ No | — | — |
| Contacts | ✗ No | ✗ No | — | — |
| Messages | ✗ No | ✗ No | — | — |
| Payment info | ✓ One-time in-app purchase only | ✗ No | Android unlock purchase via Play Billing | Processed by Google; developer does not store |
| Phone number | ✗ No | ✗ No | — | — |
| User IDs | ✗ No | ✗ No | — | — |
| Web browsing | ✗ No | ✗ No | — | — |

### 1.2 Sensitive Permissions

**Requested permissions in AndroidManifest.xml:**

- `android.permission.INTERNET` – Required for Play Games leaderboards, cloud saves, and optional telemetry upload (future)
- `android.permission.VIBRATE` – Haptic feedback during gameplay

**Not requested:**

- Camera, microphone, location, contacts, calendar, SMS, phone state, or any other sensitive permissions

### 1.3 Encryption in Transit

- Cloud saves are synced to Google Play Games Saved Games via HTTPS (encrypted)
- Telemetry (if enabled and endpoint configured) would be sent via HTTPS
- Leaderboard submissions use HTTPS

### 1.4 Policy Compliance

Declare:

- ✓ Data practices comply with Google Play policy and GDPR
- ✓ No ads, no third-party SDKs, no data sharing with external parties
- ✓ Telemetry is opt-in only (disabled by default)
- ✓ No sale of personal data
- ✓ Privacy policy is clear and up to date at `/docs/PRIVACY_POLICY.md`

---

## 2. IARC (International Age Rating Coalition) Questionnaire

### 2.1 Content Rating Questions (Draft Answers)

**Violence:**
- Does the game contain realistic violence? **No.** The game features stylised pixel-art violence (dismemberment, blood decals, death animations). The art style is deliberately cartoonish and exaggerated (similar to Hotline Miami), not photorealistic.
- Gore toggle available? **Yes.** Three options: Full, Reduced, Off.
- Does violence escalate? **Yes, satirically.** The game escalates from junior staff to corporate cult, but all violence remains within a cartoon-violence frame.

**Blood:**
- Does the game show blood? **Yes.** Blood decals are visible in combat, especially with the gore toggle enabled.
- Is it gratuitous or necessary? **Necessary.** Blood is part of the stylised pixel-art violence and combat feedback, not gratuitous.

**Dismemberment:**
- Does the game show dismemberment? **Yes.** Enemies lose limbs in combat (pixel-art, stylised).
- Gore toggle affects this? **Yes.** Toggle settings: Full (dismemberment shown), Reduced (implied/off-screen), Off (no dismemberment).

**Profanity:**
- Does the game contain profanity? **Yes.** Corporate jargon is used mockingly, and strong language appears in enemy barks and UI text.
- How frequent? **Moderate.** Profanity serves the satire and matches the 18+ rating.

**Crude Humour:**
- Does the game contain crude or sexual humour? **Yes, crude only.** Non-explicit sexual innuendo and crude office humour (e.g. bathroom jokes, crude corporate jargon puns).
- Sexual content? **No explicit sexual content.** Only crude, non-explicit innuendo.

**Drugs and Alcohol:**
- Are drugs or alcohol present? **Yes, as flavour only.**
- Do they give gameplay benefits? **No.** Per Australian rating standards, consumables are either fictional (e.g. "Rage Syrup") or if caffeine-based, only they give buffs. Real drugs and alcohol never provide in-game benefits.
- Examples: Interns may carry energy drinks (cosmetic/no buff), or a coffee mug prop (no consumable). A "Rage Potion" is fictional and non-narcotic. Alcohol (e.g. office minibar) appears as scenery or a thrown weapon, never as a consumable buff.

**Gambling:**
- Are there loot boxes? **No.**
- Is there a gacha or randomised purchase system? **No.**
- Are there cosmetic or gameplay-affecting randomised rewards? **No loot boxes.** Rewards are:
  - Benefits (picked 1 of 3 from a pre-rolled set, deterministic choice)
  - Desk Items (deterministic enemy/treasure drops)
  - Currency (earned by kills/clears)
  - No randomised paid purchases

**User Interaction:**
- Leaderboards? **Yes.** Platform-native leaderboards (Steam and Google Play).
- Social features? **No.** Leaderboards are score-only, no messaging or user profiles.
- In-game chat? **No.**
- Ability to interact with other players? **No.** Leaderboards are for personal best comparison only.

**In-Game Purchases:**
- Does the game contain in-app purchases? **Yes, Android only.**
- What is sold? **One-time unlock.** Act 1 is free; the full game (Acts 2–4) is a one-time in-app purchase via Play Billing on Android.
- Price? [TBC: £7.99–£9.99 or regional equivalent]
- Premium currency? **No.** No premium currency, only the one-time unlock.
- Loot boxes? **No.**
- Pay-to-win? **No.** The unlock is purely content access, not a gameplay advantage. The game is beatable at base power on Act 1.

**App Features:**
- Third-party login? **No.** Local saves only; cloud saves via Steam / Play Games.
- Ads? **No ads at all.**
- Tracking? **No third-party tracking. Telemetry is opt-in only and does not identify users.**

### 2.2 Expected Ratings

Based on the content above, the expected IARC ratings are:

| Region | Rating | Why |
| --- | --- | --- |
| **PEGI** | 18 | Stylised but persistent violence, gore with toggle, profanity, crude humour |
| **ESRB** | M (Mature 17+) | Blood, violence, crude humour |
| **USK** (Germany) | 18 | Violence, blood |
| **ClassInd** (Brazil) | 16 or 18 | Violence, gore (exact rating per IARC questionnaire) |

---

## 3. Steam Content Survey (Mature Content Questionnaire)

### 3.1 Steam Content Questions

**Violence:**
- ✓ Yes. The game contains violence.
- Content: Stylised pixel-art violence, dismemberment, blood, executions against environmental hazards.
- Gore toggle: Available (Full, Reduced, Off).

**Blood:**
- ✓ Yes. Blood decals and spattering are part of combat feedback.

**Gore:**
- ✓ Yes. Stylised gore: dismemberment, persistent blood. Toggle available.

**Sexual Content:**
- ✓ Yes, but only crude innuendo (no explicit sexual content).

**Profanity:**
- ✓ Yes. Corporate jargon mockery and mild profanity in barks and UI.

**Drugs, Alcohol, Tobacco:**
- ✓ Yes, as decorative/story elements only (no gameplay benefit).

**Illegal Activities:**
- ✗ No. The game does not glorify illegal activities; it is satire of corporate abuse.

**Other Mature Content:**
- Flagging recommendation: **Yes, check "Mature Content"** to apply the mature-content flag and require age verification.

---

## 4. Regional Compliance Notes

### 4.1 Germany (USK)

**Requirement:** No real-world extremist symbols or ideologies.

**Compliance:**
- ✓ No swastikas, Nazi symbols or hateful imagery of any kind
- ✓ Corporate cult imagery is fictional and stylised (ceremonial lanyards, company-values shrines), not based on real-world hate movements
- ✓ Satire of corporate excess does not reference real extremism
- ✓ Ready for USK 18 submission

**Action before submission:** Ensure no symbol or texture in the art assets inadvertently resembles real-world extremist imagery. If questionable, commission a legal review.

### 4.2 Australia (Classification Board)

**Requirement:** Drugs and alcohol must never provide gameplay benefits.

**Compliance:**
- ✓ Drugs and alcohol are flavour only
- ✓ All consumable buffs come from fictional items (Rage Potion) or caffeine (coffee)
- ✓ Real-world drugs and alcohol appear only as:
  - Decorative props (e.g. office minibar)
  - Throwable weapons (e.g. liquor bottle)
  - Enemy drops or scenery
- ✓ No consumable item with a drug/alcohol theme grants any stat buff
- ✓ Compliant with ACB M classification (likely) or MA15+ / R18+ (if the violence pushes higher)

**Action:** In item data files, verify no consumable with an alcohol or drug name (e.g. "Whiskey", "Cocaine Jolt") has an stat effect. Fictional names only for buffs (e.g. "Rage Tonic").

---

## 5. Loot Box and Ethics Statement

### 5.1 No Loot Boxes

**Commitment:**
- ✗ No loot boxes of any kind
- ✗ No randomised purchasable content
- ✗ No gacha system
- ✗ No cosmetics locked behind randomised purchases
- ✗ No gameplay-affecting randomised paid rewards

**What the game contains instead:**
- ✓ Deterministic Benefits: Player picks 1 of 3 from a pre-rolled set (not random)
- ✓ Fixed progression unlocks: Weapons, Benefits and starting roles are unlocked via meta currency earned by play
- ✓ One-time unlock (Android): Full game content for a fixed price
- ✓ No premium currency

### 5.2 No Premium Currency

- ✗ No gems, coins, premium currency or battle pass
- ✓ Only in-run currency (Petty Cash) and permanent currency (Annual Leave)
- ✓ All earned through play, never purchased

### 5.3 No Energy Timers

- ✗ No energy bars, timers or stamina systems that gate play
- ✗ No "wait X hours to play again" mechanics
- ✓ Play at your own pace; all gameplay is time-unlimited

### 5.4 No Ads

- ✗ No banner ads, video ads or interstitials
- ✓ Game experience is ad-free and uninterrupted

### 5.5 No Pay-to-Win

- ✓ The one-time Android unlock is content access only, not a power boost
- ✓ The game is beatable at base power without any purchases
- ✓ All permanent progression is cosmetic (outfits, titles, hub décor) or unlock-only (pool content), never stat increases

---

## 6. Pre-Submission Checklist

Complete these before submitting to Steam and Google Play:

### 6.1 General

- [ ] Privacy policy published and link added to game settings (in-game Privacy tab links to `/docs/PRIVACY_POLICY.md` or a live website)
- [ ] Privacy policy reviewed by a lawyer (GDPR + local law)
- [ ] ESRB / IARC questionnaire completed and age rating assigned
- [ ] Game tested on minimum-spec devices (Android: 2020 mid-range, 4GB RAM, Android 10+; PC: integrated graphics, 8GB RAM)
- [ ] All save data encryption and cloud sync (Steam Cloud, Play Games) tested
- [ ] Telemetry toggle tested (confirm OFF by default, and no data leaves device)
- [ ] Crash reporter tested (confirm local buffer only, no transmission by default)

### 6.2 Google Play

- [ ] Google Play Developer Account created and verified
- [ ] App signed with release keystore (not debug)
- [ ] Play Billing SDK integrated for one-time unlock purchase
- [ ] Data Safety form completed and published:
  - [ ] No ads declared
  - [ ] No third-party SDKs declared (if true)
  - [ ] Telemetry marked as optional/diagnostic only
  - [ ] Permissions justified (INTERNET for cloud sync, VIBRATE for haptics)
- [ ] Age rating set (likely PEGI 18 / ESRB M / USK 18)
- [ ] Content rating (violence, blood, crude humour, profanity, crude innuendo, no-benefit drugs/alcohol)
- [ ] Screenshots and video trailer uploaded
- [ ] Store listing text includes content warnings (violence, gore toggle, profanity)
- [ ] Minimum API level set to current Play requirements (check at submission time; likely API 34+)
- [ ] Build tested on 3+ device configurations (budget, mid-range, flagship)
- [ ] Telemetry and crash endpoints **not configured** (both must be empty strings in builds sent to stores)

### 6.3 Steam

- [ ] Steamworks account set up
- [ ] Mature content flag enabled
- [ ] Content survey completed:
  - [ ] Violence: Yes
  - [ ] Gore: Yes
  - [ ] Sexual content: Only crude innuendo
  - [ ] Profanity: Yes
  - [ ] Alcohol/drugs: Flavour only
- [ ] Age rating set (expected: ESRB M, PEGI 18)
- [ ] Screenshots and trailer uploaded
- [ ] Store page text describes content warnings clearly
- [ ] Store page includes link to privacy policy
- [ ] PC build tested on minimum-spec hardware (integrated graphics, 8GB RAM, Windows 10)
- [ ] Steam Deck Verified submission plan (if targeting Deck; requires controller input, 1280×800 on-deck testing)
- [ ] Telemetry and crash endpoints **not configured** in release build
- [ ] Achievements and leaderboards configured in Steamworks backend

### 6.4 Germany (USK)

- [ ] Legal review of art assets to confirm no extremist symbols
- [ ] If USK submission required (separate from IARC):
  - [ ] Submit via the online USK database with screenshots and a description of content
  - [ ] Budget for USK rating fee (~€250–€500 indicative)

### 6.5 Australia (ACB)

- [ ] Compliance check: no drug/alcohol consumables have stat effects
- [ ] If classification required (may not be if covered by IARC):
  - [ ] Check ACB website for online submission process
  - [ ] Budget for classification fee (~AUD $150+ indicative)

### 6.6 Business/Legal

- [ ] Company structure and IP ownership finalised ([TBC: Kallum Booth / IntelliDrift Ltd])
- [ ] Game title, trademark and domain checked against existing IP (Steam, Play, trademark database)
- [ ] Terms of Service drafted (if hosting any backend service)
- [ ] Refund policy aligned with platform requirements (Google Play: 48-hour refund window for in-app purchases; Steam: 14-day/2-hour refund policy)
- [ ] Contact email and support process in place
- [ ] Marketing materials reviewed for accurate content descriptions

---

## 7. Store Link Templates

**Use these templates for store descriptions and update with actual details once finalised:**

### 7.1 Steam Store Page (Mature Content Box)

> **Mature Content**: This game contains stylised violence and gore. A gore toggle allows you to reduce or disable visual blood and dismemberment. The game also contains profanity, crude humour and non-explicit sexual innuendo. Rated ESRB M and PEGI 18.

### 7.2 Google Play Store Page

> **Mature**: Violence, blood, gore, profanity, crude humour. A gore toggle is available. For Android, Act 1 (5 floors) is included free; the full game is a one-time in-app purchase. Full privacy policy: [link].

---

## 8. Future Roadmap Compliance Notes

### 8.1 If Telemetry Endpoint Is Ever Configured

- [ ] Update `src/platform/services.ts` to set `telemetryConfig.endpoint` only after all privacy and legal reviews are complete
- [ ] Update privacy policy to include retention periods and data deletion process
- [ ] Re-test telemetry flow: opt-in, local recording, transmission, and user withdrawal
- [ ] Resubmit updated privacy policy to store pages
- [ ] Update Data Safety form on Google Play to reflect transmission details
- [ ] Notify users via in-game notification before deployment

### 8.2 If Crash Reporting Endpoint Is Ever Configured

- [ ] Follow same process as telemetry above
- [ ] Ensure crash reports never include personal data (already true in code)
- [ ] Specify retention policy (recommend max 90 days for debugged crashes)

### 8.3 If Additional Platforms or Regions Are Added

- [ ] iOS: Requires separate App Store review and privacy policy; Apple is stricter on data collection
- [ ] China (via regional publisher): Requires separate compliance audit and may require local data residency
- [ ] EU after 1 Jan 2025: Already covered by UK GDPR alignment; verify DPA amendment if any
- [ ] Other regions: Check local age rating bodies (Brazil ClassInd, Mexico RTC, etc.) as they come online

---

## 9. Contacts and References

### 9.1 Rating Bodies

- **IARC (Google):** [iarc.rec.google.com](https://iarc.rec.google.com)
- **USK (Germany):** [usk.de](https://www.usk.de) — contact: [info@usk.de](mailto:info@usk.de)
- **PEGI (Europe):** [pegi.info](https://www.pegi.info) — for classification verification
- **ESRB (North America):** [esrb.org](https://www.esrb.org) — handled via IARC

### 9.2 Store Requirements

- **Steam:** [steampowered.com/app/[APPID]](https://steampowered.com) → Manage App → Content Rating
- **Google Play:** [play.google.com/console](https://play.google.com/console) → Your App → Growing Your App → App Rating Questionnaire
- **Google Play Data Safety:** [play.google.com/console](https://play.google.com/console) → Your App → Product Policies → App Safety

### 9.3 Privacy and Legal

- **UK Information Commissioner's Office (ICO):** [ico.org.uk](https://ico.org.uk)
- **UK GDPR:** [legislation.gov.uk](https://www.legislation.gov.uk/ukpga/2018/12/) — Data Protection Act 2018 (as amended)
- **Play Billing Terms:** [developer.android.com/google-play/billing](https://developer.android.com/google-play/billing)

---

## 10. Sign-Off and Ownership

| Role | Name | Date | Notes |
| --- | --- | --- | --- |
| Publisher Lead | [TBC: Kallum Booth] | [TBC] | Responsible for regulatory compliance and store submissions |
| Privacy Officer | [TBC] | [TBC] | Reviews privacy policy and data handling practices |
| Legal Review | [TBC: external counsel] | [TBC] | Recommends before any store submission |

---

**Document Version:** 1.0  
**Last Updated:** 6 October 2026  
**Status:** Draft — for internal review before store submissions
