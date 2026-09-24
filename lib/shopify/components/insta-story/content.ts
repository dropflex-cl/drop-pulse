import * as z from "zod/v4";
import { defineComponent } from "../define";

/** Cifras, escasez inventada, autoridad sin respaldo o testimonios sobre medios que no son UGC real. */
const safeCaption = (field: string) =>
  z
    .string()
    .refine((s) => !/\d/.test(s), { message: `${field}: sin cifras escritas (vendidos, plazos, cantidades)` })
    .refine((s) => !/expert|doctor|médic|kinesiólog|fisioterapeut|recomendado por|clientes? feli|reseña|["“”«»]/i.test(s), {
      message: `${field}: sin autoridad ni testimonios (expertos, médicos, «clientes felices», citas)`,
    })
    .refine((s) => !/\bcura|corrige|alivia|elimina el dolor|escoliosis|últimas unidades|se agota/i.test(s), {
      message: `${field}: sin claims de salud ni escasez`,
    });

export const instaStory = defineComponent({
  id: "insta-story",
  name: "DropFlex · Historias",
  kind: "section",
  file: "sections/df-insta-story.liquid",
  metafield: { namespace: "dropflex", key: "insta_story", type: "json" },
  media: [
    {
      key: "insta_story_media",
      type: "list.file_reference",
      source:
        "Imágenes y videos verticales (9:16) reales, subidos por el comerciante o del proveedor, en el orden de la secuencia. Nunca generados por la IA de textos; una persona generada con IA no se presenta como cliente ni experto.",
    },
  ],
  imageSlots: [
    { key: "stories", label: "Historias", min: 3, max: 10, ratio: "9:16", hint: "Una imagen vertical por historia, en el orden de la secuencia. Fotos reales del producto en uso." },
  ],
  placement:
    "Parte alta de la landing (bajo el hero) o a mitad de página como «producto en uso» antes de los testimonios: imita la interfaz de historias de la que viene el tráfico de Meta y TikTok.",
  objection: "¿Cómo es esto en la vida real? ¿Me servirá? Y la duda de legitimidad: ¿es una tienda real?",
  levers: [
    "Familiaridad: el patrón de historias no tiene curva de aprendizaje para el tráfico de Meta y TikTok.",
    "Curiosidad (Zeigarnik): el aro de color dice «hay algo sin ver»; al verlo se apaga.",
    "Continuidad anuncio → tienda: menos disonancia y rebote.",
    "Consumo pasivo con avance automático: segundos de demostración sin decidir nada; las barras invitan a terminar.",
    "Demostración: el producto en uso vale más que una ficha técnica.",
    "Cierre con llamado sin riesgo en la última historia (pagar al recibir).",
  ],
  content: z
    .object({
      heading: z.string().min(6).max(32).optional()
        .describe("«Verbo de ver + contexto»: «Míralo en acción», «Así se usa»."),
      stories: z
        .array(
          z.object({
            title: safeCaption("title").pipe(z.string().min(3).max(16))
              .describe("1-2 palabras bajo el círculo: sustantivo o momento de uso («Cómo se usa», «Detalle», «En la oficina»). Nada de frases."),
            caption_line_1: safeCaption("caption_line_1").pipe(z.string().min(6).max(28))
              .describe("Contexto o beneficio observable, ≈ 20 caracteres: «Te lo pones en segundos»."),
            caption_line_2: safeCaption("caption_line_2").pipe(z.string().min(3).max(24)).optional()
              .describe("Remate en acento, 1-4 palabras: «sin ayuda», «no rozan»."),
            cta_label: z.string().min(4).max(22).optional()
              .describe("Solo en la última historia (máx. 2): verbo + riesgo cero COD. «Pedir y pagar al recibir»."),
          }),
        )
        .min(3)
        .max(10)
        .describe("Una por medio, en el MISMO orden que insta_story_media: gancho → cómo se usa → detalle → uso diario → cierre con CTA."),
    })
    .superRefine((c, ctx) => {
      const ctas = c.stories.filter((s) => s.cta_label).length;
      if (ctas > 2) ctx.addIssue({ code: "custom", path: ["stories"], message: "cta_label en 2 historias como máximo" });
    }),
  realData: [
    "Medios: dropflex.insta_story_media (list.file_reference) o los bloques del editor; archivos reales subidos. La IA solo recibe su descripción o transcripción y escribe el texto de cada uno, alineado por índice.",
    "Duración: imágenes según el ajuste de la sección; videos, su duración real (se lee del video al reproducir).",
    "Destino del botón: la página del producto, un #ancla de la página o el enlace del bloque. Precio y oferta, si se muestran, salen de Liquid, nunca del texto.",
    "UGC de clientes solo si es real y con permiso, y se nombra como tal.",
  ],
  rules: [
    "Español neutro con tuteo, directo y visual, como un caption de reel; se leen 12 a 15 palabras en 5 segundos.",
    "Secuencia de 4 a 6: gancho o resultado visual, cómo se usa, detalle o calidad, uso diario y cierre con CTA.",
    "Línea 1 = contexto o beneficio observable; línea 2 = el remate que vende, corto.",
    "Etiquetas de 1-2 palabras; nunca repetir el título en cada historia.",
    "cta_label solo en la última historia (o como mucho en 2). Exclamación solo en el cierre. Sin emojis.",
    "El texto describe lo que se VE en el medio; nada que el medio no muestre.",
  ],
  forbidden: [
    "Atribuir recomendaciones a expertos, doctores, kinesiólogos o fisioterapeutas sin respaldo.",
    "«Clientes felices», «reseña de…» o citas sobre un medio que no es UGC real (regla FTC 2024 como referencia).",
    "Presentar una imagen generada con IA de una persona como cliente o experto.",
    "Cifras («+5.000 vendidos») o escasez («últimas unidades») (Ley 19.496 arts. 28 y 33).",
    "Claims de salud («elimina el dolor», «corrige la escoliosis»).",
  ],
  examples: [
    {
      heading: "Míralo en acción",
      stories: [
        { title: "Postura", caption_line_1: "Hombros hacia atrás", caption_line_2: "sin pensarlo" },
        { title: "Cómo se usa", caption_line_1: "Te lo pones en segundos", caption_line_2: "sin ayuda" },
        { title: "Detalle", caption_line_1: "Correas acolchadas", caption_line_2: "que no rozan" },
        { title: "En la oficina", caption_line_1: "Discreto bajo tu ropa", caption_line_2: "nadie lo nota" },
        { title: "Pídelo", caption_line_1: "Llega a tu casa y", caption_line_2: "pagas al recibir", cta_label: "Pedir ahora" },
      ],
    },
    {
      heading: "Elige tu ajuste",
      stories: [
        { title: "Talla S-M", caption_line_1: "Para contextura delgada", caption_line_2: "o media" },
        { title: "Talla L-XL", caption_line_1: "Más largo en correas", caption_line_2: "y espalda" },
        { title: "Qué incluye", caption_line_1: "Tu corrector y la guía", caption_line_2: "de uso en la caja" },
        { title: "Pídelo", caption_line_1: "Sin pagar nada", caption_line_2: "por adelantado", cta_label: "Pagar al recibir" },
      ],
    },
  ],
});
