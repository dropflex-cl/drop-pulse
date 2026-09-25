// Contrato de un componente de conversión del tema (lib/shopify/components/<id>/).
//
// Cada componente declara aquí lo que la app necesita saber sin leer Liquid: qué archivo del tema
// lo dibuja, en qué metafield del producto lee su contenido, qué escribe la IA (esquema zod, que
// es a la vez la salida estructurada del prompt y la validación), qué datos NUNCA escribe la IA
// y la psicología de venta que guía el copy. Puro: sin I/O ni dependencias de servidor.

import type * as z from "zod/v4";

/** Íconos de contenido de snippets/df-icon.liquid. La IA elige una clave; nunca escribe SVG. */
export const ICON_KEYS = [
  "check", "check-circle", "x-circle", "truck", "package", "home", "cart", "cash", "shield", "lock",
  "return", "clock", "calendar", "star", "heart", "sparkles", "bolt", "leaf", "droplet", "sun",
  "moon", "battery", "feather", "ruler", "target", "thumbs-up", "users", "chat", "gift", "fire",
  "eye", "hand", "globe", "award", "phone", "headset", "flag",
] as const;
export type IconKey = (typeof ICON_KEYS)[number];

/** Íconos de controles (flechas, reproducir, cerrar). Los usa el Liquid; la IA no los elige. */
export const UI_ICON_KEYS = [
  "chevron-left", "chevron-right", "arrow-right", "x", "minus", "play", "pause", "volume", "volume-off",
] as const;

/**
 * Metafields de DATOS REALES que publica la app (nunca la IA) y que varios componentes leen.
 * Son compartidos: ningún componente los declara como propios.
 */
export const SHARED_METAFIELDS = {
  /** Producto · color (#rrggbb). products.page_accent_color. */
  accent: { owner: "product", namespace: "dropflex", key: "accent", type: "color" },
  /**
   * Producto · json. Resumen de las reseñas APROBADAS (product_reviews):
   * { rating: number (1 decimal), count: number, five: number (de 5★), positive: number (de 4★ o más) }
   * La tienda no muestra el origen de las reseñas (decisión del comerciante, 2026-09-24).
   */
  reviewSummary: { owner: "product", namespace: "dropflex", key: "review_summary", type: "json" },
  /**
   * Producto · json. Reseñas APROBADAS, texto tal cual (o el editado por el comerciante):
   * { items: Array<{ id: string, author: string (enmascarado «M***a»), rating: 1..5, body: string,
   *   date: "YYYY-MM-DD", country?: string, image_from: number, image_count: number }> }
   * Las fotos de la reseña i son reviews_images[image_from … image_from + image_count - 1].
   */
  reviews: { owner: "product", namespace: "dropflex", key: "reviews", type: "json" },
  /** Producto · list.file_reference. Fotos de las reseñas, planas, en el orden de `reviews`. */
  reviewsImages: { owner: "product", namespace: "dropflex", key: "reviews_images", type: "list.file_reference" },
  /**
   * Tienda · json. Logística real:
   * { handling_days, transit_days_min, transit_days_max, cutoff_hour (0-23), timezone (IANA),
   *   business_days_only: boolean, saturday_delivery: boolean, saturday_dispatch: boolean,
   *   holidays: string[] ("YYYY-MM-DD"),
   *   main_city?: string, main_city_transit_max?: number, regions_extra_days?: number }
   * Con plazo de regiones, transit_days_max es el de regiones (todo «llega en {min} a {max} días»
   * es verdad en el país) y la línea de tiempo separa main_city (su máximo) del resto (+extra).
   */
  logistics: { owner: "shop", namespace: "dropflex", key: "logistics", type: "json" },
  /**
   * Tienda · json. Políticas reales (merchant_settings):
   * { cod: boolean, free_shipping: boolean, free_shipping_threshold?: number, return_days?: number,
   *   warranty_months?: number, whatsapp?: string, locale?: string («es-CL», el idioma del mercado) }
   * free_shipping_threshold va en unidades de la moneda (29990 = $29.990); el Liquid lo multiplica
   * por 100 para el filtro money, que siempre trabaja en centavos (también en CLP).
   * Un beneficio que menciona una política ausente o falsa no se publica.
   */
  policies: { owner: "shop", namespace: "dropflex", key: "policies", type: "json" },
  /**
   * Producto · single_line_text_field. La bajada bajo el título de la ficha: `short_description`
   * de la ficha aprobada (lib/copy/listing.ts). Lo lee `df-subtitle` (_landing).
   */
  subtitle: { owner: "product", namespace: "dropflex", key: "subtitle", type: "single_line_text_field" },
  /**
   * Producto · json. La oferta de la ficha: `offer_line` de la ficha aprobada y las etiquetas
   * aprobadas de los packs (pack_labels), en el orden de las variantes del producto:
   * { offer_line?: string, packs: Array<{ units: number, label: string, support?: string, badge?: string }> }
   * Cada pack es una VARIANTE del producto (1, 2 y 3 unidades) con su precio y su precio tachado
   * reales; el metafield solo lleva textos. Lo lee `df-pack-offers` (_landing).
   */
  offer: { owner: "product", namespace: "dropflex", key: "offer", type: "json" },
  /**
   * Producto · json. Eventos (Cyber, Black Friday, Navidad…) que le tocan al producto, con su
   * ventana en segundos Unix y las capas que enciende su intensidad (lib/events/resolve.ts ›
   * EventMetafield): { events: Array<{ slug, kind, name, from, start, to, intensity, announcement,
   * surface, on_surface, badge_label, accent?, on_accent?, countdown_before?, countdown_during?,
   * decor?, subtitle? }> }, ordenados por prioridad. La tienda muestra el primero que está dentro de
   * su ventana (_event/snippets/df-event-*.liquid). Nunca lleva descuentos: el % sale del precio real.
   */
  event: { owner: "product", namespace: "dropflex", key: "event", type: "json" },
} as const;

