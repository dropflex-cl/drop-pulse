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
        "Imágenes elegidas y aprobadas en la página. Las pruebas de resultados y los retratos usan únicamente referencias reales.",
    },
  ],
  imageSlots: [
    {
      key: "steps",
      label: "Fotos de los pasos",
      min: 0,
      max: 5,
      ratio: "1:1",
      hint: "Foto en el orden del contenido. Sin imagen se conserva el texto; no generar evidencia de resultados ni identidades.",
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
    "Hechos aprobados y verificados; referencias reales, reseñas aprobadas, políticas y precios publicados.",
  ],
  rules: [
    "Una idea principal por sección, textos cortos y concretos para móvil.",
    "No envíes contenido ficticio para rellenar: sin evidencia se publica el estado vacío.",
    "Todos los fact_id deben pertenecer a hechos aprobados y verificados del producto.",
  ],
  forbidden: [
    "Testimonios, expertos, estudios, resultados, escasez o plazos inventados.",
    "Imágenes generadas usadas como evidencia.",
    "Regalos que no se entregan ni garantías que la tienda no ofrece.",
  ],
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
