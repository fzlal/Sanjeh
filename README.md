# سنجه — SANJEH

[🇮🇷 نسخهٔ فارسی](README-fa.md) · **English**

SANJEH is a private exam companion for paper tests that works offline. Build an
exam, set up its booklets and timers, prepare the answer key, collect answers,
and get a report card — without an account, a server, or an internet connection.

[Try SANJEH](#get-started) · [How it works](#how-an-exam-works) ·
[Features](#what-you-can-do) · [Privacy](#privacy) ·
[For developers](#for-developers)

## Why SANJEH?

- **Your exams stay yours.** Everything is stored on your own device. No
  account, no cloud, no telemetry, no external AI calls.
- **Made for Persian classrooms.** Persian is the default language, the layout
  is right-to-left, and dates follow the Jalali calendar. English is included
  too.
- **Works where the internet doesn't.** Use the installable web app, or a
  dedicated app on Android, Windows, macOS, and Linux. Your data stays available
  offline.
- **As familiar as paper.** Booklets, four-option bubbles, page-by-page timers,
  and a report card that feels like a marked answer sheet.

## Get started

| Platform | How to get it |
| --- | --- |
| **Web / PWA** | [Open the web app](https://fzlal.github.io/Sanjeh/). In Chrome or Edge choose **Install app**; on iPhone or iPad use **Add to Home Screen**. |
| **Android** | Download an APK from [Releases](https://github.com/fzlal/Sanjeh/releases). If you are unsure which file to pick, take the **universal** APK. |
| **Windows / macOS / Linux** | Download the installer for your system from [Releases](https://github.com/fzlal/Sanjeh/releases). |

Each platform keeps its own local data. To move exams between the web app,
desktop, and Android, create a **Backup** ZIP in one app and import it in the
other.

> **iOS:** the build workflow produces an unsigned simulator build for
> development. There is no installable iOS release yet.

## How an exam works

New here? The whole flow is five steps.

1. **Create the exam.** Give it a name, choose how the answer key will be
   entered, and add one or more booklets (دفترچه) with their question counts and
   time limits. Exam PDFs and descriptive answer PDFs are optional. Set the
   schedule now or later in the editor.

2. **Prepare the key.** Use an externally generated QZ1 key, enter the correct
   options by hand, or choose the no-key practice mode.

3. **Review the key sheet.** Every unresolved `?` must be resolved (or
   explicitly excluded with `-`) before the exam can be created. Keys stay
   editable later.

4. **Run the exam.** Students open the exam and tap one bubble per question.
   Each booklet has its own timer; when time ends, the app moves to the next
   booklet automatically and locks the previous one. A "پایان دفترچه" button
   ends the current booklet early; its remaining time is never carried forward.
   Autosave and auto-submit work locally, even if the app closes and is opened
   again later.

5. **Read the report card.** Correct answers are green, wrong selections are
   red, and every score is calculated automatically. If the key was wrong, fix
   it from the report card and the score is recalculated.

## What you can do

### Exams that behave like paper

Create as many booklets as the paper exam has, give each its own question count
and time limit, and attach up to 20 optional PDFs per group (20 MB per file).
Exam PDFs stay with their booklet; descriptive answer PDFs are shared by the
whole exam. Uploaded files keep an editable title that defaults to the filename.
The app stores their original bytes with an immutable id and a SHA-256 digest,
so they can be downloaded again but never silently replaced; it never reads,
renders, or uploads them. Booklet PDFs can be downloaded during an attempt, and
both PDF groups are available afterwards.

### Three ways to prepare the key

- **AI-assisted key.** Copy the app's conversion prompt, paste it into an
  external AI chat together with any answer PDFs, and bring the returned QZ1
  line back. The prompt asks the AI to act only as a converter, not a solver.
  The app itself never contacts an AI service, and there is exactly one key per
  exam.
- **Manual key.** Skip the prompt and pick the correct option for every
  question yourself; the question count comes from the booklets. Picking another
  option replaces the previous one.
- **No key.** Run a practice exam that shows only the selected options after
  submission, with no score.

Keys stay linked to every attempt and remain editable. Fixing a key at any
time — even after students have submitted — re-scores every attempt of that
exam. Only the key, title, and description follow later edits; booklets,
question counts, and timers stay frozen once the exam exists.

### Clear, automatic scoring

Every correct answer earns **3 points**, every wrong answer deducts **1**, and
unanswered questions earn nothing. The percentage is earned points divided by
the maximum (3 × scorable questions), so it can be negative as well as 100%.
When a key accepts several options for a question, selecting any one of them
counts as correct.

### Scheduling that fits the class

Start immediately, start at a fixed time, or open a fixed or flexible window.
The date-time picker follows the active language — Jalali in Persian, Gregorian
in English — using the device's local timezone.

### A familiar answer sheet

The sheet supports up to 40 rows per column, fills left-to-right even in RTL,
uses four large bubbles per question, and shows a legend for unanswered,
correct, incorrect, and excluded questions. While building an exam, the key
preview stays collapsed so answers cannot be seen before the attempt starts.

### Persian and English, light and dark

Two languages and eighteen palettes, each with light and dark tokens. Dates and
times follow the selected calendar and the device's timezone.

### Backup and restore

Export a version-6 ZIP containing a manifest and the original PDF files, and
import it on another device or browser. Older JSON v2–v5 backups are upgraded
automatically.

### A guide that teaches itself

A short in-app guide introduces the full workflow on first launch and can be
skipped. It is available again from the header and Settings.

## Privacy

- PDFs, keys, answers, and results live in the app's local data folder on
  desktop and in IndexedDB on the web. PDFs are stored as raw bytes, never as
  base64 and never in the HTTP cache; the web build asks the browser for
  persistent storage so it does not evict them under pressure.
- SANJEH sends nothing anywhere. The AI prompt is copied to your clipboard for
  you to use with a service of your choice; that service's policies apply.
- Clearing the app's data (or site data on the web) removes everything. Export
  a backup first.

## Good to know

**Does SANJEH store exam questions?**
No. It stores the exam structure, booklets, answer keys, answer sheets,
optional PDFs, and results. Question papers are never read or rendered.

**Do I need an account or an internet connection?**
No. Everything runs locally. Only the optional AI-assisted key step uses an
external chat service of your choice.

**Can I use the same exams on my phone and laptop?**
Yes, by moving a Backup ZIP between them. Each app keeps its own local store;
the web app is also tied to its site address, so `localhost` and the published
site do not share data automatically.

**Which Android file should I download?**
The universal APK works on every device. The smaller per-ABI APKs are for
specific processors and are listed next to it in Releases.

**Can I change a key after students submit?**
Yes. The score of every attempt is recalculated, and the exam editor shows the
updated result.

**How do updates work?**
The installed web app checks for a new deployment on load, when it becomes
visible, and every 30 minutes. It reloads automatically when a new version is
ready, but waits until no exam, editor, or import screen is open and the first-run
guide is dismissed. Native apps are updated by installing a newer release.

## Reference: QZ1 answer keys

An AI-assisted key is a single compact line generated outside the app:

```
QZ1|N|SEED|A1|A2|...|AN
```

- `N` is the number of questions.
- `SEED` is an internal 0–4294967295 integer. The app never displays it.
- Each token is `1`, `1,3`, `?`, or `-`:
  - `1` / `1,3` — correct option(s), ascending;
  - `?` — unresolved (not scored);
  - `-` — excluded (not scored).

Example: `QZ1|5|48271|2|1,3|?|-|4`

Students select one option per question. When a key marks several options as
correct, they are alternative accepted answers: selecting any one of them counts
as correct, while selecting an option outside the key is wrong. Excluded and
unresolved questions are left out of the denominator. Each correct answer earns
3 points, each wrong answer deducts 1, and unanswered questions earn nothing;
the percentage is the earned points over the maximum (3 × scorable questions),
so it can be negative (down to −33.3%) as well as 100%. Exams in the no-key mode
have no denominator and no score; their results show the selected options only.

## For developers

SANJEH is a React 19 + TypeScript (strict) + Vite + Tailwind 4 + Radix UI app,
wrapped by Tauri 2 for desktop and mobile. The web, PWA, and native shells share
the same UI. The desktop build persists through a native local store; the web
build uses IndexedDB.

### Run locally

```bash
npm install
npm run dev         # http://localhost:5173
npm run typecheck
npm run lint
npm test
npm run build
npm run build:pages # static bundle for GitHub Pages (relative base)
npm run tauri dev   # native shell
npm run icons       # regenerate platform icons from icon-source/icon.json
```

Node 20+ is required (CI uses Node 24). Native builds need the Rust toolchain
and the platform prerequisites from the Tauri 2 documentation.

Always run `typecheck`, `lint`, `test`, and `build` before calling work done.
UI changes need a DOM-level smoke test in a real browser; this repository is
verified without screenshots.

### Icons

All app icons are generated from `src-tauri/icon-source/icon.json`: the full
brand icon, a transparent Android foreground, a monochrome layer, and the
`#232019` adaptive background. Run `npm run icons` and commit the regenerated
`src-tauri/icons` files after changing any artwork. The native workflow runs the
same command after `tauri android init` and `tauri ios init`, because those
commands install the Tauri template icons; run it yourself after initializing a
mobile project locally.

### GitHub Pages

`npm run build:pages` builds the same app with a relative Vite base, so it runs
from an origin root or any subpath (for example
`https://<owner>.github.io/<repo>/`). The service worker and web manifest
resolve their scope from their own location, keeping offline caching and
installation working under that path. `.github/workflows/pages.yml` deploys this
build on every push to `main`; enable it once under Settings → Pages → Build and
deployment → Source: **GitHub Actions**. GitHub Pages on a private repository
requires a plan that includes it.

Every deployment gets a fresh build ID, so the service worker installs new
caches and removes only its own previous ones. Installed clients check for
updates on load, when the tab becomes visible, and every 30 minutes; a new build
reloads the app automatically, without clearing the browser cache. The reload
waits until an active exam, editor, or import screen is closed and the first-run
guide is dismissed, so no work is interrupted.

Web data belongs to its origin: exams created on `localhost:5173` do not appear
on the Pages site. Move them with a backup ZIP.

### Native builds and releases

`.github/workflows/native-builds.yml` builds:

- Linux desktop for x86_64 and arm64 as deb, rpm, and AppImage;
- Windows x64 as NSIS and MSI;
- macOS arm64, x86_64, and universal as app and dmg;
- Android universal plus per-ABI APKs (`arm64-v8a`, `armeabi-v7a`, `x86`,
  `x86_64`), debug by default or signed release when requested;
- an unsigned iOS simulator build.

A successful native build is published as a GitHub Release when it was triggered
by a `v*` tag, or when a manual run enables the signed release build. Tag pushes
keep the pushed tag; a manual release creates
`v<version>-build.<run-number>` (for example `v0.1.0-build.42`) on the built
commit. The release contains the desktop installers, macOS dmg files, and
Android APKs; macOS app bundles and the iOS simulator build stay as workflow
artifacts.

### Android release signing (optional)

The native workflow builds debug APKs by default. To build release APKs signed
with your own key, add these repository secrets under
Settings → Secrets and variables → Actions:

| Secret | Required | Value |
| --- | --- | --- |
| `ANDROID_KEYSTORE_BASE64` | yes | Base64 of your `.jks`, `.keystore`, or `.p12` file |
| `ANDROID_KEYSTORE_PASSWORD` | yes | Keystore password |
| `ANDROID_KEY_ALIAS` | yes | Key alias inside the keystore |
| `ANDROID_KEY_PASSWORD` | no | Key password; defaults to the keystore password |

Create the encoded value with `base64 -w0 sanjeh-release.jks` (PowerShell:
`[Convert]::ToBase64String([IO.File]::ReadAllBytes("sanjeh-release.jks"))`).
If you do not have a keystore yet, create one with the JDK:

```bash
keytool -genkeypair -v -keystore sanjeh-release.jks -alias sanjeh \
  -keyalg RSA -keysize 2048 -validity 10000
```

With those secrets, a `v*` tag builds the signed release APKs. For a manual run,
enable **Build signed release APKs and publish a GitHub release** in the
workflow dispatch form. Without the secrets the workflow keeps building the
debug APK; requesting a release without them fails with a clear error. Every
Android build produces a universal APK plus separate arm64-v8a, armeabi-v7a,
x86, and x86_64 APKs. CI checks every signed release APK with `apksigner`
before uploading `sanjeh-android-universal`, `sanjeh-android-arm64-v8a`,
`sanjeh-android-armeabi-v7a`, `sanjeh-android-x86`, and
`sanjeh-android-x86_64`.

To sign a local build, initialize the Android project once and point the helper
at your keystore:

```bash
npx tauri android init --ci
npx tauri icon src-tauri/icon-source/icon.json
ANDROID_KEYSTORE_PATH=~/.keys/sanjeh-release.jks \
ANDROID_KEYSTORE_PASSWORD='…' \
ANDROID_KEY_ALIAS=sanjeh \
ANDROID_KEY_PASSWORD='…' \
npm run android:sign
npx tauri android build --apk
npx tauri android build --apk --split-per-abi
```

`scripts/stage-android-apks.mjs` stages the outputs as
`SANJEH_<version>_android_<kind>_<abi>.apk`; `npm run android:stage` exposes the
same helper. Never commit the keystore or `keystore.properties`; the generated
`gen/` tree and keystore files are gitignored. Back up the key: losing it
prevents updates to an app installed from the signed APK.

### Project layout

```
src/app          routing, shell, providers, toasts
src/features     onboarding, dashboard, import, editor, exam, results, settings
src/components    UI primitives and the shared answer sheet
src/lib          QZ1 parser, scoring, sessions, scheduling, prompts, file IO
src/storage      native/IndexedDB adapter, migrations, ZIP backups
src/i18n         typed fa/en messages
src/themes       18 palettes, light and dark
src-tauri        Tauri 2 shell and the native local store (store.rs)
public           manifest, service worker, icons, Vazirmatn font
```

See [AGENTS.md](AGENTS.md) for invariants, architecture notes, and the
verification checklist.

### Status

Pre-release `0.1.0`. CI covers typecheck, lint, tests, build, and a static smoke
test; native workflows build desktop, Android, and iOS artifacts.
