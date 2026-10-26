# AGENTS

Operational guide for anyone (human or agent) changing SANJEH.

## What this is

SANJEH (سنجه) is a Persian-first, offline-first exam runner. It does **not**
display exam content. An exam consists of:

1. one or more ordered exam booklets (دفترچه), each with a title, optional PDF
   files, its own question count, and its own time limit; stored PDFs are kept
   verbatim for later download;
2. optional descriptive answer booklet PDFs shared by the whole exam, each
   with a title, stored verbatim for later download;
3. one of three answer-key modes:
   - `qz1`: one QZ1 line for the whole exam, produced outside the app with the
     copied prompt, ideally from the descriptive answer PDFs;
   - `manual`: the correct options are entered by hand in the app;
   - `none`: no key is stored and the attempt is not scored;
4. questions (id + key), used to draw the answer sheet and, when a key exists,
   score the attempt.

The app never parses PDFs, never renders their text, never uploads them, and
never calls an AI service itself.

## Commands

```bash
npm install            # Node >= 20 (CI uses 24)
npm run dev            # Vite dev server, http://localhost:5173
npm run typecheck      # tsc -b, strict
npm run lint           # oxlint, must stay at 0 warnings / 0 errors
npm test               # Vitest (node environment)
npm run build          # typecheck + production bundle in dist/
npm run build:pages    # production bundle for GitHub Pages (relative base)
npm run tauri build    # native desktop bundle (requires Rust toolchain)
```

Always run `typecheck`, `lint`, `test`, and `build` before calling work done.
UI changes need a DOM-level smoke test in a real browser; this repository is
verified without screenshots.

## Hard invariants

- **No exam or question text exists in the app.** Do not add fields, forms,
  previews, or sample data that contain question text or option text.
- **Only PDFs for booklet files.** No JSON, TXT, or image booklets. PDFs are
  optional: each exam has at least one booklet, each group holds 0–20 PDFs, and
  every uploaded file carries a non-empty title (auto-derived from the filename
  on upload). Booklet question counts must sum exactly to the exam's question
  count, and each booklet carries its own `durationMinutes`.
- **One QZ1 answer key per exam**, not one per question, and only in `qz1`
  mode. `manual` stores a hand-entered key; `none` stores all keys as
  unresolved and never scores. `answerKeyMode` is chosen at creation and is
  fixed afterwards.
- **The seed is internal.** Parse and validate it, never display it, never ask
  the user for it, never persist it in the exam model.
- **Only Persian (`fa`) and English (`en`)** exist. Persian is the RTL default.
- **No remote backend, telemetry, remote storage, API keys, or external AI
  calls.** Non-web builds persist to a local Tauri store on the device; the web
  build uses IndexedDB. The app only copies a prompt to the clipboard for the
  user to paste elsewhere.
- **Never execute or evaluate imported content.** QZ1 files are read as text;
  PDFs are read as bytes and stored locally. Base64 exists only transiently
  over the IPC boundary and must never be persisted or written to backups.
- **Stored PDFs are immutable.** Each PDF has a stable `id` and a SHA-256
  `digest`; saving a different byte sequence under the same id is rejected with
  `StorageError.code === 'pdfImmutable'`.
- **Everything stays on the device.** On desktop the Tauri store is the source
  of truth and PDFs are raw files in the app data folder; on the web, IndexedDB
  is the source of truth and is made persistent via
  `navigator.storage.persist()`. The `sanjeh:boot` localStorage record is only a
  first-paint theme hint. The first desktop run migrates IndexedDB data into the
  native store and clears the browser copy.

## Architecture

