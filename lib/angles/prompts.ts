// Prompts de la etapa Ángulos: el orquestador (docs/spec-angulos-testeo.md §4.2) y los 6 agentes de ángulo.
// Los agentes de ángulo están adaptados de agentes-creativos/*.md (escritos para EE. UU.) a LATAM con
// pago contra entrega:
// - el copy va en el idioma del mercado con tuteo (marketBlock), no en inglés;
// - el riesgo lo elimina el pago contra entrega, no una garantía (solo si la ficha la trae);
// - los umbrales en USD (CPM, ticket < 40 USD) se reemplazan por PRECIO Y OFERTA (lib/pricing/prompt.ts);
// - la ley es la del país (consumerAuthority), además de las políticas de Meta.
// Puro. Regla de caché: el system depende solo del ángulo y del mercado; el producto va en el usuario.

import { buyerLine, buyerReasons, marketAnchorLine, productFactLines, productFacts, proofLine, reviewQuotes, supplierText } from "@/lib/ai/context";
import { promptLimit } from "@/lib/ai/limits";
import { marketBlock } from "@/lib/ai/prompts";
import type { CustomerAvatar, Differentiator, PackLabel, ProductBrief } from "@/lib/ai/schemas";
import type { CompetitorAnalysis } from "@/lib/competitors/schemas";
import type { Market } from "@/lib/market";
import type { PricingPlan } from "@/lib/pricing/plan";
import { pricingBlock } from "@/lib/pricing/prompt";
import { ANGLE_CANDIDATES, ANGLE_HOOK_MAX_WORDS, ANGLES, slotLabel, testAngleName, type SalesAngle, type TestAngle } from "./catalog";
import type { AngleIdea } from "./schemas";

/** Reglas comunes a todos (README de los agentes, versión LATAM). */
const COMMON_RULES = [
  "REGLAS QUE NO SE NEGOCIAN",
  "- Nada inventado que se presente como real: ni expertos, ni reseñas, ni historias, ni cifras, ni estudios, ni plazos. Si falta la prueba, dilo y propón cómo conseguirla o usa otro camino.",
  "- Los avatares de IA no se presentan como clientes ni como expertos: pueden demostrar, explicar o actuar una dramatización (sin rótulo: el video no lo lleva).",
  "- Política de atributos personales de Meta: no afirmes ni insinúes en segunda persona la edad, salud, peso o situación del espectador. ✗ «¿Tienes más de 40 y te duele la espalda?» ✓ «Tengo 47 y mi espalda…» / «Quienes pasan 8 horas sentados…».",
  "- Salud: «ayuda a», «diseñado para», «alivia la sensación de». Nunca «cura», «trata», «elimina» ni plazos médicos.",
  "- Urgencia solo con la FECHA REAL de abajo. Precio «antes» solo si es el tachado de PRECIO Y OFERTA.",
  "- Precios y packs: exactamente los de PRECIO Y OFERTA. No calcules otros ni inventes descuentos, envío gratis o garantías que el producto no traiga.",
  "- El cierre de confianza es el pago contra entrega («Paga al recibir»). Una garantía de devolución solo si GARANTÍA trae una.",
].join("\n");

// ---------------------------------------------------------------- Orquestador (v9)
// La pregunta que el comerciante le haría a un experto en un chat, con poco contexto. Un chat con
// cinco viñetas del proveedor propuso mejores ángulos que la v8 con la ficha y el cliente ideal
// completos (2026-10-03, el audífono): con más material, el modelo copiaba los momentos y las frases
// del cliente ideal, narraba en vez de interpelar y llenaba una forma por ángulo. Opus sabe qué vende
// en cada categoría: se le dan los hechos y se lo deja pensar. Lo comprobable lo revisa el código
// después (strategyProblems) y la forma la pone otra llamada (angleFramesUser).

