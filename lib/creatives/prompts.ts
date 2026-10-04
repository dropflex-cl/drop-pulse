// Prompts de los anuncios estáticos (agentes-creativos/generador-estaticos.md, etapa Creativos,
// docs/spec-creativos.md) en dos pasos (docs/spec-prompts-simples.md §7): los CONCEPTOS (paso
// creative_concepts, effort high: por ángulo, la idea, la familia, el titular y los textos horneados) y
// la DIRECCIÓN DE ARTE (paso creative_art, effort low, con la foto: paleta, tipografía, layout, escena,
// unidades, partes del kit y la ubicación de cada texto). La pieza sale TERMINADA del render
// (Higgsfield o Gemini): el prompt final lo arma lib/creatives/render.ts. También el chat de WhatsApp y
// el QA de cada pieza. Puro. Regla de caché: los system dependen solo del mercado.

import { angleLine, buyerLine, buyerVoice, productFacts, proofLine, reviewQuotes } from "@/lib/ai/context";
import { marketBlock } from "@/lib/ai/prompts";
import type { CustomerAvatar, PackLabel, ProductBrief } from "@/lib/ai/schemas";
import type { AngleForPrompt } from "@/lib/angles/approved";
import { hooksForPrompt } from "@/lib/hooks/select";
import type { Preset } from "@/lib/integrations/higgsfield/client";
import type { Market } from "@/lib/market";
import type { PricingPlan } from "@/lib/pricing/plan";
import { pricingBlock } from "@/lib/pricing/prompt";
import { conceptsPerAngle, CONCEPTS_PER_RUN, FAMILIES, FAMILY_DEFS, HEADLINE_MAX_WORDS, PROOF_GROUP, ROLE_PROMPT_LIMITS, TEXT_ROLES } from "./catalog";
import { CHAT_MAX_MESSAGES, CHAT_MESSAGE_PROMPT_MAX, CHAT_MIN_MESSAGES, CONTACT_NAME_PROMPT_MAX } from "./chat";
import type { ConceptIdea } from "./schemas";

const list = (items: string[]) => items.map((i) => `- ${i}`);

// ---------------------------------------------------------------- 1. Los conceptos

export function creativesSystem(market: Market): string {
  return [
    "Eres un director creativo de anuncios de imagen para Facebook e Instagram en Latinoamérica, donde se vende con pago contra entrega. Sabes qué detiene el scroll en el feed: una idea que se entiende en un vistazo y pocas palabras.",
    "",
    "- Cada pieza sale de un modelo de imagen en una sola generación, con el producto real y todos los textos dentro: pocos textos y cortos (el modelo escribe mejor 3 que 8, y en el feed nadie lee más).",
    `- Exactamente un headline de 2 a ${HEADLINE_MAX_WORDS} palabras. Roles de texto: ${TEXT_ROLES.join(", ")}. Largos: headline ≤ ${ROLE_PROMPT_LIMITS.headline} caracteres; subheadline y table_row ≤ ${ROLE_PROMPT_LIMITS.subheadline}; los demás, una línea de ≤ ${ROLE_PROMPT_LIMITS.callout}.`,
    `- Formatos (family): ${FAMILIES.map((f) => `${f} (${FAMILY_DEFS[f].name.toLowerCase()})`).join(", ")}. Una comparativa lleva 2 table_header (el producto y la práctica que reemplaza) y 2 a 4 table_row.`,
    "- Los ganchos del ángulo ya detienen el scroll en video: su texto en pantalla es un buen punto de partida para el titular.",
    "",
    "LÍMITES",
    "- Meta no acepta que el anuncio le atribuya a quien mira una condición («¿Tienes infecciones?», «Tu pH»): habla del producto, del grupo en tercera persona o en primera.",
    "- Nada de «cura», «trata», «previene» ni resultados garantizados. Nada inventado: reseñas, estrellas, cifras de clientes, expertos, certificaciones.",
    "- Montos: solo los de PRECIO Y OFERTA. Urgencia, solo con una fecha real. Comparativas contra una práctica o categoría, nunca una marca. Sin personas identificables ni antes/después de un cuerpo.",
    "- El pago contra entrega y el envío gratis no van en el titular: como badge o callout.",
    "",
    marketBlock(market),
    "",
    "Los textos van en el idioma del mercado; name, idea y why, para el comerciante.",
  ].join("\n");
}

export interface CreativesContext {
  brief: ProductBrief;
  avatar: CustomerAvatar;
  pricing: PricingPlan;
  labels?: PackLabel[];
  /** Los ángulos aprobados (2 o 3), uno por conjunto de anuncios. */
  angles: AngleForPrompt[];
}

