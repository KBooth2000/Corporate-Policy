# Privacy Policy

**Last updated:** 6 October 2026

## 1. Introduction

This Privacy Policy describes how **[TBC: Company to be confirmed; IntelliDrift Ltd]** ("we", "us", "our", or "the Publisher") collects, uses, and protects your personal data when you play Company Policy (the "Game").

The Publisher is the data controller under UK GDPR and data protection law. We respect your privacy and are committed to protecting your personal data.

**Data Controller:** [TBC: Kallum Booth / IntelliDrift Ltd]  
**Contact:** [TBC: contact email and address]

---

## 2. What data we collect

### 2.1 Data collected automatically

**We collect no personal data by default.**

The Game runs entirely on your device. We do not automatically collect:

- Your name, email address, phone number or postal address
- Your location, device advertising ID, or unique device identifier
- Your contacts, photos, calendar or any other personal content
- Detailed device information beyond your device type (e.g. phone vs. tablet)

### 2.2 Optional telemetry (you choose)

If you **opt in** to anonymous usage data in the Privacy settings, we record:

- **Gameplay metrics:** the floor you reached, how long your run lasted, which upgrades you unlocked
- **Crash reports:** error messages from the Game, but never your personal files or system information
- **Rough device class:** only "mobile" or "desktop", not your device model
- **Game version and platform** (Steam vs. Android)

This data is **anonymous**—it contains no identifying information and we cannot tie it back to you personally.

### 2.3 How we store telemetry data

When telemetry is enabled, data is **recorded in a local queue on your device only**. Nothing leaves your device unless a future version of the Game is specifically configured with an upload endpoint by the Publisher—which has not yet happened. If it ever does, we will update this policy and you will be prompted to consent.

### 2.4 Cloud saves (Steam Cloud and Google Play Games)

If you use the auto-sync feature on Steam or Google Play:

- Your save files (progress, unlocks, settings) are synced to **Steam Cloud** (PC) or **Google Play Games Saved Games** (Android).
- **Valve and Google are independent data controllers** for this data. Their privacy policies apply:
  - [Steam Privacy Policy](https://steampowered.com/privacy/)
  - [Google Privacy Policy](https://policies.google.com/privacy)
- The Publisher does not have direct access to your cloud saves; Valve and Google control them.

### 2.5 Crash reports

The Game includes an integrated crash reporter. Crash data is stored in a **local buffer of up to 25 reports on your device only**. We never send crash reports anywhere unless you explicitly opt in to telemetry AND a future build is configured with an endpoint—which has not happened. Crash reports never contain your personal files, system passwords, or sensitive device data.

---

## 3. Legal basis for processing (UK GDPR)

We process your data only on the following legal grounds:

### 3.1 Consent (Article 6(1)(a))

Telemetry and crash reporting are **entirely opt-in**. You choose whether to enable telemetry in the Privacy settings. We only collect this data if you have explicitly consented.

### 3.2 Contractual performance (Article 6(1)(b))

We process data necessary to provide the Game's core services: saving your progress locally and syncing it to cloud platforms (at your request).

### 3.3 Legitimate interests (Article 6(1)(f))

We use gameplay metrics (with your consent) to improve the Game, fix bugs and balance gameplay. We never use this data for marketing, profiling or selling to third parties.

---

## 4. What we don't do

We explicitly do not:

- Sell your data to third parties
- Build advertising or marketing profiles
- Track you across other apps or websites
- Use your data for targeted advertising
- Require an account or login
- Store your personal data (name, email, etc.)
- Use synthetic voice without proper consent and attribution
- Integrate any third-party analytics, tracking or ad SDKs

---

## 5. Your rights under UK GDPR

You have the right to:

- **Access:** Request a copy of the personal data we hold about you
- **Correction:** Ask us to correct inaccurate data
- **Erasure:** Request deletion of your data (the "right to be forgotten")
- **Restrict processing:** Ask us to limit how we use your data
- **Withdraw consent:** Disable telemetry at any time in the Privacy settings; this stops all future collection
- **Portability:** Receive your data in a structured format
- **Object:** Raise concerns about how we process your data

To exercise any of these rights, contact us at: [TBC: contact email]

You also have the right to lodge a complaint with the Information Commissioner's Office (ICO) at [ico.org.uk](https://ico.org.uk).

---

## 6. Data retention

### 6.1 Telemetry data

Telemetry data is kept in a local queue on your device until it is cleared (either by you in the Privacy settings, or by the Game automatically after reaching 200 events).

If telemetry is ever sent to a server in the future, the Publisher will retain it only as long as necessary for balancing and bug fixes—typically **no more than 90 days**. We will specify a retention period in a future update to this policy if an endpoint is configured.

### 6.2 Crash reports

Crash reports follow the same local-queue model and retention as telemetry. They are not sent anywhere by default.

### 6.3 Save data

Your save file is retained **for as long as the game is installed**. Uninstalling the Game removes all local save data. Cloud saves (Steam Cloud / Google Play Games) persist according to those platforms' policies.

### 6.4 Local settings

Your game settings and preferences are stored locally and persist until you reset them or uninstall the Game.

---

## 7. Children (under 18)

**The Game is rated for ages 18+ (PEGI 18 / ESRB M).** It is not designed for or directed at children under 18.

We do not knowingly collect personal data from children. If you believe a child under 18 has provided us with personal data, please contact us immediately so we can delete it.

---

## 8. International transfers

We do not transfer your personal data outside the UK or EU, except:

- **To the USA via Steam or Google Play:** If you use cloud sync on Steam or Android, your save data may be processed by Valve (US-based) or Google (US-based) under their respective standard contractual clauses and privacy terms.
- **No other international transfers occur.**

---

## 9. Data security

We protect your data through:

- **Local-first storage:** All data is stored on your device by default, not on our servers
- **No unnecessary transmission:** Data only leaves your device if you explicitly enable telemetry and a server endpoint is configured
- **Standard security practices:** Encrypted storage for sensitive local data (e.g. cloud sync keys)

However, no system is 100% secure. Please report any security concerns to: [TBC: security contact email]

---

## 10. Changes to this policy

We may update this Privacy Policy from time to time. We will notify you of material changes via:

- An in-game notice
- Updated text in the Privacy settings
- A date stamp on this document (see top)

Your continued use of the Game after changes constitutes acceptance of the updated policy.

---

## 11. Contact us

**Data Controller:** [TBC: Kallum Booth / IntelliDrift Ltd]

For privacy inquiries, to exercise your rights, or to report a security issue:

**Email:** [TBC: contact email]  
**Postal address:** [TBC: address]  
**Privacy inquiry response time:** We aim to respond within 30 days.

---

## 12. Appendix: Telemetry data schema

If telemetry is enabled, each event recorded includes:

```
{
  timestamp: <milliseconds since Unix epoch>,
  event: <string: event type>,
  properties: {
    floor?: <number>,
    durationSec?: <number>,
    won?: <boolean>,
    crashMessage?: <string>,
    deviceClass?: <'mobile' | 'desktop'>,
    platform?: <'web' | 'steam' | 'android'>,
    ... (other gameplay properties)
  }
}
```

No personal identifiers are included. The queue is limited to 200 events before older entries are discarded.

---

**Version:** 1.0  
**Language:** UK English  
**Jurisdiction:** UK GDPR, Data Protection Act 2018 (as amended)
