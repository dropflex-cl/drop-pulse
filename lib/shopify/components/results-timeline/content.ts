import * as z from "zod/v4";
import { defineComponent } from "../define";
import { pdpHeading, pdpBody, pdpFact } from "../_shared/pdp-content";
export const resultsTimeline = defineComponent({
  id: "results-timeline",
  name: "DropFlex · Evolución",
  kind: "section",
  file: "sections/df-results-timeline.liquid",
  metafield: { namespace: "dropflex", key: "results_timeline", type: "json" },
  media: [],
  imageSlots: [],
  placement:
    "Qué puedes esperar: después de la demostración y antes del cierre de compra.",
  objection:
    "Todavía no hay plazos de resultados documentados para este producto.",
  levers: ["Claridad visual", "Reducción de incertidumbre", "Valor respaldado"],
  content: z.object({
    heading: pdpHeading,
    stages: z
      .array(
        z.object({
          label: z
            .string()
            .regex(/^[^<>]*$/, "Escribe texto plano, sin HTML.")
            .min(3)
            .max(35),
          title: z
            .string()
            .regex(/^[^<>]*$/, "Escribe texto plano, sin HTML.")
            .min(3)
            .max(45),
          body: pdpBody,
          fact_id: pdpFact,
        }),
      )
      .min(2)
      .max(5),
    footnote: pdpBody,
  }),
  realData: [
    "Hechos aprobados y verificados; referencias reales, reseñas aprobadas, políticas y precios publicados.",
  ],
  rules: [
    "Una idea principal por sección, textos cortos y concretos para móvil.",
    "No envíes contenido ficticio para rellenar: sin evidencia se publica el estado vacío.",
    "Todos los fact_id deben pertenecer a hechos aprobados y verificados del producto.",
  ],
  forbidden: [
    "Testimonios, expertos, estudios, resultados, escasez o plazos inventados.",
    "Imágenes generadas usadas como evidencia.",
    "Regalos que no se entregan ni garantías que la tienda no ofrece.",
  ],
  examples: [
    {
      heading: "Conoce la evolución documentada",
      stages: [
        {
          title: "Prepara el uso",
          body: "Sigue las instrucciones de preparación antes de comenzar a usarlo.",
          fact_id: "00000000-0000-4000-8000-000000000001",
          label: "Al empezar",
        },
        {
          title: "Revisa el resultado",
          body: "Revisa el resultado de la demostración y las condiciones de uso documentadas.",
          fact_id: "00000000-0000-4000-8000-000000000001",
          label: "Después de usarlo",
        },
      ],
      footnote:
        "La experiencia depende de las condiciones de uso y de cada persona.",
    },
    {
      heading: "Conoce las etapas del uso",
      stages: [
        {
          title: "Prepara el uso",
          body: "Sigue las instrucciones de preparación antes de comenzar a usarlo.",
          fact_id: "00000000-0000-4000-8000-000000000001",
          label: "Al empezar",
        },
        {
          title: "Revisa el resultado",
          body: "Revisa el resultado de la demostración y las condiciones de uso documentadas.",
          fact_id: "00000000-0000-4000-8000-000000000001",
          label: "Después de usarlo",
        },
      ],
      footnote:
        "La experiencia depende de las condiciones de uso y de cada persona.",
    },
  ],
});
