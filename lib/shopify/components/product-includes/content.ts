import * as z from "zod/v4";
import { PDP_COMPONENT_COPY_RULES } from "../_shared/pdp-writing";
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
  objection: "¿Qué recibo y cómo me ayuda cada elemento?",
  levers: ["Claridad visual", "Reducción de incertidumbre", "Valor respaldado"],
  content: z.object({
    heading: pdpHeading,
    items: z.array(pdpItem).min(1).max(6),
  }),
  realData: [
    "Contenido vigente del producto, imágenes disponibles y referencias opcionales. Precios y políticas salen de los datos comerciales.",
  ],
  rules: [
    ...PDP_COMPONENT_COPY_RULES,
  ],
  forbidden: [],
  examples: [
  {
    "heading": "Un lugar propio para los útiles de tu mesa",
    "items": [
      {
        "title": "Organizador de escritorio",
        "body": "Sus compartimentos reúnen los útiles que antes quedaban repartidos por la mesa. Colócalo al alcance de tu mano."
      }
    ]
  },
  {
    "heading": "Recibe el tónico y empieza por tus uñas",
    "items": [
      {
        "title": "Tónico con gotero",
        "body": "Recibes un tónico de jengibre y cúrcuma con gotero para aplicar el cuidado directamente sobre uñas y cutículas."
      }
    ]
  }
],
});
