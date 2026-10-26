import type { AnswerKey, OptionIndex } from '@/types';

export const ANSWER_KEY_VERSION = 'QZ1';
export const MAX_SEED = 0xffffffff;
export const UNRESOLVED_TOKEN = '?';
export const EXCLUDED_TOKEN = '-';

export type AnswerKeyErrorCode =
  | 'empty'
  | 'fenced'
  | 'multiline'
  | 'segments'
  | 'version'
  | 'count'
  | 'seed'
  | 'tokenCount'
  | 'token'
  | 'duplicate';

export interface AnswerKeyError {
  code: AnswerKeyErrorCode;
  params?: Record<string, string | number>;
}

export interface ParsedAnswerKey {
  count: number;
  seed: number;
  tokens: AnswerKey[];
}

export type ParseAnswerKeyResult =
  | { ok: true; value: ParsedAnswerKey }
  | { ok: false; error: AnswerKeyError };

function fail(
  code: AnswerKeyErrorCode,
  params?: Record<string, string | number>,
): ParseAnswerKeyResult {
  return { ok: false, error: { code, params } };
}

function parseToken(raw: string, questionNumber: number): AnswerKey | AnswerKeyError {
  if (raw === UNRESOLVED_TOKEN) return { kind: 'unresolved' };
  if (raw === EXCLUDED_TOKEN) return { kind: 'excluded' };

  if (raw.length === 0) {
    return { code: 'token', params: { question: questionNumber, token: raw } };
  }

  const parts = raw.split(',').map((part) => part.trim());
  if (parts.some((part) => !/^[1-4]$/.test(part))) {
    return { code: 'token', params: { question: questionNumber, token: raw } };
  }

  const indices = parts.map((part) => Number(part) as OptionIndex);
  const unique = new Set(indices);
  if (unique.size !== indices.length) {
    return { code: 'duplicate', params: { question: questionNumber, token: raw } };
  }

  indices.sort((a, b) => a - b);
  return { kind: 'known', correct: indices };
}

/**
 * Parses the strict SANJEH answer-key contract: QZ1|N|SEED|A1|...|AN.
 * Accepts surrounding whitespace only; formatting noise is rejected so the
 * user can see exactly what an external AI produced.
 */
export function parseAnswerKey(raw: string): ParseAnswerKeyResult {
  const input = raw.trim();
  if (input.length === 0) return fail('empty');
  if (input.includes('`')) return fail('fenced');
  if (/[\r\n]/.test(input)) return fail('multiline');

  const segments = input.split('|').map((segment) => segment.trim());
  if (segments.length < 4) return fail('segments');

  if (segments[0] !== ANSWER_KEY_VERSION) {
    return fail('version', { version: segments[0] || '—' });
  }

  const countRaw = segments[1];
  if (!/^\d+$/.test(countRaw) || Number(countRaw) < 1) {
    return fail('count', { value: countRaw || '—' });
  }
  const count = Number(countRaw);

  const seedRaw = segments[2];
  if (!/^\d+$/.test(seedRaw) || !Number.isInteger(Number(seedRaw)) || Number(seedRaw) > MAX_SEED) {
    return fail('seed', { value: seedRaw || '—' });
  }
  const seed = Number(seedRaw);

  const tokenSegments = segments.slice(3);
  if (tokenSegments.length !== count) {
    return fail('tokenCount', {
      expected: count,
      actual: tokenSegments.length,
    });
  }

  const tokens: AnswerKey[] = [];
  for (let i = 0; i < tokenSegments.length; i += 1) {
    const parsed = parseToken(tokenSegments[i], i + 1);
    if ('code' in parsed) {
      return { ok: false, error: parsed };
    }
    tokens.push(parsed);
  }

  return { ok: true, value: { count, seed, tokens } };
}

export function answerKeyToToken(key: AnswerKey): string {
  if (key.kind === 'unresolved') return UNRESOLVED_TOKEN;
  if (key.kind === 'excluded') return EXCLUDED_TOKEN;
  return [...key.correct].sort((a, b) => a - b).join(',');
}

export function serializeAnswerKey(count: number, seed: number, tokens: AnswerKey[]): string {
  if (!Number.isInteger(count) || count < 1 || tokens.length !== count) {
    throw new RangeError('Answer-key token count must equal the question count.');
  }
  if (!Number.isInteger(seed) || seed < 0 || seed > MAX_SEED) {
    throw new RangeError('Seed must be a 32-bit unsigned integer.');
  }
  return [
    ANSWER_KEY_VERSION,
    String(count),
    String(seed),
    ...tokens.map(answerKeyToToken),
  ].join('|');
}

/** Builds an answer key from the accepted correct option indices. */
export function knownKey(indices: OptionIndex[]): AnswerKey {
  const unique = Array.from(new Set(indices)).sort((a, b) => a - b);
  return { kind: 'known', correct: unique };
}

/**
 * Toggles one correct option while editing. Clearing every option leaves the
 * question unresolved so the UI can demand an explicit answer.
 */
export function toggleCorrectOption(key: AnswerKey, option: OptionIndex): AnswerKey {
  const current = key.kind === 'known' ? key.correct : [];
  if (current.includes(option)) {
    const remaining = current.filter((value) => value !== option);
    return remaining.length > 0 ? knownKey(remaining) : { kind: 'unresolved' };
  }
  return knownKey([...current, option]);
}

/**
 * Single-answer editing used by manual keys: picking an option replaces the
 * current correct option, and picking the same option again leaves the
 * question unresolved.
 */
export function chooseCorrectOption(key: AnswerKey, option: OptionIndex): AnswerKey {
  const current = key.kind === 'known' ? key.correct : [];
  if (current.length === 1 && current[0] === option) return { kind: 'unresolved' };
  return knownKey([option]);
}

/** Excluded questions stay excluded until the user explicitly restores them. */
export function toggleExcluded(key: AnswerKey): AnswerKey {
  return key.kind === 'excluded' ? { kind: 'unresolved' } : { kind: 'excluded' };
}

export function countUnresolved(tokens: readonly AnswerKey[]): number {
  return tokens.filter((token) => token.kind === 'unresolved').length;
}
