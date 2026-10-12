import * as z from "zod/v4";
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
  objection: "Consulta si este producto se adapta al uso que buscas.",
  levers: ["Claridad visual", "Reducción de incertidumbre", "Valor respaldado"],
  content: useCasesSchema,
  realData: [
    "Contenido vigente del producto, imágenes disponibles y referencias opcionales. Precios y políticas salen de los datos comerciales.",
  ],
  rules: [
    "Una idea principal por sección, textos cortos y concretos para móvil.",
    "Si una infografía ya explica todos los usos, guarda display_mode: image_only e image_alt y asigna esa imagen a cases, posición 1. Requiere un archivo elegido; no muestra heading, títulos, descripciones ni acordeones.",
    "Sin display_mode, o con accordion, conserva el formato anterior: heading y entre 2 y 5 cases obligatorios; fotos opcionales. Cambiar de modo conserva textos, imágenes, variantes y visibilidad.",
  ],
  forbidden: [],
  examples: [
    {
      heading: "Encuentra el uso que necesitas",
      cases: [
        {
          title: "En casa",
          body: "Úsalo en las superficies compatibles que indica el fabricante.",
          fact_id: "00000000-0000-4000-8000-000000000001",
        },
        {
          title: "En tu rutina",
          body: "Guarda el equipo según las indicaciones después de cada uso.",
          fact_id: "00000000-0000-4000-8000-000000000001",
        },
      ],
    },
    {
      display_mode: "image_only",
      image_alt: "Tres usos del organizador: en casa, durante el trabajo y al guardar las herramientas después de usarlas.",
    },
    {
      heading: "Conoce los usos del producto",
      cases: [
        {
          title: "En casa",
          body: "Úsalo en las superficies compatibles que indica el fabricante.",
          fact_id: "00000000-0000-4000-8000-000000000001",
        },
        {
          title: "En tu rutina",
          body: "Guarda el equipo según las indicaciones después de cada uso.",
          fact_id: "00000000-0000-4000-8000-000000000001",
        },
      ],
    },
  ],
});
