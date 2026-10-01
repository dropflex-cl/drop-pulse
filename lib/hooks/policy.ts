// Reglas de política que se revisan en código en todo texto de anuncio que se dice o se lee: los
// ganchos (lib/hooks/schemas.ts) y el guion de video (lib/video/schemas.ts). Puro.

/** Condición del lector en segunda persona (política de atributos personales de Meta). */
export const SECOND_PERSON_BODY =
  /\b(tu|tus) (piel|cara|rostro|edad|cuerpo|arrugas|manchas|l[ií]neas|cuello|papada|acn[eé]|flacidez|u[ñn]as?|pies?|dedos?|dientes?|enc[ií]as|rodillas?|articulaciones|espalda|pelo|cabello|calvicie|barriga|panza|grasa|hongos?|peso|pr[oó]stata|zona [ií]ntima)\b|\ba tu edad\b|\btienes (arrugas|manchas|acn[eé]|hongos?|dolor|sobrepeso|calvicie)|\bte (est[aá]s )?(quedando calv|engordando|doliendo)/i;

/** Un plazo de resultado («al día tres», «en dos semanas»): promesa de salud que Meta rechaza. */
export const RESULT_TIMELINE =
  /\b(al|en|a los|en solo)\s+(\d+|un|una|dos|tres|cuatro|cinco|siete|diez|catorce|quince|treinta)\s+(d[ií]as?|semanas?|mes(es)?)\b|\bal d[ií]a\s+(\d+|uno|dos|tres|cuatro|cinco|siete)\b|\ben la semana\s+(\d+|uno|dos|tres)\b/i;

/**
 * El pago contra entrega y el envío gratis van en el título y el texto del anuncio (y en una franja
 * fija), no en los primeros 3 s: en el corpus, solo 5 de 85 ganadores lo decían ahí.
 */
export const COD_IN_HOOK = /\b(pago|pagas?|paga) (contra ?entrega|al recibir)\b|\bcontraentrega\b|\b(env[ií]o|despacho)s? gratis\b/i;

/** Rasgos del personaje de mascota que dan siluetas fálicas (en inglés en el guion, en español en el gancho). */
const RISKY_SHAPE =
  /\b(neck|stalk|shaft|tube|cylind\w*|elongated|finger|toe|bottom edge|patch of (?:facial )?skin|skin patch|blob of (?:\w+ )*skin|cuello|tallo|tubo|cil[ií]ndric\w*|alargad\w*|dedo|borde de abajo|(?:mancha|parche) de piel)\b/i;
/**
 * Lo que el personaje NO es no cuenta: el modelo repite las prohibiciones («no neck», «never rising from
 * the bottom edge») y la primera versión de la regla rechazó así todos los intentos en producción. Se
 * quita cada tramo negado hasta la siguiente coma o punto.
 */
export const NEGATED = /\b(?:no|not|never|without|nor|instead of|rather than|free of|avoid\w*|nunca|sin|ni)\b[^.,;:()]*/gi;

export function riskyShape(text: string): string | null {
  return text.replace(NEGATED, " ").match(RISKY_SHAPE)?.[0] ?? null;
}

/**
 * Lenguaje de foto de estudio o de campaña (docs/spec-video-detener-scroll.md §4.3): delata a la IA en
 * un video que tiene que parecer grabado con un teléfono. Se revisa en lo que escribe el modelo (las
 * escenas del guion y la primera toma del gancho), ignorando lo negado.
 */
const STUDIO =
  /\b(studio|softbox|soft (?:morning |window )?light|golden hour|cinematic|bokeh|shallow depth of field|macro|slow[- ]motion|color[- ]grad\w*|professional photo\w*|commercial (?:shot|photo\w*|look)|editorial|beauty shot|flawless|perfect skin|estudio|luz dorada|hora dorada|cinematogr[aá]fic\w*|desenfoque de fondo|c[aá]mara lenta|plano de comercial|piel perfecta)\b/i;

export function studioWord(text: string): string | null {
  return text.replace(NEGATED, " ").match(STUDIO)?.[0] ?? null;
}
