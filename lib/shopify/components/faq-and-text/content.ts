import * as z from "zod/v4";
import { defineComponent } from "../define";

const text = () => z.string();

/** Temas disponibles para las preguntas de la página. */
export const FAQ_TOPICS = ["pago_cod", "envio", "uso", "duracion", "talla_compat", "cuidado", "diferencial", "resultados", "garantia", "otro"] as const;


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
    "Prueba social ligera junto al título con la valoración compartida editable ({rating}, {count}).",
  ],
  content: z
    .object({
      eyebrow: z.string().min(3).max(28).optional()
        .describe("Rótulo corto sobre el título: «Preguntas frecuentes»."),
      heading: text().pipe(z.string().min(10).max(50))
        .describe("Tranquilidad + «tus dudas/preguntas», 3 a 7 palabras. Ej.: «Resolvemos tus dudas antes de pedir»."),
      heading_highlight: z.string().min(3).max(20).optional()
        .describe("1 o 2 palabras LITERALES del título que van en acento («tus dudas»)."),
      body: text().pipe(text()).pipe(z.string().min(20).max(160)).optional()
        .describe("Una frase de apoyo: dónde más resolver dudas (WhatsApp, soporte en español)."),
      cta_label: z.string().min(4).max(24).optional()
        .describe("Verbo + beneficio sin riesgo: «Pedir y pagar al recibir»."),
      social_proof_text: text()
        .pipe(z.string().min(10).max(60))
        .optional()
        .describe("Texto de apoyo editable; {rating} y {count} son tokens opcionales del resumen de reseñas."),
      items: z
        .array(
          z.object({
            question: text().pipe(z.string().min(8).max(70).regex(/\?$/, "question: termina en «?»"))
              .describe("Como la pensaría el comprador, 1ª persona y coloquial, una sola pregunta. Ej.: «¿Pago cuando me llegue?»."),
            answer: text().pipe(z.string().min(20).max(280))
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
    "{count} y {rating}: valoración compartida editable en review-stars, publicada en review_summary. No exige reseñas importadas ni verificación; el texto propio puede mostrarse sin cifras.",
    "Avatares: imágenes disponibles, ilustraciones o imágenes generadas.",
  ],
  rules: [
    "Español neutro con tuteo, cercano y seguro, frases cortas. Sin exclamaciones salvo un «¡Sí!» inicial; sin mayúsculas sostenidas.",
    "Cobertura mínima: envio, uso y garantia; pago_cod siempre que la tienda cobre al recibir. Máximo 8 preguntas.",
    "Orden: pago_cod → envio → uso → duracion → talla_compat → cuidado → diferencial → resultados → garantia (el cierre reduce el riesgo).",
    "Cada respuesta: la primera frase responde directo; ≤ 280 caracteres.",
    "Plazos, días de cambio y meses de garantía solo como {min}, {max}, {return_days}, {warranty_months}.",
    "La pregunta de duración («¿Cuánto me dura?», topic duracion) permite explicar rendimiento, duración y packs sin requisito de hechos verificados.",
    "Si la categoría es belleza o bienestar, incluye resultados (topic resultados) conectados con el uso del producto.",
    "La pregunta de resultados condiciona al uso constante y nunca promete un plazo.",
    "La garantía legal no se presenta como un beneficio extra.",
  ],
  forbidden: [],
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
        { topic: "uso", question: "¿Cómo lo uso con mi crema?", answer: "Aplica unas gotas sobre la piel limpia y deja que se absorban. Si usas crema, va después." },
        { topic: "duracion", question: "¿Cuánto me dura un frasco?", answer: "Un frasco de 30 ml rinde entre 1 y 1,5 meses usándolo cada noche. El pack de 3 frascos te alcanza para 3 a 4 meses de rutina." },
        { topic: "resultados", question: "¿Cuándo voy a notar la diferencia?", answer: "Depende de cada piel. Con uso constante, noche a noche, la piel se siente más suave y cómoda después de la crema. No prometemos un plazo porque cada piel tiene su ritmo." },
        { topic: "garantia", question: "¿Qué pasa si llega con una falla?", answer: "Te lo cambiamos. Escríbenos con una foto dentro de los primeros {return_days} días y coordinamos el retiro." },
      ],
    },
  ],
});
