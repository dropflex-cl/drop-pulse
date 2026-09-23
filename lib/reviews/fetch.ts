import "server-only";
import { buildFeedbackUrl, extractItemId } from "./aliexpress";

// La mitad con red de la lectura de AliExpress (la otra, pura, en ./aliexpress.ts). Portado de
// dropflex v1 (lib/reviews/fetch.ts). El endpoint no es un contrato: responde sin sesión, pero limita
// por IP y región, y desde un datacenter puede devolver una lista vacía sin error. Por eso una
// respuesta vacía y sin estadísticas se trata como “AliExpress no respondió”, no como “sin reseñas”.

/** Encabezados de un navegador de escritorio: el endpoint atiende a la página, no a bots. */
const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "es-ES,es;q=0.9",
};

const REQUEST_TIMEOUT_MS = 15_000;
/** Pausa entre páginas: leer 10 seguidas sin respiro es la forma más rápida de que corten. */
export const PAGE_DELAY_MS = 400;

/** El enlace corto de la app (a.aliexpress.com/_xxxx) → el id detrás de su redirección, o null. */
export async function resolveShortLink(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { redirect: "follow", headers: BROWSER_HEADERS, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    return extractItemId(res.url);
  } catch {
    return null;
  }
}

/** Una página de reseñas ya parseada como JSON; null ante cualquier falla. Un reintento. */
export async function fetchFeedbackPage(itemId: string, page: number, photosOnly: boolean): Promise<unknown | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(buildFeedbackUrl({ itemId, page, photosOnly }), {
        headers: { ...BROWSER_HEADERS, Referer: `https://es.aliexpress.com/item/${itemId}.html` },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        cache: "no-store",
      });
      if (res.ok) return (await res.json()) as unknown;
    } catch {
      // se reintenta una vez
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return null;
}