export function angleIdeasSystem(market: Market): string {
  return [
    "Eres un experto en ventas en formato AIDA: escribes anuncios para Facebook, Instagram y TikTok en Latinoamérica, donde se vende con pago contra entrega, y sabes qué ángulos venden en cada categoría.",
    "",
    `- Cada ángulo es un motivo distinto para comprar, con su gancho: la primera frase del anuncio, la que detiene el scroll (máximo ${promptLimit(ANGLE_HOOK_MAX_WORDS)} palabras).`,
    "- Piensa en quién compra y quién usa: a veces no son la misma persona.",
    "- Los datos del proveedor suelen exagerar o equivocarse. No uses lo que no sea creíble y dilo en doubts.",
    "- Si usas lo que cuesta la alternativa como ancla de precio, que sea una cifra que conoces bien del mercado: el comerciante la verifica antes de lanzar.",
    "",
    "LÍMITES",
    "- Meta no acepta que el anuncio le atribuya a quien mira su edad, su salud o su cuerpo («¿Tienes manchas en la cara?»). Hablarle de un ser querido o hablar en tercera persona sí se puede.",
    "- Nada de «cura» o «trata», ni reseñas, expertos o cifras de ventas inventadas.",
    "- Los precios y packs de la tienda son los de PRECIO Y OFERTA. La urgencia, solo con una fecha de FECHAS.",
    "",
    marketBlock(market),
  ].join("\n");
}

/** Una fecha comercial del calendario de eventos del mercado (tabla `events`). */
export interface UpcomingEvent {
  name: string;
  /** AAAA-MM-DD. */
  starts_on: string;
}

/** Un ángulo de una evaluación anterior: volver a evaluar propone otros. */
export interface PreviousAngle {
  title: string;
  hook: string;
}

function eventLine(e: UpcomingEvent, today: string): string {
  const date = new Date(`${e.starts_on}T12:00:00Z`);
  const weeks = Math.round((date.getTime() - Date.parse(`${today}T12:00:00Z`)) / (7 * 86_400_000));
  const when = date.toLocaleDateString("es-CL", { day: "numeric", month: "long", timeZone: "UTC" });
  return `- ${e.name}: ${when} (${weeks <= 1 ? "esta semana o la próxima" : `en ${weeks} semanas`})`;
}

/**
 * El contexto del experto: lo que dice el proveedor tal cual (para que lo critique), lo comprobado, una
 * línea de quién compra, el precio, las fechas y lo que ya propuso. Sin el porqué ni las dudas de quien
 * compra: los usan después los agentes de cada ángulo. Lo fijo: va con punto de caché.
 */
export function angleIdeasContext(c: AngleContext): string {
  const today = c.today ?? new Date().toISOString().slice(0, 10);
  return [
    `HOY: ${today}`,
    "",
    `PRODUCTO: ${c.brief.product_name}`,
    "Lo que dice el proveedor, tal cual:",
    supplierText(c.baseInfo),
    "",
    "Lo comprobado en la foto y la ficha:",
    ...productFactLines(c.brief),
    "",
    buyerLine(c.avatar),
    ...(c.differentiator ? [`EN QUÉ SE DIFERENCIA, SEGÚN EL COMERCIANTE: frente a ${c.differentiator.versus}, ${c.differentiator.claim}`] : []),
    proofLine(c.brief, c.reviews),
    "",
    pricingBlock(c.pricing, c.labels),
    "",
    "FECHAS COMERCIALES PRÓXIMAS",
    ...(c.events?.length ? c.events.map((e) => eventLine(e, today)) : ["(ninguna en los próximos meses)"]),
    ...(c.competitors?.length ? ["", "LA COMPETENCIA (para no copiar sus anuncios)", ...c.competitors.map(competitorLine)] : []),
    ...(c.previous?.length
      ? ["", "YA LE PROPUSISTE AL COMERCIANTE (propón otros; repite como máximo 2 si de verdad siguen entre los mejores)", ...c.previous.map((p) => `- ${p.title}: «${p.hook}»`)]
      : []),
  ].join("\n");
}

/** La pregunta, y en un reintento lo que estuvo mal (strategyProblems). */
export function angleIdeasTail(retry: string[] = []): string {
  return [
    ...(retry.length ? [`Tu respuesta anterior tenía estos problemas: ${retry.join(" ")} Corrígelos.`, ""] : []),
    `Dime los ${ANGLE_CANDIDATES} ángulos de venta más efectivos para este producto.`,
  ].join("\n");
}

