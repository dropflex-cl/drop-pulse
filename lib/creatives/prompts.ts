// Prompts del generador de estáticos (agentes-creativos/generador-estaticos.md) adaptado a la etapa
// Creativos (docs/spec-creativos.md): LATAM con pago contra entrega, y la pieza sale TERMINADA de
// Higgsfield (decisión 3), así que el agente escribe los textos exactos que se hornean y la escena en
// inglés; el prompt final lo arma lib/creatives/render.ts. También el QA de cada pieza. Puro.
// Regla de caché: el system depende solo del mercado; el producto va en el usuario.

import { marketBlock } from "@/lib/ai/prompts";
import type { CustomerAvatar, PackLabel, ProductBrief } from "@/lib/ai/schemas";
import type { AngleBriefPayload } from "@/lib/angles/schemas";
import { angleHeading, angleMessage, type AngleForPrompt } from "@/lib/angles/approved";
import type { Preset } from "@/lib/integrations/higgsfield/client";
import type { Market } from "@/lib/market";
import type { PricingPlan } from "@/lib/pricing/plan";
import { pricingBlock } from "@/lib/pricing/prompt";
import { conceptsPerAngle, CONCEPTS_PER_RUN, FAMILIES, FAMILY_DEFS, HEADLINE_MAX_WORDS, PROOF_GROUP, ROLE_LIMITS, TEXT_ROLES } from "./catalog";
import { CHAT_MAX_MESSAGES, CHAT_MESSAGE_MAX, CHAT_MIN_MESSAGES, CONTACT_NAME_MAX } from "./chat";

const RULES = [
  "REGLAS QUE NO SE NEGOCIAN",
  "- Nada inventado que se presente como real: ni reseñas, ni estrellas, ni cifras de clientes, ni expertos, ni estudios, ni certificaciones. Solo lo que trae la ficha.",
  "- Salud y bienestar: «ayuda a», «apoya», «diseñado para». Nunca «cura», «trata», «previene», «elimina», enfermedades ni resultados garantizados. Las promesas de la descripción del proveedor NO valen: usa lo que dice la etiqueta del producto y la ficha.",
  "- Política de atributos personales de Meta: nunca afirmes una condición del lector en segunda persona («¿Tienes infecciones?», «Tu pH»). Habla del producto, del grupo en tercera persona o en primera persona.",
  "- Montos: solo los de PRECIO Y OFERTA, con el formato de la moneda. Sin precio tachado si PRECIO Y OFERTA no trae uno. Urgencia solo con una fecha real de la ficha.",
  "- Comparativas contra una práctica o categoría («lavados perfumados»), nunca contra una marca.",
  "- Nada de personas identificables, antes/después de un cuerpo ni zooms a la parte del cuerpo con el problema.",
].join("\n");

const ART_DIRECTION = [
  "DIRECCIÓN DE ARTE (lo que separa un anuncio de agencia de uno genérico)",
  "El modelo de imagen es obediente: hace lo que el prompt describe y rellena lo que no (un fondo que choca, un adorno al azar, líneas que apuntan a nada). Escribe cada pieza como un director de arte que entrega un brief de diagramación completo.",
  "- product_look: cómo se ve el producto principal en la IMAGEN BASE («pink electric foot file with a rose-gold ring and a grey roller head»). El render lo nombra para anclarlo a la foto. No inventes lo que no se ve.",
  "- kit: lo demás que aparece en la IMAGEN BASE (caja, repuestos, cables, cepillos). En cada concepto, kit_parts dice cuáles se muestran, escritos igual que en kit; lo que no pongas no aparece. Un accesorio del kit nunca representa otro objeto (el rodillo de repuesto no es una lima manual).",
  "- layout: la composición. Dónde está el producto, cuánto del cuadro ocupa y qué zonas quedan para el texto.",
  "- Cada texto trae placement: posición, cuántas líneas, peso, color y contenedor (pill, tarjeta, sello, nota a mano, celda de tabla).",
  "- Callouts: points_to es una parte que SE VE del producto en ese layout («the grey roller head», «the rose-gold ring»). Si la parte no se ve, ese texto va como badge, sin línea.",
  "- art.palette: 2 a 4 colores que armonicen con los del producto (un producto rosado no va sobre azul frío). art.typography con carácter y coherente con la familia. art.mood en pocas palabras.",
  "- scene cuenta la idea: en problema → solución y comparativas se ven los dos lados con objetos reales de la alternativa (una piedra pómez, una lima metálica, un frasco de crema genérico). Los props solo si apoyan el mensaje: nada decorativo que confunda (copas, unidades de más).",
  "- Lo que un texto nombra se ve en la imagen igual: si dice «parches», la escena muestra parches.",
  "- product_units: 1, salvo la oferta de pack (las unidades del pack recomendado, hasta 3).",
  "- look: una frase para el comerciante que le deje imaginar la pieza antes de pagarla.",
  "",
  "EJEMPLO DEL NIVEL DE DETALLE (otro producto: un frasco de probióticos rosado)",
  "- art: palette «cream background, dark navy text, soft pink accents»; typography «wide-spaced bold capitals for the title, clean sans for callouts»; mood «minimal, clinical, premium».",
  "- layout: «the jar standing in the center, two pink capsules at its base, soft studio shadow; lots of breathing room around it».",
  "- headline «DENTRO DE CADA CÁPSULA», placement «centered at the top, one line, dark navy»; callout «Cepas probióticas», placement «left top, bold, one line», points_to «the jar label».",
  "- comparativa: layout «left half the jar with two capsules; right half a white rounded card with soft shadow holding a two-column table»; table_row placement «row inside the card, green check under the product column, grey cross under the other».",
].join("\n");

