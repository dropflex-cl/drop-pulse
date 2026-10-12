import * as z from "zod/v4";
import { defineComponent } from "../define";
import { reviewFields } from "../_shared/review-content";


export const reviewSlider = defineComponent({
  id: "review-slider",
  name: "DropFlex · Reseñas",
  kind: "block",
  file: "blocks/df-review-slider.liquid",
  metafield: { namespace: "dropflex", key: "review_slider", type: "json" },
  media: [],
  placement: "Columna del producto, justo bajo el botón de compra: la voz de otro comprador aparece en el instante de la duda final, en muy poco alto (una reseña a la vez).",
  objection: "¿Y si no es como en las fotos, llega mal o es de mala calidad? En pago contra entrega: ¿vale la pena comprometerme a recibirlo y pagarlo?",
  levers: [
    "Prueba social de pares: primera persona, más creíble que la voz de la marca.",
    "Especificidad: nombre enmascarado, estrellas y un detalle concreto («la talla M me quedó justa»).",
    "Autenticidad: foto real del producto recibido, no un retrato de stock.",
    "Rotación: varias voces desfilan sin que el comprador haga nada («muchos lo aprueban»).",
    "Imperfección creíble: una reseña de 4 estrellas entre las de 5 sube la credibilidad del conjunto.",
  ],
  content: z.object({
    heading: z
      .string()
      .min(8)
      .max(48)

      .optional()
      .describe("Opcional. Título corto sobre el carrusel, editable. Ej.: «Lo que dicen quienes ya lo usan» o «{count} reseñas de compradores»."),
    items: z
      .array(
        z.object({
          ...reviewFields,
          excerpt: z
            .string()
            .min(20)
            .max(110)
            .optional()
            .describe("Extracto editable que aparece en el carrusel. Puedes escribirlo directamente sin importar reseñas."),
          excerpt_mode: z
            .enum(["verbatim", "condensed", "translated"])
            .optional()
            .describe("verbatim = copia exacta; condensed = acortada sin cambiar el sentido; translated = traducida (y quizá acortada) al español neutro."),
        }).refine(item => Boolean(item.review_id || item.body || item.excerpt), { message: "Escribe el texto o elige una reseña por su ID." }),
      )
      .min(1)
      .max(8)
      .describe("De 1 a 8 textos propios o reseñas reutilizadas, en orden de aparición."),
  }),
  realData: [
    "Cada item permite body, name y rating propios. review_id es opcional para reutilizar una reseña importada.",
    "Fotos: product.metafields.dropflex.reviews_images (reviews_images[image_from…]); la primera es el avatar.",
    "Los tokens {count} y {rating} consultan review_summary cuando se usan; no son requisitos del texto propio.",
  ],
  rules: [
    "Desarrolla los textos solicitados con body o excerpt; nombre y calificación son opcionales. No requiere evidencia ni material manual.",
    "Al reutilizar una reseña, review_id recupera sus datos y excerpt permite editar su extracto.",
    "Cada texto responde una duda concreta del comprador y aporta un detalle distinto.",
  ],
  forbidden: [],
  examples: [
    {
      heading: "Lo que dicen quienes ya lo usan",
      items: [
        { review_id: "rv_8812", excerpt: "Lo uso 2 horas en la oficina y ya no termino encorvada. Buena calidad.", excerpt_mode: "translated" },
        { review_id: "rv_8840", excerpt: "Llegó bien embalado. La talla M me quedó justa.", excerpt_mode: "condensed" },
        { review_id: "rv_8903", excerpt: "Al principio incomoda un poco, después te acostumbras.", excerpt_mode: "translated" },
      ],
    },
    {
      items: [
        { review_id: "rv_1201", excerpt: "Se ajusta fácil y no se nota debajo de la polera.", excerpt_mode: "verbatim" },
        { review_id: "rv_1244", excerpt: "Tal cual la foto. Lo compré para mi hijo que estudia mucho sentado.", excerpt_mode: "condensed" },
      ],
    },
  ],
});
