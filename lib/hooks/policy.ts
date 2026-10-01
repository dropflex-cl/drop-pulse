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
