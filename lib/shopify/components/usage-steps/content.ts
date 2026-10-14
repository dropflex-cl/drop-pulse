import * as z from "zod/v4";
import { PDP_COMPONENT_COPY_RULES } from "../_shared/pdp-writing";
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
  objection: "¿Puedo empezar a usarlo sin complicarme?",
  levers: ["Claridad visual", "Reducción de incertidumbre", "Valor respaldado"],
  content: usageStepsSchema,
  realData: [
    "Contenido vigente del producto, imágenes disponibles y referencias opcionales. Precios y políticas salen de los datos comerciales.",
  ],
  rules: [
    ...PDP_COMPONENT_COPY_RULES,
    "Si una infografía ya contiene las instrucciones completas, guarda display_mode: image_only e image_alt y asigna el archivo a steps, posición 1. Requiere una imagen disponible; no muestra heading, números, tarjetas, títulos ni descripciones externas.",
    "Sin display_mode, o con steps, conserva el formato anterior: heading y 2–5 steps obligatorios, fotos opcionales. Cambiar de modo conserva textos, imágenes adicionales, variantes, descartes y visibilidad.",
  ],
  forbidden: [],
  examples: [
  {
    "heading": "Ordena una vez y encuentra cada útil",
    "steps": [
      {
        "title": "Elige un lugar al alcance",
        "body": "Pon el organizador sobre el escritorio, cerca de donde escribes o trabajas."
      },
      {
        "title": "Separa tus útiles",
        "body": "Agrupa lápices y útiles en los compartimentos para reconocer dónde está cada cosa."
      },
      {
        "title": "Devuélvelos a su lugar",
        "body": "Al terminar, deja cada útil en su compartimento para encontrarlo en la siguiente tarea."
      }
    ]
  },
  {
    "display_mode": "steps",
    "heading": "Empieza a cuidarlas sin complicarte",
    "steps": [
      {
        "title": "Limpia y seca",
        "body": "Prepara la uña y la cutícula: limpia la zona y sécala antes de aplicar el tónico."
      },
      {
        "title": "Aplica y masajea",
        "body": "Usa el gotero sobre la uña y la cutícula. Masajea suavemente y respeta la cantidad indicada en el envase."
      },
      {
        "title": "Mantén el cuidado",
        "body": "Deja el frasco junto a tus productos de cuidado y sigue la frecuencia del envase para mantener la constancia."
      }
    ]
  }
],
});
