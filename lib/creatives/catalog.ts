// Las 8 familias de estáticos (agentes-creativos/generador-estaticos.md) y cómo se renderizan con
// Higgsfield (docs/spec-creativos.md §2.4, §3.2 y decisiones 3–7). Puro: lo usan el prompt del
// generador, el armado del render, la pantalla y los tests.

export const FAMILIES = ["offer", "before_after", "explainer", "headline", "native", "letter", "proof", "hero"] as const;
export type Family = (typeof FAMILIES)[number];

export interface FamilyDef {
  key: Family;
  /** Nombre en la pantalla. */
  name: string;
  /** Qué es y qué palanca usa (prompt). */
  gist: string;
  /**
   * Grupos de presets de Marketing Studio que le calzan; vacío = edición directa, sin preset. Las
   * familias que dependen de la escena van sin preset: con uno, Flare se queda con la composición
   * del preset y no con la idea (spec §7.4).
   */
  presetGroups: string[];
}

export const FAMILY_DEFS: Record<Family, FamilyDef> = {
  offer: { key: "offer", name: "Oferta y pack", gist: "El pack o el precio es el mensaje (aversión a la pérdida, ancla).", presetGroups: ["Hero Spotlight"] },
  before_after: { key: "before_after", name: "Problema → solución", gist: "Dos estados que se ven: la alternativa que no alcanza y el producto resolviéndolo. Sin cuerpos ni personas.", presetGroups: [] },
  explainer: { key: "explainer", name: "Explicativo", gist: "El producto con callouts que apuntan a sus partes visibles y explican por qué funciona (fluidez causal).", presetGroups: [] },
  headline: { key: "headline", name: "Titular", gist: "Tipografía grande que filtra al grupo o elimina el riesgo (efecto cóctel).", presetGroups: ["Hero Spotlight"] },
  native: { key: "native", name: "Foto nativa", gist: "Escena casera y cotidiana, sin diseño; parece un post, no un anuncio.", presetGroups: [] },
  letter: { key: "letter", name: "Nota", gist: "Una nota o carta breve junto al producto; se lee entera.", presetGroups: [] },
  proof: { key: "proof", name: "Comparativa", gist: "Tabla ✓/✗ contra una práctica o categoría (nunca una marca).", presetGroups: ["Compare & Switch"] },
  hero: { key: "hero", name: "Producto hero", gist: "El producto como protagonista, con uno o dos textos. Deseo estético.", presetGroups: ["Hero Spotlight"] },
};

/** Rol de cada texto horneado en la pieza. */
export const TEXT_ROLES = ["headline", "subheadline", "callout", "badge", "table_header", "table_row", "note"] as const;
export type TextRole = (typeof TEXT_ROLES)[number];

/**
 * Largo máximo por rol, en caracteres: el titular en 2 a 6 palabras, el subtítulo y la fila de tabla
 * en una frase corta, y el resto en UNA línea. Más
 * largo, el modelo lo corta mal («Luz LED que se enciende al / funcionar»).
 */
export const ROLE_LIMITS: Record<TextRole, number> = { headline: 45, subheadline: 40, callout: 32, badge: 32, table_header: 32, table_row: 40, note: 32 };
export const HEADLINE_MAX_WORDS = 6;

/** Máximo de textos por pieza: pocos se leen en el feed; la comparativa y la oferta necesitan más. */
export function maxTexts(family: Family): number {
  return family === "proof" || family === "offer" ? 7 : 5;
}

export const RATIOS = ["1:1", "9:16"] as const;
export type Ratio = (typeof RATIOS)[number];

/** Render de estáticos (decisiones 4 y 5): Marketing Studio 2.5 Flare, 1k, calidad baja. */
export const RENDER = {
  endpoint: "marketing-studio/image/flare",
  resolution: "1k",
  quality: "low",
} as const;

/**
 * USD por imagen, cota conservadora: Flare cobra por tokens y la API no devuelve el costo. En F0,
 * Flare en calidad alta costó $0,10; en baja, menos (spec §7.2).
 */
export const IMAGE_COST_USD = 0.1;

/**
 * Conceptos por corrida: 6, repartidos entre los ángulos de testeo (2 por ángulo con 3 ángulos, 3 con
 * 2), cada uno en su propio conjunto de anuncios. Sin concepto de retargeting: la oferta va como capa.
 */
export const CONCEPTS_PER_RUN = 6;

/** Cuántos conceptos le tocan a cada ángulo. */
export const conceptsPerAngle = (angles: number) => Math.floor(CONCEPTS_PER_RUN / Math.max(1, angles));

/** Presets que no sirven para un producto sin reseñas reales (Social Proof pide cifras y testimonios). */
export const PROOF_GROUP = "Social Proof";

// ---------------------------------------------------------------- Chat de WhatsApp (lib/creatives/chat.ts)

/**
 * El chat de WhatsApp no es una familia del generador (no lo propone solo): el comerciante lo pide por
 * ángulo y se guarda como un concepto más, con su conversación en vez de textos.
 */
export const CHAT_FAMILY = "whatsapp_chat" as const;
export type ConceptFamily = Family | typeof CHAT_FAMILY;

export const conceptFamilyName = (family: ConceptFamily): string =>
  (family === CHAT_FAMILY ? "Chat de WhatsApp" : (FAMILY_DEFS[family]?.name ?? family));

/**
 * Las proporciones que se generan de cada concepto, la primera es la principal. El chat es una captura
 * del teléfono: sale solo en 9:16 (un 1:1 corta la conversación). En el feed Meta lo recorta a 4:5 por
 * el centro, así que el render deja los mensajes en esa zona.
 */
export function conceptRatios(family: ConceptFamily): readonly Ratio[] {
  return family === CHAT_FAMILY ? ["9:16"] : RATIOS;
}
