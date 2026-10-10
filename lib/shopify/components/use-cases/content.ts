import * as z from "zod/v4";
import { defineComponent } from "../define";
import { pdpHeading, pdpItem } from "../_shared/pdp-content";
export const useCases = defineComponent({
  id: "use-cases",
  name: "DropFlex · Usos",
  kind: "section",
  file: "sections/df-use-cases.liquid",
  metafield: { namespace: "dropflex", key: "use_cases", type: "json" },
  media: [
    {
      key: "use_cases_cases",
      type: "list.file_reference",
      source:
        "Imágenes elegidas y aprobadas en la página. Las pruebas de resultados y los retratos usan únicamente referencias reales.",
    },
  ],
  imageSlots: [
    {
      key: "cases",
      label: "Fotos de los usos",
      min: 0,
      max: 5,
      ratio: "1:1",
      hint: "Foto en el orden del contenido. Sin imagen se conserva el texto; no generar evidencia de resultados ni identidades.",
    },
  ],
  placement:
    "Elige cómo lo usarías: después de la demostración y antes del cierre de compra.",
  objection: "Consulta si este producto se adapta al uso que buscas.",
  levers: ["Claridad visual", "Reducción de incertidumbre", "Valor respaldado"],
  content: z.object({
    heading: pdpHeading,
    cases: z.array(pdpItem).min(2).max(5),
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
      heading: "Encuentra el uso que necesitas",
      cases: [
        {
          title: "En casa",
          body: "Úsalo en las superficies compatibles que indica el fabricante.",
          fact_id: "00000000-0000-4000-8000-000000000001",
        },
        {
          title: "En tu rutina",
          body: "Guarda el equipo según las indicaciones después de cada uso.",
          fact_id: "00000000-0000-4000-8000-000000000001",
        },
      ],
    },
    {
      heading: "Conoce los usos del producto",
      cases: [
        {
          title: "En casa",
          body: "Úsalo en las superficies compatibles que indica el fabricante.",
          fact_id: "00000000-0000-4000-8000-000000000001",
        },
        {
          title: "En tu rutina",
          body: "Guarda el equipo según las indicaciones después de cada uso.",
          fact_id: "00000000-0000-4000-8000-000000000001",
        },
      ],
    },
  ],
});
