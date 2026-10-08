/** Apoyos comerciales automáticos; cada render conserva sus requisitos de datos reales. */
export const DEFAULT_CONVERSION_SUPPORTS = ["review-stars", "benefit-usps", "inventory", "shipping-timeline", "benefit-double-box", "review-slider", "review-wall", "gif-strip", "ugc-slider", "scrolling-benefits"] as const;
export function conversionSupportState(disabled: string[] = []) {
  return { schema_version: "1.0", disabled_components: [...new Set(disabled)].filter(id =>
    (DEFAULT_CONVERSION_SUPPORTS as readonly string[]).includes(id)).sort() };
}
