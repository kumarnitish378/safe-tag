# SafeTag Emergency Alert — Android POC · Setup & Requirements

> **Status:** planning only. No code yet. This document lists everything to
> install and prepare. Once Android Studio is installed, we start writing code
> from this folder (`d:\safe-tag-project\android`).

---

## 1. What we're building (recap)
A **proof-of-concept** that proves one thing: when a **finder** scans a SafeTag
and triggers an SOS, the **owner's Android phone rings like an incoming call** —
loud, full-screen, over the lock screen — carrying the finder's **live location**
and the wearer's **critical info**, and the owner taps **Acknowledge** to stop it.

- **Owner** installs the app (the caregiver — e.g. a parent). **Finder needs no app.**
- **Owner's phone number is never shown** to the finder or exposed publicly.
- Reliability core: a **server-side escalation cascade** alerts contact #1 → #2 →
  #3 until someone **acknowledges**. **SMS is simulated (logged)** for the POC — no
  DLT or paid telephony needed.

Two parts:
1. **Android app** (Kotlin + Jetpack Compose + Firebase Cloud Messaging).
2. **Node.js backend** (Express + Firebase Admin) — sends the push, runs the
   escalation, and serves a tiny "finder scan" web page to trigger it.

---

## 2. Prerequisites to install

### A. Android Studio (main tool)
- Download **Android Studio** (latest stable) from
  <https://developer.android.com/studio>.
- During setup, let it install:
  - **Android SDK** (API level 35 recommended; minimum we target is API 26).
  - **Android SDK Platform-Tools** (gives you `adb`).
  - **Android Emulator** + at least one **system image** (e.g. Pixel, API 34/35)
    — *optional if you'll use a real phone (recommended for this POC).*
- Android Studio bundles the correct **JDK (17)** — no separate Java install needed.

### B. Node.js (for the backend)
- Already installed on this machine (the SafeTag web app uses Node 20+). Verify:
  ```powershell
  node --version    # expect v20+ 
  ```
- No extra global installs — backend deps come from its own `package.json`.

### C. A physical Android phone (strongly recommended)
- The "ring over the lock screen / break through silent" behavior is best proven
  on a **real device**, not the emulator.
- Enable **Developer Options** → **USB debugging**:
  Settings → About phone → tap **Build number** 7× → back → Developer options →
  turn on **USB debugging**. Connect via USB and accept the debugging prompt.

---

## 3. Firebase setup (needed for real push / FCM)
You'll create a free Firebase project and give the app + backend their keys.

