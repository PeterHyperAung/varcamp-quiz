import { z } from "zod";

const trimmed = z.string().trim();

/**
 * Optional free text.
 *
 * Accepts `null` as well as a string because forms send `""` while programmatic
 * callers naturally pass `null`; both collapse to an empty string here.
 */
const optionalText = (max: number) =>
  z
    .union([z.string(), z.null(), z.undefined()])
    .transform((value) => value ?? "")
    .pipe(trimmed.max(max));

export const quizInputSchema = z
  .object({
    title: trimmed.min(1, "Enter a title.").max(200),
    description: optionalText(2000),
  })
  .strict();

export const quizSettingsInputSchema = z
  .object({
    instructions: optionalText(4000),
    passingScore: z
      .union([z.literal(""), z.coerce.number().int().min(0).max(100), z.null()])
      .transform((value) => (value === "" || value === null ? null : value)),
    certificateEnabled: z
      .union([z.literal("on"), z.literal("true"), z.literal("false"), z.boolean(), z.null()])
      .transform((value) => value === "false" || value === false || value === null ? false : true),
  })
  .strict();

export const answerOptionInputSchema = z
  .object({
    id: z.string().uuid().optional(),
    label: trimmed.min(1, "Enter an option.").max(300),
    isCorrect: z
      .union([z.literal("on"), z.literal("true"), z.literal("false")])
      .transform((value) => value !== "false"),
  })
  .strict();

export const questionInputSchema = z
  .object({
    prompt: trimmed.min(1, "Enter the question.").max(500),
    questionType: z.enum(["multiple_choice", "true_false"]),
    points: z.coerce.number().int().min(1).max(100),
    // The admin form submits checkbox values named `correct`, so a question
    // arrives as an array of `correct` values keyed by option position.
    options: z.array(answerOptionInputSchema).min(2).max(8),
  })
  .strict();

export const questionOrderSchema = z
  .object({ orderedQuestionIds: z.array(z.string().uuid()).min(1) })
  .strict();

export type QuizInput = z.infer<typeof quizInputSchema>;
export type QuizSettingsInput = z.infer<typeof quizSettingsInputSchema>;
export type QuestionInput = z.infer<typeof questionInputSchema>;

/**
 * Parses the question editor form payload.
 *
 * `true/false` questions are fixed to two options, so the admin UI does not
 * have to invent or hide options client-side.
 */
export function normaliseQuestionInput(raw: unknown): QuestionInput {
  const parsed = questionInputSchema.parse(raw);

  if (parsed.questionType !== "true_false") return parsed;

  const [first, second] = parsed.options;
  const options = [
    { ...first, label: "True" },
    { ...second, label: "False" },
  ];

  return { ...parsed, options };
}