import * as z from "zod/v4";
import { PDP_COMPONENT_COPY_RULES } from "../_shared/pdp-writing";
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
    ...PDP_COMPONENT_COPY_RULES,
  ],
  forbidden: [],
  examples: [
  {
    "heading": "Que encontrar cada cosa se vuelva habitual",
    "stages": [
      {
        "label": "Al organizar",
        "title": "Separa lo que estaba mezclado",
        "body": "Distribuye los útiles por compartimento y deja el organizador al alcance de tu mano."
      },
      {
        "label": "En la próxima tarea",
        "title": "Toma el útil que necesitas",
        "body": "Busca en su compartimento sin apartar todo lo que hay en la mesa."
      },
      {
        "label": "Al terminar",
        "title": "Conserva ese lugar",
        "body": "Devuelve cada útil a su compartimento para que la siguiente tarea empiece sin búsqueda."
      }
    ],
    "footnote": "El ejemplo describe el uso del organizador; adapta las etapas al producto y al cambio buscado."
  },
  {
    "heading": "Empieza por las uñas que hoy prefieres ocultar",
    "stages": [
      {
        "label": "Al empezar",
        "title": "Dedica atención a esa zona",
        "body": "Aplica el tónico sobre uñas y cutículas limpias y secas, siguiendo las indicaciones del envase."
      },
      {
        "label": "Con uso constante",
        "title": "Observa su apariencia",
        "body": "Presta atención a la hidratación y apariencia de uñas y cutículas al mantener el cuidado."
      }
    ],
    "footnote": "La respuesta varía entre personas; las etapas describen el cuidado sin fijar un plazo de resultados."
  }
],
});
