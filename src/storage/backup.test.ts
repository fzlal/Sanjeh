import { describe, expect, it } from 'vitest';
import type { ExamSession, Question, Scheduling, Settings } from '@/types';
import { ANSWER_KEY_MODES } from '@/types';
import { makeBooklet, makeExam, makePdf, makeQuestion } from '@/test/fixtures';
import { createSession, toggleResponse } from '@/lib/session';
import { scoreExam } from '@/lib/scoring';
import { PDF_DATA_PREFIX, PDF_MIME, blobToPdfDataUrl, bytesToBase64 } from '@/lib/file';
import { readZip } from '@/lib/zip';
import {
  BackupValidationError,
  backupFileName,
  createBackup,
  parseBackupFile,
  validateBackup,
} from './backup';

const settings: Settings = {
  language: 'fa',
  theme: 'paper',
  appearance: 'light',
  onboardingComplete: true,
  guideSeen: true,
};

interface RawPdf {
  id: string;
  title: string;
  name: string;
  type: string;
  size: number;
  digest: string;
  file: string;
  data?: string;
}

interface RawBooklet {
  id: string;
  title: string;
  questionCount: number;
  durationMinutes: number;
  pdfs: RawPdf[];
}

interface RawExam {
  id: string;
  title: string;
  description?: string;
  answerKeyMode?: string;
  questions: Question[];
  scheduling: Scheduling;
  createdAt: number;
  updatedAt: number;
  booklets: RawBooklet[];
  answerPdfs: RawPdf[];
}

interface RawManifest {
  format: string;
  version: number;
  exportedAt: number;
  data: {
    exams: RawExam[];
    sessions: ExamSession[];
    settings: Settings;
  };
}

function submittedSession() {
  const exam = makeExam({
    id: 'exam-1',
    questions: [
      makeQuestion({ id: 'q1', key: { kind: 'known', correct: [1, 3] } }),
      makeQuestion({ id: 'q2', key: { kind: 'excluded' } }),
    ],
  });
  const session = createSession(exam, 1000);
  const answered = toggleResponse(session, 'q1', 1);
  return {
    ...answered,
    status: 'submitted' as const,
    submittedAt: 2000,
    result: scoreExam(exam, answered.responses, 2000),
  };
}

function sampleExam() {
  return makeExam({
    id: 'exam-1',
    booklets: [
      makeBooklet({
        id: 'b1',
        title: 'First',
        questionCount: 1,
        durationMinutes: 15,
        pdfs: [makePdf('first.pdf', 'First')],
      }),
      makeBooklet({
        id: 'b2',
        title: 'Second',
        questionCount: 1,
        durationMinutes: 25,
        pdfs: [makePdf('second.pdf', 'Second')],
      }),
    ],
  });
}

async function zipBackup() {
  const blob = await createBackup([sampleExam()], [submittedSession()], settings);
  const { entries } = readZip(new Uint8Array(await blob.arrayBuffer()));
  const manifestEntry = entries.get('manifest.json');
  if (!manifestEntry) throw new Error('fixture is missing manifest.json');
  const manifest = JSON.parse(new TextDecoder().decode(manifestEntry)) as RawManifest;
  return { blob, entries, manifest };
}

/** The previous JSON shape (v5) with base64 PDFs, still importable. */
async function jsonV5Backup(): Promise<Record<string, unknown>> {
  const { manifest, entries } = await zipBackup();
  const toData = (pdf: RawPdf) => {
    const bytes = entries.get(pdf.file);
    if (!bytes) throw new Error(`fixture is missing ${pdf.file}`);
    return {
      id: pdf.id,
      title: pdf.title,
      name: pdf.name,
      type: pdf.type,
      size: pdf.size,
      digest: pdf.digest,
      data: `${PDF_DATA_PREFIX}${bytesToBase64(bytes)}`,
    };
  };
  const exams = manifest.data.exams.map((exam) => ({
    ...exam,
    answerPdfs: exam.answerPdfs.map(toData),
    booklets: exam.booklets.map((booklet) => ({
      ...booklet,
      pdfs: booklet.pdfs.map(toData),
    })),
  }));
  return {
    format: 'sanjeh-backup',
    version: 5,
    exportedAt: manifest.exportedAt,
    data: { exams, sessions: manifest.data.sessions, settings: manifest.data.settings },
  };
}