/** Un gancho como texto, para partir de él: lo que se lee y lo que se dice. */
const hookLine = (h: ReturnType<typeof hooksForPrompt>[number]) => `«${(h as { on_screen?: string }).on_screen ?? h.spoken}» (se dice: «${h.spoken}»)`;

/** Lo fijo de los conceptos: igual en cada intento, va con punto de caché. Sin la ficha ni el cliente ideal en JSON. */
export function creativesContextText(c: CreativesContext): string {
  return [
    productFacts(c.brief),
    proofLine(c.brief),
    "",
    buyerLine(c.avatar),
    "",
    pricingBlock(c.pricing, c.labels),
    "",
    `LOS ÁNGULOS (${c.angles.length}; ${conceptsPerAngle(c.angles.length)} conceptos por ángulo, cada uno en su propio conjunto de anuncios)`,
    ...c.angles.flatMap((a) => {
      const hooks = hooksForPrompt(a.payload).slice(0, 4);
      return [
        angleLine(a.angle),
        ...(a.payload.core_message?.trim() ? [`- Idea central: ${a.payload.core_message.trim()}`] : []),
        ...(hooks.length ? [`- Sus mejores ganchos: ${hooks.map(hookLine).join("; ")}`] : []),
        ...(a.payload.offer_layer?.trim() ? [`- La oferta: ${a.payload.offer_layer.trim()}`] : []),
        "",
      ];
    }),
  ].join("\n");
}

/** La pregunta, y en un reintento lo que estuvo mal (conceptProblemsByConcept). */
export function creativesTail(retry: string[] = []): string {
  return [
    ...(retry.length ? [`Tu respuesta anterior no cumple las reglas: ${retry.join(" ")} Corrige eso y responde de nuevo completa.`, ""] : []),
    `Propón ${CONCEPTS_PER_RUN} anuncios de imagen que vendan, repartidos por igual entre los ángulos y con formatos distintos dentro de cada ángulo: cada uno es 100 % su ángulo.`,
  ].join("\n");
}

/** El mensaje entero en un solo texto (scripts y tests); la app lo manda en dos bloques. */
export function creativesUser(c: CreativesContext, retry: string[] = []): string {
  return `${creativesContextText(c)}\n${creativesTail(retry)}`;
}

/**
 * Corrección de algunos conceptos: vuelven solo los que fallaron, con sus problemas; los que pasaron
 * van como contexto para no repetir titulares ni ideas.
 */
export function creativesFixUser(c: CreativesContext, fix: { previous: ConceptIdea[]; problems: string[]; kept: ConceptIdea[] }): string {
  return [
    creativesContextText(c),
    "CONCEPTOS YA APROBADOS (quedan igual; no los repitas: ni su titular ni su idea)",
    ...fix.kept.map((k) => `- ángulo ${k.angle} · ${k.family} · «${k.name}» · titular: «${k.texts.find((t) => t.role === "headline")?.text ?? ""}»`),
    "",
    "TU RESPUESTA ANTERIOR (estos conceptos no cumplen las reglas)",
    JSON.stringify(fix.previous),
    "",
    `No cumple las reglas: ${fix.problems.join(" ")}`,
    "",
    `Corrige solo eso y deja igual todo lo demás. Devuelve estos ${fix.previous.length} conceptos, en el mismo orden, con el mismo ángulo y la misma familia.`,
  ].join("\n");
}

// ---------------------------------------------------------------- 2. La dirección de arte

export function artSystem(market: Market): string {
  return [
    "Eres director de arte de anuncios de imagen. Recibes conceptos ya escritos (la idea y los textos exactos) y la foto real del producto, y para cada uno entregas el brief de diagramación que sigue un modelo de imagen. No cambias los textos.",
    "",
    "- El modelo de imagen es obediente: hace lo que se describe y rellena lo que no (un fondo que choca, un adorno al azar, líneas que apuntan a nada). Describe todo.",
    "- El producto sale de la foto y se mantiene idéntico: no le cambies forma, color ni etiqueta. Un accesorio del kit nunca hace de otro objeto. Lo que un texto nombra se ve en la imagen igual.",
    "- art: 2 a 4 colores que armonicen con los del producto (nunca el producto sobre un fondo de su mismo color), una tipografía con carácter y el mood.",
    "- layout: dónde va el producto, cuánto ocupa y qué zonas quedan para el texto. scene: fondo, superficie, props que apoyan la idea y luz; en problema → solución y comparativas, los dos lados con objetos reales de la alternativa.",
    "- texts: una ubicación por texto, en su orden (posición, líneas, peso, color y contenedor). Un callout apunta (points_to) a una parte que SE VE del producto; si no se ve, va sin línea.",
    "- product_units: 1, salvo la oferta de pack (hasta 3). kit_parts: las partes del kit que aparecen, escritas igual.",
    "- Un preset aporta composición y estilo cuando el producto es el protagonista: elige uno del grupo de la familia. Las familias sin preset van con preset_id null.",
    "- look: una frase para el comerciante que le deje imaginar la pieza. scene, layout, art, placement y points_to en inglés.",
    "",
    marketBlock(market),
  ].join("\n");
}

