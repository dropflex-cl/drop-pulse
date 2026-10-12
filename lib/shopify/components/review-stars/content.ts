import * as z from "zod/v4";
import { PDP_RATING_MIN, PDP_RATING_MAX } from "@/lib/copy/pdp-rating";
import { defineComponent } from "../define";


export const reviewStars = defineComponent({
  id: "review-stars",
  name: "DropFlex · Estrellas",
  kind: "block",
  file: "blocks/df-review-stars.liquid",
  metafield: { namespace: "dropflex", key: "review_stars", type: "json" },
  media: [],
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

      .refine((s) => !s.includes("!"), { message: "label: sin signos de exclamación" })
      .describe("Texto editable junto a las estrellas. Los tokens {rating} y {count} son opcionales."),
    rating: z.number().min(PDP_RATING_MIN).max(PDP_RATING_MAX).optional().describe("Calificación agregada editable entre 4.4 y 4.9, compartida por toda la PDP, incluido Google. No requiere importación ni verificación."),
    count: z.number().int().nonnegative().optional().describe("Cantidad agregada editable y compartida por toda la PDP. No requiere reseñas importadas."),
  }),
  realData: [
    "rating y count son la fuente editable común de Google, Estrellas, Hero y cifras, muro, UGC, FAQ y prueba social. Se guardan con save_landing_content en review-stars. El resumen importado y los campos antiguos de Hero son respaldos opcionales.",
    "Cada ángulo/hook conserva su valoración. Un label sin tokens puede mostrarse sin cifras. No requiere conexión con Google, reseñas importadas ni evidencia.",
  ],
  rules: [
    "La valoración agregada debe estar entre 4,4 y 4,9, inclusive. Se muestra con un decimal.",
    "Desarrolla el texto solicitado. Puedes aportar rating y count o reutilizar el resumen disponible.",
    "≤ 40 caracteres con los tokens, tono neutro, sin exclamaciones, sin emojis.",
  ],
  forbidden: [],
  examples: [
    { label: "{rating} · {count} reseñas" },
    { label: "{count} opiniones de compradores" },
  ],
});
