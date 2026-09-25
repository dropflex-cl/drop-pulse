import * as z from "zod/v4";
import { defineComponent } from "../define";

/** Tokens de política que la tienda reemplaza con datos reales; un token sin dato oculta la pregunta. */
const POLICY_TOKENS = /\{(min|max|return_days|warranty_months)\}/g;
/** «{rating} de 5» es la escala, no una cifra inventada. */
const PROOF_TOKENS = /\{rating\} de 5\b|\{(count|rating)\}/g;

const noDigits = (field: string, tokens: RegExp) =>
  z.string().refine((s) => !/\d/.test(s.replaceAll(tokens, "")), {
    message: `${field}: plazos, cifras y cantidades van como tokens, nunca escritos`,
  });

/** Promesas de salud o resultados (Ley 19.496; ISP/MINSAL para dispositivos y suplementos). */
const noHealthClaims = (field: string) =>
  z.string().refine((s) => !/\bcura|corrige|alivia|elimina el dolor|escoliosis|garantizad|el mejor|certificad|aprobado por/i.test(s), {
    message: `${field}: sin claims de salud, superlativos ni garantías que no son la política real`,
  });

/**
 * Temas, en el orden de la lista. `duracion` («¿Cuánto me dura?») es el único que puede llevar
 * dígitos: el rendimiento que dio el comerciante (la app valida aparte que esos números estén en
 * los datos del producto, lib/copy/facts.ts). Los demás siguen sin números.
 */
export const FAQ_TOPICS = ["pago_cod", "envio", "uso", "duracion", "talla_compat", "cuidado", "diferencial", "resultados", "garantia", "otro"] as const;
/** El tema que puede escribir cifras (rendimiento y meses de uso). */
export const DIGITS_TOPIC = "duracion";

const hasDigits = (s: string) => /\d/.test(s.replaceAll(POLICY_TOKENS, ""));

