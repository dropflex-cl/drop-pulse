import * as z from "zod/v4";

// Salidas estructuradas del pipeline "Optimizar con IA" (primera parte: ficha + cliente ideal).
// Las claves van en inglés (modelo de datos); los valores, en el idioma del mercado.
// Módulo puro: lo usan el pipeline (validar la salida del modelo), la API (validar lo que edita el
// comerciante) y la UI (tipos).

/** Bump cuando cambie el prompt o el esquema de la ficha. */
export const PRODUCT_BRIEF_PROMPT_VERSION = 9;
/** Bump cuando cambie el prompt o el esquema del cliente ideal. 6: la pregunta del experto, sin perfil narrativo (spec-prompts-simples §14). */
export const CUSTOMER_AVATAR_PROMPT_VERSION = 6;

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
    gender: z
      .enum(["female", "male", "any"])
      .nullable()
      .describe("female o male solo si un dato lo sostiene: el producto es para el cuerpo de un solo sexo, o las reseñas o el comerciante lo dicen. Una modelo en las fotos o la categoría («belleza», «cuidado personal») no bastan. Si lo usan ambos, any."),
    life_stage_or_role: maybe.describe("Etapa de vida o rol que se reconoce en una línea (oficinista, mamá o papá, dueño de perro senior…)."),
    where_they_feel_it: maybe.describe("En qué momento o lugar concreto sienten el problema."),
  }),
  alternatives_already_tried: z.array(text).describe("Lo que el comprador suele usar hoy y le falla (categorías o prácticas, nunca marcas)."),
  differentiator: z
    .object({
      versus: text.describe("Contra qué se diferencia: lo que el cliente usa hoy y no le resuelve el problema (categoría o práctica, nunca marca). Ej.: «fajas rígidas que aprietan y se dejan de usar a la semana»."),
      claim: text.describe("La diferencia en una frase: el problema que resuelve y por qué lo resuelve donde lo que usa hoy falla, sostenida con la información. Es la solución, no un complemento de lo que ya usa. Ej.: «endereza la espalda con tirantes elásticos que se usan bajo la ropa todo el día, donde la faja rígida incomoda y queda en el cajón»."),
      basis: text.describe("De qué dato sale (how_it_works, key_facts, modo de uso…)."),
    })
    .nullable()
    .describe("En qué se diferencia el producto de lo que el cliente ya usa. null si con la información no se sostiene ninguna diferencia real (y entonces va primero en missing_inputs)."),
  price: z.number().nullable().describe("Precio de venta de PRECIO Y OFERTA, en la moneda del mercado."),
  unit_cost: z.number().nullable().describe("Precio de compra al proveedor de PRECIO Y OFERTA."),
  bundle_options: z.array(text).describe("Los packs de PRECIO Y OFERTA, uno por línea, p. ej. «2 unidades: $47.990 ($23.995 c/u, ahorra $9.990)»; más cualquier otra oferta que el comerciante mencione (kit, regalo)."),
  real_deadline_or_event: maybe.describe("Fecha comercial real que el comerciante mencionó, o null."),
  proof: z.object({
    real_reviews: z.array(text).describe("Solo reseñas que el comerciante pegó o que vienen en RESEÑAS REALES, copiadas textuales. Nunca redactadas."),
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

/** El diferenciador del producto (propuesto en la ficha, confirmado por el comerciante en `products.differentiator`). */
export const differentiatorSchema = z.object({
  versus: z.string().trim().min(3).max(120),
  claim: z.string().trim().min(10).max(280),
  basis: z.string().trim().max(280).default(""),
});
export type Differentiator = z.infer<typeof differentiatorSchema>;

// ---------------------------------------------------------------- Cliente ideal
// Desde la versión 6 (docs/spec-prompts-simples.md §14) es lo que contesta un experto a «¿quién compra
// este producto, quién lo usa y por qué?»: personas y motivos, sin nombre, escenas ni frases inventadas.
// El perfil de antes (la fórmula de dropflex base, los momentos detonantes y «cómo lo dice») llegaba a
// los ángulos, los ganchos y la página, que copiaban sus escenas y sus frases textuales: el chat, sin
// cliente ideal, escribía mejores ganchos (audífono, 2026-10-04).

export const customerAvatarSchema = z.object({
  summary: text.describe("Quién compra y, si es otra persona, quién lo usa, en una frase y sin escenas: «Hijas e hijos de 40 a 55 que se lo compran a su papá o mamá que ya no escucha bien»."),
  buyer: text.describe("Quién compra: edad, para quién y por qué es quien paga."),
  user: text.describe("Quién lo usa, si no es quien compra; vacío si es la misma persona."),
  age_range: text.describe("La edad de quien compra («40-55»)."),
  why_buy: text.describe("Por qué lo compraría, en 1 o 2 frases."),
  doubts: z.array(text).describe("2 a 4 dudas que lo frenan, también las de comprarle a una tienda que no conoce."),
  cash_on_delivery: text.describe("Cómo lo calma el pago contra entrega, en una frase."),
  more_than_one: text.describe("Por qué llevaría más de una unidad (regalar, la pareja, repuesto, uso diario), o vacío si no hay un motivo real."),
});

export type CustomerAvatar = z.infer<typeof customerAvatarSchema>;

/** Un perfil de antes de la versión 6, con lo que se sigue leyendo. */
interface LegacyAvatar {
  summary?: string;
  demographics?: { age_range?: string };
  problems?: { main_problem?: string };
  emotions?: { core_motivation?: string };
  objections?: { critical_question?: string; main_objection?: string; cash_on_delivery_concerns?: string };
}

/**
 * El cliente ideal guardado, de cualquier versión. Los perfiles de antes (con fórmula, momentos y frases)
 * se leen con lo que sirve: su resumen, su edad, lo que lo mueve y sus dudas. Su resumen todavía puede
 * traer una escena: «Volver a generar» lo reemplaza por uno nuevo.
 */
export function readAvatar(payload: unknown): CustomerAvatar {
  const parsed = customerAvatarSchema.safeParse(payload);
  if (parsed.success) return parsed.data;
  const p = (payload ?? {}) as LegacyAvatar;
  const o = p.objections ?? {};
  const summary = p.summary?.trim() ?? "";
  return {
    summary,
    buyer: summary,
    user: "",
    age_range: p.demographics?.age_range?.trim() ?? "",
    why_buy: (p.emotions?.core_motivation || p.problems?.main_problem || "").trim(),
    doubts: [o.main_objection, o.critical_question].map((t) => t?.trim() ?? "").filter(Boolean),
    cash_on_delivery: o.cash_on_delivery_concerns?.trim() ?? "",
    more_than_one: "",
  };
}

// ---------------------------------------------------------------- Etiquetas de los packs
// Salen en la misma llamada que el cliente ideal (ya tiene la ficha, el precio y quién compra), pero
// se guardan y se aprueban aparte (pack_labels): aceptar una no obliga a revisar la otra.

/** Bump cuando cambie el prompt o el esquema de las etiquetas. 2: el contexto en texto corto (sin la ficha ni el cliente ideal en JSON). */
export const PACK_LABELS_PROMPT_VERSION = 2;

export const PACK_LABEL_BASES = ["duration", "sharing", "spare", "gift", "savings", "other"] as const;

export const packLabelSchema = z.object({
  units: z.number().int().describe("Unidades del pack (1, 2 o 3), igual que en PRECIO Y OFERTA."),
  label: text.describe("El nombre del pack que lee el cliente, idealmente hasta 40 caracteres (cuéntalos; si pasa, acórtalo tú en vez de dejarlo a medias): «2 meses de uso», «Uno para ti y otro para tu pareja». Sin promesas de salud ni resultados."),
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
