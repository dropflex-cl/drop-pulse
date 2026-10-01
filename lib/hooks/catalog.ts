// El agente de ganchos COD LatAm (agentes-creativos/hook-cod-latam.md): arquetipos de producto,
// patrones de gancho y topes. Sale de 85 videos COD activos y longevos (≥ 21 días, mediana 136) en 9
// países, transcritos y codificados. Lo que se puede contar vive aquí como números. Puro.

import { promptLimit } from "@/lib/ai/limits";

/** Ganchos por ángulo (§3, paso 3). */
export const HOOKS_PER_ANGLE = 10;
/** Patrones distintos como mínimo entre los 10, y ganchos como máximo por patrón (§3 y §5). */
export const MIN_PATTERNS = 5;
export const MAX_PER_PATTERN = 3;
/** Los que se prueban primero, cada uno con su variante A/B (§8 C). */
export const TOP_HOOKS = 3;

/** Hablado de 0 a 3 s: ~3 s de habla en español. La segunda frase llega hasta los 6 s. */
export const SPOKEN_MAX_WORDS = 9;
export const FOLLOW_UP_MAX_WORDS = 9;
/** Texto en pantalla: legible sin sonido. */
export const ON_SCREEN_MAX_WORDS = 6;
/** Lo que pide el prompt (un 10 % menos, lib/ai/limits.ts); el código acepta hasta el tope real. */
export const SPOKEN_PROMPT_WORDS = promptLimit(SPOKEN_MAX_WORDS);
export const ON_SCREEN_PROMPT_WORDS = promptLimit(ON_SCREEN_MAX_WORDS);
/** Un criterio en este puntaje o menos descarta el gancho (§5). */
export const DISCARD_SCORE = 2;

export const ARCHETYPES = ["visible_problem", "hidden_problem", "desire", "protection", "value", "novelty"] as const;
export type Archetype = (typeof ARCHETYPES)[number];

export const HOOK_PATTERNS = [
  "demo",
  "pain",
  "offer",
  "contrarian",
  "confession",
  "authority",
  "curiosity",
  "fear",
  "social_shame",
  "try_on",
  "behind_scenes",
  "comment_reply",
  "identity",
] as const;
export type HookPattern = (typeof HOOK_PATTERNS)[number];

export const RISKS = ["low", "medium", "high"] as const;
export type HookRisk = (typeof RISKS)[number];

export interface ArchetypeDef {
  name: string;
  signal: string;
  examples: string;
  main: HookPattern[];
  secondary: HookPattern[];
}

/** §3, pasos 1 y 2: el arquetipo del producto decide qué patrones abren mejor. */
export const ARCHETYPE_DEFS: Record<Archetype, ArchetypeDef> = {
  visible_problem: {
    name: "Problema visible",
    signal: "El antes/después o el uso se ve en cámara.",
    examples: "quitapelusas, sellador de rayones, pelador, tapón de drenaje",
    main: ["demo", "pain"],
    secondary: ["curiosity", "contrarian"],
  },
  hidden_problem: {
    name: "Problema invisible o íntimo",
    signal: "El dolor existe pero no se muestra.",
    examples: "próstata, olor, caída del cabello, articulaciones",
    main: ["confession", "authority", "pain"],
    secondary: ["contrarian", "curiosity"],
  },
  desire: {
    name: "Deseo, estatus o estética",
    signal: "Se compra por cómo se ve o se siente quien lo usa.",
    examples: "moda, perfumes, relojes, joyas, luces para el auto",
    main: ["try_on", "authority", "identity"],
    secondary: ["offer"],
  },
  protection: {
    name: "Protección o seguridad",
    signal: "Evita un riesgo para la persona o los suyos.",
    examples: "barandas de cama, GPS, linterna de emergencia, medidor de llantas",
    main: ["fear", "demo"],
    secondary: ["pain"],
  },
  value: {
    name: "Valor o commodity",
    signal: "Se decide por precio y cantidad.",
    examples: "packs de ropa, combos, 2x1",
    main: ["offer", "contrarian"],
    secondary: ["behind_scenes"],
  },
  novelty: {
    name: "Novedad («no sabía que existía»)",
    signal: "Lo sorprendente es el producto en sí.",
    examples: "protector que cambia de color, internet sin mensualidad, planta exótica",
    main: ["curiosity", "demo"],
    secondary: ["contrarian"],
  },
};

