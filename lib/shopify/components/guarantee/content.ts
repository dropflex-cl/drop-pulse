import * as z from "zod/v4";
import { defineComponent } from "../define";
import { pdpHeading, pdpBody } from "../_shared/pdp-content";
export const guarantee = defineComponent({
  id: "guarantee",
  name: "DropFlex · Garantía",
  kind: "section",
  file: "sections/df-guarantee.liquid",
  metafield: { namespace: "dropflex", key: "guarantee", type: "json" },
  media: [],
  imageSlots: [],
  placement:
    "Compra con confianza: después de la demostración y antes del cierre de compra.",
  objection: "Consulta las condiciones de cambios y garantía antes de comprar.",
  levers: ["Claridad visual", "Reducción de incertidumbre", "Valor respaldado"],
  content: z.object({ heading: pdpHeading, body: pdpBody }),
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
      heading: "Compra con las condiciones claras",
      body: "Revisa las condiciones de pago, cambios y garantía disponibles para tu compra.",
    },
    {
      heading: "Conoce las condiciones de tu compra",
      body: "Revisa las condiciones de pago, cambios y garantía disponibles para tu compra.",
    },
  ],
});
