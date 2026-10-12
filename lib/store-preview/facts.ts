// Los datos reales que la tienda pone en los componentes (reseñas, políticas, logística), tal como
// los ve la vista previa de la etapa Página del producto. Los textos de la IA traen tokens ({count},
// {min}…) que en la tienda se llenan con datos reales; aquí se llenan igual y, si el dato todavía
// no existe, con un ejemplo marcado como tal (nadie tiene que creer que es su dato). Puro.

export interface StoreReview {
  id: string;
  /** Anonimizado: «M***a». */
  author: string;
  rating: number;
  body: string;
  /** «ago 2026». */
  date?: string;
  /** La misma fecha como YYYY-MM-DD (la de dropflex.reviews): la usa el muro de testimonios. */
  iso?: string;
  photos: string[];
}

export interface StorePolicies {
  /** Siempre: la operación es con pago contra entrega. */
  cod: boolean;
  free_shipping: boolean;
  /** Monto desde el que el envío es gratis (unidades de la moneda). */
  threshold?: number;
  return_days?: number;
  warranty_months?: number;
  whatsapp?: string;
}

/**
 * Un pack de «Precio y packs»: en la tienda es la variante de 1 unidad × N (df-pack-offers), con el
 * precio que cobra la oferta por cantidad de EasySell. Tachado = (tachado de 1 unidad, o su precio)
 * × unidades, si es mayor. Los textos son las etiquetas de los packs aprobadas; sin ellas, «N unidades».
 */
export interface StorePack {
  units: number;
  price: number;
  compareAt?: number;
  label?: string;
  support?: string;
  badge?: string;
}

export interface StoreFacts {
  /** Solo cuando existe una lectura operativa real. Sin ella el preview indica que Shopify lo resuelve. */
  inventory?: { available: boolean; quantity?: number; management?: string | null; policy?: string };
  policyLinks?: { refund?: string; shipping?: string };
  /** Enlace de Google opcional; rating/count anteriores se conservan por compatibilidad, no se usan. */
  googleRating?: { rating: number; count: number; url: string };
  /** Archivo asociado por el comerciante en Shopify. El enlace no llega al preview público. */
  gift?: { title: string; cover?: string; ready: boolean };
  /** Hechos aprobados/verificados del producto, sin contradicciones activas. */
  verifiedFacts?: { id: string; statement: string }[];
  productName: string;
  productImage?: string;
  /** Portada y galería aprobadas, en el mismo orden que Shopify. */
  productImages?: string[];
  price: number;
  compareAt?: number;
  currency: string;
  /** Los packs con precio guardado; vacío o ausente sin «Precio y packs». */
  packs?: StorePack[];
  /** Las reseñas aprobadas, en su orden. */
  reviews: StoreReview[];
  /** Valoración agregada compartida y editable (1 decimal); null si no hay una nota guardada. */
  rating: number | null;
  count: number;
  policies: StorePolicies;
  /**
   * Días de entrega (preparación + tránsito; `max` es el de regiones si hay plazo de regiones); null
   * si la tienda todavía no los tiene. El resto es lo que la línea de tiempo necesita para las fechas.
   */
  logistics: {
    min: number;
    max: number;
    handling?: number;
    cutoff?: number | null;
    saturdayDispatch?: boolean;
    saturdayDelivery?: boolean;
    businessDaysOnly?: boolean;
    /** Ciudad del tránsito y días extra a regiones (Ajustes › Envíos). */
    city?: string | null;
    extra?: number;
  } | null;
  /** Los GIF elegidos en Imágenes (URLs firmadas), en su orden: el GIF N lleva el texto N de gif-strip. */
  gifs?: string[];
}

/** El tachado de un pack: lo que costarían sus unidades al precio de referencia, si es mayor. */
export function packCompareAt(
  units: number,
  price: number,
  unitPrice: number,
  unitCompareAt?: number | null,
): number | undefined {
  const ref = (unitCompareAt ?? unitPrice) * units;
  return ref > price ? ref : undefined;
}

/** Valores de ejemplo para lo que la tienda todavía no tiene (y lo que se simula: stock, reloj). */
export const EXAMPLE = {
  rating: 4.8,
  count: 124,
  min: 2,
  max: 5,
  return_days: 30,
  warranty_months: 6,
  threshold: 29990,
  qty: 3,
  time: "3 h 12 min",
  ship: "hoy",
} as const;

/**
 * Si la tienda muestra un ítem que afirma esa política (la tienda oculta lo que no está activo). Los
 * plazos de entrega todavía no se cargan en la app: se muestran con su ejemplo marcado, porque todas
 * las tiendas despachan. Lo demás (cambios, garantía, WhatsApp) se oculta si la tienda no lo tiene.
 */
export function policyActive(
  policy: string | undefined,
  facts: StoreFacts,
): boolean {
  const p = facts.policies;
  switch (policy) {
    case "cod":
      return p.cod;
    case "free_shipping":
      return p.free_shipping;
    case "returns":
      return (p.return_days ?? 0) > 0;
    case "warranty":
      return (p.warranty_months ?? 0) > 0;
    case "shipping_time":
      return (facts.logistics?.max ?? 0) > 0;
    case "delivery":
      return Boolean(facts.logistics);
    case "whatsapp":
      return Boolean(p.whatsapp);
    default:
      return true;
  }
}

