import * as z from "zod/v4";
import { PDP_COMPONENT_COPY_RULES } from "../_shared/pdp-writing";
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
        "Imágenes elegidas en la página, de referencia o generadas.",
    },
  ],
  imageSlots: [
    {
      key: "main",
      label: "Detalle del mecanismo",
      min: 0,
      max: 1,
      ratio: "1:1",
      hint: "Foto en el orden del contenido. Sin imagen se conserva el texto.",
    },
  ],
  placement:
    "Así funciona: después de la demostración y antes del cierre de compra.",
  objection: "¿Por qué este formato me ayuda a conseguir el cambio que busco?",
  levers: ["Claridad visual", "Reducción de incertidumbre", "Valor respaldado"],
  content: z.object({
    heading: pdpHeading,
    items: z.array(pdpItem).min(2).max(4),
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
    "heading": "Encuentra cada útil sin revolver la mesa",
    "items": [
      {
        "title": "Un lugar para cada cosa",
        "body": "Los compartimentos separan lápices y útiles para que encuentres lo que necesitas sin apartar lo demás."
      },
      {
        "title": "Todo cerca de tu mano",
        "body": "Mantén los útiles juntos sobre el escritorio: cambia de tarea sin levantarte a buscarlos."
      }
    ]
  },
  {
    "heading": "El cuidado va justo donde lo necesitas",
    "items": [
      {
        "title": "Directo a la uña",
        "body": "El gotero lleva el tónico a la uña y la cutícula. Así puedes atender esa zona que suele quedar fuera del cuidado diario."
      },
      {
        "title": "Jengibre y cúrcuma",
        "body": "Una fórmula de cuidado con jengibre y cúrcuma para uñas y cutículas: atención específica para esa zona que hoy prefieres ocultar."
      },
      {
        "title": "Sin sensación pegajosa",
        "body": "Su textura ligera se absorbe rápido. Aplica, masajea y continúa con tus actividades sin dejar el cuidado para después."
      }
    ]
  }
],
});
