import { z } from "zod";
import { words } from "@/lib/video/schemas";
import { A_ROLL_SECONDS_MIN, A_ROLL_SECONDS_MAX, FORMAT_LIMITS, WORDS_PER_SECOND_MAX, WORDS_PER_SECOND_PROMPT, SPOKEN_MAX_WORDS, ON_SCREEN_MAX_WORDS, wordCount } from "@/lib/video/catalog";

/** Comprobación de una propuesta, sin plan de producción ni escritura. */
export const ugcTimingInput = z.strictObject({
  product_id: z.string().uuid(),
  format: z.enum(["ugc", "mascot"]),
  hook: z.strictObject({ spoken: z.string().trim().min(1).max(256), screen: z.string().trim().min(1).max(160) }),
  a_roll: z.array(z.strictObject({ line: z.string().trim().min(1).max(500), seconds: z.number().positive().max(120) })).min(1).max(12),
});
export const ugcTimingReport = z.strictObject({
  valid: z.boolean(),
  scope: z.literal("timing_only"),
  format: z.enum(["ugc", "mascot"]),
  limits: z.strictObject({ shots_min: z.number(), shots_max: z.number(), seconds_min: z.number(), seconds_max: z.number(), total_min: z.number(), total_max: z.number(), words_per_second_max: z.number(), words_per_second_target: z.number(), hook_words_max: z.number(), screen_words_max: z.number() }),
  shots: z.array(z.strictObject({ key: z.string(), line: z.string(), seconds: z.number(), words: z.number().int(), words_per_second: z.number(), max_words: z.number().int(), within_duration: z.boolean(), within_rate: z.boolean() })),
  hook: z.strictObject({ spoken_words: z.number().int(), screen_words: z.number().int(), within_spoken_limit: z.boolean(), within_screen_limit: z.boolean(), opens_first_line: z.boolean() }),
  total: z.strictObject({ seconds: z.number(), words: z.number().int(), words_per_second: z.number(), within_duration: z.boolean(), within_shot_count: z.boolean() }),
  problems: z.array(z.strictObject({ field: z.string(), message: z.string() })),
  next_action: z.string(),
});

export function checkUgcTiming(input: z.infer<typeof ugcTimingInput>): z.infer<typeof ugcTimingReport> {
  const limits = FORMAT_LIMITS[input.format];
  const problems: { field: string; message: string }[] = [];
  const shots = input.a_roll.map((shot, i) => {
    const count = words(shot.line).length;
    const withinDuration = Number.isInteger(shot.seconds) && shot.seconds >= A_ROLL_SECONDS_MIN && shot.seconds <= A_ROLL_SECONDS_MAX;
    const withinRate = count <= shot.seconds * WORDS_PER_SECOND_MAX;
    if (!withinDuration) problems.push({ field: `a_roll.${i}.seconds`, message: `A${i + 1} debe durar de ${A_ROLL_SECONDS_MIN} a ${A_ROLL_SECONDS_MAX} segundos enteros.` });
    if (!withinRate) problems.push({ field: `a_roll.${i}.line`, message: `A${i + 1} tiene ${count} palabras para ${shot.seconds} s: máximo ${Math.floor(shot.seconds * WORDS_PER_SECOND_MAX)}. Acorta o redistribuye.` });
    return { key: `A${i + 1}`, line: shot.line, seconds: shot.seconds, words: count, words_per_second: count / shot.seconds, max_words: Math.floor(shot.seconds * WORDS_PER_SECOND_MAX), within_duration: withinDuration, within_rate: withinRate };
  });
  const seconds = shots.reduce((sum, shot) => sum + shot.seconds, 0);
  const count = shots.reduce((sum, shot) => sum + shot.words, 0);
  const withinTotal = seconds >= limits.totalMin && seconds <= limits.totalMax;
  const withinCount = shots.length >= limits.aRollMin && shots.length <= limits.aRollMax;
  if (!withinTotal) problems.push({ field: "a_roll", message: `La voz suma ${seconds} s; debe sumar de ${limits.totalMin} a ${limits.totalMax}.` });
  if (!withinCount) problems.push({ field: "a_roll", message: `Hay ${shots.length} tomas; deben ser de ${limits.aRollMin} a ${limits.aRollMax}.` });
  const hookWords = words(input.hook.spoken), screenWords = wordCount(input.hook.screen), openingWords = words(shots[0].line);
  const opens = hookWords.length > 0 && hookWords.every((word, i) => word === openingWords[i]);
  if (hookWords.length > SPOKEN_MAX_WORDS) problems.push({ field: "hook.spoken", message: `La apertura completa tiene ${hookWords.length} palabras; máximo ${SPOKEN_MAX_WORDS} para 3 s. Cuenta también lo que sigue a una pregunta si completa la tensión.` });
  if (screenWords > ON_SCREEN_MAX_WORDS) problems.push({ field: "hook.screen", message: `El texto inicial tiene ${screenWords} palabras; máximo ${ON_SCREEN_MAX_WORDS}.` });
  if (!opens) problems.push({ field: "a_roll.0.line", message: "A1 debe empezar con la apertura hablada enviada, sin frases anteriores." });
  return {
    valid: problems.length === 0, scope: "timing_only", format: input.format,
    limits: { shots_min: limits.aRollMin, shots_max: limits.aRollMax, seconds_min: A_ROLL_SECONDS_MIN, seconds_max: A_ROLL_SECONDS_MAX, total_min: limits.totalMin, total_max: limits.totalMax, words_per_second_max: WORDS_PER_SECOND_MAX, words_per_second_target: WORDS_PER_SECOND_PROMPT, hook_words_max: SPOKEN_MAX_WORDS, screen_words_max: ON_SCREEN_MAX_WORDS },
    shots, hook: { spoken_words: hookWords.length, screen_words: screenWords, within_spoken_limit: hookWords.length <= SPOKEN_MAX_WORDS, within_screen_limit: screenWords <= ON_SCREEN_MAX_WORDS, opens_first_line: opens },
    total: { seconds, words: count, words_per_second: count / seconds, within_duration: withinTotal, within_shot_count: withinCount }, problems,
    next_action: problems.length ? "Corrige los campos indicados y vuelve a comprobar el texto exacto antes de mostrarlo. Esta lectura no guarda ni genera." : "Los tiempos previstos cumplen. Revisa continuidad argumental, beneficio, objeción y oferta antes de entregar: esta comprobación no certifica persuasión, claims, plan ni duración real de clips.",
  };
}