```
src/
  app/            shell, routing state, data loading, toasts, settings provider
  components/     shared UI primitives (ui/) and the answer-sheet component
  features/
    onboarding/   first-run setup + the skippable feature guide
    dashboard/    exam list and recent results
    import/       new-exam flow (booklets + optional PDFs + answer-key mode + scheduling),
                  key dialog, prompt copy
    editor/       metadata, booklet files/counts/timers, scheduling, key preview
    exam/         answering screen, timer, autosave, submit
    results/      report card and review answer sheet
    settings/     language, themes, appearance, backup, danger zone
  lib/            pure domain code: answerKey, scoring, session, scheduling,
                  prompts, file IO, formatting
  storage/        native/IndexedDB adapter, migrations, ZIP backups
  i18n/           typed messages (en.ts is the source of keys) + provider
  themes/         18 palettes with light/dark tokens
  types/          shared domain types
```

### Data model essentials

- `Exam`: id, title, description, exam-wide `answerPdfs`, ordered `booklets`,
  `questions` (`{ id, key }`), scheduling, timestamps.
- `Booklet`: id, title, `pdfs`, `questionCount`, `durationMinutes` (0 = no time
  limit for that booklet). Together the booklet counts must cover every
  question exactly once, in printed order.
- `StoredPdf`: stable `id`, `title`, filename, `type: 'application/pdf'`, size,
  SHA-256 `digest`, bytes in the native store (desktop) or a `Blob` (web), max
  20 MB each. Bytes are immutable for a given id.
- `ExamSession`: frozen `ExamSnapshot` **without PDFs** but with booklet
  metadata, responses by stable question id, `bookletIndex`,
  `bookletStartedAt`, `bookletEndsAt` (active booklet deadline), `endsAt`
  (hard schedule end), status, result. Sessions fetch PDFs from the exams store
  only when a download is requested.
- `Question.key`: `known` (1–4 correct indices), `unresolved` (`?`), or
  `excluded` (`-`).
- `Settings.guideSeen`: the feature guide opens once after onboarding; the
  header help button and Settings reopen it. Backups without the flag default
  to unseen.

### Booklets and timing

- Every booklet starts with its own full duration when it becomes active;
  `computeBookletDeadline` clamps that deadline to the fixed/flexible window
  end (`endsAt`).
- When `bookletEndsAt` passes, `syncBookletProgress` advances automatically and
  starts the next booklet at that deadline. Leftover time is discarded, never
  carried forward. A 0-minute booklet never expires on its own.
- "پایان دفترچه" (`advanceBooklet`) starts the next booklet at `now` with its
  full duration; the current booklet's remaining time is **not** added to it.
- The final booklet's deadline (or the schedule hard end) ends the attempt and
  opens submission.
- Answer-sheet rows outside the active booklet stay visible but locked;
  `toggleResponse` refuses them, so earlier/later answers cannot change.

### QZ1

`QZ1|N|SEED|A1|...|AN`

- `N` must equal the number of tokens and the exam's question count.
- Tokens: `1`, `1,3`, `?`, `-`.
- Parser is strict: single line, no fences, no whitespace inside tokens,
  ascending unique indices, seed 0–4294967295.
- Scoring accepts any option the key lists as correct; a selection outside the
  key is wrong. `?` and `-` are removed from the denominator and reported
  separately. A correct answer earns 3 points and a wrong answer deducts 1, so
  the percentage (points over 3 × scorable questions) can be negative. Submitted
  attempts are re-derived from their stored responses and keys on load, so saved
  percentages always follow the current rule.
- `?` is a request for the user's answer, not a final state: in `qz1` and
  `manual` modes, exam creation and saving are blocked until every `?` is
  resolved or excluded. `none` mode stores every key as `?` on purpose and
  skips that validation.

### Answer-key modes

`Exam.answerKeyMode` is one of `qz1`, `manual`, or `none` and is snapshotted
into every session (`ExamSnapshot.answerKeyMode`).

- `qz1`: the import flow parses a QZ1 line and seeds the exam's questions.
- `manual`: no AI prompt or key file; the question count comes from the
  booklets and the key is entered with `AnswerKeyEditor`. Saving requires every
  question to be resolved or excluded.
- `none`: the question count comes from the booklets, all keys stay
  unresolved, and answer PDFs are not offered. Results show only the selected
  options (`AnswerSheet` variant `selected`), with no score, stats, or key
  editor.
