# سنجه — SANJEH

An offline-first exam runner. SANJEH never shows exam content: it
stores one or more exam booklets and the descriptive answer PDFs locally, turns
a compact QZ1 answer key into a bubble answer sheet, and issues a report card.

Everything stays on the device. No account, no server, no telemetry, no
external AI calls.

## Features

- **PDF-only booklets with their own files, questions, and time.** Create as
  many booklets (دفترچه) as the paper exam has. Each booklet holds one or more
  exam PDFs, its question count, and its own time limit; answer PDFs are shared
  by the whole exam. Up to 20 files per group, 20 MB per file, every file with
  an editable title that defaults to its filename. Files are stored verbatim so
  you can download them again; the app never reads, renders, or uploads them.
- **Booklet timers that advance on their own.** When a booklet's time ends the
  app moves to the next booklet automatically, and only that booklet's
  questions can be answered — earlier and later rows stay visible but locked.
  A "پایان دفترچه" button ends the current booklet early; its remaining time is
  never carried into the next booklet. Students can optionally start the whole
  exam inside a fixed or flexible schedule window.
- **One QZ1 answer key per exam.** Paste or upload a single line generated
  outside the app. It defines the question count and the correct options.
  Grok has given us the best and most accurate results in our experience, and
  AI can still make mistakes — so every key stays editable.
- **Editable keys everywhere.** Options can be corrected while importing,
  later in the exam editor, and even after an attempt. Editing after the fact
  re-scores the stored session. `?` means the AI was unsure: the app asks the
  user to choose the answer and blocks create/save until every `?` is resolved.
  `-` is an explicit exclusion and stays excluded.
- **Answer sheet that matches the paper.** Up to 40 rows per column, filled
  left-to-right even in RTL, four large bubbles per question, and the reference
  legend: unanswered, incorrect, correct, excluded. While building an exam the
  key preview stays collapsed in an accordion, so answers cannot be seen before
  the attempt starts.
- **Report card.** After submission the same sheet becomes the student report
  card: correct answers in green, wrong selections in red, correct-but-unselected
  options outlined in green, unresolved and excluded questions marked distinctly.
- **Offline and local.** IndexedDB storage, PWA install, and Tauri builds for
  Linux (deb, rpm, AppImage), Windows (NSIS, MSI), macOS (app, dmg), Android
  (APK), and iOS; native artifacts are produced in CI.
- **Two languages, eighteen palettes.** Persian (RTL, default) and English
  (LTR), each palette with light and dark tokens.
- **Backup and restore.** A single JSON file with exams, sessions, settings,
  and the stored PDFs.

## How an exam works

1. Create an exam, add one or more booklets, and give each booklet its PDFs,
   question count, and time limit. Upload the descriptive answer PDFs too,
   adjusting titles if needed.
2. Open the answer-key prompt from the app, attach the descriptive answer PDFs
   in an external AI chat, and send the prompt. The AI must act only as a
   converter — never as a solver — and must keep the seed in the third field.
3. Paste the returned QZ1 line back into the app. The sheet preview appears
   immediately and every question can be corrected, including `?` rows, which
   must be resolved before the exam can be created. There is exactly one key
   per exam.
4. Students open the exam, tap bubbles, and submit. Each booklet keeps its own
   timer: the active booklet advances automatically, or the student can finish
   it early without carrying the remaining time forward. Autosave and
   auto-submit are handled locally.
5. The report card shows the score and the completed answer sheet. If an answer
   was wrong, correct it from the key editor on the report card; the score is
   recalculated and stored. Every booklet PDF remains available for download.

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

Scoring is exact-set: for multi-answer questions every correct option must be
selected and nothing else. Excluded and unresolved questions are removed from
the denominator; there is no negative marking.

## Privacy

- PDFs, keys, answers, and results live in this browser's IndexedDB (or the
  app's WebView storage on desktop/mobile).
- The app sends nothing anywhere. The prompt is copied to your clipboard for
  you to use with a service of your choice; that service's policies apply.
- Clearing site data or the app's data removes everything. Export a backup.

## Development

```bash
npm install
npm run dev         # http://localhost:5173
npm run typecheck
npm run lint
npm test
npm run build
npm run tauri dev   # native shell
```

Node 20+ is required (CI uses Node 24). Native builds need the Rust toolchain
and the platform prerequisites from the Tauri 2 documentation.

## Project layout

```
src/app          routing, shell, providers, toasts
src/features     onboarding, dashboard, import, editor, exam, results, settings
src/components    UI primitives and the shared answer sheet
src/lib          QZ1 parser, scoring, sessions, scheduling, prompts, file IO
src/storage      IndexedDB, boot mirror, backup validation
src/i18n         typed fa/en messages
src/themes       18 palettes, light and dark
src-tauri        Tauri 2 configuration
public           manifest, service worker, icons, Vazirmatn font
```

See [AGENTS.md](AGENTS.md) for invariants, architecture notes, and the
verification checklist.

## Status

Pre-release `0.1.0`. The web, PWA, and Tauri shells share the same UI and
storage model. CI covers typecheck, lint, tests, build, and a static smoke
test; native workflows build desktop, Android, and iOS artifacts.