export interface PatternDef {
  /** El nombre que ve el comerciante. */
  name: string;
  mechanism: string;
  structure?: string;
  templates: string[];
  /** Textos reales del corpus. */
  real: string[];
  risk: string;
  /**
   * Material real que el gancho necesita para no ser inventado (§4 y §6). `always`: siempre (la tienda
   * o la bodega de verdad). `reviews`: un testimonio o un comentario real (las reseñas de la ficha
   * sirven). `expert`: un experto real con credencial.
   */
  needsReal?: "always" | "reviews" | "expert";
}

/** §4: la biblioteca de patrones. */
export const PATTERN_DEFS: Record<HookPattern, PatternDef> = {
  demo: {
    name: "Demostración",
    mechanism: "Satisfacción visual y ciclo abierto («¿funcionará?»).",
    structure: "Problema visible en pantalla → la mano aplica el producto → resultado parcial a los 3 s.",
    templates: ["«Tienes que ver esto.»", "«Mira esto, solo mira.»", "«No es [objeción], es [prueba].»"],
    real: ["Encendedor sobre la sandalia: «No es sintético ni plástico, es 100% cuero.»"],
    risk: "Si la demo exagera lo que hace el producto real, se dispara el rechazo en la puerta. Solo lo que se ve es lo que llega. Variante fuerte: prueba de estrés (quemar, golpear, mojar, estirar).",
  },
  pain: {
    name: "Dolor",
    mechanism: "Sesgo de negatividad y autorreferencia.",
    structure: "Daño o molestia concreta + consecuencia → producto.",
    templates: ["«Esto está dañando tu [objeto].»", "«¿Cansado de [molestia concreta]?»", "«Si tu [X] nunca queda bien, no es por [causa obvia].» (falso culpable)"],
    real: ["«Esta vibración está dañando tu lavadora.»", "«Si tu pasto nunca queda bien, no es por el riego ni por el clima.»"],
    risk: "En salud o cuerpo, nunca afirmes que quien mira tiene la condición.",
  },
  offer: {
    name: "Oferta con ancla",
    mechanism: "Anclaje y filtro de capacidad de pago (baja el rechazo en la entrega).",
    structure: "Cantidad + precio local + comparación con la alternativa.",
    templates: ["«[N] [producto] por [precio].»", "«…seguro gastas más que eso en uno solo.»", "«El doble por [precio].»"],
    real: ["«5 bermudas por 190 mil pesos.»", "«4 polos compresores por solo 100 soles… seguro gastan más de eso en uno solo.»"],
    risk: "Un «antes $X» falso es práctica engañosa: solo comparaciones reales y los montos de PRECIO Y OFERTA.",
  },
  contrarian: {
    name: "Contrario",
    mechanism: "Violación de expectativas e inoculación contra el escepticismo.",
    templates: ["«No compres [producto] hasta ver esto.»", "«No te creas todo lo que ves en TikTok…»", "«Lo siento por quienes ya compraron…»", "«Todos quieren [resultado], nadie quiere [esfuerzo].»"],
    real: ["«Vengo a hacer una denuncia pública…» (y luego: «…y sí cumple»)."],
    risk: "La «denuncia» va contra la propia marca y en broma; nunca contra una persona o un competidor real.",
  },
  confession: {
    name: "Confesión",
    mechanism: "Narrativa, ciclo abierto e identificación.",
    templates: ["«[Hice X] después de usar esto [tiempo]. Esto es lo que pasó.»", "«Les voy a confesar algo…»", "«Pensé que era puro cuento, pero…»"],
    real: ["«Cancelé mi cirugía después de usar esto por tres semanas. Esto es lo que pasó.»"],
    risk: "Nunca inventes testimonios: sale de una reseña real de la ficha o pide un testimonio real. Nada de afirmaciones médicas («cancelé mi cirugía»).",
    needsReal: "reviews",
  },
  authority: {
    name: "Autoridad",
    mechanism: "Heurística de autoridad y prestigio prestado.",
    templates: ["«Un [especialista] explica por qué…»", "«El modelo que es éxito en [lugar].»", "«¿Es posible recuperar [X]? Este es un caso de…»"],
    real: ["Especialista con bata y pantalla dividida: «¿Es posible recuperar estas cejas?»"],
    risk: "Bata sin profesional real o una celebridad sin autorización es riesgo legal y de rechazo. Solo autoridad real o prestigio de categoría («perfumería árabe»).",
    needsReal: "expert",
  },
  curiosity: {
    name: "Curiosidad",
    mechanism: "Brecha de información.",
    templates: ["«A muchos les parece imposible [X]…»", "«El secreto que seguro no conocías de [X].»", "«Esto existe y casi nadie lo sabe.»"],
    real: ["«A muchos les parece imposible tener internet sin pagar cada mes…»"],
    risk: "El clickbait que no se resuelve en 10 s quema la confianza: resuélvelo rápido con el producto.",
  },
  fear: {
    name: "Miedo o seguridad",
    mechanism: "Detección de amenazas y protección de los seres queridos.",
    templates: ["«¿Te preocupa [riesgo] de [ser querido]?»", "«En una emergencia, esto puede [salvar X].»", "«[Riesgo] ocurre en segundos.»"],
    real: ["«¿Te preocupa la seguridad de tus seres queridos al dormir?» (barandas de cama, 414 días)."],
    risk: "No exageres estadísticas ni muestres accidentes reales.",
  },
  social_shame: {
    name: "Vergüenza o deseo social",
    mechanism: "Miedo a la evaluación social y deseo.",
    templates: ["«[Algo íntimo] no debería ser [imagen graciosa]… no vamos a juzgar, pero alguien más probablemente sí.»"],
    real: ["«Tu zona íntima no debería ser un bosque… no vamos a juzgarte, pero alguien más probablemente sí.»"],
    risk: "Con humor y en tercera persona, sin atribuirle el problema a quien mira. Las versiones explícitas tienen alto riesgo de rechazo de Meta.",
  },
  try_on: {
    name: "Prueba puesta o unboxing",
    mechanism: "Estética y prueba visual del ajuste: en Deseo el visual ES el gancho.",
    templates: ["Cambio de outfit en corte con el beat.", "POV abriendo la caja.", "Mano estirando la tela («AJUSTABLE»)."],
    real: [],
    risk: "La música sola es el formato más débil: agrega un texto en pantalla con el beneficio o la oferta.",
  },
  behind_scenes: {
    name: "Bastidores",
    mechanism: "Credibilidad: responde «¿esto existe?» sin decirlo.",
    templates: ["«Acá estamos preparando los pedidos que salen hoy a [ciudad].»", "Vendedor en la tienda física: «5 bermudas por…»"],
    real: [],
    risk: "Necesita grabar la operación de verdad (bodega, pedidos, tienda). Ideal en Valor y en mercados con mucha desconfianza.",
    needsReal: "always",
  },
  comment_reply: {
    name: "Respuesta a comentario",
    mechanism: "Prueba social y formato nativo (no parece anuncio).",
    structure: "Burbuja de un comentario real («¿Para qué sirven esas gotas?») + la respuesta en video.",
    templates: ["Burbuja con la pregunta frecuente + «Te respondo:»"],
    real: [],
    risk: "El comentario es real o una pregunta frecuente real (las objeciones de la ficha o las reseñas). Nunca nombres de usuario inventados.",
    needsReal: "reviews",
  },
  identity: {
    name: "Identidad",
    mechanism: "Pertenencia: le habla al grupo con su jerga.",
    templates: ["«Oye [apodo del grupo], [beneficio para su pasión].»"],
    real: ["«Oye Toretto, dale un estilo diferente a tu nave.»"],
    risk: "La identidad es un rol o una pasión (tuning, fitness, maternidad, oficios), nunca una condición del cuerpo o la edad.",
  },
};

