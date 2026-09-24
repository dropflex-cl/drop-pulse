import * as z from "zod/v4";
import { defineComponent } from "../define";

const RATING_TOKENS = /\{(rating|count)\}/g;
// La escala («de 5», «/5») no es un hecho: se permite. Todo otro número es un token.
const noDigits = (s: string) => !/\d/.test(s.replaceAll(RATING_TOKENS, "").replaceAll(/(\/\s?|de )5\b/g, ""));
const boldPairs = (s: string) => (s.match(/\*\*/g) ?? []).length / 2;

/** Hechos reales que puede mostrar una cifra. El valor lo pone la tienda; la IA solo escribe la etiqueta. */
export const STAT_FACTS = ["rating", "review_count", "return_days", "warranty_months", "delivery_days_max"] as const;

export const statsWithImage = defineComponent({
  id: "stats-with-image",
  name: "DropFlex · Hero y cifras",
  kind: "section",
  file: "sections/df-stats-with-image.liquid",
  metafield: { namespace: "dropflex", key: "stats_with_image", type: "json" },
  media: [
    {
      key: "stats_with_image_images",
      type: "list.file_reference",
      source: "Fotos de uso elegidas por el comerciante en la etapa Imágenes (1 a 4, la primera vertical si son 3). Sin este metafield, las fotos del producto.",
    },
  ],
  imageSlots: [
    { key: "collage", label: "Fotos del collage", min: 0, max: 4, ratio: "3:4", hint: "De 1 a 4 fotos de uso; si son 3, la primera va vertical. Sin elegir, van las fotos del producto." },
  ],
  placement:
    "Segunda pantalla de la landing, justo después del bloque de compra (o primera sección de un advertorial): junta en un solo vistazo calificación, promesa, razones, testimonio y botón.",
  objection: "¿Esto funciona y otros ya lo compraron? El comprador frío que llega desde un anuncio y todavía no confía.",
  levers: [
    "Prueba social cuantitativa arriba de todo: la calificación real ancla la credibilidad antes de leer (primacía, efecto halo).",
    "Prueba social cualitativa: un testimonio real con nombre y estrellas genera identificación con un par.",
    "Escaneabilidad: 3 razones con check se leen en 3 segundos.",
    "Simulación mental: fotos de uso real dejan imaginarse con el producto.",
    "AIDA en una pantalla: imagen y estrellas → título → descripción, razones y testimonio → botón.",
  ],
  content: z.object({
    heading: z
      .string()
      .min(12)
      .max(64)
      .refine((s) => boldPairs(s) === 1, { message: "El título lleva exactamente una parte destacada con **…**" })
      .refine((s) => !/\d/.test(s), { message: "Sin números en el título" })
      .describe("[verbo de invitación o resultado] + [beneficio concreto] con UNA palabra o marca destacada entre **…** (≤ 60 caracteres visibles). Ej.: «Recupera una postura erguida con **PosturaFit**»."),
    description: z
      .string()
      .min(80)
      .max(224)
      .refine((s) => boldPairs(s) <= 1 && Number.isInteger(boldPairs(s)), { message: "Máximo una frase en **negrita**" })
      .refine((s) => !/\d/.test(s), { message: "Sin números: los hechos van en las cifras reales" })
      .describe("1 o 2 oraciones: para quién o en qué situación + cómo funciona (mecanismo real) + resultado esperable no médico. Máximo una frase en **negrita**."),
    bullets: z
      .array(z.string().min(8).max(48).refine((s) => !/[.!]$/.test(s.trim()), { message: "Sin punto final" }))
      .min(2)
      .max(4)
      .describe("3 razones (2 a 4): atributo verificable → beneficio, 3 a 7 palabras, sin punto final. Una puede ser sobre el pago al recibir."),
    cta_label: z
      .string()
      .min(6)
      .max(24)
      .describe("Acción + beneficio de bajo riesgo. Ej.: «Pídelo y paga al recibir», «Quiero el mío». Evita «Comprar ahora»."),
    rating_label: z
      .string()
      .min(10)
      .max(48)
      .includes("{rating}")
      .refine(noDigits, { message: "La calificación y la cantidad van como {rating} y {count}, nunca escritas" })
      .describe("Plantilla de la línea de calificación con {rating} y, si quieres, {count}. Ej.: «{rating} de 5 según {count} reseñas». Nunca «pedidos»."),
    review_id: z
      .string()
      .min(1)
      .optional()
      .describe("Id de una reseña APROBADA de la lista recibida para el testimonio (la más concreta: antes → después). Se muestra tal cual; omítelo si ninguna sirve."),
    stats: z
      .array(
        z.object({
          fact: z.enum(STAT_FACTS).describe("Dato real que pone el valor: rating, review_count, return_days, warranty_months o delivery_days_max."),
          label: z
            .string()
            .min(4)
            .max(32)
            .refine((s) => !/\d/.test(s), { message: "La etiqueta no lleva el número" })
            .describe("Qué significa la cifra, sin el número. Ej.: «días para cambiarlo»."),
        }),
      )
      .max(3)
      .optional()
      .describe("0 a 3 cifras. Solo hechos que la tienda tiene (se ocultan si falta el dato)."),
  }),
  realData: [
    "Calificación y cantidad: dropflex.review_summary (rating, count, source_label). La línea solo aparece con el mínimo de reseñas del editor, y la fuente siempre se muestra.",
    "Testimonio: la reseña aprobada de dropflex.reviews con ese id (autor enmascarado, calificación, país), mostrada tal cual y recortada a 240 caracteres.",
    "Cifras: rating y review_count de review_summary; return_days y warranty_months de shop.metafields.dropflex.policies; delivery_days_max = preparación + tránsito máximo de shop.metafields.dropflex.logistics.",
    "Fotos: ajustes del editor → dropflex.stats_with_image_images → imágenes del producto. Nunca imágenes que muestren resultados que el producto no logra.",
  ],
  rules: [
    "Título: [verbo de invitación o resultado] + [beneficio concreto] + **destacado** (marca o palabra-beneficio), una sola parte destacada.",
    "Descripción: 80 a 220 caracteres; para quién + mecanismo real + resultado no médico; máximo una **negrita**.",
    "Razones: 3 (2 a 4), atributo verificable → beneficio, ≤ 48 caracteres, sin punto final.",
    "Botón: acción + bajo riesgo en pago contra entrega, ≤ 24 caracteres.",
    "Calificación: solo plantilla con {rating} y {count}; hablar de «reseñas» u «opiniones», nunca de «pedidos» o «clientes».",
    "Tuteo, español neutro, frases cortas, sin emojis ni mayúsculas sostenidas.",
  ],
  forbidden: [
    "Escribir calificaciones, cantidades, cifras, testimonios o nombres de clientes: la IA solo elige un review_id de la lista.",
    "«Científicamente probado», «clínicamente», «recomendado por médicos o kinesiólogos», «cura», «elimina el dolor», «corrige la escoliosis».",
    "Garantías de resultado en X días, «el más vendido», cifras de clientes (Ley 19.496, arts. 28 y 33).",
    "Presentar el producto como dispositivo médico.",
  ],
  examples: [
    {
      heading: "Recupera una postura erguida con **PosturaFit**",
      description:
        "Un soporte ajustable que te recuerda llevar los hombros hacia atrás mientras trabajas o estudias. Liviano, **discreto bajo la ropa** y fácil de poner en segundos.",
      bullets: ["Tiras ajustables a tu contorno", "Tela respirable para uso diario", "Se usa bajo la ropa sin notarse"],
      cta_label: "Pídelo y paga al recibir",
      rating_label: "{rating} de 5 según {count} reseñas",
      review_id: "r_1042",
      stats: [
        { fact: "rating", label: "calificación promedio" },
        { fact: "return_days", label: "días para cambiarlo" },
      ],
    },
    {
      heading: "Tu espalda te lo va a **agradecer**",
      description:
        "Pensado para quienes pasan horas frente al computador. Te ayuda a tomar conciencia de tu postura y a formar un mejor hábito día a día.",
      bullets: ["Ajuste cruzado que no aprieta", "Lavable a mano", "Pagas al recibirlo en tu casa"],
      cta_label: "Quiero el mío",
      rating_label: "Calificación {rating}/5 · {count} opiniones",
    },
  ],
});
