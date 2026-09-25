import * as z from "zod/v4";
import { defineComponent } from "../define";

const TOKENS = /\{(count|rating)\}/g;

export const reviewStars = defineComponent({
  id: "review-stars",
  name: "DropFlex · Estrellas",
  kind: "block",
  file: "blocks/df-review-stars.liquid",
  metafield: { namespace: "dropflex", key: "review_stars", type: "json" },
  media: [],
  minReviews: 3,
  placement: "Columna del producto, sobre el título: es lo primero que se lee de la ficha y colorea la lectura del nombre y del precio que vienen debajo.",
  objection: "¿Es confiable? ¿Alguien más lo compró y le fue bien? Clave en pago contra entrega, donde el comprador llega desde un anuncio y no conoce la tienda.",
  levers: [
    "Prueba social: otros compradores ya lo evaluaron.",
    "Fluidez: cinco estrellas se entienden sin leer.",
    "Efecto halo: la calificación tiñe la percepción del título y el precio que siguen.",
    "Invitación a verificar: el clic lleva a las reseñas; la transparencia misma da confianza.",
    "Imperfección creíble: un 4,6 real convence más que un 5,0 (el perfecto despierta sospecha).",
  ],
  content: z.object({
    label: z
      .string()
      .min(6)
      .max(40)
      .includes("{count}")
      .refine((s) => !/\d/.test(s.replaceAll(TOKENS, "")), { message: "label: la cantidad y la nota van como {count} y {rating}, nunca escritas" })
      .refine((s) => !s.includes("!"), { message: "label: sin signos de exclamación" })
      .describe("Plantilla del texto junto a las estrellas: [{rating} opcional] + {count} + sustantivo concreto de comprador. Ej.: «{rating} · {count} reseñas» o «{count} opiniones de compradores». Sin adjetivos ni superlativos."),
  }),
  realData: [
    "Calificación y cantidad: product.metafields.dropflex.review_summary ({ rating, count }) calculado por la app sobre las reseñas APROBADAS; nunca la IA ni el editor.",
    "Origen visible: review_summary.source_label (p. ej. «Reseñas de compradores del mismo producto en AliExpress»).",
    "Bajo el mínimo de reseñas del bloque (3 por defecto) no se muestra nada.",
    "Con menos de 30 reseñas, si la proporción convence, la tienda reemplaza la plantilla por «{rating} · 9 de cada 10 le dan 5 estrellas» (de review_summary.five/positive).",
  ],
  rules: [
    "Fórmula: [{rating} ·] {count} + sustantivo concreto: «reseñas», «opiniones», «reseñas de compradores».",
    "≤ 40 caracteres con los tokens, tono neutro, sin exclamaciones, sin emojis.",
    "{count} es obligatorio: sin él la tienda descarta la plantilla y usa «{rating} · {count} reseñas».",
    "Las reseñas vienen de compradores del producto en AliExpress: «compradores», no «nuestros clientes».",
  ],
  forbidden: [
    "Escribir cualquier número: cantidad y nota son tokens.",
    "«Miles de clientes felices», «100 % satisfechos», «el más vendido» y superlativos sin respaldo (Ley 19.496, art. 28).",
    "«Clientes de nuestra tienda» o «compras verificadas en la tienda» con reseñas importadas del proveedor (FTC 16 CFR 465).",
  ],
  examples: [
    { label: "{rating} · {count} reseñas" },
    { label: "{count} opiniones de compradores" },
  ],
});
