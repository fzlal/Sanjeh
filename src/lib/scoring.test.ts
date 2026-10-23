import { describe, expect, it } from 'vitest';
import type { OptionIndex } from '@/types';
import { makeExam, makeQuestion } from '@/test/fixtures';
import { isExactMatch, scoreExam } from './scoring';

const exam = makeExam({
  questions: [
    makeQuestion({ id: 'q1', key: { kind: 'known', correct: [1, 3] } }),
    makeQuestion({ id: 'q2', key: { kind: 'known', correct: [2] } }),
    makeQuestion({ id: 'q3', key: { kind: 'unresolved' } }),
    makeQuestion({ id: 'q4', key: { kind: 'excluded' } }),
    makeQuestion({ id: 'q5', key: { kind: 'known', correct: [4] } }),
  ],
});

describe('isExactMatch', () => {
  it('requires the exact set regardless of order or duplicates', () => {
    expect(isExactMatch([3, 1] as OptionIndex[], [1, 3])).toBe(true);
    expect(isExactMatch([1] as OptionIndex[], [1, 3])).toBe(false);
    expect(isExactMatch([1, 2, 3] as OptionIndex[], [1, 3])).toBe(false);
    expect(isExactMatch([] as OptionIndex[], [1, 3])).toBe(false);
  });
});

describe('scoreExam', () => {
  const responses = {
    q1: [1, 3] as OptionIndex[],
    q2: [1] as OptionIndex[],
    q3: [2] as OptionIndex[],
    q4: [1] as OptionIndex[],
    // q5 unanswered
  };

  it('scores correct, incorrect, and unanswered questions', () => {
    const result = scoreExam(exam, responses, 1000);
    expect(result.correct).toBe(1);
    expect(result.incorrect).toBe(1);
    expect(result.unanswered).toBe(1);
    expect(result.scoredQuestions).toBe(3);
    expect(result.percentage).toBe(33.3);
  });

  it('excludes excluded and unresolved questions from the denominator', () => {
    const result = scoreExam(exam, responses, 1000);
    expect(result.excluded).toBe(1);
    expect(result.unresolved).toBe(1);
    expect(result.totalQuestions).toBe(5);
    expect(result.scoredQuestions).toBe(3);
  });

  it('marks an empty response as unanswered, not incorrect', () => {
    const result = scoreExam(exam, { q2: [] as OptionIndex[] }, 1000);
    expect(result.unanswered).toBe(3);
    expect(result.incorrect).toBe(0);
  });

  it('keeps ? and - outcomes distinguishable in the review', () => {
    const result = scoreExam(exam, responses, 1000);
    const unresolved = result.perQuestion.find((item) => item.questionId === 'q3');
    const excluded = result.perQuestion.find((item) => item.questionId === 'q4');
    expect(unresolved).toMatchObject({ outcome: 'unresolved', correct: null });
    expect(excluded).toMatchObject({ outcome: 'excluded', correct: null });
    expect(unresolved?.selected).toEqual([2]);
  });

  it('associates responses with stable ids even when display order changes', () => {
    const reversed = { ...exam, questions: [...exam.questions].reverse() };
    const forward = scoreExam(exam, responses, 1000);
    const backward = scoreExam(reversed, responses, 1000);
    expect(backward.correct).toBe(forward.correct);
    expect(backward.incorrect).toBe(forward.incorrect);
    expect(backward.percentage).toBe(forward.percentage);
  });

  it('returns a null percentage when nothing is scorable', () => {
    const empty = makeExam({
      questions: [
        makeQuestion({ key: { kind: 'unresolved' } }),
        makeQuestion({ key: { kind: 'excluded' } }),
      ],
    });
    const result = scoreExam(empty, {}, 1);
    expect(result.scoredQuestions).toBe(0);
    expect(result.percentage).toBeNull();
  });

  it('reports a perfect score for an exact multi-answer match', () => {
    const perfect = makeExam({
      questions: [makeQuestion({ id: 'single', key: { kind: 'known', correct: [1, 3] } })],
    });
    const result = scoreExam(perfect, { single: [3, 1] }, 1);
    expect(result.correct).toBe(1);
    expect(result.percentage).toBe(100);
  });
});