- Missing `answerKeyMode` in older data or backups means `qz1`; an unknown
  value is rejected at the backup boundary.

### Storage

Two local adapters share one API (`src/storage/db.ts`):

- **Desktop (Tauri).** `src-tauri/src/store.rs` writes
  `store/{meta.json,settings.json,exams/*.json,sessions/*.json,pdfs/*.pdf}` in
  the app data directory. IDs are validated before becoming paths, writes are
  atomic, PDF digests are re-verified on load, and orphaned PDF files are
  removed. Try/flexible schedules and autosave use the same commands. PDF bytes
  cross IPC lazily (base64) only when a download is requested.
- **Web.** DB `sanjeh`, version 6, stores `exams`, `sessions`, `meta`. PDFs live
  inside the exam records as `Blob`s. The v2–v6 upgrades rebuild stores, convert
  singular PDFs to arrays, wrap flat PDFs into one booklet, add booklet
  deadlines to sessions, convert base64 data URLs to native Blobs, and add
  `answerKeyMode` (defaulting to `qz1`).
- The first desktop run copies any existing IndexedDB data into the native
  store, writes `meta.json` as ready, and deletes the browser copy.
- `saveExam` writes the exam and every affected session in one unit. It syncs
  question keys by stable question id into all sessions of that exam and
  re-scores submitted attempts. Question count, booklet layout, and timers stay
  frozen in snapshots; only keys, title, and description follow the exam.
- Expired attempts are settled centrally (`settleSession` in `lib/session.ts`):
  on load, on start/resume, and every 10 seconds while the app is open. A missed
  deadline is scored and persisted, so the dashboard never offers to resume a
  finished exam.
- Backups are ZIP files (`sanjeh-backup`, version 6). `manifest.json` holds PDF
  metadata, sessions, and settings; each PDF is stored raw at
  `pdfs/00001.pdf` with store-only compression and CRC32. Legacy JSON backups
  v2–v5 are accepted and upgraded on read; every other version is rejected.
  Validation in `storage/backup.ts` is the trust boundary for imported files;
  keep it strict, including booklet ids, the question-count total, unique PDF
  ids, byte length, and digest. Empty PDF groups are valid.
- `replaceAllData` replaces all stores in one transaction (or one staged native
  replace-all) and `clearAllStores` removes everything.

### Answer sheet

`src/components/answer-sheet.tsx` is the single source of the visual sheet:
header, legend, up to 40 rows per column via CSS grid `grid-auto-flow: column`,
question number, four bubbles, and a status glyph. The grid is always laid out
LTR (question 1 starts at the left, later columns to the right) even when the
UI is Persian/RTL. Variants:

- `answering`: interactive and single-select — tapping a bubble replaces the
  previous choice, tapping the selected bubble clears it. Excluded rows and rows
  outside the active booklet are disabled. Locked rows show a lock in the legend.
- `review`: report card; correct selected green, wrong selected red, correct
  unselected green outline, unresolved muted, excluded slashed.
- `key`: read-only key preview in import/editor, always wrapped in
  `src/components/key-sheet-accordion.tsx`. The preview starts collapsed so the
  answers are not visible before the student takes the exam; the trigger shows
  the question count and collapses again on demand.
- `selected`: choices-only report for exams in `none` mode. It shows the
  student's selected bubbles and answered/unanswered status, with no
  correctness coloring and no interactivity.

### Editable answer keys

`src/components/answer-key-editor.tsx` is the single editable key UI, hosted
inside the same accordion. It is available in three places:

- while importing, before the exam exists (`qz1` and `manual` modes);
- in the exam editor, for a saved exam (`qz1` and `manual` modes);
- on the results screen, after the attempt (`qz1` and `manual` modes).

The editor and the results-screen editor are hidden for `none` exams.

Every saved key change goes through `saveExam`, which propagates it to all
submitted sessions of that exam and re-scores them; the results screen performs
the same update. Editing the key never changes the question count or booklet
snapshots. The student sheet stays single-select; a key may list several correct
options as alternatives, and selecting any one of them counts.

