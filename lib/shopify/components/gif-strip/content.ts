import * as z from "zod/v4";
import { defineComponent, ICON_KEYS } from "../define";

/** Los textos que escribe la IA: uno por GIF posible. El GIF N lleva el texto N; con 3 GIF, los 3 primeros. */
export const GIF_TEXTS = 5;

const noEndPunctuation = (s: string) => !/[.!]$/.test(s.trim());

const bullet = z.object({
  icon: z.enum(ICON_KEYS).describe("Ícono que calza con su línea; uno distinto por línea."),
  text: z
    .string()
    .min(3)
    .max(40)
    .refine(noEndPunctuation, { message: "Sin punto final" })
    .describe("2 a 6 palabras: el beneficio primero, el mecanismo después."),
});

// Un solo cuerpo por GIF: el párrafo (`text`) o la lista (`bullets`). Dos campos opcionales y no una
// unión: el formulario de edición los muestra como dos campos y el Liquid dibuja el que haya.
const item = z
  .object({
    heading: z
      .string()
      .min(12)
      .max(70)
      .describe(
        "La línea sobre el GIF: dice qué mirar. Una pregunta con una CONDUCTA que el comprador se reconoce haciendo («¿Te agarras de la pared al entrar a la ducha?»), o una afirmación que responde 2 o 3 dudas a la vez («Firme, sin taladro y lista en un minuto»). Nunca abre con el nombre del producto.",
      ),
    text: z
      .string()
      .min(40)
      .max(160)
      .optional()
      .describe("Párrafo bajo el GIF (o bullets, nunca los dos): hasta 2 oraciones, lo que hace el producto en ese momento + el resultado que se ve. Una cifra solo si está en la ficha."),
    bullets: z
      .array(bullet)
      .min(2)
      .max(4)
      .refine((list) => new Set(list.map((i) => i.icon)).size === list.length, { message: "Un ícono distinto por línea" })
      .optional()
      .describe("Lista bajo el GIF (o text, nunca los dos): 2 a 4 líneas cortas con su ícono."),
  })
  .refine((i) => Boolean(i.text) !== Boolean(i.bullets?.length), { message: "Bajo el GIF va un párrafo o una lista, no los dos." });

