import * as z from "zod/v4";
import { defineComponent } from "../define";
import { pdpHeading, pdpItem } from "../_shared/pdp-content";
export const productIncludes = defineComponent({
  id: "product-includes",
  name: "DropFlex · En tu caja",
  kind: "section",
  file: "sections/df-product-includes.liquid",
  metafield: { namespace: "dropflex", key: "product_includes", type: "json" },
  media: [
    {
      key: "product_includes_items",
      type: "list.file_reference",
      source:
        "Imágenes elegidas y aprobadas en la página. Las pruebas de resultados y los retratos usan únicamente referencias reales.",
    },
  ],
  imageSlots: [
    {
      key: "items",
      label: "Contenido del paquete",
      min: 0,
      max: 6,
      ratio: "1:1",
      hint: "Foto en el orden del contenido. Sin imagen se conserva el texto; no generar evidencia de resultados ni identidades.",
    },
  ],
  placement:
    "Qué incluye tu compra: después de la demostración y antes del cierre de compra.",
  objection: "Confirma aquí el contenido del paquete antes de comprar.",
  levers: ["Claridad visual", "Reducción de incertidumbre", "Valor respaldado"],
  content: z.object({
    heading: pdpHeading,
    items: z.array(pdpItem).min(1).max(6),
  }),
  realData: [
    "Hechos aprobados y verificados; referencias reales, reseñas aprobadas, políticas y precios publicados.",
  ],
  rules: [
    "Una idea principal por sección, textos cortos y concretos para móvil.",
    "No envíes contenido ficticio para rellenar: sin evidencia se publica el estado vacío.",
    "Todos los fact_id deben pertenecer a hechos aprobados y verificados del producto.",
    "Solo elementos que realmente se entregan con el producto. Los regalos requieren estar incluidos en el paquete real; este componente no añade productos al checkout.",
  ],
  forbidden: [
    "Testimonios, expertos, estudios, resultados, escasez o plazos inventados.",
    "Imágenes generadas usadas como evidencia.",
    "Regalos que no se entregan ni garantías que la tienda no ofrece.",
  ],
  examples: [
    {
      heading: "Todo lo que viene en tu paquete",
      items: [
        {
          title: "Equipo principal",
          body: "El equipo que aparece en la descripción del producto viene incluido en tu compra.",
          fact_id: "00000000-0000-4000-8000-000000000001",
        },
        {
          title: "Accesorios de uso",
          body: "Los accesorios indicados en el contenido del paquete acompañan al equipo.",
          fact_id: "00000000-0000-4000-8000-000000000001",
        },
      ],
    },
    {
      heading: "Conoce el contenido de tu compra",
      items: [
        {
          title: "Equipo principal",
          body: "El equipo que aparece en la descripción del producto viene incluido en tu compra.",
          fact_id: "00000000-0000-4000-8000-000000000001",
        },
        {
          title: "Accesorios de uso",
          body: "Los accesorios indicados en el contenido del paquete acompañan al equipo.",
          fact_id: "00000000-0000-4000-8000-000000000001",
        },
      ],
    },
  ],
});