/** Los presets que puede usar, agrupados (sin prueba social si no hay reseñas reales). */
export function presetsBlock(presets: Preset[], hasRealReviews: boolean): string {
  const usable = presets.filter((p) => hasRealReviews || p.group !== PROOF_GROUP);
  // Sin presets (el render es con Gemini): todas las familias van directas, con la escena y el layout.
  if (!usable.length) return "PRESETS: ninguno. Todos los conceptos van con preset_id null; la escena, el layout y el estilo mandan.";
  const groups = [...new Set(usable.map((p) => p.group))];
  return [
    "PRESETS (usa solo estos ids)",
    ...groups.flatMap((g) => [`${g || "Otros"}:`, ...usable.filter((p) => p.group === g).map((p) => `- ${p.id} · ${p.name}${p.ratio ? ` (${p.ratio})` : ""}`)]),
  ].join("\n");
}

export interface ArtContext {
  brief: ProductBrief;
  concepts: ConceptIdea[];
  presets: Preset[];
  /** Sin reseñas reales aprobadas no se ofrecen los presets de prueba social. */
  hasRealReviews: boolean;
  /** El aspecto del producto y su kit, si ya se describieron para esta imagen base. */
  look?: { product_look: string; kit: string[] } | null;
}

/** Lo fijo de la dirección de arte: los conceptos, los presets y, si ya se sabe, cómo se ve el producto. */
export function artContext(c: ArtContext): string {
  return [
    "La primera imagen es la IMAGEN BASE del producto (la referencia del render); las siguientes, si hay, lo complementan.",
    "",
    `PRODUCTO: ${c.brief.product_name}`,
    ...(c.look
      ? [`CÓMO SE VE (ya descrito): ${c.look.product_look}`, `KIT (ya descrito; kit_parts se escribe igual): ${c.look.kit.length ? c.look.kit.join("; ") : "(solo el producto)"}`]
      : ["Describe primero product_look (cómo se ve el producto principal en la IMAGEN BASE) y kit (lo demás que aparece en ella). No inventes lo que no se ve."]),
    "",
    presetsBlock(c.presets, c.hasRealReviews),
    "",
    "LOS CONCEPTOS (en orden)",
    ...c.concepts.flatMap((k, i) => [
      `${i + 1}. ${k.family} (${FAMILY_DEFS[k.family].name}${FAMILY_DEFS[k.family].presetGroups.length ? `; presets del grupo ${FAMILY_DEFS[k.family].presetGroups.join(" o ")}` : "; sin preset"}) · «${k.name}»: ${k.idea}`,
      ...k.texts.map((t) => `   - ${t.role}: «${t.text}»`),
    ]),
    "",
  ].join("\n");
}

export function artTail(retry: string[] = []): string {
  return [
    ...(retry.length ? [`Tu respuesta anterior no cumple las reglas: ${retry.join(" ")} Corrige eso y responde de nuevo completa.`, ""] : []),
    "Entrega la dirección de arte de cada concepto, en el mismo orden.",
  ].join("\n");
}

// ---------------------------------------------------------------- Chat de WhatsApp (lib/creatives/chat.ts)

