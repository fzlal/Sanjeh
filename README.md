# سنجه — SANJEH

An offline-first exam runner. SANJEH never shows exam content: it
stores exam booklets and optional descriptive answer PDFs locally, turns a
compact QZ1 answer key — or a hand-entered key — into a bubble answer sheet,
and issues a report card. Exams can also run with no answer key at all, in
which case only the selected options are shown after submission.

Everything stays on the device. No account, no server, no telemetry, no
external AI calls.

## Features

- **Booklets with optional PDFs, their own questions, and time.** Create as
  many booklets (دفترچه) as the paper exam has. Each booklet holds its question
  count and its own time limit, plus up to 20 optional exam PDFs; answer PDFs
  are optional too and shared by the whole exam. Every uploaded file gets an
  editable title that defaults to its filename, with a 20 MB per-file cap.
  Files are stored verbatim — as raw files in the native desktop store and as
  Blobs in IndexedDB on the web — with a SHA-256 digest and an immutable id, so
  you can download them again but their bytes can never be silently replaced;
  the app never reads, renders, or uploads them.
- **Booklet timers that advance on their own.** When a booklet's time ends the
  app moves to the next booklet automatically, and only that booklet's
  questions can be answered — earlier and later rows stay visible but locked.
  A "پایان دفترچه" button ends the current booklet early; its remaining time is
  never carried into the next booklet. Scheduling can be set while creating the
  exam or later in the editor: start immediately, at a fixed time, or inside a
  fixed or flexible window. The date-time picker follows the active language —
  Jalali in Persian and Gregorian in English — using the device's local
  timezone.
- **Three answer-key modes.** Choose at creation:
  - **AI answer key** — paste or upload a single QZ1 line generated outside the
    app. It defines the question count and the correct options. Grok has given
    us the best and most accurate results in our experience, and AI can still
    make mistakes — so every key stays editable.
  - **Manual answer key** — no AI prompt and no answer-key file. The question
    count comes from the booklets and you pick the single correct option of
    every question by hand; picking another option replaces it.
  - **No answer key** — the exam is purely for practice: after submission only
    the selected options are shown and no score is calculated.
- **Editable, relational keys.** Options can be corrected while importing,
  later in the exam editor, and even after an attempt. Saving a key updates
  every attempt of that exam and re-scores submitted ones; only keys, title, and
  description follow the exam — question count, booklets, and timers stay
  frozen. `?` means the answer is unresolved: the app asks the user to choose
  the answer and blocks create/save until every `?` is resolved. `-` is an
  explicit exclusion and stays excluded.
- **Answer sheet that matches the paper.** Up to 40 rows per column, filled
  left-to-right even in RTL, four large bubbles per question, and the reference
  legend: unanswered, incorrect, correct, excluded. While building an exam the
  key preview stays collapsed in an accordion, so answers cannot be seen before
  the attempt starts. Students pick exactly one option per question; when a key
  lists several correct options, selecting any one of them counts.
- **Report card.** After submission the same sheet becomes the student report
  card: correct answers in green, wrong selections in red, correct-but-unselected
  options outlined in green, unresolved and excluded questions marked distinctly.
  Every correct answer earns 3 points and every wrong answer deducts 1, so the
  percentage can be negative. Exams without a key instead show a choices-only
  sheet with the selected options and no score.
- **Offline and local.** The desktop build persists to a native Tauri store in
  the app data folder; the web build uses IndexedDB with a persistent-storage
  request. PWA install and Tauri builds for Linux (deb, rpm, AppImage for
  x86_64 and arm64), Windows (NSIS, MSI for x86_64), macOS (app and dmg for
  arm64, x86_64, and universal), Android (universal and per-ABI APKs), and iOS
  are supported; native artifacts are produced in CI.
- **Two languages, eighteen palettes.** Persian (RTL, default) and English
  (LTR), each palette with light and dark tokens. Displayed dates and times use
  the language's calendar: Jalali for Persian, Gregorian for English.
- **Backup and restore.** A version-6 ZIP with a manifest plus the original PDF
  files; older JSON v2–v5 backups are upgraded on import.

## How an exam works

