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
        "Imágenes elegidas en la página, de referencia o generadas.",
    },
  ],
  imageSlots: [
    {
      key: "items",
      label: "Contenido del paquete",
      min: 0,
      max: 6,
      ratio: "1:1",
      hint: "Foto en el orden del contenido. Sin imagen se conserva el texto.",
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
    "Contenido vigente del producto, imágenes disponibles y referencias opcionales. Precios y políticas salen de los datos comerciales.",
  ],
  rules: [
    "Una idea principal por sección, textos cortos y concretos para móvil.",
  ],
  forbidden: [],
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