/** Promedio con 1 decimal de las reseñas. */
export function averageRating(reviews: { rating: number }[]): number | null {
  if (!reviews.length) return null;
  return (
    Math.round(
      (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length) * 10,
    ) / 10
  );
}

/**
 * Con menos de 30 reseñas la cantidad sola («10 reseñas») se lee como poca: la proporción
 * («9 de cada 10 le dan 5 estrellas»), redondeada hacia abajo. "" si ninguna es verdad y convence
 * (el bloque usa su plantilla con {count}). Espejo de snippets/df-review-proof.liquid.
 */
export function reviewProof(reviews: { rating: number }[]): string {
  const n = reviews.length;
  if (n === 0 || n >= 30) return "";
  const five = reviews.filter((r) => r.rating >= 5).length;
  const positive = reviews.filter((r) => r.rating >= 4).length;
  const k5 = Math.floor((five * 10) / n);
  const kp = Math.floor((positive * 10) / n);
  if (five === n) return "todas sus reseñas son de 5 estrellas";
  if (k5 >= 7) return `${k5} de cada 10 le dan 5 estrellas`;
  if (positive === n) return "todas sus reseñas son de 4 o 5 estrellas";
  if (kp >= 8) return `${kp} de cada 10 le dan 4 o 5 estrellas`;
  return "";
}

const decimal = new Intl.NumberFormat("es-CL", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const integer = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 });

export function formatMoney(value: number, currency: string): string {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  })
    .format(value)
    .replace(/\s/g, "");
}

/** El valor de cada token y si es un ejemplo. */
export function tokenValues(
  facts: StoreFacts,
): Record<string, { value: string; example: boolean }> {
  const hasReviews = facts.rating != null;
  const p = facts.policies;
  return {
    rating: {
      value: decimal.format(hasReviews ? facts.rating! : EXAMPLE.rating),
      example: !hasReviews,
    },
    count: {
      value: integer.format(hasReviews ? facts.count : EXAMPLE.count),
      example: !hasReviews,
    },
    min: {
      value: String(facts.logistics?.min ?? EXAMPLE.min),
      example: !facts.logistics,
    },
    max: {
      value: String(facts.logistics?.max ?? EXAMPLE.max),
      example: !facts.logistics,
    },
    return_days: {
      value: String(p.return_days ?? EXAMPLE.return_days),
      example: p.return_days == null,
    },
    warranty_months: {
      value: String(p.warranty_months ?? EXAMPLE.warranty_months),
      example: p.warranty_months == null,
    },
    threshold: {
      value: formatMoney(p.threshold ?? EXAMPLE.threshold, facts.currency),
      example: p.threshold == null,
    },
    // Simulados: en la tienda salen del stock y del reloj de cada visita, no son un dato que falte.
    qty: { value: String(EXAMPLE.qty), example: false },
    time: { value: EXAMPLE.time, example: false },
    ship: { value: EXAMPLE.ship, example: false },
  };
}

/** Total vigente; «hoy» describe el texto del contador, no un filtro por fecha. */
export function reviewCountLabel(text: string): string {
  return text.replace(/(\d[\d.,]*\s+(?:reseñas?|opiniones|opinión))\b(?!\s+hoy\b)/gi, "$1 hoy");
}

/** El texto con sus tokens llenos. */
export function fill(text: string | undefined, facts: StoreFacts): string {
  if (!text) return "";
  const values = tokenValues(facts);
  return reviewCountLabel(text.replace(
    /\{([a-z_]+)\}/g,
    (m, k: string) => values[k]?.value ?? m,
  ));
}

/** Render de tienda: conserva el token sin dato para que el componente lo omita, igual que Liquid. */
export function fillAvailable(text: string | undefined, facts: StoreFacts): string {
  const values = tokenValues(facts);
  return (text ?? "").replace(/\{([a-z_]+)\}/g, (token, key: string) => {
    const value = values[key];
    if (!value || value.example) return token;
    if (key === "threshold" && !(facts.policies.threshold && facts.policies.threshold > 0)) return token;
    if (key === "return_days" && !(facts.policies.return_days && facts.policies.return_days > 0)) return token;
    if (key === "warranty_months" && !(facts.policies.warranty_months && facts.policies.warranty_months > 0)) return token;
    return value.value;
  });
}

/** FAQ y tabla comparativa aceptan políticas guardadas con 0; no sustituyen otros tokens. */
export function fillPolicyTokens(text: string | undefined, facts: StoreFacts): string {
  const values: Record<string, number | undefined> = {
    min: facts.logistics?.min,
    max: facts.logistics ? Math.max(facts.logistics.min, facts.logistics.max) : undefined,
    return_days: facts.policies.return_days,
    warranty_months: facts.policies.warranty_months,
  };
  return (text ?? "").replace(/\{([a-z_]+)\}/g, (token, key: string) =>
    values[key] != null ? String(values[key]) : token);
}

/**
 * Los tokens de un contenido que se llenan con un ejemplo (la tarjeta lo dice). `ignore`: tokens que
 * ese componente llena solo (en «Foto y razones», {count} es la cantidad de beneficios).
 */
export function exampleTokens(
  content: unknown,
  facts: StoreFacts,
  ignore: string[] = [],
): string[] {
  const values = tokenValues(facts);
  const found = new Set<string>();
  for (const m of JSON.stringify(content ?? "").matchAll(/\{([a-z_]+)\}/g))
    if (values[m[1]]?.example && !ignore.includes(m[1])) found.add(m[1]);
  return [...found];
}
