import * as z from "zod/v4";
import { defineComponent } from "../define";
import { pdpHeading, pdpItem } from "../_shared/pdp-content";
export const mechanism = defineComponent({
  id: "mechanism",
  name: "DropFlex · Mecanismo",
  kind: "section",
  file: "sections/df-mechanism.liquid",
  metafield: { namespace: "dropflex", key: "mechanism", type: "json" },
  media: [
    {
      key: "mechanism_main",
      type: "list.file_reference",
      source:
        "Imágenes elegidas y aprobadas en la página. Las pruebas de resultados y los retratos usan únicamente referencias reales.",
    },
  ],
  imageSlots: [
    {
      key: "main",
      label: "Detalle del mecanismo",
      min: 0,
      max: 1,
      ratio: "1:1",
      hint: "Foto en el orden del contenido. Sin imagen se conserva el texto; no generar evidencia de resultados ni identidades.",
    },
  ],
  placement:
    "Así funciona: después de la demostración y antes del cierre de compra.",
  objection: "Consulta las características de este producto antes de elegirlo.",
  levers: ["Claridad visual", "Reducción de incertidumbre", "Valor respaldado"],
  content: z.object({
    heading: pdpHeading,
    items: z.array(pdpItem).min(2).max(4),
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
      heading: "Entiende qué hace cada parte",
      items: [
        {
          title: "El mecanismo principal",
          body: "La función descrita en la descripción del producto explica cómo trabaja el equipo.",
          fact_id: "00000000-0000-4000-8000-000000000001",
        },
        {
          title: "El complemento de uso",
          body: "Los accesorios cumplen la función indicada por el fabricante.",
          fact_id: "00000000-0000-4000-8000-000000000001",
        },
      ],
    },
    {
      heading: "Conoce el mecanismo del producto",
      items: [
        {
          title: "El mecanismo principal",
          body: "La función descrita en la descripción del producto explica cómo trabaja el equipo.",
          fact_id: "00000000-0000-4000-8000-000000000001",
        },
        {
          title: "El complemento de uso",
          body: "Los accesorios cumplen la función indicada por el fabricante.",
          fact_id: "00000000-0000-4000-8000-000000000001",
        },
      ],
    },
  ],
});
