import * as z from "zod/v4";
import { defineComponent } from "../define";
import { pdpHeading, pdpBody } from "../_shared/pdp-content";
export const offerSummary = defineComponent({
  id: "offer-summary",
  name: "DropFlex · Elige tu pack",
  kind: "section",
  file: "sections/df-offer-summary.liquid",
  metafield: { namespace: "dropflex", key: "offer_summary", type: "json" },
  media: [],
  imageSlots: [],
  placement:
    "Elige tu pack: después de la demostración y antes del cierre de compra.",
  objection:
    "Consulta el precio y las opciones de compra en la ficha del producto.",
  levers: ["Claridad visual", "Reducción de incertidumbre", "Valor respaldado"],
  content: z.object({
    heading: pdpHeading,
    body: pdpBody,
    cta_label: z
      .string()
      .regex(/^[^<>]*$/, "Escribe texto plano, sin HTML.")
      .min(3)
      .max(35),
  }),
  realData: [
    "Hechos aprobados y verificados; referencias reales, reseñas aprobadas, políticas y precios publicados.",
  ],
  rules: [
    "Una idea principal por sección, textos cortos y concretos para móvil.",
    "No envíes contenido ficticio para rellenar: sin evidencia se publica el estado vacío.",
    "Todos los fact_id deben pertenecer a hechos aprobados y verificados del producto.",
    "Los precios, ahorros, pago, envío, devoluciones y garantía se leen de datos publicados. No escribir números ni nuevas políticas en el texto.",
  ],
  forbidden: [
    "Testimonios, expertos, estudios, resultados, escasez o plazos inventados.",
    "Imágenes generadas usadas como evidencia.",
    "Regalos que no se entregan ni garantías que la tienda no ofrece.",
  ],
  examples: [
    {
      heading: "Elige la opción para tu compra",
      body: "Compara las opciones disponibles y revisa el precio de cada pack.",
      cta_label: "Elegir mi pack",
    },
    {
      heading: "Conoce las opciones de tu compra",
      body: "Compara las opciones disponibles y revisa el precio de cada pack.",
      cta_label: "Elegir mi pack",
    },
  ],
});