1. Create an exam, choose how the answer key will be supplied (AI QZ1, manual,
   or none), and add one or more booklets with their question counts and time
   limits. Booklet PDFs and descriptive answer PDFs are optional; add them if
   you want to distribute or keep them, adjusting titles as needed. Pick the
   schedule here or later in the exam editor. The answer-key mode is fixed once
   the exam is created.
2. For the **AI answer key**, open the prompt from the app, attach the
   descriptive answer PDFs (when available) in an external AI chat, and send it.
   The AI must act only as a converter — never as a solver — and must keep the
   seed in the third field. Paste the returned QZ1 line back into the app; there
   is exactly one key per exam.
   For the **manual answer key**, skip the AI entirely and pick the correct
   options for each question in the key editor. For **no answer key**, no key
   work is needed at all.
3. Review the key sheet. In the AI and manual modes every `?` must be resolved
   (or explicitly excluded) before the exam can be created.
4. Students open the exam, tap bubbles, and submit. Each booklet keeps its own
   timer: the active booklet advances automatically, or the student can finish
   it early without carrying the remaining time forward. Autosave and
   auto-submit are handled locally, including attempts that expire while the app
   is closed — the next launch settles them.
5. The report card shows the score and the completed answer sheet. If an answer
   was wrong, correct it from the key editor on the report card; the score is
   recalculated and stored. Exams created without a key show only the selected
   options and no score or key editor. Booklet PDFs are downloadable during the
   attempt when present, and both PDF groups are available after it when files
   exist.

### QZ1 format

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

## Privacy

- PDFs, keys, answers, and results live in the app's local data folder on
  desktop and in IndexedDB on the web. PDFs are stored as raw bytes, never as
  base64 and never in the HTTP cache; the web build asks the browser for
  persistent storage so it does not evict them under pressure.
- The app sends nothing anywhere. The prompt is copied to your clipboard for
  you to use with a service of your choice; that service's policies apply.
- Clearing the app's data (or site data on the web) removes everything. Export
  a backup.

## Development

```bash
npm install
npm run dev         # http://localhost:5173
npm run typecheck
npm run lint
npm test
npm run build
npm run build:pages # static bundle for GitHub Pages (relative base)
npm run tauri dev   # native shell
```

Node 20+ is required (CI uses Node 24). Native builds need the Rust toolchain
and the platform prerequisites from the Tauri 2 documentation.

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
updates on load, when the tab becomes visible, and every 30 minutes; a new
build reloads the app automatically, without clearing the browser cache. The
reload waits until an active exam, editor, or import screen is closed so no work
is interrupted.

Web data belongs to its origin: exams created on `localhost:5173` do not appear
on the Pages site. Move them with a backup ZIP.

### Android release signing (optional)

The native workflow builds debug APKs by default. To build release APKs
signed with your own key, add these repository secrets under
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

A successful native build is published as a GitHub Release when it was
triggered by a `v*` tag, or when a manual run enables the signed release build.
Tag pushes keep the pushed tag; a manual release creates
`v<version>-build.<run-number>` (for example `v0.1.0-build.42`) on the built
commit. The release contains the desktop installers, macOS dmg files, and
Android APKs; macOS app bundles and the iOS simulator build stay as workflow
artifacts.

To sign a local build, initialize the Android project once and point the helper
at your keystore:

```bash
npx tauri android init --ci
ANDROID_KEYSTORE_PATH=~/.keys/sanjeh-release.jks \
ANDROID_KEYSTORE_PASSWORD='…' \
ANDROID_KEY_ALIAS=sanjeh \
ANDROID_KEY_PASSWORD='…' \
npm run android:sign
npx tauri android build --apk
npx tauri android build --apk --split-per-abi
```

The second command produces the smaller per-ABI APKs; use the universal APK
when you need one file that works on every device.

Never commit the keystore or `keystore.properties`; the generated `gen/` tree
and keystore files are gitignored. Back up the key: losing it prevents updates
to an app installed from the signed APK.

## Project layout

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

## Status

Pre-release `0.1.0`. The web, PWA, and Tauri shells share the same UI; desktop
builds persist through a native local store and the web build through
IndexedDB. CI covers typecheck, lint, tests, build, and a static smoke test;
native workflows build desktop, Android, and iOS artifacts.