/** El mensaje entero en un solo texto (tests); la app lo manda en dos bloques. */
export function angleIdeasUser(c: AngleContext, retry: string[] = []): string {
  return `${angleIdeasContext(c)}\n\n${angleIdeasTail(retry)}`;
}

/** La segunda llamada: clasifica cada ángulo (no lo cambia). */
export const ANGLE_FRAMES_SYSTEM = [
  "Clasificas ángulos de venta ya escritos por un experto, sin cambiarlos. Para cada uno, en el mismo orden:",
  "- frame: la forma que más se le parece, de la lista. Elige qué especialista lo va a desarrollar.",
  "- pain_or_desire: el dolor o deseo que mueve, con las palabras de la gente.",
  "- segment: para quién, en una línea.",
  "- promise: lo que promete, sin salud ni resultados garantizados.",
  "- trigger_moment: la escena concreta que abre el anuncio.",
  "Escribe en el idioma de los ángulos, con tuteo.",
].join("\n");

export function angleFramesUser(ideas: AngleIdea[], frames: readonly SalesAngle[], c: Pick<AngleContext, "brief" | "avatar">): string {
  return [
    "FORMAS",
    ...frames.map((f) => `- ${f}: ${ANGLES[f].gist}`),
    "",
    `PRODUCTO: ${c.brief.product_name}. ${c.brief.what_it_does}`,
    `QUIÉN COMPRA: ${c.avatar.summary}`,
    "",
    "ÁNGULOS",
    json(ideas.map((a) => ({ title: a.title, hook: a.hook, speaks_to: a.speaks_to, aida: a.aida }))),
  ].join("\n");
}

function json(v: unknown) {
  return JSON.stringify(v, null, 2);
}

export interface AngleContext {
  brief: ProductBrief;
  avatar: CustomerAvatar;
  pricing: PricingPlan;
  /** Etiquetas de los packs APROBADAS (sin aprobar no se pasan). */
  labels?: PackLabel[];
  baseInfo: string;
  /** El diferenciador confirmado (o el que propuso la ficha). */
  differentiator?: Differentiator | null;
  /** Lo que hace la competencia (tiendas analizadas). Vacío = sin datos. */
  competitors?: (CompetitorAnalysis & { url: string })[];
  /** Textos de las reseñas aprobadas hoy (la ficha puede ser de antes de importarlas). */
  reviews?: string[];
  /** Fechas comerciales próximas del mercado. */
  events?: UpcomingEvent[];
  /** AAAA-MM-DD, el día de la evaluación. */
  today?: string;
  /** Lo que propuso la evaluación anterior (para no repetirlo). */
  previous?: PreviousAngle[];
}

function competitorLine(c: CompetitorAnalysis & { url: string }, i: number): string {
  const host = (() => {
    try {
      return new URL(c.url).host;
    } catch {
      return c.url;
    }
  })();
  const price = c.price != null ? ` · ${c.price}` : "";
  return `${i + 1}. ${c.store_name || host}${price} · ángulo: ${c.main_angle.pain_or_desire} → ${c.main_angle.promise} (para ${c.main_angle.segment}) · forma: ${ANGLES[c.frame]?.name ?? c.frame}${c.offer ? ` · oferta: ${c.offer}` : ""}`;
}

/** Reseñas que recibe el agente de ángulo para citar (lib/ai/context.ts). */
const BRIEF_REVIEWS = 3;

/**
 * El contexto del agente de ángulo, en texto corto (docs/spec-prompts-simples.md §8): los hechos, lo que
 * el comprador usa hoy, las pruebas (con 3 reseñas para citar), quién compra con su porqué y sus dudas,
 * el precio, el diferenciador y la competencia. Sin la ficha ni el cliente ideal en JSON, y sin escenas
 * ni frases del comprador (spec-prompts-simples §14): las escribe el agente para su ángulo.
 */
