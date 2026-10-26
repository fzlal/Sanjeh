import type { ExamSnapshot, OptionIndex, ResultSnapshot, ReviewedQuestion } from '@/types';
import { OPTION_INDICES } from '@/types';

export function normalizeSelection(selected: readonly number[] | undefined): OptionIndex[] {
  if (!selected) return [];
  const allowed = new Set<number>(OPTION_INDICES);
  return Array.from(new Set(selected.filter((value) => allowed.has(value)))).sort(
    (a, b) => a - b,
  ) as OptionIndex[];
}

/**
 * Accepts any selection made only of the key's correct options. Because the
 * student picks one option per question, any single correct option is enough;
 * a selection containing an option outside the key is wrong.
 */
export function isAcceptedSelection(
  selected: readonly OptionIndex[],
  correct: readonly OptionIndex[],
): boolean {
  const a = normalizeSelection(selected);
  const b = normalizeSelection(correct);
  return a.length > 0 && a.every((value) => b.includes(value));
}

export const CORRECT_POINTS = 3;
export const INCORRECT_POINTS = -1;

/**
 * Scores by stable question IDs, never by displayed position.
 * The denominator contains only known answer keys. Questions that are
 * unanswered, excluded, or unresolved are reported separately.
 * Each correct answer is worth 3 points and each wrong answer deducts 1,
 * so the overall percentage can be negative.
 */
export function scoreExam(
  exam: Pick<ExamSnapshot, 'questions'>,
  responses: Record<string, OptionIndex[] | undefined>,
  completedAt: number = Date.now(),
): ResultSnapshot {
  const perQuestion: ReviewedQuestion[] = [];
  let correct = 0;
  let incorrect = 0;
  let unanswered = 0;
  let excluded = 0;
  let unresolved = 0;

  for (const question of exam.questions) {
    const selected = normalizeSelection(responses[question.id]);

    if (question.key.kind === 'excluded') {
      excluded += 1;
      perQuestion.push({
        questionId: question.id,
        outcome: 'excluded',
        selected,
        correct: null,
      });
      continue;
    }

    if (question.key.kind === 'unresolved') {
      unresolved += 1;
      perQuestion.push({
        questionId: question.id,
        outcome: 'unresolved',
        selected,
        correct: null,
      });
      continue;
    }

    const correctKey = normalizeSelection(question.key.correct);
    if (selected.length === 0) {
      unanswered += 1;
      perQuestion.push({
        questionId: question.id,
        outcome: 'unanswered',
        selected,
        correct: correctKey,
      });
      continue;
    }

    if (isAcceptedSelection(selected, correctKey)) {
      correct += 1;
      perQuestion.push({
        questionId: question.id,
        outcome: 'correct',
        selected,
        correct: correctKey,
      });
    } else {
      incorrect += 1;
      perQuestion.push({
        questionId: question.id,
        outcome: 'incorrect',
        selected,
        correct: correctKey,
      });
    }
  }

  const scoredQuestions = correct + incorrect + unanswered;
  const points = correct * CORRECT_POINTS + incorrect * INCORRECT_POINTS;
  const percentage =
    scoredQuestions > 0
      ? Math.round((points / (scoredQuestions * CORRECT_POINTS)) * 1000) / 10
      : null;

  return {
    totalQuestions: exam.questions.length,
    scoredQuestions,
    correct,
    incorrect,
    unanswered,
    excluded,
    unresolved,
    percentage,
    completedAt,
    perQuestion,
  };
}
