// Qué ganchos de un desarrollo se pueden usar y cómo llegan a los pasos siguientes (video, estáticos,
// chat y el texto del anuncio). Puro, con tests.

import { PATTERN_NAMES } from "./catalog";
import type { AngleHook, HooksMeta } from "./schemas";

/** Lo de un desarrollo que leen los ganchos (los de antes no traen el meta). */
export type HookSource = { hooks: AngleHook[]; recommended_hook: number } & HooksMeta;

/**
 * ¿Se puede usar sin inventar nada ni arriesgar la cuenta? Fuera: los que rozan la política, los de
 * riesgo alto y los que piden material real que no hay (un testimonio, la bodega, un experto). Los
 * pasos con IA no tienen ese material: lo grabaría el comerciante.
 */
export function isUsable(h: AngleHook): boolean {
  return h.policy_ok !== false && h.risk !== "high" && !h.needs_real_material?.trim() && Boolean(h.text.trim());
}

const total = (h: AngleHook) => (h.scores ? h.scores.salience + h.scores.relevance + h.scores.credibility + h.scores.verifiability : 0);

/**
 * Los ganchos que se pueden usar, del mejor al peor: el recomendado, después el resto del top (en su
 * orden) y después los demás por puntaje. `index` es su posición en el desarrollo.
 */
export function usableHooks(src: HookSource): { index: number; hook: AngleHook }[] {
  const order = [src.recommended_hook, ...(src.hook_top ?? []).map((t) => t.hook)];
  const rank = (i: number) => {
    const k = order.indexOf(i);
    return k < 0 ? order.length : k;
  };
  return src.hooks
    .map((hook, index) => ({ index, hook }))
    .filter(({ hook }) => isUsable(hook))
    .sort((a, b) => rank(a.index) - rank(b.index) || total(b.hook) - total(a.hook) || a.index - b.index);
}

/** El gancho que abre el anuncio cuando nadie elige (el texto principal del anuncio). */
export function bestHook(src: HookSource): AngleHook | null {
  return usableHooks(src)[0]?.hook ?? null;
}

/** El texto principal del anuncio: el hablado del mejor gancho y su segunda frase. Vacío si no hay. */
export function adHookText(src: HookSource | null | undefined): string {
  const h = src ? bestHook(src) : null;
  return h ? [h.text, h.follow_up].filter((t) => t?.trim()).join(" ") : "";
}

/** Un gancho como lo lee un prompt: la tríada, su patrón y si lo escribió el comerciante. */
export function hookForPrompt(index: number, h: AngleHook) {
  return {
    index,
    ...(h.pattern ? { pattern: `${PATTERN_NAMES[h.pattern]} (${h.pattern})` } : {}),
    ...(h.mechanism ? { mechanism: h.mechanism } : {}),
    spoken: h.text,
    ...(h.follow_up ? { follow_up: h.follow_up } : {}),
    ...(h.on_screen ? { on_screen: h.on_screen } : {}),
    ...(h.visual_first_3s ? { visual_first_3s: h.visual_first_3s } : {}),
    ...(h.edited ? { edited_by_merchant: true } : {}),
  };
}

/** Los ganchos usables listos para un prompt, el recomendado primero. */
export function hooksForPrompt(src: HookSource) {
  return usableHooks(src).map(({ index, hook }) => hookForPrompt(index, hook));
}