export function briefContext(c: AngleContext): string[] {
  const b = c.brief;
  const reviews = reviewQuotes(c.reviews ?? b.proof?.real_reviews ?? [], BRIEF_REVIEWS);
  return [
    productFacts(b),
    ...(b.alternatives_already_tried?.length ? [`Lo que el comprador usa hoy y le falla: ${b.alternatives_already_tried.join("; ")}`] : []),
    ...(b.forbidden_claims?.length ? [`Promesas que no se pueden hacer: ${b.forbidden_claims.join("; ")}`] : []),
    "",
    proofLine(b, c.reviews),
    ...(reviews.length ? ["Reseñas reales que se pueden citar:", ...reviews.map((r) => `- «${r}»`)] : []),
    `GARANTÍA: ${b.proof?.guarantee_days ? `${b.proof.guarantee_days} días` : "ninguna (el cierre es el pago contra entrega)"}`,
    `FECHA REAL: ${b.real_deadline_or_event?.trim() || "ninguna (sin urgencia)"}`,
    "",
    buyerLine(c.avatar),
    ...buyerReasons(c.avatar),
    "",
    pricingBlock(c.pricing, c.labels),
    "",
    "DIFERENCIADOR (en qué se diferencia de lo que el cliente ya usa)",
    c.differentiator ? `Frente a ${c.differentiator.versus}: ${c.differentiator.claim}` : "(sin diferenciador confirmado)",
    "",
    `COMPETENCIA (${c.competitors?.length ?? 0} tiendas analizadas)`,
    ...(c.competitors?.length ? c.competitors.map(competitorLine) : ["(sin datos de competencia)"]),
  ];
}

// ---------------------------------------------------------------- Agentes de ángulo

interface AngleGuide {
  role: string;
  psychology: string[];
  when: string[];
  whenNot: string[];
  structure: string[];
  aida: string[];
  visuals: string[];
  guardrails: string[];
}

