// Fechas y autores reales de las reseñas aprobadas, espejo del Liquid.
export const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
export const SHORT_MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export function wallAuthor(author: string | undefined): string { return author?.trim() || "Comprador"; }

/**
 * La fecha como la escribe Facebook: «13 de agosto» este año, «13 de agosto de 2025» antes; la
 * corta («13 ago 2025») es la de la tarjeta angosta. Vacías si la fecha no es YYYY-MM-DD.
 */
export function wallDate(iso: string | undefined, thisYear: string): { long: string; short: string } {
  const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return { long: "", short: "" };
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1) return { long: "", short: "" };
  const other = m[1] !== thisYear;
  return {
    long: `${day} de ${MONTHS[month - 1]}${other ? ` de ${m[1]}` : ""}`,
    short: `${day} ${SHORT_MONTHS[month - 1]}${other ? ` ${m[1]}` : ""}`,
  };
}
