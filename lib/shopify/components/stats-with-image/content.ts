import * as z from "zod/v4";
import { PDP_RATING_MIN, PDP_RATING_MAX } from "@/lib/copy/pdp-rating";
import { defineComponent } from "../define";
import { reviewItem } from "../_shared/review-content";

// Las cifras aceptan un valor propio o una referencia operativa opcional.
const boldPairs = (s: string) => (s.match(/\*\*/g) ?? []).length / 2;

/** Fuentes opcionales de cifras; rating/review_count usan el agregado editable compartido. */
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
    "Prueba social cuantitativa arriba de todo: la valoración compartida ancla la credibilidad antes de leer (primacía, efecto halo).",
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

      .describe("[verbo de invitación o resultado] + [beneficio concreto] con UNA palabra o marca destacada entre **…** (≤ 60 caracteres visibles). Ej.: «Recupera una postura erguida con **PosturaFit**»."),
    description: z
      .string()
      .min(80)
      .max(224)
      .refine((s) => boldPairs(s) <= 1 && Number.isInteger(boldPairs(s)), { message: "Máximo una frase en **negrita**" })

      .describe("1 o 2 oraciones: para quién o en qué situación + cómo funciona (mecanismo real) + resultado esperado. Máximo una frase en **negrita**."),
    bullets: z
      .array(z.string().min(8).max(48).refine((s) => !/[.!]$/.test(s.trim()), { message: "Sin punto final" }))
      .min(2)
      .max(4)
      .describe("3 razones (2 a 4): atributo del producto → beneficio, 3 a 7 palabras, sin punto final. Una puede ser sobre el pago al recibir."),
    cta_label: z
      .string()
      .min(6)
      .max(24)
      .describe("Acción + beneficio de bajo riesgo. Ej.: «Pídelo y paga al recibir», «Quiero el mío». Evita «Comprar ahora»."),
    rating_label: z
      .string()
      .min(10)
      .max(48)

      .describe("Línea de calificación editable. {rating} y {count} son tokens opcionales."),
    rating: z.number().min(PDP_RATING_MIN).max(PDP_RATING_MAX).optional().describe("Campo compatible de respaldo entre 4.4 y 4.9. Edita la valoración compartida en review-stars; su rating prevalece en toda la PDP."),
    count: z.number().int().nonnegative().optional().describe("Campo compatible de respaldo. Edita la cantidad compartida en review-stars; su count prevalece en toda la PDP."),
    testimonial: reviewItem.optional().describe("Texto propio con body, name y rating opcionales, o reseña reutilizada por review_id."),
    review_id: z
      .string()
      .min(1)
      .optional()
      .describe("Id de una reseña seleccionada de la lista recibida para el testimonio (la más concreta: antes → después). Se muestra tal cual; omítelo si ninguna sirve."),
    stats: z
      .array(
        z.object({
          fact: z.enum(STAT_FACTS).optional().describe("Fuente operativa opcional del valor, cuando no se escribe value."),
          value: z.string().trim().regex(/^[^<>]*$/, "Escribe texto plano, sin HTML.").min(1).max(32).optional().describe("Cifra o valor editable del contenido; no requiere un hecho verificado."),
          label: z
            .string()
            .min(4)
            .max(32)

            .describe("Qué significa la cifra, sin el número. Ej.: «días para cambiarlo»."),
        }).refine(item => Boolean(item.fact || item.value), { message: "Escribe value o elige la fuente fact." }),
      )
      .max(3)
      .optional()
      .describe("0 a 3 cifras con value propio o fact para reutilizar un dato operativo."),
  }),
  realData: [
    "La nota y cantidad agregadas usan la fuente común review-stars; rating/count antiguos son respaldo compatible cuando Estrellas no los aporta. testimonial permite contenido propio; review_id es opcional.",
    "Cifras: rating y review_count de la valoración compartida editable de la PDP; return_days y warranty_months de shop.metafields.dropflex.policies; delivery_days_max = preparación + tránsito máximo de shop.metafields.dropflex.logistics.",
    "Fotos: ajustes del editor → dropflex.stats_with_image_images → imágenes del producto; admite imágenes de referencia o generadas.",
  ],
  rules: [
    "Título: [verbo de invitación o resultado] + [beneficio concreto] + **destacado** (marca o palabra-beneficio), una sola parte destacada.",
    "Descripción: 80 a 220 caracteres; para quién + mecanismo real + resultado esperado; máximo una **negrita**.",
    "Razones: 3 (2 a 4), atributo del producto → beneficio, ≤ 48 caracteres, sin punto final.",
    "Botón: acción + bajo riesgo en pago contra entrega, ≤ 24 caracteres.",
    "Desarrolla las cifras y el testimonio solicitados con los campos propios; no exige reseñas importadas ni evidencia documental.",
    "Tuteo, español neutro, frases cortas, sin emojis ni mayúsculas sostenidas.",
  ],
  forbidden: [],
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
