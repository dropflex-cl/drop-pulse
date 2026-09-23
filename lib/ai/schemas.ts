import * as z from "zod/v4";

// Salidas estructuradas del pipeline "Optimizar con IA" (primera parte: ficha + cliente ideal).
// Las claves van en inglés (modelo de datos); los valores, en el idioma del mercado.
// Módulo puro: lo usan el pipeline (validar la salida del modelo), la API (validar lo que edita el
// comerciante) y la UI (tipos).

/** Bump cuando cambie el prompt o el esquema de la ficha. */
export const PRODUCT_BRIEF_PROMPT_VERSION = 5;
/** Bump cuando cambie el prompt o el esquema del cliente ideal. */
export const CUSTOMER_AVATAR_PROMPT_VERSION = 4;

const text = z.string();
const maybe = z.string().nullable();

// ---------------------------------------------------------------- Ficha de producto
// La entrada estándar de los agentes creativos (agentes-creativos/README.md › Ficha de producto),
// adaptada a LATAM con pago contra entrega: moneda del mercado en vez de USD, reseñas solo si el
// comerciante las pegó y lo que falta dicho como pregunta.

export const productBriefSchema = z.object({
  product_name: text.describe("Nombre claro y literal del producto (qué es), sin adjetivos de venta."),
  category: text.describe("Categoría comercial, p. ej. «dolor y postura», «hogar», «mascotas», «belleza»."),
  what_it_does: text.describe("Qué hace, en una frase."),
  problem_solved: text.describe("El dolor o la frustración concreta que resuelve."),
  how_it_works: maybe.describe("Mecanismo físico o técnico (materiales, diseño, principio). null si no hay base en la información."),
  key_facts: z
    .array(z.object({ label: text, value: text }))
    .describe("Datos duros tal como aparecen en la información o las imágenes: medidas, materiales, qué incluye, modo de uso, compatibilidad. Nada inventado."),
  target_audience: z.object({
    age_range: maybe.describe("Rango de edad probable, p. ej. «30-55». null si no hay señal."),
    gender: z.enum(["female", "male", "any"]).nullable(),
    life_stage_or_role: maybe.describe("Etapa de vida o rol que se reconoce en una línea (oficinista, mamá, dueño de perro senior…)."),
    where_they_feel_it: maybe.describe("En qué momento o lugar concreto sienten el problema."),
  }),
  alternatives_already_tried: z.array(text).describe("Lo que el comprador suele usar hoy y le falla (categorías o prácticas, nunca marcas)."),
  price: z.number().nullable().describe("Precio de venta de PRECIO Y OFERTA, en la moneda del mercado."),
  unit_cost: z.number().nullable().describe("Precio de compra al proveedor de PRECIO Y OFERTA."),
  bundle_options: z.array(text).describe("Los packs de PRECIO Y OFERTA, uno por línea, p. ej. «2 unidades: $47.990 ($23.995 c/u, ahorra $9.990)»; más cualquier otra oferta que el comerciante mencione (kit, regalo)."),
  real_deadline_or_event: maybe.describe("Fecha comercial real que el comerciante mencionó, o null."),
  proof: z.object({
    real_reviews: z.array(text).describe("Solo reseñas que el comerciante pegó, copiadas textuales. Nunca redactadas."),
    real_expert: maybe.describe("Experto real que el comerciante nombró, con su credencial. null si no hay."),
    studies_or_certifications: z.array(text).describe("Solo los que aparecen con su fuente."),
    units_sold_or_social_proof: maybe,
    guarantee_days: z.number().int().nullable(),
  }),
  images: z
    .array(
      z.object({
        image_id: text.describe("El id que acompaña a la imagen en la entrada."),
        shows: text.describe("Qué se ve, en una frase."),
        usable_for_ads: z.boolean().describe("false si tiene texto del proveedor, marcas de agua, collage confuso o baja calidad."),
        issues: z.array(text),
      }),
    )
    .describe("Una entrada por imagen recibida, en el mismo orden."),
  known_objections: z.array(text).describe("Dudas que frenan la compra, incluidas las propias del pago contra entrega."),
  forbidden_claims: z.array(text).describe("Promesas que no se pueden hacer con este producto (salud, resultados garantizados, plazos)."),
  inferred_fields: z.array(text).describe("Campos que no venían en la información y se infirieron (p. ej. «target_audience.age_range»)."),
  missing_inputs: z
    .array(
      z.object({
        field: text.describe("Campo de la ficha que falta o está débil."),
        question: text.describe("Pregunta para el comerciante, corta, en tuteo, que se responde en una línea."),
      }),
    )
    .describe("Lo que más subiría la calidad de los anuncios si el comerciante lo agrega. Máximo 5, lo más importante primero."),
});

