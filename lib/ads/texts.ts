// Los textos del anuncio por defecto (docs/spec-anuncios.md §7.3): salen de lo aprobado, sin otra
// llamada a la IA, y todos se pueden editar. El copywriter de anuncios se integra después en el mismo
// campo. Puro.

import { DESCRIPTION_LIMIT, HEADLINE_LIMIT, MAX_HEADLINES, MAX_PRIMARY_TEXTS, PRIMARY_TEXT_LIMIT, type LaunchConfig } from "./schemas";

export interface TextSources {
  /** El gancho recomendado de cada desarrollo aprobado (principal primero). */
  hooks: string[];
  /** La frase de la oferta aprobada en la página («2 por $39.990 · Paga al recibir»). */
  offerLine: string | null;
  /** El nombre corto aprobado («Corrector de postura»). */
  shortName: string | null;
  /** El título del producto (si no hay nombre corto). */
  title: string;
  freeShipping: boolean;
}

const COD = "Paga al recibir";
const clip = (s: string, n: number) => ([...s].length <= n ? s : [...s].slice(0, n - 1).join("").trimEnd() + "…");

export function defaultTexts(s: TextSources): Pick<LaunchConfig, "primary_texts" | "headlines" | "description"> {
  const offer = s.offerLine?.trim() ?? "";
  const close = offer ? (/recibir/i.test(offer) ? offer : `${offer} · ${COD}`) : COD;
  const primary = s.hooks
    .map((h) => h.trim())
    .filter(Boolean)
    .map((h) => clip(`${h}\n\n${close}`, PRIMARY_TEXT_LIMIT));
  const name = (s.shortName?.trim() || s.title.trim()).slice(0, 200);
  const headlines = [clip(name, HEADLINE_LIMIT), ...(offer && [...offer].length <= HEADLINE_LIMIT ? [offer] : [COD])];
  return {
    primary_texts: [...new Set(primary.length ? primary : [close])].slice(0, MAX_PRIMARY_TEXTS),
    headlines: [...new Set(headlines)].slice(0, MAX_HEADLINES),
    description: clip(s.freeShipping ? `Envío gratis · ${COD}` : COD, DESCRIPTION_LIMIT),
  };
}
