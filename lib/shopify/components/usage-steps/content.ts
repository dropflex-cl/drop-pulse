import * as z from "zod/v4";
import { defineComponent } from "../define";
import { pdpHeading, pdpItem } from "../_shared/pdp-content";
export const usageSteps = defineComponent({
  id: "usage-steps",
  name: "DropFlex · Pasos de uso",
  kind: "section",
  file: "sections/df-usage-steps.liquid",
  metafield: { namespace: "dropflex", key: "usage_steps", type: "json" },
  media: [
    {
      key: "usage_steps_steps",
      type: "list.file_reference",
      source:
        "Imágenes elegidas en la página, de referencia o generadas.",
    },
  ],
  imageSlots: [
    {
      key: "steps",
      label: "Fotos de los pasos",
      min: 0,
      max: 5,
      ratio: "1:1",
      hint: "Foto en el orden del contenido. Sin imagen se conserva el texto.",
    },
  ],
  placement:
    "Cómo se usa: después de la demostración y antes del cierre de compra.",
  objection: "Las instrucciones de uso estarán disponibles aquí.",
  levers: ["Claridad visual", "Reducción de incertidumbre", "Valor respaldado"],
  content: z.object({
    heading: pdpHeading,
    steps: z.array(pdpItem).min(2).max(5),
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
      heading: "Empieza sin complicarte",
      steps: [
        {
          title: "Prepara el equipo",
          body: "Comprueba el contenido del paquete y sigue las instrucciones del fabricante.",
          fact_id: "00000000-0000-4000-8000-000000000001",
        },
        {
          title: "Ajusta antes de usar",
          body: "Selecciona el ajuste indicado en el manual para el uso que necesitas.",
          fact_id: "00000000-0000-4000-8000-000000000001",
        },
      ],
    },
    {
      heading: "Conoce los pasos para empezar",
      steps: [
        {
          title: "Prepara el equipo",
          body: "Comprueba el contenido del paquete y sigue las instrucciones del fabricante.",
          fact_id: "00000000-0000-4000-8000-000000000001",
        },
        {
          title: "Ajusta antes de usar",
          body: "Selecciona el ajuste indicado en el manual para el uso que necesitas.",
          fact_id: "00000000-0000-4000-8000-000000000001",
        },
      ],
    },
  ],
});
