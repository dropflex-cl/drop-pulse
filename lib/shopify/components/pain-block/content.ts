import * as z from "zod/v4";
import { defineComponent } from "../define";

const noDigits = (field: string) =>
  z.string().refine((s) => !/\d/.test(s), {
    message: `${field}: sin cifras ni plazos; el dolor se cuenta con palabras`,
  });

/** Promesas de salud o de resultado (Ley 19.496, art. 28; sin registro ISP). */
const noHealthClaims = (field: string) =>
  z.string().refine((s) => !/\b(cura|curar|corrige|alivia|elimina|previene|sana tu|rejuvenec|garantizad|certificad|aprobado por|el mejor)/i.test(s), {
    message: `${field}: sin afirmaciones de salud, promesas de resultado ni superlativos`,
  });

/** Diagnosticar o humillar al lector en segunda persona («tienes la piel…», «tu cara se ve…»). */
const noDiagnosis = (field: string) =>
  z.string().refine((s) => !/\btienes (la |el |una |un )?(piel|cara|pelo|cabello|espalda|postura|columna|sobrepeso|arrugas|acn[ée])|\btu (cara|piel|cuerpo|espalda|pelo|cabello) (se ve|est[áa])/i.test(s), {
    message: `${field}: no diagnostiques ni juzgues al lector; cuéntalo en primera o tercera persona`,
  });

const sober = (field: string) =>
  z.string().refine((s) => !/[!¡]/.test(s), { message: `${field}: sobrio, sin exclamaciones` });

const text = (field: string) => noDigits(field).pipe(noHealthClaims(field)).pipe(noDiagnosis(field)).pipe(sober(field));

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
    "Un momento por ángulo de venta: quien llega desde cualquiera de los anuncios encuentra su escena.",
    "Dolor antes que producto: la solución vale más cuando el problema ya está nombrado.",
    "Puente al diferenciador: el remate explica qué faltaba, y la página sigue con el producto que lo trae.",
  ],
  content: z
    .object({
      heading: text("heading").pipe(z.string().min(8).max(48))
        .describe("Una pregunta de reconocimiento, sin diagnosticar. Ej.: «¿Te pasa esto frente al espejo?»."),
      moments: z
        .array(
          z.object({
            slot: z.number().int().min(1).max(3).describe("El ángulo de venta al que le hace puente (1, 2 o 3)."),
            title: text("title").pipe(z.string().min(8).max(40))
              .describe("La escena en pocas palabras, sin punto final. Ej.: «La cara tirante a las siete»."),
            text: text("text").pipe(z.string().min(30).max(160))
              .describe("1 o 2 oraciones en primera persona («me lavo la cara…») o tercera («quienes ya usan crema…»), con las palabras del cliente ideal."),
          }),
        )
        .length(3)
        .describe("Exactamente 3 momentos, uno por ángulo de venta (slot 1, 2 y 3)."),
      bridge: text("bridge").pipe(z.string().min(20).max(120))
        .describe("Una frase que lleva del dolor al diferenciador del producto (qué faltaba), no a la oferta. Ej.: «La crema sella. Lo que faltaba es el paso de antes: unas gotas ligeras sobre piel limpia.»."),
    })
    .superRefine((c, ctx) => {
      const slots = c.moments.map((m) => m.slot);
      if (new Set(slots).size !== slots.length) {
        ctx.addIssue({ code: "custom", path: ["moments"], message: "un momento por ángulo: los slot no se repiten" });
      }
    }),
  realData: ["Ninguno: es solo texto. No lleva cifras, plazos ni tokens de la tienda."],
  rules: [
    "Primera persona («me lavo la cara y a media mañana…») o tercera («quienes ya usan crema…»); nunca la segunda persona para describir el problema.",
    "Las palabras y las escenas salen del cliente ideal (voice_of_customer y trigger_moments); nada de contexto inventado.",
    "Cada momento le hace puente a un ángulo de venta distinto (slot 1, 2 y 3). Si hay menos ángulos, el que falta sale de los momentos del cliente ideal.",
    "Título del momento: la escena en 3 a 6 palabras, concreta y sin punto final.",
    "El remate (bridge) lleva al diferenciador del producto (qué faltaba), no a la oferta, al precio ni al pago al recibir.",
    "Sobrio y cercano: sin exclamaciones, sin mayúsculas sostenidas, sin dramatizar.",
  ],
  forbidden: [
    "Diagnosticar al lector («tienes la piel deshidratada», «tu postura está mal»).",
    "Cifras y plazos («en siete días», «el noventa por ciento»), escritos con números o con palabras.",
    "Promesas de resultado y afirmaciones de salud («elimina las arrugas», «corrige la columna»).",
    "Humillar o dramatizar («tu cara se ve vieja», «das vergüenza»).",
    "Segunda persona sobre edad, salud o peso («a tu edad», «con tu sobrepeso»).",
  ],
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
      bridge: "La crema sella. Lo que faltaba es el paso de antes: unas gotas ligeras sobre piel limpia.",
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
