import * as z from "zod/v4";
import { PDP_COMPONENT_COPY_RULES } from "../_shared/pdp-writing";
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
    "Contenido vigente del producto, imágenes disponibles y referencias opcionales. Precios y políticas salen de los datos comerciales.",
  ],
  rules: [
    ...PDP_COMPONENT_COPY_RULES,
    "Los precios, ahorros, pago, envío, devoluciones y garantía se leen de datos publicados. No escribir números ni nuevas políticas en el texto.",
  ],
  forbidden: [],
  examples: [
  {
    "heading": "Haz tu pedido con las condiciones claras",
    "body": "Elige el producto y revisa las condiciones vigentes antes de confirmar. Aquí tienes el pago y el envío de tu pedido."
  },
  {
    "heading": "Empieza sin adelantar el pago",
    "body": "Elige tu tónico, confirma tu pedido y paga cuando llegue a tu casa. El envío gratuito acompaña tu compra."
  }
],
});
