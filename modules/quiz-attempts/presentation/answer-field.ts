/**
 * Shared between the quiz runner form and the submission action.
 *
 * It lives outside `actions.ts` because a `"use server"` module may only export
 * async functions, and this prefix is a plain constant.
 *
 * Each question's radio group is named `answer_<questionId>` so its options stay
 * mutually exclusive; the question id therefore travels in the form field *key*
 * rather than in the value.
 */
export const ANSWER_FIELD_PREFIX = "answer_";