const GUIDES: Record<SalesAngle, AngleGuide> = {
  authority: {
    role: "Eres especialista en creativos de autoridad: un profesional creíble (kinesiólogo, dentista, dermatólogo, veterinario) explica el problema y usa el producto él mismo.",
    psychology: [
      "Heurística de autoridad: ante un problema que no sabemos evaluar, delegamos el juicio en alguien con credencial. La bata o la consulta funcionan antes de la primera palabra.",
      "«Lo uso yo mismo»: usarlo en carne propia convierte una recomendación, que podría ser pagada, en una elección personal.",
      "Transferencia de confianza: la confianza en la profesión pasa al producto.",
      "Revelación de insider: el experto comparte lo que su gremio no dice en voz alta.",
      "Menos riesgo percibido: un experto calma el «¿y si no me sirve?» más que un descuento.",
    ],
    when: ["El problema es terreno de un oficio reconocible: postura, espalda, pies, dientes, piel, sueño, mascotas.", "El producto parece algo que el profesional tendría en su consulta o su casa.", "Hay un experto REAL con credencial verificable, o se puede contratar uno."],
    whenNot: ["No hay experto real ni forma de conseguirlo: no se inventan médicos ni credenciales.", "Moda, estatus o impulso: la autoridad se siente forzada.", "La promesa supera lo que un profesional diría en voz alta."],
    structure: ["Credencial en 2 segundos: escena y rol.", "Observación del oficio: «Veo esto todos los días…».", "El error común que comete la mayoría.", "«Por eso uso / recomiendo…»: el producto como su elección.", "Demostración profesional: cómo lo usa o lo ajusta.", "Cierre suave: el experto no grita ofertas; la oferta va en el texto o en la página."],
    aida: ["Atención: credencial en 2 segundos.", "Interés: observación del oficio y error común.", "Deseo: «lo uso yo mismo» y la demostración.", "Acción: cierre suave con el pago contra entrega."],
    visuals: ["Experto en su consulta (9:16), luz natural, el producto sobre la camilla o el modelo anatómico.", "Reacción del experto a un video del problema.", "Estático de estilo de vida con el copy del experto."],
    guardrails: ["Experto real, con credencial verificable y consentimiento; si cobra, se declara.", "Si no hay experto real en PRUEBAS REALES: expert_is_real = false y en expert el perfil a contratar, nunca una identidad ficticia.", "Habla de pacientes o en primera persona, nunca «tu ciática»."],
  },
  common_enemy: {
    role: "Eres especialista en creativos de enemigo común: «lo que la industria no te dice». El cliente no fracasó: le vendieron lo incorrecto.",
    psychology: [
      "Atribución externa: quitarle la culpa («no es tu culpa») lo vuelve receptivo.",
      "Nosotros contra ellos: un enemigo compartido une al emisor con el espectador; el producto pasa a ser un bando.",
      "Reactancia: denunciar una manipulación canaliza la molestia hacia el enemigo.",
      "Disonancia: chocar con una creencia obliga a seguir mirando.",
      "Contraste: frente a una alternativa cara, riesgosa o inútil, el producto se ve mejor.",
    ],
    when: ["Lo que el comprador usa hoy le falla: una solución masiva que falla o tiene costo oculto.", "Sofisticación ≥ 3.", "El enemigo es una práctica, categoría o creencia, no una marca."],
    whenNot: ["Es la primera solución de su tipo y no hay a quién oponerse.", "Habría que difamar a una marca concreta.", "La audiencia está conforme con lo que usa."],
    structure: ["Gancho de choque: nombra al enemigo y lo contradice.", "Validación: «Si probaste [alternativa] y no funcionó, no eres tú».", "La revelación: por qué falla (dato, lógica o experiencia).", "El costo de seguir igual.", "La alternativa: el producto como salida.", "Prueba real de quienes dejaron al enemigo.", "Cierre sin riesgo: paga al recibir."],
    aida: ["Atención: choque contra una creencia.", "Interés: «no es tu culpa» y la revelación.", "Deseo: costo de seguir igual, la alternativa y la prueba.", "Acción: probar es más seguro que seguir igual."],
    visuals: ["UGC a cámara con el texto polémico arriba (9:16).", "Pantalla dividida: el enemigo a la izquierda, el producto a la derecha.", "«Cosas que dejé de comprar»: una lista tachando alternativas."],
    guardrails: ["Ataca prácticas, categorías o creencias, nunca marcas con nombre.", "Cada crítica necesita una base verificable; «estudios muestran» exige el estudio real.", "Sin segunda persona sobre condiciones («tu acné»)."],
  },
  unique_mechanism: {
    role: "Eres especialista en creativos de mecanismo único (Schwartz, Todd Brown): reencuadras la causa del problema para que el producto sea la pieza que faltaba.",
    psychology: [
      "Una nueva causa explica los fracasos pasados: «atacabas la causa equivocada» devuelve la esperanza sin hacerlo sentir tonto.",
      "Novedad frente a la saturación: con sofisticación 3–5 las promesas ya no se creen; una explicación nueva del «cómo» sí.",
      "Fluidez causal: un mecanismo simple con una metáfora se siente verdadero.",
      "Unificación de síntomas: una causa con una solución es más creíble que cinco problemas.",
      "Prueba visual de lo invisible: el alivio no se ve, el mecanismo se puede dibujar.",
    ],
    when: ["Cómo funciona el producto es un principio concreto: presión, geometría, compresión, drenaje, filtración.", "Las alternativas fallan por atacar otra causa o por diseño.", "El resultado es invisible pero el mecanismo se puede visualizar."],
    whenNot: ["El producto es genérico, sin diferencia técnica real: inventar un mecanismo es engañoso.", "El mecanismo exige promesas médicas que no se pueden sustentar.", "Producto de impulso barato donde nadie quiere una explicación."],
    structure: ["Gancho de reencuadre: «No es X. Es Y.»", "Síntoma reconocible en primera o tercera persona.", "La causa real con un visual.", "Por qué fallan las alternativas: atacan X, no Y.", "Cómo el producto ataca Y: una frase y una metáfora.", "Prueba: demo o comparación.", "Cierre: paga al recibir, con la oferta como capa."],
    aida: ["Atención: «No es X, es Y».", "Interés: síntoma y causa real visualizada.", "Deseo: por qué fallan los demás, cómo lo resuelve el producto y la prueba.", "Acción: probarlo sin riesgo."],
    visuals: ["Animación técnica (9:16): el punto de presión o la causa antes de mostrar el producto.", "Demo comparativa: el producto contra la alternativa bajo la misma prueba.", "UGC explicando con las manos o con un objeto cotidiano como metáfora."],
    guardrails: ["El mecanismo debe ser real y salir de los datos del producto: no se inventan tecnologías, patentes ni nombres científicos.", "Las animaciones son ilustrativas: «Ilustración» si pueden confundirse con imagen médica.", "Sin segunda persona sobre condiciones de salud."],
  },
  age_identity: {
    role: "Eres especialista en creativos de identidad: segmentas en el gancho por etapa de vida o rol (40+, posparto, turnos largos, dueños de perros mayores).",
    psychology: [
      "Atención selectiva: una etiqueta que te describe atraviesa el scroll; quien no es del grupo sigue de largo y eso abarata la venta.",
      "Autocategorización: «la gente como yo hace esto» es prueba social filtrada.",
      "Normalización: convertir una vergüenza privada en experiencia compartida genera confianza.",
      "Identidad amenazada: el anuncio ofrece volver a sentirse uno mismo, no solo arreglar un síntoma.",
      "Similitud con el vocero: confiamos en quien se nos parece.",
    ],
    when: ["El cliente ideal tiene un rango de edad, una etapa o un rol bien definido.", "El problema aparece o empeora en esa etapa.", "Se puede conseguir un vocero del grupo (real o actor declarado)."],
    whenNot: ["Producto universal sin grupo dominante.", "La única forma de decirlo es acusatoria en segunda persona: Meta la rechaza y ofende."],
    structure: ["Etiqueta y síntoma en el gancho, en primera o tercera persona.", "Normalización: «No eres solo tú. Le pasa a [grupo] porque…».", "El intento fallido típico del grupo.", "El producto como ajuste para esta etapa, no como cura.", "Prueba real de pares.", "Recuperar la identidad.", "Cierre: paga al recibir, con el pack si aplica."],
    aida: ["Atención: etiqueta del grupo y síntoma.", "Interés: normalización y el intento fallido.", "Deseo: el ajuste, la prueba de pares y la identidad recuperada.", "Acción: actuar como actúa su grupo."],
    visuals: ["Vocero del grupo en su contexto (9:16).", "Listicle con texto grande («3 ERRORES») y la demo de fondo.", "Montaje de pares: 3 o 4 personas del grupo diciendo su rol y una frase."],
    guardrails: ["Nada de segunda persona sobre edad, salud o peso: primera persona del vocero o tercera del grupo.", "Nada de promesas de rejuvenecimiento ni resultados con plazo.", "Si el vocero es actor o avatar de IA, no afirma edad ni experiencia como hechos reales."],
  },
  personal_story: {
    role: "Eres especialista en storytelling de respuesta directa: un relato real en primera persona, con detalles concretos (edad, montos, lugares, un momento detonante).",
    psychology: [
      "Transporte narrativo: cuando la historia absorbe, se baja la guardia crítica.",
      "Especificidad = credibilidad: las cifras raras y los detalles concretos suenan a vida real.",
      "Víctima identificable: una persona concreta mueve más que una estadística.",
      "El giro con un desconocido sabio mezcla curiosidad y autoridad externa.",
      "Formato nativo: un texto largo sobre una foto cotidiana parece un post, no un anuncio.",
    ],
    when: ["Hay reseñas reales con narrativa: un antes, un momento y un después.", "El problema tiene carga emocional o un evento detonante.", "Compra de consideración media, donde el comprador necesita convencerse."],
    whenNot: ["No hay testimonios reales: este ángulo NO se construye con historias inventadas.", "Producto de impulso muy barato."],
    structure: ["Gancho en medio de la acción: el peor momento, con un detalle.", "Contexto humano: quién es y qué le importa.", "La escalada: lo que probó y cuánto le costó.", "El giro.", "El descubrimiento del producto, dentro de la historia.", "La resolución con un detalle concreto.", "Puente al espectador y cierre: paga al recibir."],
    aida: ["Atención: el peor momento con un detalle.", "Interés: contexto, escalada y giro.", "Deseo: descubrimiento y resolución.", "Acción: «si te suena, esto es lo que usó»."],
    visuals: ["Texto largo sobre una foto cotidiana (9:16), sin estética publicitaria.", "Selfie narrado por la persona real, en un solo plano.", "Estático tipo unboxing con el copy largo."],
    guardrails: ["Solo historias reales con consentimiento, o dramatizaciones que no se presentan como el testimonio de una clienta.", "Si no hay reseñas reales: story_is_real = false y las preguntas de entrevista en interview_questions.", "Sin promesas médicas dentro de la historia; «los resultados varían» cuando corresponda."],
  },
  offer: {
    role: "Eres especialista en ofertas: el pack es el mensaje (lleva 3 y paga 2, precio ancla, una fecha real). Con pago contra entrega, cada pedido paga el anuncio y el despacho una vez: el pack es lo que sostiene el CPA.",
    psychology: [
      "Aversión a la pérdida: «llévate 1 GRATIS» pesa más que «30 % de descuento».",
      "Anclaje: el primer número fija la referencia (el tachado real, el precio por unidad).",
      "El efecto «gratis»: lo gratis mueve más que un precio bajo.",
      "Urgencia real: un plazo verdadero acorta la duda; uno falso enseña a ignorarlo y es ilegal.",
      "Contabilidad mental: el pack convierte «gasto en mí» en «uno para mí y otro para regalar».",
      "Simplicidad: si el producto se entiende en 1 segundo, cualquier explicación sobra.",
    ],
    when: ["Ticket bajo para el país, producto de impulso, consumible, con variantes o regalable.", "El resultado se entiende sin explicación.", "El pack de PRECIO Y OFERTA gana más que 1 unidad.", "Hay una fecha comercial real (CyberDay, Día de la Madre, Black Friday)."],
    whenNot: ["Problema complejo de ticket alto: la oferta va como capa, no como gancho."],
    structure: ["La oferta ES el gancho: el número o «GRATIS» en los primeros 1–2 segundos.", "El producto en su mejor ángulo: variantes o demo rápida.", "Tres beneficios con check.", "El ancla: el tachado real o el precio por unidad del pack.", "Sin riesgo: paga al recibir.", "Urgencia solo si es real, y la llamada a la acción."],
    aida: ["Atención: la oferta en 1–2 segundos.", "Interés: el producto y 3 beneficios.", "Deseo: el ancla y el pago contra entrega.", "Acción: la fecha real y la llamada."],
    visuals: ["Estático grilla de precio (1:1): las variantes, el precio grande y 3 checks.", "«Compra esto / llévate esto GRATIS» con flechas a mano.", "Video del producto con stickers de oferta (9:16)."],
    guardrails: ["La estructura recomendada es uno de los packs de PRECIO Y OFERTA: no inventes otra ni recalcules márgenes.", "«GRATIS» tiene que ser gratis de verdad.", "Nada de contadores que se reinician ni «termina hoy» permanente.", "Si el ángulo principal es otro, este desarrollo es la capa de oferta: details.as_layer = true."],
  },
};

