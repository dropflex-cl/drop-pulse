import * as z from "zod/v4";
import { PDP_COMPONENT_COPY_RULES } from "../_shared/pdp-writing";
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
  objection: "¿Qué opción elijo para empezar a resolver lo que me trajo aquí?",
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
    "Contenido vigente del producto, imágenes disponibles y referencias opcionales. Precios y políticas salen de los datos comerciales.",
  ],
  rules: [
    ...PDP_COMPONENT_COPY_RULES,
    "Los precios, ahorros, pago, envío, devoluciones y garantía se leen de datos publicados. No escribir números ni nuevas políticas en el texto.",
  ],
  forbidden: [],
  examples: [
  {
    "heading": "Que buscar tus útiles deje de interrumpirte",
    "body": "Elige la opción que necesitas y dale un lugar a lo que usas cada día. Revisa tu oferta y confirma tu pedido.",
    "cta_label": "Pedir mi organizador"
  },
  {
    "heading": "Deja de posponer el cuidado de tus uñas",
    "body": "Empieza por esas uñas que hoy prefieres ocultar. Elige AntiHongos Pro y dedica el cuidado directamente a uñas y cutículas.",
    "cta_label": "Pedir mi AntiHongos Pro"
  }
],
});
