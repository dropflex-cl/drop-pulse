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
        "Imágenes elegidas y aprobadas en la página. Las pruebas de resultados y los retratos usan únicamente referencias reales.",
    },
    {
      key: "before_after_after",
      type: "list.file_reference",
      source:
        "Imágenes elegidas y aprobadas en la página. Las pruebas de resultados y los retratos usan únicamente referencias reales.",
    },
  ],
  imageSlots: [
    {
      key: "before",
      label: "Antes, foto real",
      min: 0,
      max: 1,
      ratio: "1:1",
      hint: "Foto en el orden del contenido. Sin imagen se conserva el texto; no generar evidencia de resultados ni identidades.",
    },
    {
      key: "after",
      label: "Después, foto real",
      min: 0,
      max: 1,
      ratio: "1:1",
      hint: "Foto en el orden del contenido. Sin imagen se conserva el texto; no generar evidencia de resultados ni identidades.",
    },
  ],
  placement:
    "Mira la diferencia: después de la demostración y antes del cierre de compra.",
  objection: "Todavía no hay una comparación documentada para este producto.",
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
    "Hechos aprobados y verificados; referencias reales, reseñas aprobadas, políticas y precios publicados.",
  ],
  rules: [
    "Una idea principal por sección, textos cortos y concretos para móvil.",
    "No envíes contenido ficticio para rellenar: sin evidencia se publica el estado vacío.",
    "Todos los fact_id deben pertenecer a hechos aprobados y verificados del producto.",
    "Las dos fotos deben ser referencias reales de la misma demostración, no imágenes generadas. El hecho aprobado debe documentar las condiciones de la comparación.",
  ],
  forbidden: [
    "Testimonios, expertos, estudios, resultados, escasez o plazos inventados.",
    "Imágenes generadas usadas como evidencia.",
    "Regalos que no se entregan ni garantías que la tienda no ofrece.",
  ],
  examples: [
    {
      heading: "Compara una demostración real",
      before_label: "Antes del uso",
      after_label: "Después del uso",
      body: "Estas imágenes corresponden a la misma demostración, sin alterar el resultado.",
      fact_id: "00000000-0000-4000-8000-000000000001",
    },
    {
      heading: "Conoce la comparación documentada",
      before_label: "Antes del uso",
      after_label: "Después del uso",
      body: "Estas imágenes corresponden a la misma demostración, sin alterar el resultado.",
      fact_id: "00000000-0000-4000-8000-000000000001",
    },
  ],
});