export function angleSystem(angle: SalesAngle, market: Market): string {
  const g = GUIDES[angle];
  const list = (items: string[]) => items.map((i) => `- ${i}`);
  return [
    `${g.role} Conviertes el producto, quién compra y el precio en un BRIEF DE ÁNGULO que después usan el guionista, el generador de estáticos y el copywriter. Razonas en español; todo el copy (ganchos, frases, titulares) va en el idioma del mercado.`,
    "",
    marketBlock(market),
    "",
    "LA PSICOLOGÍA DETRÁS",
    ...list(g.psychology),
    "",
    "CUÁNDO USARLO",
    ...list(g.when),
    "CUÁNDO NO",
    ...list(g.whenNot),
    "",
    "ESTRUCTURA DEL MENSAJE (cada beat en body_beats con su etapa AIDA)",
    ...list(g.structure),
    "",
    "MAPA AIDA",
    ...list(g.aida),
    "",
    "FORMATOS VISUALES",
    ...list(g.visuals),
    "",
    "GUARDRAILS DEL ÁNGULO",
    ...list(g.guardrails),
    "",
    COMMON_RULES,
    "",
    "ENTREGA",
    "- Los ganchos no van aquí: los escribe después un agente de ganchos a partir de este desarrollo. En aida_summary.attention di qué tiene que lograr la apertura.",
    "- aida_summary: una frase por etapa, lo que el comerciante lee para aprobar.",
    "- 3 a 5 objeciones con respuesta; al menos una sobre comprar online o el pago contra entrega (lo que le preocupa a quien compra).",
    "- offer_layer: la oferta en una línea con los números exactos de PRECIO Y OFERTA y «Paga al recibir».",
    "- 3 conceptos visuales y 2 estáticos (3 si el ángulo es Oferta). Las referencias pueden ser anuncios de EE. UU. como inspiración de formato.",
  ].join("\n");
}

