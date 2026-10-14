import * as z from "zod/v4";
import { PDP_COMPONENT_COPY_RULES } from "../_shared/pdp-writing";
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
    ...PDP_COMPONENT_COPY_RULES,
  ],
  forbidden: [],
  examples: [
  {
    "heading": "Ordenar sirve cuando encuentras lo que buscas",
    "name": "Perspectiva editorial de ejemplo",
    "credential": "Organización de espacios",
    "quote": "Separar los útiles por tipo facilita reconocer dónde está cada cosa. El organizador debe quedar cerca de donde los utilizas."
  },
  {
    "heading": "El cuidado empieza por prestar atención",
    "name": "Perspectiva editorial de ejemplo",
    "credential": "Cuidado de uñas y cutículas",
    "quote": "Dedica cuidado a la zona que observas reseca o descuidada. La aplicación localizada permite atender uñas y cutículas sin extender el producto a todo el pie."
  }
],
});
