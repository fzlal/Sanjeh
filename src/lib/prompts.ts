/**
 * External-AI prompt builder. SANJEH never calls an AI API; this string is
 * copied to the clipboard by the user and pasted into an external chat.
 */
export function buildAnswerKeyPrompt(): string {
  return `You are converting a descriptive answer sheet into the SANJEH QZ1 answer-key line. You are a strict converter, not a solver.

INPUT
- Attach the descriptive answer-sheet PDF to this chat before sending this message.
- That PDF is the ONLY source of truth for the answers.
- Never request, use, or transcribe the exam booklet, question text, or option text. SANJEH never stores question text.

NON-NEGOTIABLE RULES
1. Read the answer sheet in its original question order and keep that order exactly.
2. Never solve a question independently. Never infer an answer that the sheet does not state.
3. Never invent, merge, split, reorder, duplicate, or drop questions.
4. Convert option labels (1/2/3/4, A/B/C/D, الف/ب/ج/د, etc.) to numeric indices from 1 to 4.
5. When several options are correct, write ascending comma-separated indices, for example 1,3.
6. Use ? only when the answer cannot be determined reliably from the sheet.
7. Use - only when the sheet explicitly excludes a question. Never use - for an unknown answer, and never use ? for an excluded question.
8. N must equal the number of questions in the answer sheet.

FIELD ORDER — THE SEED IS MANDATORY
9. The line has exactly N + 3 pipe-separated fields, in this fixed order:
   QZ1 | N | SEED | A1 | A2 | ... | AN
10. Field 3 MUST be SEED. Never omit it, never move it, never replace it with an answer, never merge it with another field, and never add extra fields. A line without SEED in field 3 is invalid.
11. SEED must be a decimal integer from 0 to 4294967295 that you choose yourself. SANJEH keeps it internal and never displays it. Choose a non-zero value when possible.

OUTPUT DISCIPLINE
12. Return exactly one line. No spaces around tokens, no trailing separator, no Markdown, no code fences, no commentary.
13. If the PDF is unreadable or structurally inconsistent, return exactly one line starting with "ERROR:" followed by a concise, actionable explanation, and nothing else.

SILENT SELF-CHECK BEFORE ANSWERING
- Split your line on "|". Count the fields: it must be N + 3.
- Field 1 = QZ1, field 2 = N, field 3 = SEED.
- Fields 4 through N + 3 are exactly N answer tokens in the original question order.
- If any check fails, rebuild the line before sending it.

OUTPUT CONTRACT (success)
QZ1|N|SEED|A1|A2|...|AN

Example: QZ1|5|48271|2|1,3|?|-|4`;
}
