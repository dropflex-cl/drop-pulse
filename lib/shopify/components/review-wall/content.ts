import * as z from "zod/v4";
import { defineComponent } from "../define";

const TOKENS = /\{(count|rating)\}/g;

export const reviewWall = defineComponent({
  id: "review-wall",
  name: "DropFlex · Testimonios",
  kind: "section",
  file: "sections/df-review-wall.liquid",
  metafield: { namespace: "dropflex", key: "review_wall", type: "json" },
  media: [],
  minReviews: 4,
  placement: "Cuerpo de la landing, después de las historias: un muro de reseñas reales dibujadas como publicaciones de Facebook, dos por fila en el teléfono para que la prueba no se vuelva un scroll eterno.",
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
      .refine((s) => !/\d/.test(s.replaceAll(TOKENS, "")), { message: "heading: cifras solo como {count} o {rating}" })
      .describe("Título sobre el muro, sin cifras escritas. Ej.: «Fotos de quienes ya lo recibieron» o «{count} compradores ya lo tienen»."),
    items: z
      .array(
        z.object({
          review_id: z.string().min(1).describe("Id de una reseña APROBADA de la lista recibida. Nunca inventado."),
        }),
      )
      .min(4)
      .max(12)
      .refine((items) => new Set(items.map((i) => i.review_id)).size === items.length, { message: "No repitas una reseña." })
      .describe("De 4 a 12 reseñas reales, en el orden del muro (la primera arriba a la izquierda). Primero las que tienen fotos; un número par (2 por fila en el teléfono)."),
  }),
  realData: [
    "Reseñas: product.metafields.dropflex.reviews (aprobadas por el comerciante): texto completo, fecha y fotos. La tienda las une por review_id; un id que ya no existe se omite.",
    "Fotos: product.metafields.dropflex.reviews_images (hasta 3 por publicación).",
    "Calificación sobre el muro: product.metafields.dropflex.review_summary (rating, count; con pocas reseñas, la proporción de 5 estrellas).",
    "Nombres de las publicaciones: los pone la tienda (un nombre de pila y una inicial fijos por reseña, o el autor tal como vino, según el ajuste); nunca la IA.",
  ],
  rules: [
    "Solo elegir ids de la lista recibida y ordenarlos; el texto de cada publicación es el de la reseña, completo.",
    "Primero las reseñas con fotos (la lista dice «N fotos»); una sin fotos solo si faltan con foto.",
    "Abrir con la más específica (un uso concreto, un detalle del producto recibido) e incluir al menos una de 4 estrellas si existe.",
    "Si hay suficientes, no repetir las que elegiste para review-slider: son dos lugares de la misma página.",
    "Número par de publicaciones: el muro va de a 2 por fila en el teléfono.",
    "El título describe sin adjetivos inflados; cifras solo como {count} o {rating}.",
  ],
  forbidden: [
    "Inventar reseñas, ids, autores, calificaciones o fechas (Ley 19.496 arts. 28 y 33; FTC 16 CFR 465).",
    "Elegir reseñas con promesas de salud («me curó la escoliosis»): claim sanitario a través de un tercero.",
    "Elegir reseñas que hablen de aduanas, del marketplace o de un envío desde otro país: la tienda despacha localmente y paga al recibir.",
    "Presentarlas como clientes de la tienda en el título: son compradores del mismo producto.",
  ],
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
