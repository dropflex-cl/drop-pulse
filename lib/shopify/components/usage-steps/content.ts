import * as z from "zod/v4";
import { defineComponent } from "../define";
import { pdpHeading, pdpImageAlt, pdpItem } from "../_shared/pdp-content";

const fields = {
  heading: pdpHeading.optional(),
  steps: z.array(pdpItem).min(2).max(5).optional(),
  image_alt: pdpImageAlt.optional(),
};
const usageStepsSchema = z.union([
  z.object({
    ...fields,
    display_mode: z.literal("image_only"),
    image_alt: pdpImageAlt,
  }),
  z.object({
    ...fields,
    display_mode: z.literal("steps").optional(),
    heading: pdpHeading,
    steps: z.array(pdpItem).min(2).max(5),
  }),
]);
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
      source: "Imágenes elegidas en la página, de referencia o generadas.",
    },
  ],
  imageSlots: [
    {
      key: "steps",
      label: "Fotos de los pasos",
      min: 0,
      max: 5,
      ratio: "1:1",
      hint: "En Pasos, una foto por paso. En Solo imagen, se muestra la primera imagen con las instrucciones completas; las demás se conservan.",
    },
  ],
  placement:
    "Cómo se usa: después de la demostración y antes del cierre de compra.",
  objection: "Las instrucciones de uso estarán disponibles aquí.",
  levers: ["Claridad visual", "Reducción de incertidumbre", "Valor respaldado"],
  content: usageStepsSchema,
  realData: [
    "Contenido vigente del producto, imágenes disponibles y referencias opcionales. Precios y políticas salen de los datos comerciales.",
  ],
  rules: [
    "Una idea principal por sección, textos cortos y concretos para móvil.",
    "Si una infografía ya contiene las instrucciones completas, guarda display_mode: image_only e image_alt y asigna el archivo a steps, posición 1. Requiere una imagen disponible; no muestra heading, números, tarjetas, títulos ni descripciones externas.",
    "Sin display_mode, o con steps, conserva el formato anterior: heading y 2–5 steps obligatorios, fotos opcionales. Cambiar de modo conserva textos, imágenes adicionales, variantes, descartes y visibilidad.",
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
      display_mode: "image_only",
      image_alt:
        "Cómo usar el organizador: prepara el equipo, ajusta antes de usar y guárdalo siguiendo las instrucciones del fabricante.",
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
