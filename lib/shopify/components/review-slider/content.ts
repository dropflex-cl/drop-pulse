import * as z from "zod/v4";
import { defineComponent } from "../define";

const TOKENS = /\{(count|rating)\}/g;

export const reviewSlider = defineComponent({
  id: "review-slider",
  name: "DropFlex · Reseñas",
  kind: "block",
  file: "blocks/df-review-slider.liquid",
  metafield: { namespace: "dropflex", key: "review_slider", type: "json" },
  media: [],
  minReviews: 3,
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
      .refine((s) => !/\d/.test(s.replaceAll(TOKENS, "")), { message: "heading: cifras solo como {count} o {rating}" })
      .optional()
      .describe("Opcional. Título corto sobre el carrusel, sin cifras escritas. Ej.: «Lo que dicen quienes ya lo usan» o «{count} reseñas de compradores»."),
    items: z
      .array(
        z.object({
          review_id: z.string().min(1).describe("Id de una reseña APROBADA de la lista recibida. Nunca inventado."),
          excerpt: z
            .string()
            .min(20)
            .max(110)
            .describe("La oración más específica del original con las palabras del autor (50–90 caracteres ideal), primera persona. Sin agregar datos, adjetivos ni resultados; sin emojis."),
          excerpt_mode: z
            .enum(["verbatim", "condensed", "translated"])
            .describe("verbatim = copia exacta; condensed = acortada sin cambiar el sentido; translated = traducida (y quizá acortada) al español neutro."),
        }),
      )
      .min(2)
      .max(8)
      .describe("De 2 a 8 reseñas reales, en orden de aparición. Prioriza las que responden objeciones (calidad, talla, plazo, uso) e incluye al menos una de 4 estrellas si existe."),
  }),
  realData: [
    "Reseñas: product.metafields.dropflex.reviews (items aprobados por el comerciante): autor enmascarado, calificación, texto, fecha, país y fotos. La tienda las une por review_id; un id inexistente se omite.",
    "Fotos: product.metafields.dropflex.reviews_images (reviews_images[image_from…]); la primera es el avatar.",
    "Mínimo de reseñas y origen visible: product.metafields.dropflex.review_summary (count, source_label).",
  ],
  rules: [
    "Solo seleccionar ids de la lista recibida y extraer; nunca redactar una reseña.",
    "Extracto: la oración más específica, con las palabras del autor. Si se traduce, tuteo neutro; si se acorta, sin cambiar el sentido.",
    "Marcar con honestidad excerpt_mode: la tienda muestra «Resumida» o «Traducida» y el texto completo.",
    "Incluir al menos una de 4 estrellas si existe: una muestra 100 % perfecta sesga.",
    "El título, si va, describe sin adjetivos inflados; cifras solo como {count} o {rating}.",
  ],
  forbidden: [
    "Inventar reseñas, autores, calificaciones, fechas o ids; «humanizar» el autor («M***a» → «María M.») (Ley 19.496 arts. 28 y 33; FTC 16 CFR 465).",
    "Agregar resultados, adjetivos o datos que el autor no escribió.",
    "Elegir reseñas con promesas de salud («me curó la escoliosis»): claim sanitario a través de un tercero.",
    "Presentarlas como clientes de la tienda: son compradores del mismo producto en AliExpress.",
  ],
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