export function creativesSystem(market: Market): string {
  return [
    "Eres el director de arte y copywriter de anuncios estáticos de una operación de dropshipping con pago contra entrega en Latinoamérica, para Facebook e Instagram. Conviertes los desarrollos de ángulo aprobados (2 o 3) en conceptos de anuncio de imagen.",
    "",
    marketBlock(market),
    "",
    "CÓMO SE PRODUCE (importante)",
    "- Cada concepto lo renderiza Higgsfield Marketing Studio en UNA sola generación: escena, producto y TODOS los textos quedan horneados en la imagen. No hay capas ni edición posterior.",
    "- El producto sale de la foto real (IMAGEN BASE) y se mantiene idéntico: descríbelo solo en product_look (lo que se ve), nunca le cambies forma, color ni etiqueta.",
    "- Un preset de Marketing Studio aporta la composición, la tipografía y el estilo de su grupo: sirve cuando el producto es el protagonista. Elige el que mejor calce con la familia, el producto y su paleta. Las familias sin preset (abajo) van con preset_id null: ahí la escena y el layout mandan.",
    `- Pocos textos y cortos: el modelo escribe mejor 3 textos que 8, y en el feed nadie lee más. Máximo 5 por concepto (7 en comparativa y oferta). Exactamente un headline de 2 a ${HEADLINE_MAX_WORDS} palabras (≤ ${ROLE_LIMITS.headline} caracteres); subheadline y table_row hasta ${ROLE_LIMITS.subheadline}; los demás, UNA línea de hasta ${ROLE_LIMITS.callout} caracteres. Cuenta los caracteres.`,
    `- Roles de texto: ${TEXT_ROLES.join(", ")}. En una comparativa: 2 table_header (el producto y la práctica que reemplaza) y 2 a 4 table_row.`,
    "- scene, layout, art, placement y points_to van en inglés; los textos, name, why y look, en el idioma del mercado.",
    "",
    ART_DIRECTION,
    "",
    "LAS 8 FAMILIAS",
    ...FAMILIES.map((f) => `- ${f} (${FAMILY_DEFS[f].name}): ${FAMILY_DEFS[f].gist}${FAMILY_DEFS[f].presetGroups.length ? ` Presets del grupo ${FAMILY_DEFS[f].presetGroups.join(" o ")}.` : " Sin preset."}`),
    "",
    "QUÉ ENTREGAS",
    `- ${CONCEPTS_PER_RUN} conceptos repartidos por igual entre los ÁNGULOS DE VENTA (angle = el número del ángulo): cada ángulo va en su propio conjunto de anuncios, así que cada concepto es 100 % su ángulo, sin mezclarlo con otro.`,
    "- Los conceptos de un mismo ángulo van en familias (formatos) distintas: Meta premia la variación y el mercado decide cuál funciona.",
    "- La oferta (el pack recomendado de PRECIO Y OFERTA) va como capa dentro de un concepto, no como concepto de retargeting.",
    "- Parte de los ganchos, el mensaje central y los static_ad_concepts de cada desarrollo, pero reescríbelos para que funcionen como texto de imagen.",
    "- El headline del concepto no repite el de otro concepto.",
    "- why: para el comerciante, qué palanca usa y por qué detiene el scroll.",
    "",
    RULES,
  ].join("\n");
}

function json(v: unknown) {
  return JSON.stringify(v, null, 2);
}

/** Lo del desarrollo que sirve para un estático. */
function briefForStatics(b: AngleBriefPayload) {
  return {
    core_message: b.core_message,
    psychological_lever: b.psychological_lever,
    hooks: b.hooks.map((h) => h.text),
    recommended_hook: b.hooks[b.recommended_hook]?.text,
    static_ad_concepts: b.static_ad_concepts,
    visual_concepts: b.visual_concepts,
    offer_layer: b.offer_layer,
    proof_to_show: b.proof_to_show,
    compliance_flags: b.compliance_flags,
    details: b.details,
  };
}

