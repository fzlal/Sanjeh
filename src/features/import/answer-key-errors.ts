import type { AnswerKeyError, AnswerKeyErrorCode } from '@/lib/answerKey';
import type { MessageKey, Translate } from '@/i18n';
import { formatNumber } from '@/lib/format';

export const ANSWER_KEY_ERROR_KEYS: Record<AnswerKeyErrorCode, MessageKey> = {
  empty: 'errEmpty',
  fenced: 'errFenced',
  multiline: 'errMultiline',
  segments: 'errSegments',
  version: 'errVersion',
  count: 'errCount',
  seed: 'errSeed',
  tokenCount: 'errTokenCount',
  token: 'errToken',
  duplicate: 'errDuplicate',
};

/** Localizes a parser error, including locale-formatted numeric params. */
export function answerKeyErrorText(
  issue: AnswerKeyError,
  t: Translate,
  locale: string,
): string {
  const params: Record<string, string | number> = {};
  if (issue.params) {
    for (const [key, value] of Object.entries(issue.params)) {
      params[key] = typeof value === 'number' ? formatNumber(value, locale) : String(value);
    }
  }
  return t(ANSWER_KEY_ERROR_KEYS[issue.code], params);
}
