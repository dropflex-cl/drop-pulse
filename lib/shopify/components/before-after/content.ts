import * as z from "zod/v4";
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
    "Una idea principal por sección, textos cortos y concretos para móvil.",
  ],
  forbidden: [],
  examples: [
    {
      heading: "Mira la diferencia",
      before_label: "Antes del uso",
      after_label: "Después del uso",
      body: "Compara el espacio antes y después de organizar tus útiles.",
    },
    {
      heading: "Compara el antes y el después",
      before_label: "Antes del uso",
      after_label: "Después del uso",
      body: "Observa cómo cambia tu escritorio con todo en su lugar.",
    },
  ],
});