/**
 * La primera toma del gancho (docs/spec-video-detener-scroll.md §3.2): lo que la IA puede mostrar en el
 * cuadro 0 sin inventar nada, o `real_footage` si hace falta grabarlo de verdad. El gancho la elige y el
 * guion del video la ejecuta.
 */
export const OPENING_SHOTS = ["selfie_talk", "pov_hands", "problem_scene", "product_in_place", "mirror", "real_footage"] as const;
export type OpeningShot = (typeof OPENING_SHOTS)[number];
/** Las que se hacen con IA (el video con persona). */
export type AiOpeningShot = Exclude<OpeningShot, "real_footage">;

export const OPENING_SHOT_DEFS: Record<OpeningShot, { name: string; frame0: string }> = {
  selfie_talk: { name: "La persona a cámara", frame0: "La persona habla a la cámara frontal, YA en medio del gesto del gancho (se inclina, levanta una ceja, levanta el producto)." },
  pov_hands: { name: "Las manos con el producto", frame0: "Cámara trasera mirando hacia abajo: una mano con el producto o haciendo la acción (aplicar, poner, abrir), en la casa." },
  problem_scene: { name: "El problema en su lugar", frame0: "El problema donde ocurre (la lavadora que tiembla, la manguera tensa), sin mostrar ningún resultado." },
  product_in_place: { name: "El producto donde se usa", frame0: "El producto en su lugar de uso, en una mano o sobre el lavamanos; nunca en pose de catálogo." },
  mirror: { name: "Selfie en el espejo", frame0: "La persona se graba en el espejo del baño o la pieza, cuerpo entero o medio cuerpo." },
  real_footage: { name: "Necesita grabación real", frame0: "Algo que la IA no puede mostrar sin inventar: el efecto o el resultado, una prueba de estrés, la bodega, un testimonio." },
};