export type ProductBrief = z.infer<typeof productBriefSchema>;

// ---------------------------------------------------------------- Cliente ideal
// El avatar psicológico de dropflex base (docs/prompt-avatar.md: 7 secciones + fórmula), con lo que
// le faltaba para decidir ángulos y segmentar: demografía, nivel de consciencia (Schwartz),
// sofisticación, momentos detonantes, dudas del pago contra entrega y frases con sus palabras.

export const AWARENESS_LEVELS = ["unaware", "problem_aware", "solution_aware", "product_aware", "most_aware"] as const;

export const customerAvatarSchema = z.object({
  name: text.describe("Nombre de pila creíble en el país del mercado."),
  summary: text.describe("Quién es, en una frase: «Andrés, 38, oficinista que pasa 9 horas sentado…»."),
  demographics: z.object({
    age_range: text,
    gender: z.enum(["female", "male", "any"]),
    location: text.describe("Dónde vive dentro del país (ciudad grande, regiones…)."),
    socioeconomic_level: text,
    occupation_or_role: text,
  }),
  awareness_level: z.enum(AWARENESS_LEVELS).describe("Nivel de consciencia del mercado (Eugene Schwartz) frente a este producto."),
  awareness_reason: text,
  market_sophistication: z.number().int().describe("De 1 a 5: cuántas promesas parecidas ya vio este comprador."),
  sophistication_reason: text,
  identity: z.object({ current_identity: text, desired_identity: text, lifestyle: text }),
  priorities: z.object({ primary_focus: text, secondary_priorities: text, long_term_outcome: text, immediate_outcome: text }),
  problems: z.object({
    main_problem: text.describe("El obstáculo externo evidente, con sus palabras."),
    underlying_problem: text.describe("El problema que nace del principal (emocional, de identidad)."),
    current_frustration: text,
    trigger_moments: z.array(text).describe("3 a 5 escenas concretas y observables en que siente el problema (el filtro del gancho)."),
  }),
  emotions: z.object({ fears: text, secret_desires: text, core_motivation: text }),
  objections: z.object({
    critical_question: text,
    main_objection: text,
    common_excuses: text,
    cash_on_delivery_concerns: text.describe("Qué le preocupa de comprar a una tienda online que no conoce y cómo el pago contra entrega lo calma."),
  }),
  enemies: z.object({ external_enemy: text, internal_enemy: text }),
  vision: z.object({ future_vision: text, number_one: text }),
  voice_of_customer: z.array(text).describe("4 a 6 frases en primera persona, como las diría en un comentario o a un amigo."),
  formula: text.describe("La Fórmula del Cliente Ideal completa, siguiendo la plantilla del sistema."),
});

export type CustomerAvatar = z.infer<typeof customerAvatarSchema>;
export type AwarenessLevel = (typeof AWARENESS_LEVELS)[number];

export const AWARENESS_LABEL: Record<AwarenessLevel, string> = {
  unaware: "No sabe que tiene el problema",
  problem_aware: "Siente el problema, no conoce soluciones",
  solution_aware: "Conoce soluciones, no la tuya",
  product_aware: "Conoce productos como el tuyo",
  most_aware: "Solo espera una buena oferta",
};

export const GENDER_LABEL = { female: "Mujer", male: "Hombre", any: "Cualquiera" } as const;

