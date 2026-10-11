import * as z from "zod/v4";
import { defineComponent } from "../define";
import { pdpHeading, pdpFact } from "../_shared/pdp-content";
export const expertEndorsement = defineComponent({
  id: "expert-endorsement",
  name: "DropFlex · Experto",
  kind: "section",
  file: "sections/df-expert-endorsement.liquid",
  metafield: { namespace: "dropflex", key: "expert_endorsement", type: "json" },
  media: [
    {
      key: "expert_endorsement_portrait",
      type: "list.file_reference",
      source:
        "Imágenes elegidas en la página, de referencia o generadas.",
    },
  ],
  imageSlots: [
    {
      key: "portrait",
      label: "Retrato",
      min: 0,
      max: 1,
      ratio: "1:1",
      hint: "Foto en el orden del contenido. Sin imagen se conserva el texto.",
    },
  ],
  placement:
    "Una opinión con respaldo: después de la demostración y antes del cierre de compra.",
  objection:
    "¿Por qué elegir esta solución para mi rutina?",
  levers: ["Claridad visual", "Reducción de incertidumbre", "Valor respaldado"],
  content: z.object({
    heading: pdpHeading,
    name: z
      .string()
      .regex(/^[^<>]*$/, "Escribe texto plano, sin HTML.")
      .min(3)
      .max(70),
    credential: z
      .string()
      .regex(/^[^<>]*$/, "Escribe texto plano, sin HTML.")
      .min(3)
      .max(100),
    quote: z
      .string()
      .regex(/^[^<>]*$/, "Escribe texto plano, sin HTML.")
      .min(8)
      .max(280),
    fact_id: pdpFact,
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
      heading: "Una perspectiva sobre el producto",
      name: "Nombre del profesional",
      credential: "Organización de espacios",
      quote:
        "Tener tus herramientas a mano hace más simple comenzar cada tarea.",
    },
    {
      heading: "Conoce la opinión del profesional",
      name: "Nombre del profesional",
      credential: "Organización de espacios",
      quote:
        "Un escritorio ordenado te ayuda a aprovechar mejor tu espacio de trabajo.",
    },
  ],
});