export const gifStrip = defineComponent({
  id: "gif-strip",
  name: "DropFlex · GIFs",
  kind: "block",
  file: "blocks/df-gif-strip.liquid",
  metafield: { namespace: "dropflex", key: "gif_strip", type: "json" },
  media: [
    {
      key: "gif_strip_media",
      type: "list.file_reference",
      source: "Los GIF que el comerciante sube en la etapa Imágenes (espacio GIFs), en su orden, re-codificados como WebP animado. Nunca de la IA.",
    },
  ],
  placement:
    "Columna del producto, bajo el botón y la doble tarjeta: responde «¿de verdad hace eso?» mientras el comprador todavía mira el precio y el botón, que es cuando se lo pregunta. A media página la prueba llega tarde.",
  objection: "¿De verdad hace lo que dice? ¿Cómo se ve funcionando?",
  levers: [
    "Demostración: el mecanismo funcionando convence más que cualquier foto fija o adjetivo.",
    "Atención: el movimiento detiene el scroll; el título le dice al comprador qué mirar y el texto convierte lo que vio en promesa.",
    "Reconocimiento: un título que nombra una conducta («¿Te agarras de la pared…?») hace que el lector se vea en la escena.",
    "Liviano: un GIF corto no frena la página como un video.",
  ],
  content: z.object({
    gifs: z
      .array(item)
      .length(GIF_TEXTS)
      .describe(
        `Exactamente ${GIF_TEXTS} textos, el MÁS FUERTE PRIMERO: el comerciante sube de 1 a ${GIF_TEXTS} GIF y el GIF N usa el texto N, así que con 2 GIF solo se ven los 2 primeros. Cada uno muestra un momento o beneficio distinto del producto funcionando.`,
      ),
  }),
  realData: [
    "Los GIF: product.metafields.dropflex.gif_strip_media (list.file_reference), los que sube el comerciante en Imágenes. Se muestran tantos textos como GIF haya; sin GIF, el bloque no aparece.",
    "La IA no ve los GIF: escribe los 5 momentos más convincentes del producto y el comerciante ordena sus GIF (o edita los textos) para que calcen.",
  ],
  rules: [
    `Exactamente ${GIF_TEXTS} textos, ordenados del más fuerte al más débil: si el comerciante sube pocos GIF, se usan los primeros.`,
    "Cada texto, un momento distinto del producto funcionando (el problema en acción, el uso, el resultado, un detalle, la facilidad). Nunca dos del mismo punto con otras palabras.",
    "Título (heading): pregunta con una conducta cotidiana del comprador, o una afirmación que responde 2 o 3 dudas a la vez. Sin el nombre del producto al comienzo. Mayúscula inicial, el resto en minúscula.",
    "Bajo el GIF va text (párrafo) o bullets (lista), nunca los dos. Alterna párrafo y lista a lo largo de los 5; cinco listas iguales se leen como formulario. En el párrafo, qué hace + el resultado visible; una cifra solo si está en la ficha. En la lista, el beneficio antes que el mecanismo («Agarre firme, con ventosas»).",
    "Ataca el costo de la alternativa cuando aplique («sin taladro, sin gasfiter»). Valida antes de vender si el título nombra un miedo.",
    "Describe lo que un GIF típico del producto puede mostrar: el uso, el mecanismo, el antes y el después visible. Nunca algo que no se vería en una animación de pocos segundos.",
  ],
  forbidden: [
    "Promesas de salud o resultados médicos: «cura», «elimina», «trata», «garantiza resultados»; nunca afirmar que el lector TIENE una condición (Ley 19.496 art. 28; sin registro ISP).",
    "Precios, descuentos, packs o regalos: la ficha ya los muestra y cambian.",
    "Materiales, medidas, certificaciones o garantías que no están en la ficha del producto.",
    "Presentar el GIF como de un cliente («así lo usa María»): es el producto funcionando, no un testimonio.",
  ],
  examples: [
    {
      gifs: [
        {
          heading: "¿Te agarras de la pared cada vez que entras a la ducha?",
          text: "Se fija al azulejo con ventosas en segundos y te da un punto de apoyo firme justo donde lo necesitas, sin perforar nada.",
        },
        {
          heading: "Firme, sin taladro y lista en un minuto",
          bullets: [
            { icon: "hand", text: "Agarre firme con una mano" },
            { icon: "bolt", text: "Se instala sin herramientas" },
            { icon: "home", text: "No daña tus muros" },
          ],
        },
        {
          heading: "¿Te da miedo resbalar al salir de la tina?",
          text: "No estás exagerando: el piso mojado es donde más cuesta mantener el equilibrio. Tener dónde apoyarte cambia ese momento.",
        },
        {
          heading: "La llevas a donde la necesites",
          bullets: [
            { icon: "return", text: "Se quita y se vuelve a poner" },
            { icon: "globe", text: "Sirve en viajes y otras casas" },
          ],
        },
        {
          heading: "Así de simple se revisa que quedó bien",
          text: "El indicador de la ventosa te muestra de un vistazo si quedó firme, para que la uses con confianza todos los días.",
        },
      ],
    },
    {
      gifs: [
        {
          heading: "¿Sigues tallando el sartén con la esponja por minutos?",
          text: "El cepillo eléctrico gira por ti y saca la grasa pegada de una pasada, sin que tengas que hacer fuerza con la muñeca.",
        },
        {
          heading: "Un cabezal para cada rincón de la cocina",
          bullets: [
            { icon: "target", text: "Llega a esquinas y juntas" },
            { icon: "droplet", text: "Resiste el agua del lavaplatos" },
            { icon: "battery", text: "Se carga por cable USB" },
          ],
        },
        {
          heading: "Así queda la parrilla después del asado",
          text: "La cerda firme levanta lo quemado sin rayar la superficie, y terminas antes de que se enfríe la sobremesa.",
        },
        {
          heading: "Liviano, sin cables y fácil de guardar",
          bullets: [
            { icon: "feather", text: "Lo sostienes con una mano" },
            { icon: "home", text: "Cabe en un cajón" },
          ],
        },
        {
          heading: "Cambias el cabezal en segundos",
          text: "Se saca y se pone a presión, así usas uno para la loza y otro para el baño sin mezclar la suciedad.",
        },
      ],
    },
  ],
});
