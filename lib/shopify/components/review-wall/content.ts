import * as z from "zod/v4";
import { defineComponent } from "../define";
import { reviewItem } from "../_shared/review-content";


export const reviewWall = defineComponent({
  id: "review-wall",
  name: "DropFlex · Testimonios",
  kind: "section",
  file: "sections/df-review-wall.liquid",
  metafield: { namespace: "dropflex", key: "review_wall", type: "json" },
  media: [],
  placement: "Cuerpo de la landing, después de las historias: un muro de reseñas dibujadas como publicaciones de Facebook, dos por fila en el teléfono para que la prueba no se vuelva un scroll eterno.",
  objection: "¿A gente como yo le llegó y le sirvió? ¿Las fotos del anuncio son reales o el producto llega distinto?",
  levers: [
    "Formato de red social: un comprador lee el pantallazo de una publicación como la palabra de otro comprador; una tarjeta de reseña, como marketing de la tienda.",
    "Volumen visible: seis publicaciones con foto en una pantalla dicen «muchos lo compraron» sin escribir una cifra.",
    "Foto real del producto recibido, en la casa de alguien: responde «¿llega como en el anuncio?».",
    "Texto completo con las palabras del autor, sin resumir: la imperfección (una de 4 estrellas, un «al principio incomoda») sube la credibilidad del conjunto.",
  ],
  content: z.object({
    heading: z
      .string()
      .min(8)
      .max(48)

      .describe("Título sobre el muro, editable. Ej.: «Fotos de quienes ya lo recibieron» o «{count} compradores ya lo tienen»."),
    items: z
      .array(
        reviewItem,
      )
      .min(1)
      .max(12)
      .refine((items) => { const ids = items.flatMap(i => i.review_id ? [i.review_id] : []); return new Set(ids).size === ids.length; }, { message: "No repitas una reseña." })
      .describe("De 1 a 12 textos propios o reseñas reutilizadas, en el orden del muro."),
  }),
  realData: [
    "Cada item permite body, name y rating propios. review_id es opcional para reutilizar una reseña importada.",
    "Fotos: product.metafields.dropflex.reviews_images (hasta 3 por publicación).",
    "Calificación sobre el muro: product.metafields.dropflex.review_summary (rating, count; con pocas reseñas, la proporción de 5 estrellas).",
    "Nombre: name del contenido propio o el autor de la reseña reutilizada.",
  ],
  rules: [
    "Desarrolla los textos solicitados con body; nombre y calificación son opcionales. No requiere evidencia ni fotos para mostrarse.",
    "Al reutilizar una reseña, review_id recupera su texto, autor, fecha y fotos.",
    "Si hay suficientes, no repetir las que elegiste para review-slider: son dos lugares de la misma página.",
  ],
  forbidden: [],
  examples: [
    {
      heading: "Fotos de quienes ya lo recibieron",
      items: [{ review_id: "rv_8812" }, { review_id: "rv_8840" }, { review_id: "rv_1244" }, { review_id: "r_1042" }, { review_id: "rv_8903" }, { review_id: "rv_1201" }],
    },
    {
      heading: "{count} compradores ya lo tienen",
      items: [{ review_id: "rv_1201" }, { review_id: "rv_8903" }, { review_id: "rv_8812" }, { review_id: "rv_8840" }],
    },
  ],
});
