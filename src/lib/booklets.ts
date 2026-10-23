export interface BookletLike {
  questionCount: number;
}

export interface BookletRange {
  index: number;
  /** 1-based first question number shown on the answer sheet. */
  startQuestion: number;
  /** 1-based last question number; 0 when the booklet has no questions. */
  endQuestion: number;
  /** 0-based inclusive start in the exam's question array. */
  startIndex: number;
  /** 0-based exclusive end in the exam's question array. */
  endIndex: number;
  count: number;
}

function safeCount(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

export function bookletRanges(booklets: readonly BookletLike[]): BookletRange[] {
  let offset = 0;
  return booklets.map((booklet, index) => {
    const count = safeCount(booklet.questionCount);
    const startIndex = offset;
    offset += count;
    return {
      index,
      startQuestion: count > 0 ? startIndex + 1 : 0,
      endQuestion: startIndex + count,
      startIndex,
      endIndex: startIndex + count,
      count,
    };
  });
}

export function totalQuestionCount(booklets: readonly BookletLike[]): number {
  return booklets.reduce((sum, booklet) => sum + safeCount(booklet.questionCount), 0);
}

export function totalDurationMinutes(
  booklets: readonly { durationMinutes: number }[],
): number {
  return booklets.reduce(
    (sum, booklet) =>
      sum + (Number.isFinite(booklet.durationMinutes) ? Math.max(0, booklet.durationMinutes) : 0),
    0,
  );
}

export function bookletIndexForQuestion(
  ranges: readonly BookletRange[],
  questionIndex: number,
): number {
  const match = ranges.find(
    (range) => questionIndex >= range.startIndex && questionIndex < range.endIndex,
  );
  return match ? match.index : -1;
}

export function isQuestionInBooklet(
  ranges: readonly BookletRange[],
  bookletIndex: number,
  questionIndex: number,
): boolean {
  const range = ranges[bookletIndex];
  if (!range) return false;
  return questionIndex >= range.startIndex && questionIndex < range.endIndex;
}
