// El agente de ganchos COD LatAm (agentes-creativos/hook-cod-latam.md): topes, la clasificación de lo
// que escribe (arquetipo del producto, patrón, primera toma, cómo se dice) y lo que se valida en código.
// Desde la versión 6 (docs/spec-prompts-simples.md §4) los patrones no van al prompt como menú: sirven
// para clasificar y para saber qué material real falta. Puro.

import { promptLimit } from "@/lib/ai/limits";

/** Ganchos por ángulo. */
export const HOOKS_PER_ANGLE = 10;

/** Hablado de 0 a 3 s: ~3 s de habla en español. La segunda frase llega hasta los 6 s. */
export const SPOKEN_MAX_WORDS = 9;
export const FOLLOW_UP_MAX_WORDS = 9;
/** Texto en pantalla: legible sin sonido. */
export const ON_SCREEN_MAX_WORDS = 6;
/** Lo que pide el prompt (un 10 % menos, lib/ai/limits.ts); el código acepta hasta el tope real. */
export const SPOKEN_PROMPT_WORDS = promptLimit(SPOKEN_MAX_WORDS);
export const ON_SCREEN_PROMPT_WORDS = promptLimit(ON_SCREEN_MAX_WORDS);
/** Frases del cliente ideal que recibe el agente (buyerVoice): de ahí salen las citas (source_quote). */
export const HOOK_VOICE_LINES = 5;
/** Palabras con contenido (4 letras o más) que un gancho comparte con la cita de la que parte. */
export const QUOTE_SHARED_WORDS = 2;
/** El crítico: si menos de estos ganchos lo detienen, se reescriben una vez los que no. */
export const CRITIC_MIN_STOPS = 4;

/**
 * Cómo se dice el gancho (la voz de A1 en el video). Nunca gritado ni exasperado: en las pruebas de
 * Seedance sale golpeado. `voice` es la dirección en inglés para el modelo de video.
 */
export const HOOK_DELIVERIES = ["confiding", "intrigued", "surprised", "indignant", "deadpan", "playful"] as const;
export type HookDelivery = (typeof HOOK_DELIVERIES)[number];
export const HOOK_DELIVERY_DEFS: Record<HookDelivery, { name: string; voice: string }> = {
  confiding: { name: "Confidencia", voice: "low and close, like telling a secret to a friend, leaning in" },
  intrigued: { name: "Intriga", voice: "curious and a little puzzled, as if still figuring it out" },
  surprised: { name: "Sorpresa", voice: "genuinely surprised, eyebrows up, a quick intake of breath" },
  indignant: { name: "Indignación contenida", voice: "quietly fed up, firm and matter-of-fact, never shouting" },
  deadpan: { name: "Seco", voice: "dry and flat on purpose, a beat of silence after the line" },
  playful: { name: "Juguetón", voice: "teasing and amused, holding back a laugh" },
};

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

/** El tipo de producto que diagnostica el agente (lo que ve el comerciante sobre los ganchos). */
export const ARCHETYPE_NAMES: Record<Archetype, string> = {
  visible_problem: "Problema visible",
  hidden_problem: "Problema invisible o íntimo",
  desire: "Deseo, estatus o estética",
  protection: "Protección o seguridad",
  value: "Valor o commodity",
  novelty: "Novedad («no sabía que existía»)",
};

/**
 * Material real que un patrón necesita para no ser inventado. `always`: siempre (la tienda o la bodega
 * de verdad). `reviews`: un testimonio o un comentario real (las reseñas de la ficha sirven). `expert`:
 * un experto real con credencial. Si falta, el código lo dice en `needs_real_material` (normalizeHooks).
 */
export type RealMaterial = "always" | "reviews" | "expert";

/**
 * Los patrones de gancho: clasifican lo que el agente ya escribió (la etiqueta que ve el comerciante) y
 * dicen qué material real necesita cada uno. No son un menú: el prompt no los enumera ni pide cuotas
 * (docs/spec-prompts-simples.md §4).
 */
export const PATTERN_DEFS: Record<HookPattern, { name: string; needsReal?: RealMaterial }> = {
  demo: { name: "Demostración" },
  pain: { name: "Dolor" },
  offer: { name: "Oferta con ancla" },
  contrarian: { name: "Contrario" },
  confession: { name: "Confesión", needsReal: "reviews" },
  authority: { name: "Autoridad", needsReal: "expert" },
  curiosity: { name: "Curiosidad" },
  fear: { name: "Miedo o seguridad" },
  social_shame: { name: "Vergüenza o deseo social" },
  try_on: { name: "Prueba puesta o unboxing" },
  behind_scenes: { name: "Bastidores", needsReal: "always" },
  comment_reply: { name: "Respuesta a comentario", needsReal: "reviews" },
  identity: { name: "Identidad" },
};

/** Lo que falta grabar o conseguir, dicho al comerciante, cuando el agente no lo dijo. */
export const REAL_MATERIAL_NOTE: Record<RealMaterial, string> = {
  always: "Grabar la operación real (bodega, pedidos o tienda)",
  reviews: "Un testimonio o un comentario real de un comprador",
  expert: "Un experto real que lo recomiende, con su credencial",
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
