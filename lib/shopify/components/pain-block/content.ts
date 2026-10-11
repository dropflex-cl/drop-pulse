import * as z from "zod/v4";
import { defineComponent } from "../define";

const text = () => z.string();

export const painBlock = defineComponent({
  id: "pain-block",
  name: "DropFlex · Lo que te pasa",
  kind: "section",
  file: "sections/df-pain-block.liquid",
  metafield: { namespace: "dropflex", key: "pain_block", type: "json" },
  media: [],
  placement:
    "Primer bloque del cuerpo, justo después de la galería y la ficha y antes de la foto con razones (image-with-benefits): antes de explicar el producto, el comprador se reconoce en lo que le pasa.",
  objection: "¿Esto es para mí? ¿Entienden lo que me pasa?",
  levers: [
    "Reconocimiento: el lector se ve en una escena concreta con sus propias palabras y siente que la tienda lo entiende.",
    "Coherencia con el anuncio: los momentos desarrollan el argumento de la variante seleccionada.",
    "Dolor antes que producto: la solución vale más cuando el problema ya está nombrado.",
    "Puente al diferenciador: el remate explica qué faltaba, y la página sigue con el producto que lo trae.",
  ],
  content: z
    .object({
      heading: text().pipe(z.string().min(8).max(48))
        .describe("Una pregunta de reconocimiento, sin diagnosticar. Ej.: «¿Te pasa esto frente al espejo?»."),
      moments: z
        .array(
          z.object({
            slot: z.number().int().min(1).max(3).describe("Orden del momento dentro del argumento activo (1, 2 o 3)."),
            title: text().pipe(z.string().min(8).max(40))
              .describe("La escena en pocas palabras, sin punto final. Ej.: «La cara tirante a las siete»."),
            text: text().pipe(z.string().min(30).max(160))
              .describe("1 o 2 oraciones en primera persona («me lavo la cara…») o tercera («quienes ya usan crema…»), con palabras de todos los días."),
          }),
        )
        .min(1).max(3)
        .describe("De 1 a 3 momentos del mensaje activo. slot identifica el momento, sin repetir."),
      bridge: text().pipe(z.string().min(20).max(120))
        .describe("Una frase que lleva del dolor al diferenciador del producto (qué faltaba), no a la oferta. Ej.: «La crema cubre la superficie. Lo que faltaba es colágeno concentrado, en gotas, donde la piel lo necesita.». Es la solución, no un complemento."),
    })
    .superRefine((c, ctx) => {
      const slots = c.moments.map((m) => m.slot);
      if (new Set(slots).size !== slots.length) {
        ctx.addIssue({ code: "custom", path: ["moments"], message: "los momentos no repiten su orden" });
      }
    }),
  realData: ["Ninguno: es solo texto. No lleva cifras, plazos ni tokens de la tienda."],
  rules: [
    "Primera persona («me lavo la cara y a media mañana…») o tercera («quienes ya usan crema…»); nunca la segunda persona para describir el problema.",
    "Cada momento sale del argumento de venta (el momento de su ángulo); nada de contexto inventado.",
    "Cada momento sostiene el ángulo activo. Usa slot 1, 2 y 3 para ordenar, sin mezclar mensajes de otras variantes.",
    "Título del momento: la escena en 3 a 6 palabras, concreta y sin punto final.",
    "El remate (bridge) lleva al diferenciador del producto (qué faltaba), no a la oferta, al precio ni al pago al recibir.",
    "Sobrio y cercano: sin exclamaciones, sin mayúsculas sostenidas, sin dramatizar.",
  ],
  forbidden: [],
  examples: [
    {
      heading: "¿Te pasa esto frente al espejo?",
      moments: [
        {
          slot: 1,
          title: "Otra crema más en el velador",
          text: "Probé cremas más espesas, mascarillas y colágeno de tomar. Nunca supe si algo hizo efecto: solo sé que seguía comprando lo mismo.",
        },
        {
          slot: 2,
          title: "La cara tirante a las siete",
          text: "Me lavo la cara, me echo crema y a media mañana la piel vuelve a sentirse tirante, como si la crema tapara algo que no está debajo.",
        },
        {
          slot: 3,
          title: "La base marcada en las líneas",
          text: "Tengo treinta y tantos y lo que más me molesta es ver la base acumulada al lado de la nariz. En las fotos del trabajo mi cara se ve apagada.",
        },
      ],
      bridge: "La crema cubre la superficie. Lo que faltaba es colágeno concentrado, en gotas, donde la piel lo necesita.",
    },
    {
      heading: "¿Te reconoces al final del día?",
      moments: [
        {
          slot: 1,
          title: "Encorvada frente al computador",
          text: "Paso la jornada frente al computador y recién en la tarde me doy cuenta de lo encorvada que estuve.",
        },
        {
          slot: 2,
          title: "Me enderezo y se me olvida",
          text: "Me enderezo cuando me acuerdo, pero a los pocos minutos vuelvo a la misma postura sin darme cuenta.",
        },
        {
          slot: 3,
          title: "Los hombros en las fotos",
          text: "Quienes trabajan sentados lo notan en las fotos: los hombros caen hacia adelante y la espalda se ve curva.",
        },
      ],
      bridge: "No falta fuerza de voluntad, falta un recordatorio: correas que llevan los hombros suavemente hacia atrás.",
    },
  ],
});
