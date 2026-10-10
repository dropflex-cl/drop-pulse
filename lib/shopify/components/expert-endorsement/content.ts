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
        "Imágenes elegidas y aprobadas en la página. Las pruebas de resultados y los retratos usan únicamente referencias reales.",
    },
  ],
  imageSlots: [
    {
      key: "portrait",
      label: "Retrato autorizado",
      min: 0,
      max: 1,
      ratio: "1:1",
      hint: "Foto en el orden del contenido. Sin imagen se conserva el texto; no generar evidencia de resultados ni identidades.",
    },
  ],
  placement:
    "Una opinión con respaldo: después de la demostración y antes del cierre de compra.",
  objection:
    "Todavía no hay una opinión profesional documentada para este producto.",
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
    "Hechos aprobados y verificados; referencias reales, reseñas aprobadas, políticas y precios publicados.",
  ],
  rules: [
    "Una idea principal por sección, textos cortos y concretos para móvil.",
    "No envíes contenido ficticio para rellenar: sin evidencia se publica el estado vacío.",
    "Todos los fact_id deben pertenecer a hechos aprobados y verificados del producto.",
    "El hecho debe documentar la identidad, credencial, declaración literal y autorización del profesional; el retrato es una referencia real.",
  ],
  forbidden: [
    "Testimonios, expertos, estudios, resultados, escasez o plazos inventados.",
    "Imágenes generadas usadas como evidencia.",
    "Regalos que no se entregan ni garantías que la tienda no ofrece.",
  ],
  examples: [
    {
      heading: "Conoce una opinión documentada",
      name: "Nombre del profesional",
      credential: "Especialidad documentada",
      quote:
        "Esta opinión de ejemplo debe reemplazarse por una declaración real y autorizada.",
      fact_id: "00000000-0000-4000-8000-000000000001",
    },
    {
      heading: "Conoce la opinión del profesional",
      name: "Nombre del profesional",
      credential: "Especialidad documentada",
      quote:
        "Esta opinión de ejemplo debe reemplazarse por una declaración real y autorizada.",
      fact_id: "00000000-0000-4000-8000-000000000001",
    },
  ],
});
