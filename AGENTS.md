# AGENTS

Operational guide for anyone (human or agent) changing SANJEH.

## What this is

SANJEH (سنجه) is a Persian-first, offline-first exam runner. It does **not**
display exam content. An exam consists of:

1. one or more ordered exam booklets (دفترچه), each with a title, its own PDF
   files, its own question count, and its own time limit, all stored verbatim
   for later download;
2. one or more descriptive answer booklet PDFs shared by the whole exam, each
   with a title, stored verbatim for later download;
3. one QZ1 answer key for the whole exam, produced outside the app by an AI
   from the descriptive answer PDFs only;
4. questions derived from that key (id + correct options), used to draw the
   answer sheet and score the attempt.

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
npm run tauri build    # native desktop bundle (requires Rust toolchain)
```

Always run `typecheck`, `lint`, `test`, and `build` before calling work done.
UI changes need a DOM-level smoke test in a real browser; this repository is
verified without screenshots.

## Hard invariants

- **No exam or question text exists in the app.** Do not add fields, forms,
  previews, or sample data that contain question text or option text.
- **Only PDFs for booklets.** No JSON, TXT, or image booklets. Each exam has
  at least one booklet and one answer PDF; each booklet has at least one PDF,
  up to 20 per group, and every file carries a non-empty title (auto-derived
  from the filename on upload). Booklet question counts must sum exactly to the
  exam's question count, and each booklet carries its own `durationMinutes`.
- **One QZ1 answer key per exam**, not one per question.
- **The seed is internal.** Parse and validate it, never display it, never ask
  the user for it, never persist it in the exam model.
- **Only Persian (`fa`) and English (`en`)** exist. Persian is the RTL default.
- **No backend, telemetry, remote storage, API keys, or external AI calls.**
  The app only copies a prompt to the clipboard for the user to paste elsewhere.
- **Never execute or evaluate imported content.** Files are read as text (QZ1)
  or base64 (PDF) and stored locally.
- **Everything stays on the device.** IndexedDB is the source of truth; the
  `sanjeh:boot` localStorage record is only a first-paint theme hint.

## Architecture

```
src/
  app/            shell, routing state, data loading, toasts, settings provider
  components/     shared UI primitives (ui/) and the answer-sheet component
  features/
    onboarding/   three-step setup
    dashboard/    exam list, PDF downloads, recent results
    import/       new-exam flow (booklets + answer PDFs + QZ1), key dialog,
                  prompt copy
    editor/       metadata, booklet files/counts/timers, scheduling, key preview
    exam/         answering screen, timer, autosave, submit
    results/      report card and review answer sheet
    settings/     language, themes, appearance, backup, danger zone
  lib/            pure domain code: answerKey, scoring, session, scheduling,
                  prompts, file IO, formatting
  storage/        IndexedDB access, boot mirror, backup validation
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
- `StoredPdf`: `title`, filename, `type: 'application/pdf'`, size, base64 data
  URL (`data:application/pdf;base64,...`), max 20 MB each.
- `ExamSession`: frozen `ExamSnapshot` **without PDFs** but with booklet
  metadata, responses by stable question id, `bookletIndex`,
  `bookletStartedAt`, `bookletEndsAt` (active booklet deadline), `endsAt`
  (hard schedule end), status, result. Sessions fetch PDFs from the exams store
  only when a download is requested.
- `Question.key`: `known` (1–4 correct indices), `unresolved` (`?`), or
  `excluded` (`-`).

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
- Scoring is exact-set. `?` and `-` are removed from the denominator and
  reported separately. There is no negative marking.
- `?` is a request for the user's answer, not a final state: exam creation and
  saving are blocked until every `?` is resolved or excluded.

### Storage

- DB `sanjeh`, version 4, stores `exams`, `sessions`, `meta`.
- The version-2 upgrade rebuilds the stores because version-1 exams had no
  PDFs. Version 3 migrates each singular `examPdf`/`answerPdf` into a one-item
  `examPdfs`/`answerPdfs` array with a generated title. Version 4 wraps the old
  flat `examPdfs` + exam-level `durationMinutes` into one booklet covering every
  question, and adds `bookletIndex`/`bookletStartedAt`/`bookletEndsAt` to
  sessions (the legacy `endsAt` becomes the only booklet's deadline).
- Backups are JSON (`sanjeh-backup`, version 4) and include PDFs. Versions 2
  and 3 are accepted and upgraded on read; every other version is rejected.
  Validation in `storage/backup.ts` is the trust boundary for imported files;
  keep it strict, including booklet ids and the question-count total.
- `replaceAllData` writes all three stores in one transaction.

### Answer sheet

`src/components/answer-sheet.tsx` is the single source of the visual sheet:
header, legend, up to 40 rows per column via CSS grid `grid-auto-flow: column`,
question number, four bubbles, and a status glyph. The grid is always laid out
LTR (question 1 starts at the left, later columns to the right) even when the
UI is Persian/RTL. Variants:

- `answering`: interactive toggles; excluded rows and rows outside the active
  booklet are disabled. Locked rows show a lock in the legend.
- `review`: report card; correct selected green, wrong selected red, correct
  unselected green outline, unresolved muted, excluded slashed.
- `key`: read-only key preview in import/editor, always wrapped in
  `src/components/key-sheet-accordion.tsx`. The preview starts collapsed so the
  answers are not visible before the student takes the exam; the trigger shows
  the question count and collapses again on demand.

### Editable answer keys

`src/components/answer-key-editor.tsx` is the single editable key UI, hosted
inside the same accordion. It is available in three places:

- while importing, before the exam exists;
- in the exam editor, for a saved exam;
- on the results screen, after the attempt, where a change re-scores the stored
  session immediately and also fixes the source exam.

Rules:

- Options are toggles; clearing all four returns the question to `?`.
- `?` tokens are unresolved: create/save is blocked until the user picks an
  option for every one of them. Never auto-resolve an unresolved token.
- `-` is an explicit exclusion and is never treated as unknown; the user can
  still restore it with the exclude toggle.
- Key editing must never alter question IDs, order, or count.

Copy must keep two notes visible wherever the QZ1 prompt is offered: Grok gives
the best and most accurate results, and AI can make mistakes, so the user
should review and correct the output.

Do not fork this layout; extend the component instead.

## Testing

- Unit tests live next to the code (`src/**/*.test.ts`) and run in Node.
- Focus areas: QZ1 parsing, exact scoring, session snapshots and toggling,
  booklet auto-advance (no carry-over) and row locking, scheduling, IndexedDB
  persistence + v4 migrations (`fake-indexeddb`), backup v2/v3 upgrades and
  validation.
- Fixtures live in `src/test/fixtures.ts`; keep them PDF-backed.
- For UI work, start the dev server and inspect the accessibility tree /
  computed styles. Verify the 40-row column layout, bubble tones, disabled
  excluded rows, and that no question text is present.

## CI and releases

- `.github/workflows/ci.yml`: typecheck, lint, tests, build, static smoke test.
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
- Motion uses the shared tokens in `src/index.css` (`animate-fade-up`,
  `animate-rise-in`, `animate-pop-in`, `animate-pulse-soft`, `.stagger`,
  `.hover-lift`). Keep entrances short (≤ 340 ms), never animate layout
  properties, and never remove the global `prefers-reduced-motion` override.
- Comments only for non-obvious WHY. No dead code, no half migrations.
