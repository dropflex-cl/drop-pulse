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
    "¿Cómo se integra en mi rutina con el tiempo?",
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
    "Contenido vigente del producto, imágenes disponibles y referencias opcionales. Precios y políticas salen de los datos comerciales.",
  ],
  rules: [
    "Una idea principal por sección, textos cortos y concretos para móvil.",
  ],
  forbidden: [],
  examples: [
    {
      heading: "Conoce la evolución",
      stages: [
        {
          title: "Prepara el uso",
          body: "Sigue las instrucciones de preparación antes de comenzar a usarlo.",
          label: "Al empezar",
        },
        {
          title: "Revisa el resultado",
          body: "Observa el cambio y adapta la rutina a tus necesidades.",
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
          label: "Al empezar",
        },
        {
          title: "Revisa el resultado",
          body: "Observa el cambio y adapta la rutina a tus necesidades.",
          label: "Después de usarlo",
        },
      ],
      footnote:
        "La experiencia depende de las condiciones de uso y de cada persona.",
    },
  ],
});
