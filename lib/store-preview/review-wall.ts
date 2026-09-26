// Lo que sections/df-review-wall.liquid calcula para cada publicación (nombre al azar, fecha como
// Facebook, contadores decorativos), para que la vista previa muestre lo mismo que la tienda. Las
// listas son copia de las del Liquid: el test (review-wall.test.ts) exige que sean iguales. Puro.

export const WOMEN = [
  "María", "Camila", "Valentina", "Daniela", "Fernanda", "Javiera", "Catalina", "Constanza", "Francisca", "Sofía",
  "Isidora", "Antonia", "Paula", "Carolina", "Andrea", "Natalia", "Gabriela", "Paola", "Claudia", "Lorena",
  "Patricia", "Verónica", "Macarena", "Bárbara", "Karina", "Pamela", "Alejandra", "Marcela", "Carla", "Tamara",
  "Nicole", "Josefa", "Florencia", "Martina", "Agustina", "Trinidad", "Emilia", "Ignacia", "Rocío", "Lucía",
  "Elena", "Sandra", "Mónica", "Cecilia", "Soledad", "Ximena", "Viviana", "Romina", "Belén", "Ana",
];
export const MEN = [
  "Juan", "José", "Carlos", "Luis", "Jorge", "Diego", "Felipe", "Sebastián", "Matías", "Nicolás",
  "Tomás", "Benjamín", "Cristóbal", "Ignacio", "Francisco", "Rodrigo", "Gonzalo", "Andrés", "Pablo", "Javier",
  "Álvaro", "Eduardo", "Ricardo", "Fernando", "Manuel", "Alejandro", "Daniel", "Marcelo", "Mauricio", "Claudio",
  "Patricio", "Cristián", "Héctor", "Raúl", "Sergio", "Víctor", "Hernán", "Óscar", "Gustavo", "Martín",
  "Joaquín", "Vicente", "Agustín", "Maximiliano", "Esteban", "Rafael", "Samuel", "Gabriel", "Emilio", "Pedro",
];
export const INITIALS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "L", "M", "N", "O", "P", "R", "S", "T", "V", "Z"];
/** Palabras que delatan quién escribe: con ellas, el nombre sale de esa lista. */
export const FEM_MARKS = [" encantada ", " contenta ", " satisfecha ", " enamorada ", " sorprendida ", " agradecida ", " cansada ", " embarazada ", " mi esposo ", " mi marido ", " mi novio "];
export const MASC_MARKS = [" encantado ", " contento ", " satisfecho ", " enamorado ", " sorprendido ", " agradecido ", " cansado ", " mi esposa ", " mi señora ", " mi mujer ", " mi novia "];
export const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
export const SHORT_MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** La semilla del Liquid: product.id módulo 9973. La vista previa no tiene id de Shopify: usa 0. */
export const wallSeed = (productId?: number) => (productId ? productId % 9973 : 0);

/**
 * El nombre al azar de la reseña `ri` (su posición en dropflex.reviews): un nombre de pila de la
 * lista que calza con el texto y una inicial, siempre el mismo para esa reseña y ese producto.
 *
 * @example
 * wallAuthor("Quedé encantada, llegó rápido.", 0, 0) // → "María A."
 */
export function wallAuthor(body: string, ri: number, seed: number): string {
  const text = ` ${body.toLowerCase().replace(/[.,!¡?¿;:()"\n\r]/g, " ")} `;
  let gender = FEM_MARKS.some((m) => text.includes(m)) ? "f" : MASC_MARKS.some((m) => text.includes(m)) ? "m" : "";
  if (!gender) gender = (seed + ri) % 2 === 0 ? "f" : "m";
  const name = (gender === "f" ? WOMEN : MEN)[(ri * 37 + seed) % 50];
  return `${name} ${INITIALS[(ri * 7 + seed) % INITIALS.length]}.`;
}

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

/**
 * Reacciones (320 a 1.600, «1,2 mil» como Facebook) y comentarios (8 a 46) de la reseña `ri`.
 *
 * @example
 * wallCounters(0, 0) // → { reactions: "320", comments: 8 }
 */
export function wallCounters(ri: number, seed: number): { reactions: string; comments: number } {
  const reactions = ((ri * 389 + seed) % 1281) + 320;
  const comments = ((ri * 17 + seed) % 39) + 8;
  if (reactions < 1000) return { reactions: String(reactions), comments };
  const tenths = Math.floor(reactions / 100);
  const dec = tenths % 10;
  return { reactions: `${Math.floor(tenths / 10)}${dec ? `,${dec}` : ""} mil`, comments };
}
