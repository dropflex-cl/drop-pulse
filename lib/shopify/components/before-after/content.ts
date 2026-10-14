import * as z from "zod/v4";
import { PDP_COMPONENT_COPY_RULES } from "../_shared/pdp-writing";
import { defineComponent } from "../define";
import { pdpHeading, pdpBody, pdpFact } from "../_shared/pdp-content";
export const beforeAfter = defineComponent({
  id: "before-after",
  name: "DropFlex · Antes/después",
  kind: "section",
  file: "sections/df-before-after.liquid",
  metafield: { namespace: "dropflex", key: "before_after", type: "json" },
  media: [
    {
      key: "before_after_before",
      type: "list.file_reference",
      source:
        "Imágenes elegidas en la página, de referencia o generadas.",
    },
    {
      key: "before_after_after",
      type: "list.file_reference",
      source:
        "Imágenes elegidas en la página, de referencia o generadas.",
    },
  ],
  imageSlots: [
    {
      key: "before",
      label: "Antes",
      min: 0,
      max: 1,
      ratio: "1:1",
      hint: "Foto en el orden del contenido. Sin imagen se conserva el texto.",
    },
    {
      key: "after",
      label: "Después",
      min: 0,
      max: 1,
      ratio: "1:1",
      hint: "Foto en el orden del contenido. Sin imagen se conserva el texto.",
    },
  ],
  placement:
    "Mira la diferencia: después de la demostración y antes del cierre de compra.",
  objection: "¿Qué diferencia puedo ver al usarlo?",
  levers: ["Claridad visual", "Reducción de incertidumbre", "Valor respaldado"],
  content: z.object({
    heading: pdpHeading,
    before_label: z
      .string()
      .regex(/^[^<>]*$/, "Escribe texto plano, sin HTML.")
      .min(2)
      .max(35),
    after_label: z
      .string()
      .regex(/^[^<>]*$/, "Escribe texto plano, sin HTML.")
      .min(2)
      .max(35),
    body: pdpBody,
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
    "heading": "De útiles dispersos a cada cosa en su lugar",
    "before_label": "Todo mezclado en la mesa",
    "after_label": "Cada útil en su compartimento",
    "body": "La comparación representa la misma mesa y los mismos útiles, antes y después de separarlos en el organizador."
  },
  {
    "heading": "Imagina dedicar cuidado a esas uñas",
    "before_label": "Uñas con aspecto descuidado",
    "after_label": "Apariencia de uñas cuidadas",
    "body": "Representación de la apariencia que se busca con el cuidado. El contraste visual desarrolla la misma dirección de la página."
  }
],
});