/** El chat se escribe para un ángulo: la historia del amigo es la de ese ángulo. */
export function chatSystem(market: Market): string {
  return [
    "Eres un copywriter de respuesta directa que escribe anuncios de Facebook e Instagram para una operación de dropshipping con pago contra entrega en Latinoamérica. El formato es «Chat de WhatsApp»: la captura de pantalla de una conversación entre dos amigos. Tiene que leerse como una recomendación privada y espontánea, nunca como texto de marca.",
    "",
    marketBlock(market),
    "",
    "LA HISTORIA (en este orden)",
    "1. GANCHO: el amigo abre entusiasmado con lo que le está pasando con ESTE producto («Amiga, no sabes lo que me pasó con…»). Puede partir de uno de los ganchos del ángulo (el primero es el recomendado), dicho como lo escribiría un amigo: la primera burbuja es lo que detiene el scroll.",
    "2. PRUEBA: manda UNA foto del producto (photo: true) con un pie que cuenta su experiencia concreta y personal con él.",
    "3. RECONOCIMIENTO: el lector («me») dice que lo ha visto en TikTok o Instagram y pregunta si de verdad funciona: es la duda del propio lector.",
    "4. RESPUESTA: el amigo confirma con un detalle específico más y una razón por la que es un sí fácil (lo fácil que es de usar, que pagó al recibirlo, que llegó rápido).",
    "5. PEDIDO: el lector cierra queriéndolo y pide el link. La ÚLTIMA burbuja es SIEMPRE de «me».",
    `De ${CHAT_MIN_MESSAGES} a ${CHAT_MAX_MESSAGES} burbujas. Las horas avanzan de a uno o dos minutos; el reloj de la barra de estado va justo después de la última burbuja.`,
    "",
    "EL ÁNGULO MANDA",
    "- El chat es para UN ángulo de venta: el gancho y la experiencia del amigo cuentan el dolor o deseo, la promesa y el momento de ese ángulo, con las palabras de su cliente. No mezcles otro ángulo.",
    "- contact_gender según quien compra: quien le escribe al lector es alguien como él (amiga o amigo).",
    "",
    "QUÉ PUEDE DECIR EL AMIGO",
    "- Si hay RESEÑAS REALES, su experiencia sale de ahí: elige lo que dijeron compradores reales y dilo con sus palabras. No agregues un resultado, un plazo ni una cifra que ninguna reseña mencione. Nunca copies una reseña entera.",
    "- Sin reseñas, quédate en lo que hace el producto.",
    "- Vale la experiencia subjetiva y sensorial («la siento más suave», «me encanta cómo me queda»). NO valen: promesas de salud, nombrar una condición o enfermedad, resultados garantizados o con plazo («en 3 días»), porcentajes ni antes/después del cuerpo.",
    "- Nunca afirmes una condición del lector («tú que tienes hongos»): el amigo habla de SU experiencia.",
    "- Nunca nombres la tienda, una marca que el producto no trae, ni un precio o descuento: si el amigo habla de precio, dice que le pareció barato o que pagó al recibirlo, sin montos.",
    "",
    "CÓMO ESCRIBEN",
    "- Como dos amigos que se escriben: cálido, casual, burbujas cortas, alguna muletilla natural («jaja», «amiga», «porfa», «demasiado»). Toque ligero: tiene que leerse como un chat real, no como una caricatura.",
    "- Ortografía y tildes impecables. Como mucho un emoji por burbuja, y no en todas.",
    `- Cada burbuja hasta ${CHAT_MESSAGE_PROMPT_MAX} caracteres; el nombre del contacto hasta ${CONTACT_NAME_PROMPT_MAX}. Cuenta los caracteres.`,
    "- name y why, para el comerciante, en su idioma.",
  ].join("\n");
}

export interface ChatContext {
  brief: ProductBrief;
  avatar: CustomerAvatar;
  angle: AngleForPrompt;
  /** Reseñas reales de 4 o 5 estrellas (primero las aprobadas); [] si no hay. */
  reviews: string[];
}

/** Frases del cliente ideal que recibe el chat: el amigo escribe como alguien como él. */
const CHAT_VOICE_LINES = 3;

/** `retry`: lo que estuvo mal en el intento anterior (lib/creatives/schemas.ts › chatProblems). Sin la ficha ni el cliente ideal en JSON. */
export function chatUser(c: ChatContext, retry: string[] = []): string {
  const hooks = hooksForPrompt(c.angle.payload).slice(0, 4);
  return [
    productFacts(c.brief),
    "",
    buyerLine(c.avatar),
    ...list(buyerVoice(c.avatar, CHAT_VOICE_LINES).map((v) => `«${v}»`)),
    "",
    "EL ÁNGULO",
    angleLine(c.angle.angle),
    ...(c.angle.payload.core_message?.trim() ? [`- Idea central: ${c.angle.payload.core_message.trim()}`] : []),
    ...(hooks.length ? [`- Sus mejores ganchos (el primero es el recomendado): ${hooks.map((h) => `«${h.spoken}»`).join("; ")}`] : []),
    "",
    ...(c.reviews.length
      ? ["RESEÑAS REALES (de compradores del mismo producto; la experiencia del amigo sale de aquí, con otras palabras y sin inventar nada más)", ...reviewQuotes(c.reviews, c.reviews.length).map((r, i) => `${i + 1}. ${r}`)]
      : ["RESEÑAS REALES: ninguna importada. La experiencia sale solo de lo que hace el producto."]),
    "",
    ...(retry.length ? [`Tu respuesta anterior no cumple las reglas: ${retry.join(" ")} Corrige eso y responde de nuevo completa.`, ""] : []),
    "Escribe la conversación de WhatsApp.",
  ].join("\n");
}

// ---------------------------------------------------------------- QA (§3.3)

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
