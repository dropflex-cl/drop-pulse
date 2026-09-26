// Llamadas en paralelo con el mismo prefijo en caché (el QA de las imágenes de un producto): si salen
// juntas, todas escriben la caché (1,25×) y ninguna la lee (0,1×). Con esta puerta la primera sale
// sola y las demás esperan a que termine: desde la segunda se lee lo que escribió.
// ai_generations, 2026-09-25: las 4 primeras page_qa de una galería escribieron 6.116 tokens cada una.
// Vive en la memoria del proceso: sirve dentro de una misma corrida en segundo plano (after()), que
// es donde se juntan. Puro: sin I/O, testeable.

/** La caché de Anthropic dura 5 minutos; se deja margen para no esperar por una que ya venció. */
const WARM_MS = 4 * 60_000;

const warm = new Map<string, { done: Promise<unknown>; at: number }>();

/**
 * Corre `call` después de la primera llamada con la misma `key` que siga fresca. Si la primera falla,
 * las demás salen igual (sin caché que leer, pero sin quedar trabadas).
 */
export async function afterCacheWarm<T>(key: string, call: () => Promise<T>, now = Date.now()): Promise<T> {
  const first = warm.get(key);
  if (first && now - first.at < WARM_MS) {
    await first.done.catch(() => undefined);
    return call();
  }
  const done = call();
  warm.set(key, { done, at: now });
  for (const [k, v] of warm) if (now - v.at >= WARM_MS) warm.delete(k);
  return done;
}