### Steps (in the Firebase console — <https://console.firebase.google.com>)
1. **Create a project** (e.g. `safetag-sos-poc`). Google Analytics: optional/off.
2. **Add an Android app** to the project:
   - **Package name:** `in.sftg.sos` (we'll use this — tell me if you want a different one).
   - Download the generated **`google-services.json`**.
   - 👉 Place it at `android/app/google-services.json` (I'll tell you exactly where when we code).
3. **Cloud Messaging** is enabled by default (Build → **Cloud Messaging**). Nothing
   else to toggle for FCM v1.
4. **Service account key for the backend** (so the server can send pushes):
   - Project settings (gear) → **Service accounts** → **Generate new private key**.
   - Downloads a JSON file → 👉 save as `android/backend/serviceAccountKey.json`
     (**do not commit it** — it's a secret; we'll gitignore it).

> You don't need to do any of this *now* — just have a Google account ready. We'll
> walk these steps when we wire FCM.

---

## 4. Tech stack & versions we'll use
| Piece | Choice |
|---|---|
| Language | **Kotlin** |
| UI | **Jetpack Compose** (Material 3) |
| Min / Target SDK | **26** (Android 8.0) / **35** |
| Push | **Firebase Cloud Messaging (FCM v1)** |
| Networking (app→backend) | **OkHttp** + Kotlin coroutines |
| Alert sound | Device **alarm ringtone** (no audio file to ship) |
| Location display | lat/lng + **"Open in Google Maps"** intent (no Maps SDK/API key) |
| Backend | **Node.js + Express + firebase-admin** (in-memory state, no DB) |

*(No Google Maps API key required — we open the finder's location via a maps URL,
keeping setup light.)*

---

## 5. Project structure we'll create
```
android/
├─ SETUP.md                ← this document
├─ backend/                ← Node.js trigger + escalation + finder web page
│  ├─ server.js
│  ├─ package.json
│  ├─ .env.example
│  └─ serviceAccountKey.json   (you add — gitignored)
└─ app/                    ← the Android app (opened in Android Studio)
   ├─ build.gradle.kts / settings.gradle.kts / ...
   └─ app/
      ├─ google-services.json  (you add — gitignored)
      └─ src/main/
         ├─ AndroidManifest.xml
         ├─ java/in/sftg/sos/
         │  ├─ MainActivity.kt              (register / home / history screens)
         │  ├─ EmergencyAlertActivity.kt    (full-screen, over-lock-screen ring UI)
         │  ├─ SosFirebaseMessagingService  (receives the push)
         │  ├─ AlertForegroundService.kt    (loud looping sound + vibration)
         │  └─ data/ (models, API client, demo state)
         └─ res/ (strings, theme, notification icon)
```

---

## 6. Android permissions the app will request (FYI)
- `POST_NOTIFICATIONS` (Android 13+ runtime prompt)
- `USE_FULL_SCREEN_INTENT` (ring over lock screen; Android 14+ may need a Settings toggle)
- `FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_MEDIA_PLAYBACK` (keep the alert alive)
- `INTERNET`, `VIBRATE`, `WAKE_LOCK`
- Optional: disable **battery optimization** for the app (Xiaomi/Oppo/Vivo/Realme
  aggressively kill background apps — this affects push reliability; we'll add a
  prompt guiding the user to allow it).

---

## 7. Build phases (once we start coding)
1. **Phase 1 — the ring.** App with a built-in **"Simulate SOS"** button →
   full-screen call-style alert over the lock screen, loud sound, Acknowledge.
   *No backend/Firebase needed — runs the same day.*
2. **Phase 2 — real push.** Add FCM + the Node backend so a **browser scan page**
   triggers the ring **remotely**.
3. **Phase 3 — escalation.** Backend cascades to contact #2, #3 on no-ack, logs
   `[SIM-SMS]`, stops on Acknowledge. Alert history in the app.

---

## 8. Who does what
| I (Claude) write | You do |
|---|---|
| All Kotlin + Compose source | Install Android Studio + SDK |
| The full-screen ring + FCM + foreground service | Create the Firebase project |
| The Node backend + finder scan page | Add `google-services.json` + `serviceAccountKey.json` |
| Manifest, gradle, resources, READMEs | Run/build in Android Studio, test on your phone |
| Fixes for any build/runtime errors you paste back | Be my eyes: confirm it actually rings |

> I can't launch an Android emulator or verify the ring visually from here, so
> you run it and paste any errors — we iterate.

---

## 9. Pre-coding checklist
- [ ] Android Studio installed (with Android SDK API 35 + Platform-Tools)
- [ ] `adb` works (`adb devices` lists your phone) — *if using a real device*
- [ ] Node.js 20+ available (`node --version`)
- [ ] Google account ready for Firebase
- [ ] (When we reach Phase 2) Firebase project created + `google-services.json` downloaded
- [ ] (When we reach Phase 2) Service-account key downloaded for the backend
- [ ] A real Android phone with USB debugging on (recommended)

---

### Decisions to confirm before we code
1. **App package name** — proposed `in.sftg.sos`. OK, or prefer another?
2. **App display name** — proposed "SafeTag SOS". OK?
3. Start at **Phase 1 (ring only, no Firebase)** so you see it working fast, then
   add push? *(Recommended.)*

Ping me once Android Studio is installed and we'll begin with Phase 1.
