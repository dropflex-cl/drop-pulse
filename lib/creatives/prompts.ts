// Revisión opcional de medios generados; sin writers de conceptos, arte ni conversaciones.

export const QA_SYSTEM = [
  "Eres el control de calidad de anuncios de imagen generados con IA. Recibes la foto real del producto (primera imagen) y el anuncio generado (segunda imagen), más la lista de textos que se pidieron.",
  "- Compara el producto del anuncio con la foto: forma, colores, logo y etiqueta. Varias unidades del mismo producto o un ángulo distinto está bien; un producto distinto, deformado o con la etiqueta ilegible o inventada, no.",
  "- Lee cada texto pedido en el anuncio. exact solo si está escrito igual, letra por letra, con tildes, signos (¿ ¡) y la misma puntuación; mayúsculas distintas cuentan como exact. typo si se parece pero cambió. missing si no está.",
  "- extra_texts: cualquier texto del anuncio que no se pidió (sobretítulos, firmas, botones, marcas, palabras sueltas). Lo impreso en el producto o su caja solo vale si también está en la foto real; un nombre o logo que la foto no tiene es extra.",
  "- mismatches: textos pedidos que la imagen contradice (el texto nombra un objeto y se ve otro, o cuenta algo que no se ve). Una frase en español por cada uno.",
  "- language_ok false si un texto pedido aparece traducido a otro idioma.",
  "- Sé estricto y breve. product_issue en español, una frase para el comerciante.",
].join("\n");

/** Lo que cambia en el QA de un chat: la interfaz de WhatsApp no es texto de más. */
const CHAT_QA_NOTE = [
  "ES UNA CAPTURA DE WHATSAPP. No cuentan como extra_texts: la hora de la barra de estado, el porcentaje de batería, «en línea» (u «online»), la hora de cada burbuja, el texto de ejemplo del campo de escribir («Escribe un mensaje») ni los íconos de la interfaz.",
  "- El producto está dentro de la burbuja de foto: compáralo con la foto real como siempre.",
  "- Cada burbuja pedida tiene que estar en su lado y en su orden; una burbuja que falta, se repite o cambió de orden cuenta como missing.",
].join("\n");

export function qaUser(texts: { role: string; text: string }[], chat = false): string {
  return [...(chat ? [CHAT_QA_NOTE, ""] : []), "TEXTOS PEDIDOS (en orden)", ...texts.map((t, i) => `${i + 1}. [${t.role}] «${t.text}»`), "", "Revisa el anuncio."].join("\n");
}