/** Rótulos en español de cada campo narrativo, en el orden en que se muestran. */
export const AVATAR_SECTIONS: { key: keyof CustomerAvatar; title: string; fields: [string, string][] }[] = [
  {
    key: "identity",
    title: "Identidad",
    fields: [
      ["current_identity", "Cómo se ve hoy"],
      ["desired_identity", "Quién quiere ser"],
      ["lifestyle", "Su día a día"],
    ],
  },
  {
    key: "problems",
    title: "Problemas",
    fields: [
      ["main_problem", "Problema principal"],
      ["underlying_problem", "Problema de fondo"],
      ["current_frustration", "Lo que lo frustra hoy"],
    ],
  },
  {
    key: "emotions",
    title: "Emociones",
    fields: [
      ["fears", "Miedos"],
      ["secret_desires", "Deseos que no dice"],
      ["core_motivation", "Lo que lo mueve"],
    ],
  },
  {
    key: "objections",
    title: "Objeciones",
    fields: [
      ["critical_question", "La pregunta que necesita resolver"],
      ["main_objection", "Objeción principal"],
      ["common_excuses", "Excusas"],
      ["cash_on_delivery_concerns", "Pago contra entrega"],
    ],
  },
  {
    key: "priorities",
    title: "Prioridades",
    fields: [
      ["primary_focus", "Lo que ocupa su cabeza"],
      ["secondary_priorities", "Otras prioridades"],
      ["immediate_outcome", "Lo que quiere ya"],
      ["long_term_outcome", "Lo que quiere a largo plazo"],
    ],
  },
  {
    key: "enemies",
    title: "Enemigos",
    fields: [
      ["external_enemy", "A quién culpa"],
      ["internal_enemy", "Lo que lo frena de sí mismo"],
    ],
  },
  {
    key: "vision",
    title: "Visión",
    fields: [
      ["future_vision", "Cómo se ve con el problema resuelto"],
      ["number_one", "Lo que más quiere"],
    ],
  },
];

// ---------------------------------------------------------------- Etiquetas de los packs
// Salen en la misma llamada que el cliente ideal (ya tiene la ficha, el precio y quién compra), pero
// se guardan y se aprueban aparte (pack_labels): aceptar una no obliga a revisar la otra.

/** Bump cuando cambie el prompt o el esquema de las etiquetas. */
export const PACK_LABELS_PROMPT_VERSION = 1;

export const PACK_LABEL_BASES = ["duration", "sharing", "spare", "gift", "savings", "other"] as const;

export const packLabelSchema = z.object({
  units: z.number().int().describe("Unidades del pack (1, 2 o 3), igual que en PRECIO Y OFERTA."),
  label: text.describe("El nombre del pack que lee el cliente, hasta 40 caracteres: «2 meses de uso», «Uno para ti y otro para tu pareja». Sin promesas de salud ni resultados."),
  support: maybe.describe("Línea de apoyo corta con una cifra real de PRECIO Y OFERTA («$17.495 al mes», «Ahorras $24.980»), o null."),
  badge: maybe.describe("Distintivo de 1 a 2 palabras solo para 1 pack («Más elegido», «Mejor precio»), o null."),
  basis: z.enum(PACK_LABEL_BASES).describe("En qué se apoya: duración real, compartir, repuesto, regalo, ahorro u otro."),
  reason: text.describe("Para el comerciante, en una frase: por qué esta etiqueta y de qué dato sale."),
});

export const packLabelsSchema = z.array(packLabelSchema).describe("Una etiqueta por pack de PRECIO Y OFERTA, en el mismo orden.");

export type PackLabel = z.infer<typeof packLabelSchema>;

/** Lo que devuelve el paso del cliente ideal: el perfil y, aparte, las etiquetas de los packs. */
export const avatarStepSchema = z.object({ avatar: customerAvatarSchema, pack_labels: packLabelsSchema });

/** “Otras etiquetas”: la llamada aparte, solo con las etiquetas. */
export const packLabelsOnlySchema = z.object({ pack_labels: packLabelsSchema });
