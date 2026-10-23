import { describe, expect, it } from 'vitest';
import {
  answerKeyToToken,
  countUnresolved,
  parseAnswerKey,
  serializeAnswerKey,
  toggleCorrectOption,
  toggleExcluded,
} from './answerKey';

describe('parseAnswerKey', () => {
  it('parses the documented five-question example', () => {
    const result = parseAnswerKey('QZ1|5|48271|2|1,3|?|-|4');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.count).toBe(5);
    expect(result.value.seed).toBe(48271);
    expect(result.value.tokens).toEqual([
      { kind: 'known', correct: [2] },
      { kind: 'known', correct: [1, 3] },
      { kind: 'unresolved' },
      { kind: 'excluded' },
      { kind: 'known', correct: [4] },
    ]);
  });

  it('normalizes whitespace and surrounding padding around tokens', () => {
    const result = parseAnswerKey('  QZ1 | 5 | 48271 | 2 | 1,3 | ? | - | 4  ');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.tokens[3]).toEqual({ kind: 'excluded' });
    expect(result.value.tokens[1]).toEqual({ kind: 'known', correct: [1, 3] });
  });

  it('sorts multi-answer indices and rejects duplicates', () => {
    const sorted = parseAnswerKey('QZ1|1|1|3,1');
    expect(sorted.ok && sorted.value.tokens[0]).toEqual({ kind: 'known', correct: [1, 3] });
    const duplicate = parseAnswerKey('QZ1|1|1|1,1');
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) expect(duplicate.error.code).toBe('duplicate');
  });

  it('keeps ? and - semantically distinct', () => {
    const result = parseAnswerKey('QZ1|2|7|?|-');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.tokens[0].kind).toBe('unresolved');
    expect(result.value.tokens[1].kind).toBe('excluded');
  });

  it.each([
    ['', 'empty'],
    ['`QZ1|1|1|2`', 'fenced'],
    ['QZ1|1|1|2\nQZ1|1|1|2', 'multiline'],
    ['QZ1|1|1', 'segments'],
    ['QZ2|1|1|2', 'version'],
    ['QZ1|0|1|2', 'count'],
    ['QZ1|abc|1|2', 'count'],
    ['QZ1|1|4294967296|2', 'seed'],
    ['QZ1|1|-5|2', 'seed'],
    ['QZ1|2|1|2', 'tokenCount'],
    ['QZ1|1|1|5', 'token'],
    ['QZ1|1|1|0', 'token'],
    ['QZ1|1|1|1,5', 'token'],
  ])('rejects malformed input %j with %s', (input, code) => {
    const result = parseAnswerKey(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(code);
  });

  it('reports the failing question number for bad tokens', () => {
    const result = parseAnswerKey('QZ1|2|1|2|x');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('token');
      expect(result.error.params?.question).toBe(2);
    }
  });
});

describe('answer key serialization', () => {
  it('round-trips through parse and serialize', () => {
    const input = 'QZ1|5|123456|2|1,4|?|-|3';
    const parsed = parseAnswerKey(input);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(
      serializeAnswerKey(parsed.value.count, parsed.value.seed, parsed.value.tokens),
    ).toBe(input);
  });

  it('serializes each key kind to its token', () => {
    expect(answerKeyToToken({ kind: 'known', correct: [4, 2] })).toBe('2,4');
    expect(answerKeyToToken({ kind: 'unresolved' })).toBe('?');
    expect(answerKeyToToken({ kind: 'excluded' })).toBe('-');
  });

  it('refuses to serialize inconsistent data', () => {
    expect(() => serializeAnswerKey(2, 1, [{ kind: 'unresolved' }])).toThrow(RangeError);
    expect(() => serializeAnswerKey(1, -1, [{ kind: 'unresolved' }])).toThrow(RangeError);
  });
});

describe('editing answer keys', () => {
  it('adds and removes options while keeping them sorted', () => {
    const two = toggleCorrectOption({ kind: 'known', correct: [3] }, 1);
    expect(two).toEqual({ kind: 'known', correct: [1, 3] });
    expect(toggleCorrectOption(two, 3)).toEqual({ kind: 'known', correct: [1] });
  });

  it('clears a known key back to unresolved', () => {
    expect(toggleCorrectOption({ kind: 'known', correct: [2] }, 2)).toEqual({
      kind: 'unresolved',
    });
  });

  it('starts answering an unresolved or excluded question from scratch', () => {
    expect(toggleCorrectOption({ kind: 'unresolved' }, 4)).toEqual({
      kind: 'known',
      correct: [4],
    });
    expect(toggleCorrectOption({ kind: 'excluded' }, 3)).toEqual({
      kind: 'known',
      correct: [3],
    });
  });

  it('toggles exclusion without touching other keys', () => {
    expect(toggleExcluded({ kind: 'known', correct: [1, 2] })).toEqual({ kind: 'excluded' });
    expect(toggleExcluded({ kind: 'excluded' })).toEqual({ kind: 'unresolved' });
  });

  it('counts only unresolved tokens', () => {
    expect(
      countUnresolved([
        { kind: 'unresolved' },
        { kind: 'excluded' },
        { kind: 'known', correct: [1] },
        { kind: 'unresolved' },
      ]),
    ).toBe(2);
  });
});