export interface AngleHandoff {
  /** El ángulo que se desarrolla (mensaje + forma). */
  angle: TestAngle;
  /** Los otros ángulos que se testean en paralelo (para no repetirlos). */
  others: TestAngle[];
  /** Por qué conviene esta forma, según el orquestador. */
  why: string;
  risks: string[];
  /** Solo en los ángulos de antes del orquestador v7 (los nuevos traen su propio AIDA). */
  aidaEmphasis?: string;
  complianceFlags: string[];
}

export function angleUser(frame: SalesAngle, c: AngleContext, h: AngleHandoff): string {
  const a = h.angle;
  return [
    ...briefContext(c),
    "",
    "HANDOFF DEL ORQUESTADOR",
    `- Este es el ${slotLabel(a.slot).toLowerCase()} de ${h.others.length + 1} que se testean a la vez, cada uno en su propio conjunto de anuncios. Quien ve este anuncio no ve los otros: tiene que ser 100 % este ángulo, sin mezclarlo con los demás.`,
    `- El ángulo: «${testAngleName(a)}».`,
    ...(a.pain_or_desire ? [`- Dolor o deseo: ${a.pain_or_desire}`] : []),
    ...(a.segment ? [`- Para quién: ${a.segment}`] : []),
    ...(a.promise ? [`- Promesa: ${a.promise}`] : []),
    ...(a.trigger_moment ? [`- Momento que abre el anuncio: ${a.trigger_moment}`] : []),
    ...(a.competition ? [`- Competencia: ${a.competition}`] : []),
    ...(a.speaks_to ? [`- Le habla a: ${a.speaks_to === "buyer" ? "quien compra (puede no ser quien lo usa)" : "quien usa el producto"}.`] : []),
    ...(a.hook ? [`- El gancho con que el comerciante eligió este ángulo: «${a.hook}». Es la idea que tiene que sobrevivir: el desarrollo la cuenta, no la cambia.`] : []),
    ...(a.tone ? [`- Tono: ${a.tone}.`] : []),
    ...(a.aida ? [`- El AIDA que se propuso: Atención: ${a.aida.attention} Interés: ${a.aida.interest} Deseo: ${a.aida.desire} Acción: ${a.aida.action}`] : []),
    ...(a.market_amounts?.length ? [`- ${marketAnchorLine(a.market_amounts, c.pricing.currency)}`] : []),
    `- Se cuenta con la forma ${ANGLES[frame].name}.${a.hook ? " La forma es una guía de estructura, no un molde: si choca con el gancho o el tono del ángulo, mandan el gancho y el tono." : ""} Por qué: ${h.why}`,
    ...(h.others.length ? [`- Los otros ángulos del testeo (no los repitas): ${h.others.map((o) => `«${testAngleName(o)}» (${ANGLES[o.frame].name})`).join("; ")}.`] : []),
    ...(h.risks.length ? [`- Riesgos: ${h.risks.join("; ")}.`] : []),
    ...(h.aidaEmphasis ? [`- Énfasis AIDA: ${h.aidaEmphasis}`] : []),
    ...(h.complianceFlags.length ? [`- Alertas de cumplimiento: ${h.complianceFlags.join("; ")}.`] : []),
    "- La oferta va como capa (offer_layer), nunca reemplaza al ángulo.",
    "",
    `Desarrolla este ángulo con la forma ${ANGLES[frame].name}.`,
  ].join("\n");
}