export type ComponentKind = "block" | "section";

/** Metafield de producto que lleva archivos (imágenes, videos) aparte del texto. */
export interface MediaMetafield {
  key: string;
  type: "file_reference" | "list.file_reference";
  /** De dónde salen los archivos en DropFlex (nunca de la IA). */
  source: string;
}

/**
 * Espacio de imagen que el comerciante llena eligiendo del catálogo del producto (fotos de
 * Información base e imágenes de la etapa Imágenes). La IA nunca elige ni describe imágenes.
 */
export interface ImageSlot {
  key: string;
  /** Nombre en la pantalla («Foto central»). */
  label: string;
  /** Mínimo para que el componente se vea bien; 0 = el Liquid tiene respaldo (la foto del producto). */
  min: number;
  max: number;
  ratio: "1:1" | "3:4" | "9:16";
  /** Qué foto conviene, en una línea para el comerciante. */
  hint: string;
}

export interface ConversionComponent<C extends z.ZodType = z.ZodType> {
  /** Id estable: carpeta en lib/shopify/components y sufijo del archivo (df-<id>). */
  id: string;
  /** Nombre visible en el editor de temas (≤ 25 caracteres, lo exige Shopify). */
  name: string;
  kind: ComponentKind;
  /** Archivo principal dentro del tema. */
  file: `blocks/df-${string}.liquid` | `sections/df-${string}.liquid`;
  /** Metafield json con el contenido que escribe la IA; null si el componente no tiene texto propio. */
  metafield: { namespace: "dropflex"; key: string; type: "json" } | null;
  media: MediaMetafield[];
  /** Imágenes que se eligen en la etapa Página del producto (Publicar las sube a Shopify Files). */
  imageSlots?: ImageSlot[];
  /**
   * Reseñas aprobadas que necesita para existir: sin ellas no se escribe (la IA elegiría reseñas
   * que no hay) ni se puede usar en la página. Igual al ajuste min_reviews de su Liquid.
   */
  minReviews?: number;
  /** Dónde va en la página y por qué ahí. */
  placement: string;
  /** Duda u objeción del comprador que responde. */
  objection: string;
  /** Palancas psicológicas y por qué funcionan. */
  levers: string[];
  /** Lo que escribe la IA. Límites y cantidades aquí son los mismos del prompt y del editor. */
  content: C;
  /** Datos que salen de hechos reales (inventario, reseñas, logística, políticas), nunca de la IA. */
  realData: string[];
  /** Reglas del copy para el prompt: fórmula por campo, tono, largos. */
  rules: string[];
  /** Lo prohibido (legal y ético: Ley 19.496, reseñas falsas, salud, escasez inventada). */
  forbidden: string[];
  /** Salidas de ejemplo, en español neutro con tuteo. El test exige que pasen `content`. */
  examples: z.infer<C>[];
}

export function defineComponent<C extends z.ZodType>(component: ConversionComponent<C>): ConversionComponent<C> {
  return component;
}