/**
 * Los patrones que puede decir una mascota (la uña, el diente, la lavadora: lo que tiene el problema,
 * personificado). Los que piden una persona o material real (confesión, autoridad, bastidores,
 * respuesta a comentario, prueba puesta, demostración del efecto) no.
 */
export const MASCOT_PATTERNS: readonly HookPattern[] = ["pain", "curiosity", "contrarian", "social_shame", "fear", "identity", "offer"];
/** Ganchos con versión de mascota como mínimo, y en cuántos patrones distintos. */
export const MIN_MASCOT_HOOKS = 3;
export const MIN_MASCOT_PATTERNS = 2;

export const ARCHETYPE_NAMES = Object.fromEntries(ARCHETYPES.map((a) => [a, ARCHETYPE_DEFS[a].name])) as Record<Archetype, string>;
export const PATTERN_NAMES = Object.fromEntries(HOOK_PATTERNS.map((p) => [p, PATTERN_DEFS[p].name])) as Record<HookPattern, string>;

/**
 * §7, sin el trato: la app escribe en español neutro con tuteo en todos los países (marketBlock), así
 * que de cada mercado solo se toma cómo se escribe el precio y cómo se nombra el pago y el envío.
 */
export const LOCAL_NOTES: Record<string, string> = {
  CO: "Precio como «$79.900» o, hablado, «79 mil pesos». Se dice «contraentrega».",
  MX: "Precio como «$399 pesos». Se dice «paga al recibir» y «envío gratis».",
  CL: "Precio como «$19.990». Se dice «pago contra entrega» y «despacho gratis».",
  PE: "Precio como «S/100». Se dice «pago contraentrega» y «envíos a provincia».",
  EC: "Precio en dólares, como «$25». Se dice «pago contra entrega a todo el Ecuador».",
  GT: "Precio en quetzales, como «Q149». Se dice «pagas al recibir».",
  CR: "Precio en colones, como «₡14.900». «Tico» funciona como identidad.",
  AR: "Precio en pesos, como «$24.990».",
};