Rules:

- Options are toggles in `qz1` keys (multiple correct options allowed);
  clearing the selection returns the question to `?`. In `manual` mode the
  editor is single-select, so picking another option replaces the current one
  and picking the selected option clears it.
- `?` tokens are unresolved: in `qz1` and `manual` modes, create/save is
  blocked until the user picks an option for every one of them. Never
  auto-resolve an unresolved token. `none` mode keeps all tokens unresolved on
  purpose.
- `-` is an explicit exclusion and is never treated as unknown; the user can
  still restore it with the exclude toggle.
- Key editing must never alter question IDs, order, or count.

Copy must keep two notes visible wherever the QZ1 prompt is offered: Grok gives
the best and most accurate results, and AI can make mistakes, so the user
should review and correct the output.

Do not fork this layout; extend the component instead.

## Testing

- Unit tests live next to the code (`src/**/*.test.ts`) and run in Node.
- Focus areas: QZ1 parsing, accepted-option scoring, single-select responses, session
  snapshots and key sync/re-scoring, automatic deadline settlement, booklet
  auto-advance (no carry-over) and row locking, scheduling, IndexedDB
  persistence + v6 migrations (`fake-indexeddb`), PDF immutability, ZIP v6
  backup round-trips/CRC checks, answer-key modes, and legacy v2–v5 upgrades.
- Download buttons appear only when their PDF group is non-empty: exam/answer
  PDF buttons are hidden before a completed attempt and whenever no files exist.
- Fixtures live in `src/test/fixtures.ts`; keep them PDF-backed. PDF-free exams
  are valid and must round-trip through storage, backups, and the editor.
- For UI work, start the dev server and inspect the accessibility tree /
  computed styles. Verify the 40-row column layout, bubble tones, disabled
  excluded rows, and that no question text is present.

## CI and releases

- `.github/workflows/ci.yml`: typecheck, lint, tests, build, static smoke test.
- `.github/workflows/pages.yml`: lint, tests, Pages build, and the GitHub Pages
  deployment on pushes to `main`. The Pages bundle uses a relative base, so
  runtime asset URLs in `public/sw.js` and `public/manifest.webmanifest` must
  stay relative to their own location; verify it from a `/Sanjeh/` subpath.
- The Vite build emits `precache-manifest.js` (plugin in `vite.config.ts`);
  `public/sw.js` imports it so the hashed JS/CSS are cached on the first visit.
  Keep the import and the plugin in sync, and keep `updateViaCache: 'none'` on
  registration so an updated worker never imports a stale list.
- `.github/workflows/native-builds.yml`: Tauri desktop (Linux x64/arm64 as
  deb + rpm + AppImage, Windows x64 as NSIS + MSI, macOS universal as app +
  dmg), Android debug APK, iOS simulator, on tags.
- `.github/workflows/release.yml`: publishes verified native artifacts.
- Keep the repository lightweight: no `node_modules`, `dist`, `target`, SDKs,
  or binaries committed.

## Style

- TypeScript strict; no `any`; prefer pure functions in `lib/`.
- Tailwind 4 tokens only; use theme variables (`bg-surface`, `text-correct`),
  never raw hex values in components.
- Every user-visible string goes through i18n, with `fa` and `en` updated
  together. `en.ts` defines the key set.
- All displayed dates go through `src/lib/format.ts`, which binds the locale's
  calendar (Jalali for `fa`, Gregorian for `en`). Scheduling uses the shared
  `DateTimePicker`; never reintroduce native `datetime-local` inputs.
- Motion uses the shared tokens in `src/index.css` (`animate-fade-up`,
  `animate-rise-in`, `animate-pop-in`, `animate-pulse-soft`, `.stagger`,
  `.hover-lift`). Keep entrances short (≤ 340 ms), never animate layout
  properties, and never remove the global `prefers-reduced-motion` override.
- Comments only for non-obvious WHY. No dead code, no half migrations.