async function legacyPdf(name: string, title: string) {
  const pdf = makePdf(name, title);
  if (!pdf.blob) throw new Error('fixture has no PDF bytes');
  return {
    id: pdf.id,
    title,
    name: pdf.name,
    type: PDF_MIME,
    size: pdf.size,
    digest: pdf.digest,
    data: await blobToPdfDataUrl(pdf.blob),
  };
}

/** Flat v2/v3 exam shape before booklets existed. */
async function legacyExam(version: 2 | 3) {
  const [first, second] = await Promise.all([
    legacyPdf('first.pdf', 'First'),
    legacyPdf('second.pdf', 'Second'),
  ]);
  const answers = await legacyPdf('answers.pdf', 'answers');
  const base = {
    id: 'legacy-exam',
    title: 'Legacy exam',
    description: '',
    questions: [
      makeQuestion({ id: 'q1' }),
      makeQuestion({ id: 'q2' }),
    ],
    scheduling: { mode: 'immediate' },
    createdAt: 1000,
    updatedAt: 1000,
    durationMinutes: 45,
  };
  return version === 2
    ? { ...base, examPdf: first, answerPdf: answers }
    : { ...base, examPdfs: [first, second], answerPdfs: [answers] };
}

async function legacyBackup(version: 2 | 3): Promise<Record<string, unknown>> {
  return {
    format: 'sanjeh-backup',
    version,
    exportedAt: 2000,
    data: {
      exams: [await legacyExam(version)],
      sessions: [],
      settings,
    },
  };
}

