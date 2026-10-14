import * as z from "zod/v4";
import { PDP_COMPONENT_COPY_RULES } from "../_shared/pdp-writing";
import { defineComponent } from "../define";
import { pdpHeading, pdpItem } from "../_shared/pdp-content";

export function isImageOnlyUseCases(content: unknown): boolean {
  return (content as { display_mode?: string } | null)?.display_mode === "image_only";
}

const imageAlt = z.string().trim().regex(/^[^<>]*$/, "Escribe texto plano, sin HTML.").min(8).max(500)
  .describe("Describe el mensaje y los usos incluidos en la imagen para lectores de pantalla.");
const fields = { heading: pdpHeading.optional(), cases: z.array(pdpItem).min(2).max(5).optional(), image_alt: imageAlt.optional() };

// Los campos anteriores se conservan al cambiar el modo; no se imprimen en image_only.
export const useCasesSchema = z.union([
  z.object({ ...fields, display_mode: z.literal("image_only"), image_alt: imageAlt }),
  z.object({ ...fields, display_mode: z.literal("accordion").optional(), heading: pdpHeading, cases: z.array(pdpItem).min(2).max(5) }),
]);

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
        "Imágenes elegidas en la página, de referencia o generadas.",
    },
  ],
  imageSlots: [
    {
      key: "cases",
      label: "Fotos de los usos",
      min: 0,
      max: 5,
      ratio: "1:1",
      hint: "En Acordeones, una foto por uso. En Solo imagen, se muestra la primera imagen con el mensaje completo; las demás se conservan.",
    },
  ],
  placement:
    "Elige cómo lo usarías: después de la demostración y antes del cierre de compra.",
  objection: "¿En qué momento de mi vida aprovecharía esta solución?",
  levers: ["Claridad visual", "Reducción de incertidumbre", "Valor respaldado"],
  content: useCasesSchema,
  realData: [
    "Contenido vigente del producto, imágenes disponibles y referencias opcionales. Precios y políticas salen de los datos comerciales.",
  ],
  rules: [
    ...PDP_COMPONENT_COPY_RULES,
    "Si una infografía ya explica todos los usos, guarda display_mode: image_only e image_alt y asigna esa imagen a cases, posición 1. Requiere un archivo elegido; no muestra heading, títulos, descripciones ni acordeones.",
    "Sin display_mode, o con accordion, conserva el formato anterior: heading y entre 2 y 5 cases obligatorios; fotos opcionales. Cambiar de modo conserva textos, imágenes, variantes y visibilidad.",
  ],
  forbidden: [],
  examples: [
  {
    "heading": "Sigue con tu tarea sin buscar tus útiles",
    "cases": [
      {
        "title": "Cuando trabajas en el escritorio",
        "body": "Deja lápices y útiles juntos para encontrarlos al tomar una nota, sin interrumpir lo que estabas haciendo."
      },
      {
        "title": "Cuando cambias de actividad",
        "body": "Separa los útiles por compartimento y toma el que necesitas al pasar de escribir a dibujar."
      }
    ]
  },
  {
    "display_mode": "accordion",
    "heading": "Para las uñas que hoy prefieres ocultar",
    "cases": [
      {
        "title": "Cuando eliges zapatos cerrados",
        "body": "Si la apariencia de tus uñas te hace dejar las sandalias guardadas, empieza por darles un cuidado localizado."
      },
      {
        "title": "Cuando notas resequedad",
        "body": "Incluye uñas y cutículas en tu cuidado: suelen pasar desapercibidas hasta que se ven resecas o descuidadas."
      },
      {
        "title": "Cuando también miras tus manos",
        "body": "Lleva esa misma atención a las uñas de las manos. El gotero permite concentrar la aplicación en cada zona."
      }
    ]
  }
],
});