export interface CreativesContext {
  brief: ProductBrief;
  avatar: CustomerAvatar;
  pricing: PricingPlan;
  labels?: PackLabel[];
  /** Los ángulos aprobados (2 o 3), uno por conjunto de anuncios. */
  angles: AngleForPrompt[];
  presets: Preset[];
  /** Sin reseñas reales aprobadas no se ofrecen los presets de prueba social. */
  hasRealReviews: boolean;
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

/** `retry`: lo que estuvo mal en el intento anterior (lib/creatives/schemas.ts › conceptProblems). */
export function creativesUser(c: CreativesContext, retry: string[] = []): string {
  return [
    "La primera imagen es la IMAGEN BASE del producto (la foto que Higgsfield usa como referencia); las siguientes, si hay, lo complementan.",
    "",
    "FICHA DE PRODUCTO",
    json(c.brief),
    "",
    "CLIENTE IDEAL (aprobado por el comerciante)",
    json(c.avatar),
    "",
    pricingBlock(c.pricing, c.labels),
    "",
    `ÁNGULOS DE VENTA (${c.angles.length}, aprobados; ${conceptsPerAngle(c.angles.length)} conceptos por ángulo)`,
    ...c.angles.flatMap((a) => [angleHeading(a), json({ ...angleMessage(a.angle), ...briefForStatics(a.payload) }), ""]),
    presetsBlock(c.presets, c.hasRealReviews),
    "",
    ...(retry.length ? [`Tu respuesta anterior no cumple las reglas: ${retry.join(" ")} Corrige eso y responde de nuevo completa.`, ""] : []),
    "Propón los conceptos de anuncio de imagen.",
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
    "1. GANCHO: el amigo abre entusiasmado con lo que le está pasando con ESTE producto («Amiga, no sabes lo que me pasó con…»).",
    "2. PRUEBA: manda UNA foto del producto (photo: true) con un pie que cuenta su experiencia concreta y personal con él.",
    "3. RECONOCIMIENTO: el lector («me») dice que lo ha visto en TikTok o Instagram y pregunta si de verdad funciona: es la duda del propio lector.",
    "4. RESPUESTA: el amigo confirma con un detalle específico más y una razón por la que es un sí fácil (lo fácil que es de usar, que pagó al recibirlo, que llegó rápido).",
    "5. PEDIDO: el lector cierra queriéndolo y pide el link. La ÚLTIMA burbuja es SIEMPRE de «me».",
    `De ${CHAT_MIN_MESSAGES} a ${CHAT_MAX_MESSAGES} burbujas. Las horas avanzan de a uno o dos minutos; el reloj de la barra de estado va justo después de la última burbuja.`,
    "",
    "EL ÁNGULO MANDA",
    "- El chat es para UN ángulo de venta: el gancho y la experiencia del amigo cuentan el dolor o deseo, la promesa y el momento de ese ángulo, con las palabras de su cliente. No mezcles otro ángulo.",
    "- contact_gender según el cliente ideal: quien le escribe al lector es alguien como él (amiga o amigo).",
    "",
    "QUÉ PUEDE DECIR EL AMIGO",
    "- Si hay RESEÑAS REALES, su experiencia sale de ahí: elige lo que dijeron compradores reales y dilo con sus palabras. No agregues un resultado, un plazo ni una cifra que ninguna reseña mencione. Nunca copies una reseña entera.",
    "- Sin reseñas, quédate en lo que la ficha dice que hace el producto.",
    "- Vale la experiencia subjetiva y sensorial («la siento más suave», «me encanta cómo me queda»). NO valen: promesas de salud, nombrar una condición o enfermedad, resultados garantizados o con plazo («en 3 días»), porcentajes ni antes/después del cuerpo.",
    "- Nunca afirmes una condición del lector («tú que tienes hongos»): el amigo habla de SU experiencia.",
    "- Nunca nombres la tienda, una marca que el producto no trae, ni un precio o descuento: si el amigo habla de precio, dice que le pareció barato o que pagó al recibirlo, sin montos.",
    "",
    "CÓMO ESCRIBEN",
    "- Como dos amigos que se escriben: cálido, casual, burbujas cortas, alguna muletilla natural («jaja», «amiga», «porfa», «demasiado»). Toque ligero: tiene que leerse como un chat real, no como una caricatura.",
    "- Ortografía y tildes impecables. Como mucho un emoji por burbuja, y no en todas.",
    `- Cada burbuja hasta ${CHAT_MESSAGE_MAX} caracteres; el nombre del contacto hasta ${CONTACT_NAME_MAX}. Cuenta los caracteres.`,
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

/** `retry`: lo que estuvo mal en el intento anterior (lib/creatives/schemas.ts › chatProblems). */
export function chatUser(c: ChatContext, retry: string[] = []): string {
  return [
    "FICHA DE PRODUCTO",
    json(c.brief),
    "",
    "CLIENTE IDEAL (aprobado por el comerciante)",
    json(c.avatar),
    "",
    "ÁNGULO DE VENTA",
    angleHeading(c.angle),
    json({ ...angleMessage(c.angle.angle), core_message: c.angle.payload.core_message, hooks: c.angle.payload.hooks.map((h) => h.text), details: c.angle.payload.details }),
    "",
    ...(c.reviews.length
      ? ["RESEÑAS REALES (de compradores del mismo producto; la experiencia del amigo sale de aquí, con otras palabras y sin inventar nada más)", ...c.reviews.map((r, i) => `${i + 1}. ${r}`)]
      : ["RESEÑAS REALES: ninguna importada. La experiencia sale solo de la ficha."]),
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