describe('ZIP backups', () => {
  it('writes a manifest and one raw PDF entry per document', async () => {
    const { blob, entries, manifest } = await zipBackup();
    expect(blob.type).toBe('application/zip');
    expect(manifest.version).toBe(6);
    expect(manifest.data.exams).toHaveLength(1);
    expect(manifest.data.exams[0].booklets).toHaveLength(2);
    expect(entries.size).toBe(4);
    expect(entries.has('manifest.json')).toBe(true);
    expect(entries.has('pdfs/00001.pdf')).toBe(true);
    expect(entries.has('pdfs/00003.pdf')).toBe(true);

    const pdfs = [
      ...manifest.data.exams[0].booklets.flatMap((booklet) => booklet.pdfs),
      ...manifest.data.exams[0].answerPdfs,
    ];
    expect(pdfs).toHaveLength(3);
    for (const pdf of pdfs) {
      expect(pdf.file).toMatch(/^pdfs\/\d{5}\.pdf$/);
      expect(pdf.data).toBeUndefined();
      expect(pdf.digest).toMatch(/^[a-f0-9]{64}$/);
      expect(entries.get(pdf.file)?.byteLength).toBe(pdf.size);
    }
    expect(new TextDecoder().decode(entries.get('pdfs/00001.pdf'))).toBe(
      '%PDF-1.4\n%EOF\n',
    );
  });

  it('round-trips an exam without any PDFs', async () => {
    const exam = makeExam({
      id: 'no-pdfs',
      answerPdfs: [],
      booklets: [makeBooklet({ questionCount: 2, pdfs: [] })],
    });
    const blob = await createBackup([exam], [], settings);
    const { entries } = readZip(new Uint8Array(await blob.arrayBuffer()));
    expect([...entries.keys()]).toEqual(['manifest.json']);
    const parsed = await parseBackupFile(blob);
    expect(parsed.data.exams[0].answerPdfs).toEqual([]);
    expect(parsed.data.exams[0].booklets[0].pdfs).toEqual([]);
  });

  it('round-trips a ZIP backup back into stored PDFs', async () => {
    const { blob } = await zipBackup();
    const parsed = await parseBackupFile(blob);
    expect(parsed.version).toBe(6);
    expect(parsed.data.exams[0].booklets[0].pdfs[0].blob).toBeInstanceOf(Blob);
    expect(await parsed.data.exams[0].booklets[0].pdfs[0].blob?.text()).toBe(
      '%PDF-1.4\n%EOF\n',
    );
    expect(parsed.data.exams[0].booklets[1].title).toBe('Second');
    expect(parsed.data.exams[0].booklets[1].pdfs[0].title).toBe('Second');
    expect(parsed.data.exams[0].booklets[1].durationMinutes).toBe(25);
    expect(parsed.data.exams[0].answerPdfs[0].title).toBe('answers');
    expect(parsed.data.sessions[0].result?.totalQuestions).toBeGreaterThan(0);
    expect(parsed.data.settings.language).toBe('fa');
  });

  it('round-trips the answer-key mode of exams and session snapshots', async () => {
    for (const mode of ANSWER_KEY_MODES) {
      const exam = makeExam({
        id: `exam-${mode}`,
        answerKeyMode: mode,
        answerPdfs: [],
        booklets: [makeBooklet({ questionCount: 1, pdfs: [] })],
        questions: [makeQuestion({ key: { kind: 'unresolved' } })],
      });
      const session: ExamSession = {
        ...createSession(exam, 1000),
        status: 'submitted',
        submittedAt: 2000,
        result: scoreExam(exam, {}, 2000),
      };
      const parsed = await parseBackupFile(await createBackup([exam], [session], settings));
      expect(parsed.data.exams[0].answerKeyMode).toBe(mode);
      expect(parsed.data.sessions[0].exam.answerKeyMode).toBe(mode);
    }
  });

  it('defaults a missing answer-key mode to QZ1 for older backups', async () => {
    const { manifest, entries } = await zipBackup();
    delete manifest.data.exams[0].answerKeyMode;
    delete (manifest.data.sessions[0].exam as { answerKeyMode?: string }).answerKeyMode;
    const parsed = await validateBackup(manifest, { files: entries });
    expect(parsed.data.exams[0].answerKeyMode).toBe('qz1');
    expect(parsed.data.sessions[0].exam.answerKeyMode).toBe('qz1');
  });

  it('rejects an unknown answer-key mode', async () => {
    const { manifest, entries } = await zipBackup();
    manifest.data.exams[0].answerKeyMode = 'auto';
    await expect(validateBackup(manifest, { files: entries })).rejects.toThrow(
      /answer-key mode/,
    );
  });

  it('deduplicates a PDF reused in several places by its stable id', async () => {
    const shared = makePdf('shared.pdf');
    const exam = makeExam({
      id: 'shared-exam',
      answerPdfs: [shared],
      booklets: [
        makeBooklet({ id: 'b1', questionCount: 1, pdfs: [shared] }),
        makeBooklet({ id: 'b2', questionCount: 1, pdfs: [shared] }),
      ],
    });
    const blob = await createBackup([exam], [], settings);
    const { entries } = readZip(new Uint8Array(await blob.arrayBuffer()));
    expect(entries.size).toBe(2);
  });

  it('computes a missing digest from the actual PDF bytes', async () => {
    const pdf = { ...makePdf('no-digest.pdf'), digest: '' };
    const exam = makeExam({ id: 'no-digest', answerPdfs: [pdf], booklets: [makeBooklet({ questionCount: 2, pdfs: [pdf] })] });
    const { manifest } = await (async () => {
      const blob = await createBackup([exam], [], settings);
      const { entries } = readZip(new Uint8Array(await blob.arrayBuffer()));
      const entry = entries.get('manifest.json');
      if (!entry) throw new Error('missing manifest');
      return { manifest: JSON.parse(new TextDecoder().decode(entry)) as RawManifest };
    })();
    expect(manifest.data.exams[0].answerPdfs[0].digest).toMatch(/^[a-f0-9]{64}$/);
    expect(manifest.data.exams[0].booklets[0].pdfs[0].digest).toBe(
      manifest.data.exams[0].answerPdfs[0].digest,
    );
  });

  it('refuses to export a PDF whose bytes are unavailable', async () => {
    const pdf = makePdf('lost.pdf');
    delete pdf.blob;
    const exam = makeExam({
      id: 'lost',
      answerPdfs: [pdf],
      booklets: [makeBooklet({ questionCount: 2, pdfs: [pdf] })],
    });
    await expect(createBackup([exam], [], settings)).rejects.toThrow(/bytes/);
  });

  it('rejects a corrupted entry checksum', async () => {
    const { blob } = await zipBackup();
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const marker = new TextEncoder().encode('%PDF-1.4');
    const index = bytes.findIndex((_, position) =>
      marker.every((value, offset) => bytes[position + offset] === value),
    );
    expect(index).toBeGreaterThan(0);
    bytes[index + marker.length] ^= 0xff;
    await expect(parseBackupFile(bytes)).rejects.toThrow(BackupValidationError);
  });

  it('names exports with a zip extension', () => {
    expect(backupFileName(new Date(2026, 9, 25, 14, 30))).toBe(
      'sanjeh-backup-20261025-1430.zip',
    );
  });
});

