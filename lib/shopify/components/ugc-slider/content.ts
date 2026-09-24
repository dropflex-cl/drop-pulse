import * as z from "zod/v4";
import { defineComponent } from "../define";

const TOKENS = /\{(count|rating)\}/g;
// Resultados, promesas o cifras que un texto corto sobre un video no puede afirmar.
const CLAIMS = /\b(cur\w*|san[óo]\w*|elimin\w*|adelgaz\w*|garantiz\w*|resultado\w*|milagr\w*|definitiv\w*|dolor\w*|tratamiento\w*)/i;

const caption = z
  .string()
  .min(3)
  .max(40)
  .refine((s) => !/\d/.test(s), { message: "caption: sin cifras" })
  .refine((s) => !CLAIMS.test(s), { message: "caption: describe lo que se ve, sin resultados ni promesas" });

export const ugcSlider = defineComponent({
  id: "ugc-slider",
  name: "DropFlex · Videos UGC",
  kind: "block",
  file: "blocks/df-ugc-slider.liquid",
  metafield: { namespace: "dropflex", key: "ugc_slider", type: "json" },
  media: [
    {
      key: "ugc_videos",
      type: "list.file_reference",
      source: "Videos que el comerciante sube en DropFlex (Shopify Files), con permiso de uso confirmado; nunca de la IA ni del proveedor presentados como clientes.",
    },
  ],
  placement: "Columna del producto, bajo el botón de compra: prueba visual para el que duda, en el mismo formato vertical de los anuncios de Meta y TikTok de donde viene el tráfico.",
  objection: "¿Se ve igual en la vida real? ¿Funciona? ¿Me va a quedar? La duda de tangibilidad, máxima cuando las fotos son renders del proveedor.",
  levers: [
    "Demostración: ver a una persona común usándolo vale más que cualquier texto.",
    "Similitud: celular, luz casera, sin producción → «gente como yo», alta credibilidad.",
    "Familiaridad de formato: reels e historias; el comprador ya sabe cómo usarlo.",
    "Reproductor flotante en escritorio: sigue mirando mientras baja y compra; acorta la distancia entre prueba y acción.",
  ],
  content: z.object({
    heading: z
      .string()
      .min(8)
      .max(48)
      .refine((s) => !/\d/.test(s.replaceAll(TOKENS, "")), { message: "heading: cifras solo como {count} o {rating}" })
      .refine((s) => !s.includes("+"), { message: "heading: sin «+» inflado" })
      .optional()
      .describe("Opcional. Sin cifra: describe el contenido («Así lo usan quienes ya lo tienen»). Con cifra real: «**{count} reseñas** de compradores». **…** resalta en el color de acento."),
    captions: z
      .array(caption.describe("≤ 40 caracteres: lo que se ve o el uso («Se ajusta en segundos», «Debajo de la ropa»). Sin cifras ni resultados."))
      .max(10)
      .optional()
      .describe("Un texto corto por video, en el mismo orden de los videos subidos (índice 0 = primer video)."),
  }),
  realData: [
    "Videos y pósters: product.metafields.dropflex.ugc_videos (list.file_reference) que sube el comerciante; los ajustes de video del bloque son el respaldo.",
    "{count} y {rating} del título y la fila de estrellas: product.metafields.dropflex.review_summary, solo sobre el mínimo de reseñas; si no, el título con cifra no se muestra.",
    "Aviso «Incluye contenido patrocinado»: lo declara el comerciante en el bloque.",
  ],
  rules: [
    "Título opcional, ≤ 48 caracteres: sin cifra, una frase que describe el contenido; con cifra, {count} + el sustantivo exacto de lo que se cuenta («reseñas de compradores»).",
    "Textos por video: describen la acción o el contexto visible, ≤ 40 caracteres, tuteo, sin emojis ni exclamaciones.",
    "Si no conoces el contenido de un video, omite captions: mejor sin texto que un texto que no calza.",
  ],
  forbidden: [
    "Cifras escritas, «más de», «+» o «miles de clientes» (Ley 19.496 art. 28).",
    "Resultados o promesas de salud en los textos («me sanó la espalda», «elimina el dolor»).",
    "Presentar videos del proveedor, actores o generados por IA como clientes (FTC 16 CFR 465).",
    "Llamarlos «nuestros clientes» si son compradores del proveedor: «compradores».",
  ],
  examples: [
    {
      heading: "**{count} reseñas** de compradores",
      captions: ["Se pone en segundos", "En la oficina, bajo la camisa", "Así viene en la caja"],
    },
    {
      heading: "Así lo usan quienes ya lo tienen",
    },
  ],
});
