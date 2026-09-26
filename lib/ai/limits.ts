// Topes que el modelo tiene que contar (caracteres, palabras por segundo). El modelo no cuenta con
// precisión: si el prompt pide el mismo tope que valida el código, lo roza, la respuesta entera se
// rechaza y se paga otra vez (ai_generations, 2026-09-24/25: invalid_concepts en 6 de 9 llamadas).
// El prompt pide un 10 % menos y el código sigue aceptando hasta el tope real. Puro, con tests.

/** Qué parte del tope real se le pide al modelo. */
export const PROMPT_MARGIN = 0.9;

/** El tope entero que va en el prompt: 45 → 40, 32 → 28, 120 → 108. */
export function promptLimit(limit: number): number {
  return Math.floor(limit * PROMPT_MARGIN);
}

/** Un tope con decimales para el prompt, redondeado a una décima: 3 → 2,7. */
export function promptRate(limit: number): number {
  return Math.round(limit * PROMPT_MARGIN * 10) / 10;
}