describe('backup validation', () => {
  it('requires the archive files for a version-6 manifest', async () => {
    const { manifest } = await zipBackup();
    await expect(validateBackup(manifest)).rejects.toThrow(/ZIP archive/);
  });

  it('imports a version-5 JSON backup with base64 PDFs', async () => {
    const parsed = await parseBackupFile(JSON.stringify(await jsonV5Backup()));
    expect(parsed.version).toBe(6);
    expect(await parsed.data.exams[0].booklets[1].pdfs[0].blob?.text()).toBe(
      '%PDF-1.4\n%EOF\n',
    );
    expect(parsed.data.sessions).toHaveLength(1);
  });

  it('upgrades a version-3 backup into one legacy booklet', async () => {
    const parsed = await validateBackup(await legacyBackup(3));
    expect(parsed.version).toBe(6);
    expect(parsed.data.exams[0].booklets).toHaveLength(1);
    expect(parsed.data.exams[0].booklets[0]).toMatchObject({
      title: '',
      questionCount: 2,
      durationMinutes: 45,
    });
    expect(parsed.data.exams[0].booklets[0].pdfs.map((pdf) => pdf.title)).toEqual([
      'First',
      'Second',
    ]);
    expect(parsed.data.exams[0].answerPdfs[0].title).toBe('answers');
  });

  it('upgrades a version-2 backup with one PDF per booklet', async () => {
    const parsed = await validateBackup(await legacyBackup(2));
    expect(parsed.version).toBe(6);
    expect(parsed.data.exams[0].booklets).toHaveLength(1);
    expect(parsed.data.exams[0].booklets[0].questionCount).toBe(2);
    expect(parsed.data.exams[0].booklets[0].durationMinutes).toBe(45);
    expect(parsed.data.exams[0].booklets[0].pdfs[0].title).toBe('first');
    expect(parsed.data.exams[0].answerPdfs[0].title).toBe('answers');
  });

  it('upgrades a version-3 session without booklet fields', async () => {
    const { manifest } = await zipBackup();
    const session = manifest.data.sessions[0];
    const sessionFields = Object.fromEntries(
      Object.entries(session).filter(
        ([key]) => key !== 'bookletIndex' && key !== 'bookletStartedAt' && key !== 'bookletEndsAt',
      ),
    );
    const snapshotFields = Object.fromEntries(
      Object.entries(session.exam).filter(([key]) => key !== 'booklets'),
    );
    const legacyBase = await legacyBackup(3);
    const legacy = {
      ...legacyBase,
      data: {
        ...(legacyBase.data as Record<string, unknown>),
        sessions: [
          {
            ...sessionFields,
            exam: { ...snapshotFields, durationMinutes: 45 },
            endsAt: 123_456,
          },
        ],
      },
    };
    const parsed = await validateBackup(legacy);
    expect(parsed.data.sessions[0]).toMatchObject({
      bookletIndex: 0,
      bookletStartedAt: session.startedAt,
      bookletEndsAt: 123_456,
      endsAt: 123_456,
    });
    expect(parsed.data.sessions[0].exam.booklets).toHaveLength(1);
    expect(parsed.data.sessions[0].exam.booklets[0].durationMinutes).toBe(45);
  });

  it('rejects non-JSON, foreign files, and PDFs missing from the archive', async () => {
    await expect(parseBackupFile('not json')).rejects.toThrow(BackupValidationError);
    await expect(validateBackup({ format: 'other', version: 3 })).rejects.toThrow(
      BackupValidationError,
    );
    await expect(validateBackup(null)).rejects.toThrow(BackupValidationError);

    const { manifest, entries } = await zipBackup();
    entries.delete(manifest.data.exams[0].booklets[0].pdfs[0].file);
    await expect(validateBackup(manifest, { files: entries })).rejects.toThrow(
      /missing from the archive/,
    );
  });

  it('rejects unsupported versions', async () => {
    const { manifest, entries } = await zipBackup();
    await expect(
      validateBackup({ ...manifest, version: 1 }, { files: entries }),
    ).rejects.toThrow(/version/);
    await expect(
      validateBackup({ ...manifest, version: 7 }, { files: entries }),
    ).rejects.toThrow(/version/);
  });

  it('rejects malformed answer keys', async () => {
    const { manifest, entries } = await zipBackup();
    manifest.data.exams[0].questions[0].key = {
      kind: 'known',
      correct: [9],
    } as never;
    await expect(validateBackup(manifest, { files: entries })).rejects.toThrow(/option index/);

    const second = await zipBackup();
    second.manifest.data.exams[0].questions[0].key = {
      kind: 'known',
      correct: [],
    } as never;
    await expect(validateBackup(second.manifest, { files: second.entries })).rejects.toThrow(
      /at least one option/,
    );
  });

  it('rejects missing or malformed booklets', async () => {
    const missing = await zipBackup();
    delete (missing.manifest.data.exams[0] as { booklets?: unknown }).booklets;
    await expect(validateBackup(missing.manifest, { files: missing.entries })).rejects.toThrow(
      /booklets/,
    );

    const empty = await zipBackup();
    empty.manifest.data.exams[0].booklets = [];
    await expect(validateBackup(empty.manifest, { files: empty.entries })).rejects.toThrow(
      /at least one booklet/,
    );

    const mismatch = await zipBackup();
    mismatch.manifest.data.exams[0].booklets[0].questionCount = 5;
    await expect(validateBackup(mismatch.manifest, { files: mismatch.entries })).rejects.toThrow(
      /question counts cover/,
    );

    const duplicate = await zipBackup();
    duplicate.manifest.data.exams[0].booklets[1].id =
      duplicate.manifest.data.exams[0].booklets[0].id;
    await expect(validateBackup(duplicate.manifest, { files: duplicate.entries })).rejects.toThrow(
      /duplicate booklet id/,
    );

    const badDuration = await zipBackup();
    badDuration.manifest.data.exams[0].booklets[0].durationMinutes = -1;
    await expect(
      validateBackup(badDuration.manifest, { files: badDuration.entries }),
    ).rejects.toThrow(/durationMinutes/);
  });

  it('rejects missing or malformed PDFs', async () => {
    const missing = await zipBackup();
    delete (missing.manifest.data.exams[0] as { answerPdfs?: unknown }).answerPdfs;
    await expect(validateBackup(missing.manifest, { files: missing.entries })).rejects.toThrow(
      /answerPdfs/,
    );

    const noPdf = await zipBackup();
    delete (noPdf.manifest.data.exams[0].booklets[0] as { pdfs?: unknown }).pdfs;
    await expect(validateBackup(noPdf.manifest, { files: noPdf.entries })).rejects.toThrow(
      /pdfs/,
    );

    const untitled = await zipBackup();
    untitled.manifest.data.exams[0].booklets[0].pdfs[0].title = '  ';
    await expect(validateBackup(untitled.manifest, { files: untitled.entries })).rejects.toThrow(
      /title/,
    );

    const wrongType = await zipBackup();
    wrongType.manifest.data.exams[0].booklets[0].pdfs[0].type = 'text/plain';
    await expect(validateBackup(wrongType.manifest, { files: wrongType.entries })).rejects.toThrow(
      /application\/pdf/,
    );

    const wrongData = await jsonV5Backup();
    const pdfs = (wrongData.data as RawManifest['data']).exams[0].booklets[0].pdfs;
    pdfs[0].data = 'JVBERi0xLjQK';
    await expect(validateBackup(wrongData)).rejects.toThrow(/base64/);
  });

  it('rejects PDF size or digest mismatches', async () => {
    const wrongSize = await zipBackup();
    wrongSize.manifest.data.exams[0].booklets[0].pdfs[0].size = 999;
    await expect(validateBackup(wrongSize.manifest, { files: wrongSize.entries })).rejects.toThrow(
      /size does not match/,
    );

    const wrongDigest = await zipBackup();
    wrongDigest.manifest.data.exams[0].booklets[0].pdfs[0].digest = 'deadbeef';
    await expect(
      validateBackup(wrongDigest.manifest, { files: wrongDigest.entries }),
    ).rejects.toThrow(/digest mismatch/);
  });

  it('rejects duplicate PDF ids across a booklet and the answer PDFs', async () => {
    const duplicate = await zipBackup();
    duplicate.manifest.data.exams[0].answerPdfs[0].id =
      duplicate.manifest.data.exams[0].booklets[0].pdfs[0].id;
    await expect(
      validateBackup(duplicate.manifest, { files: duplicate.entries }),
    ).rejects.toThrow(/duplicate PDF id/);
  });

  it('rejects duplicate exam ids', async () => {
    const backup = await zipBackup();
    backup.manifest.data.exams.push(structuredClone(backup.manifest.data.exams[0]));
    await expect(validateBackup(backup.manifest, { files: backup.entries })).rejects.toThrow(
      /duplicate exam id/,
    );
  });

  it('rejects duplicate question ids inside a session snapshot', async () => {
    const backup = await zipBackup();
    const questions = backup.manifest.data.sessions[0].exam.questions;
    questions[1].id = questions[0].id;
    await expect(validateBackup(backup.manifest, { files: backup.entries })).rejects.toThrow(
      /duplicate question id/,
    );
  });

  it('rejects a session snapshot whose booklet counts do not match', async () => {
    const backup = await zipBackup();
    backup.manifest.data.sessions[0].exam.booklets[0].questionCount = 9;
    await expect(validateBackup(backup.manifest, { files: backup.entries })).rejects.toThrow(
      /question counts cover/,
    );
  });

  it('rejects responses for unknown questions', async () => {
    const backup = await zipBackup();
    backup.manifest.data.sessions[0].responses.ghost = [1];
    await expect(validateBackup(backup.manifest, { files: backup.entries })).rejects.toThrow(
      /unknown question/,
    );
  });

  it('requires a result on submitted sessions', async () => {
    const backup = await zipBackup();
    delete backup.manifest.data.sessions[0].result;
    await expect(validateBackup(backup.manifest, { files: backup.entries })).rejects.toThrow(
      /result/,
    );
  });

  it('rejects unknown languages, themes, and appearances', async () => {
    const language = await zipBackup();
    (language.manifest.data.settings as { language: string }).language = 'xx';
    await expect(
      validateBackup(language.manifest, { files: language.entries }),
    ).rejects.toThrow(/language/);

    const theme = await zipBackup();
    (theme.manifest.data.settings as { theme: string }).theme = 'unknown-theme';
    await expect(validateBackup(theme.manifest, { files: theme.entries })).rejects.toThrow(
      /theme/,
    );

    const appearance = await zipBackup();
    (appearance.manifest.data.settings as { appearance: string }).appearance = 'sepia';
    await expect(
      validateBackup(appearance.manifest, { files: appearance.entries }),
    ).rejects.toThrow(/appearance/);
  });

  it('accepts settings from before the guide flag existed', async () => {
    const backup = await zipBackup();
    delete (backup.manifest.data.settings as Partial<Settings>).guideSeen;
    const parsed = await validateBackup(backup.manifest, { files: backup.entries });
    expect(parsed.data.settings.guideSeen).toBe(false);
  });

  it('rejects impossible scheduling ranges', async () => {
    const backup = await zipBackup();
    backup.manifest.data.exams[0].scheduling = {
      mode: 'window',
      startsAt: 1000,
      endsAt: 500,
    };
    await expect(validateBackup(backup.manifest, { files: backup.entries })).rejects.toThrow(
      /window/,
    );
  });

  it('accepts a backup with no sessions', async () => {
    const backup = await zipBackup();
    backup.manifest.data.sessions = [];
    expect((await validateBackup(backup.manifest, { files: backup.entries })).data.sessions).toEqual(
      [],
    );
  });
});