export const faqAndText = defineComponent({
  id: "faq-and-text",
  name: "DropFlex · FAQ con texto",
  kind: "section",
  file: "sections/df-faq-and-text.liquid",
  metafield: { namespace: "dropflex", key: "faq_and_text", type: "json" },
  media: [],
  placement:
    "Tercio inferior de la landing, después de beneficios, reseñas y comparativa y antes del último llamado: el comprador ya quiere el producto y solo le quedan dudas concretas (pago, plazo, uso, cambios).",
  objection: "Las dudas residuales que se convierten en «lo pienso y vuelvo»: ¿pago al recibir?, ¿cuándo llega?, ¿cómo se usa?, ¿y si no me sirve?",
  levers: [
    "Reducción de riesgo: la pregunta de cambios o garantía cierra la lista, en la posición de mayor recencia.",
    "Fluidez cognitiva: respuestas colapsadas; se escanean las preguntas y se abre solo la que importa.",
    "Transparencia: anticipar las preguntas transmite que la tienda conoce a su cliente.",
    "Validación en el título: la palabra en acento reconoce las dudas del lector («tus dudas»).",
    "Prueba social ligera junto al título, solo con el resumen real de reseñas ({rating}, {count}).",
  ],
  content: z
    .object({
      eyebrow: z.string().min(3).max(28).optional()
        .describe("Rótulo corto sobre el título: «Preguntas frecuentes»."),
      heading: noHealthClaims("heading").pipe(z.string().min(10).max(50))
        .describe("Tranquilidad + «tus dudas/preguntas», 3 a 7 palabras. Ej.: «Resolvemos tus dudas antes de pedir»."),
      heading_highlight: z.string().min(3).max(20).optional()
        .describe("1 o 2 palabras LITERALES del título que van en acento («tus dudas»)."),
      body: noDigits("body", POLICY_TOKENS).pipe(noHealthClaims("body")).pipe(z.string().min(20).max(160)).optional()
        .describe("Una frase de apoyo: dónde más resolver dudas (WhatsApp, soporte en español)."),
      cta_label: z.string().min(4).max(24).optional()
        .describe("Verbo + beneficio sin riesgo: «Pedir y pagar al recibir»."),
      social_proof_text: noDigits("social_proof_text", PROOF_TOKENS)
        .pipe(z.string().min(10).max(60))
        .refine((s) => /\{(count|rating)\}/.test(s), { message: "social_proof_text: requiere {count} o {rating} (resumen real de reseñas)" })
        .optional()
        .describe("Solo con reseñas reales: «{rating} de 5 según {count} reseñas». Sin tokens no se publica."),
      items: z
        .array(
          z.object({
            question: noDigits("question", POLICY_TOKENS).pipe(z.string().min(8).max(70).regex(/\?$/, "question: termina en «?»"))
              .describe("Como la pensaría el comprador, 1ª persona y coloquial, una sola pregunta. Ej.: «¿Pago cuando me llegue?»."),
            answer: noHealthClaims("answer").pipe(z.string().min(20).max(280))
              .describe("1ª frase responde directo («Sí.», «Entre {min} y {max} días hábiles.»), 2ª el detalle, 3ª opcional la red de seguridad. Sin números, salvo en la de duración (el rendimiento que dio el comerciante)."),
            topic: z.enum(FAQ_TOPICS).describe("Tema, para cobertura y orden. No se muestra. duracion = «¿Cuánto me dura?»."),
          }),
        )
        .min(3)
        .max(8)
        .describe("Orden COD: pago_cod, envio, uso, duracion, talla_compat, cuidado, diferencial, resultados, garantia al final."),
    })
    .superRefine((c, ctx) => {
      if (c.heading_highlight && !c.heading.includes(c.heading_highlight)) {
        ctx.addIssue({ code: "custom", path: ["heading_highlight"], message: "heading_highlight debe aparecer tal cual en heading" });
      }
      c.items.forEach((item, i) => {
        if (item.topic !== DIGITS_TOPIC && hasDigits(item.answer)) {
          ctx.addIssue({ code: "custom", path: ["items", i, "answer"], message: "answer: plazos, cifras y cantidades van como tokens, nunca escritos (solo la pregunta de duración lleva el rendimiento)" });
        }
      });
      const topics = new Set(c.items.map((i) => i.topic));
      for (const required of ["envio", "uso", "garantia"] as const) {
        if (!topics.has(required)) {
          ctx.addIssue({ code: "custom", path: ["items"], message: `falta una pregunta de ${required}` });
        }
      }
    }),
  realData: [
    "{min} y {max}: días de preparación + tránsito de shop.metafields.dropflex.logistics.",
    "{return_days} y {warranty_months}: shop.metafields.dropflex.policies. Una pregunta con un token sin dato no se muestra.",
    "Pago contra entrega: la pregunta pago_cod solo si policies.cod es verdadero.",
    "{count} y {rating}: product.metafields.dropflex.review_summary (reseñas aprobadas), con su source_label visible. Sin resumen, la prueba social se oculta.",
    "Avatares: imágenes del editor (clientes reales con permiso o ilustraciones), nunca de la IA.",
  ],
  rules: [
    "Español neutro con tuteo, cercano y seguro, frases cortas. Sin exclamaciones salvo un «¡Sí!» inicial; sin mayúsculas sostenidas.",
    "Cobertura mínima: envio, uso y garantia; pago_cod siempre que la tienda cobre al recibir. Máximo 8 preguntas.",
    "Orden: pago_cod → envio → uso → duracion → talla_compat → cuidado → diferencial → resultados → garantia (el cierre reduce el riesgo).",
    "Cada respuesta: la primera frase responde directo; ≤ 280 caracteres.",
    "Plazos, días de cambio y meses de garantía solo como {min}, {max}, {return_days}, {warranty_months}.",
    "La pregunta de duración («¿Cuánto me dura?», topic duracion) usa el rendimiento que dio el comerciante y explica los packs como meses de uso. Va siempre que el producto traiga rendimiento o duración, y es la única respuesta que puede llevar números: solo los de los datos del producto.",
    "Si la categoría es belleza o bienestar, incluye resultados (topic resultados), condicionado al uso constante y sin plazo.",
    "La pregunta de resultados condiciona al uso constante y nunca promete un plazo.",
    "La garantía legal no se presenta como un beneficio extra.",
  ],
  forbidden: [
    "Escribir números: plazos, días, costos, cantidad de clientes o pedidos (Ley 19.496 arts. 28 y 33). La única excepción es la respuesta de duración, con el rendimiento tal como lo dio el comerciante.",
    "Inventar el rendimiento o la duración, o prometer resultados en un plazo («en dos semanas»).",
    "Claims de salud («corrige», «cura», «alivia el dolor», «elimina la escoliosis»).",
    "«El mejor del mercado», «100 % garantizado», «certificado», «aprobado por…».",
    "Inventar materiales, composición o cuidados que no estén en la ficha del producto.",
    "Prueba social sin datos reales («miles de clientes confían»).",
  ],
  examples: [
    {
      eyebrow: "Preguntas frecuentes",
      heading: "Resolvemos tus dudas antes de pedir",
      heading_highlight: "tus dudas",
      social_proof_text: "{rating} de 5 según {count} reseñas",
      cta_label: "Pedir y pagar al recibir",
      items: [
        { topic: "pago_cod", question: "¿Pago cuando me llegue el pedido?", answer: "Sí. Pagas al recibirlo en la puerta de tu casa. No necesitas adelantar ningún pago para confirmar tu pedido." },
        { topic: "envio", question: "¿Cuánto demora en llegar?", answer: "Entre {min} y {max} días hábiles. Te avisamos por WhatsApp cuando tu pedido salga a reparto." },
        { topic: "uso", question: "¿Cómo me lo pongo?", answer: "Pasa los brazos por las correas, ajusta el velcro de la espalda y listo. Empieza con ratos cortos y aumenta el tiempo según te acomode." },
        { topic: "talla_compat", question: "¿Se nota debajo de la ropa?", answer: "Es delgado y se ajusta al cuerpo, así que queda discreto bajo una polera o camisa. Con ropa muy ajustada podría marcarse un poco." },
        { topic: "garantia", question: "¿Y si no me queda o no me gusta?", answer: "Tienes {return_days} días para pedir el cambio. Escríbenos por WhatsApp y te guiamos paso a paso, sin complicaciones." },
      ],
    },
    {
      heading: "Lo que nos preguntan antes de pedir",
      heading_highlight: "antes de pedir",
      body: "Si te queda otra duda, escríbenos por WhatsApp y te respondemos en español.",
      items: [
        { topic: "pago_cod", question: "¿Tengo que pagar por adelantado?", answer: "No. Pagas solo al recibir tu pedido, directamente al repartidor." },
        { topic: "envio", question: "¿Cuándo me llega?", answer: "Entre {min} y {max} días hábiles desde que confirmas tu pedido." },
        { topic: "uso", question: "¿Cómo lo uso con mi crema?", answer: "Aplica unas gotas sobre la piel limpia, deja que se absorban y después sigue con tu crema de siempre. Es el paso de antes, no la reemplaza." },
        { topic: "duracion", question: "¿Cuánto me dura un frasco?", answer: "Un frasco de 30 ml rinde entre 1 y 1,5 meses usándolo cada noche. El pack de 3 frascos te alcanza para 3 a 4 meses de rutina." },
        { topic: "resultados", question: "¿Cuándo voy a notar la diferencia?", answer: "Depende de cada piel. Con uso constante, noche a noche, la piel se siente más suave y cómoda después de la crema. No prometemos un plazo porque cada piel tiene su ritmo." },
        { topic: "garantia", question: "¿Qué pasa si llega con una falla?", answer: "Te lo cambiamos. Escríbenos con una foto dentro de los primeros {return_days} días y coordinamos el retiro." },
      ],
    },
  ],
});
