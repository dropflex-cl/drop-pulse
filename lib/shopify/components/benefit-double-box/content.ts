import * as z from "zod/v4";
import { defineComponent, ICON_KEYS } from "../define";

/** Tokens que la tienda reemplaza con datos reales (políticas y logística). */
const TOKENS = ["return_days", "warranty_months", "threshold", "min", "max"];

/** Política real que afirma la tarjeta; la tienda la oculta si no está activa. */
const POLICIES = ["cod", "returns", "warranty", "free_shipping", "shipping_time", "whatsapp", "none"] as const;

/** Largo visible: cada token cuenta como su valor típico ("$19.990" o "30"). */
const visibleLength = (s: string) => s.replaceAll("{threshold}", "$00.000").replaceAll(/\{[a-z_]+\}/g, "00").length;

const cardText = (field: string, min: number, max: number) =>
  z.string().max(max + 20)
    .refine((s) => !/\d/.test(s.replaceAll(/\{[a-z_]+\}/g, "")), {
      message: `${field}: las cifras van como token ({return_days}, {warranty_months}, {threshold}, {min}, {max}), nunca escritas`,
    })
    .refine((s) => [...s.matchAll(/\{([a-z_]+)\}/g)].every((m) => TOKENS.includes(m[1])), {
      message: `${field}: tokens permitidos: ${TOKENS.map((t) => `{${t}}`).join(", ")}`,
    })
    .refine((s) => visibleLength(s) >= min && visibleLength(s) <= max, {
      message: `${field}: entre ${min} y ${max} caracteres visibles (tokens como su valor)`,
    });

const card = z.object({
  icon: z.enum(ICON_KEYS).describe("Ícono de la tarjeta: cash o lock = pago, return o shield = cambio/garantía, truck = envío, headset = soporte."),
  title: cardText("title", 6, 24).describe("Hecho verificable: modalidad o cifra + unidad como token. Ej.: «Pagas al recibir», «{return_days} días para cambiarlo»."),
  body: cardText("body", 16, 48).describe("Cómo funciona o qué te evita, en una frase que no repite el título. Ej.: «Nada por adelantado: pagas cuando llega»."),
  policy: z.enum(POLICIES).describe("Política real que afirma la tarjeta; la tienda la oculta si no está activa."),
});

export const benefitDoubleBox = defineComponent({
  id: "benefit-double-box",
  name: "DropFlex · Doble tarjeta",
  kind: "block",
  file: "blocks/df-benefit-double-box.liquid",
  metafield: { namespace: "dropflex", key: "benefit_double_box", type: "json" },
  media: [],
  placement: "Columna del producto, bajo el botón de compra: reaseguro en el instante del clic, con las dos objeciones de más peso (cómo pago y qué pasa si no me sirve).",
  objection: "¿Cómo pago, es seguro pagar? y ¿qué pasa si no me sirve? Las dos últimas barreras de riesgo percibido.",
  levers: [
    "Reversión de riesgo: el cambio o la garantía traslada el riesgo del comprador a la tienda.",
    "Pago diferido: pagar al recibir reduce el dolor de pagar y la desconfianza hacia una tienda nueva.",
    "Autoridad prestada: los logos reales de medios de pago transfieren confianza (solo si están activos).",
    "Formato sello: dos tarjetas gemelas se leen como garantías formales, más que una lista.",
    "Cobertura completa: pago (antes de la compra) + cambio (después) cubren todo el recorrido.",
  ],
  content: z.object({
    cards: z.array(card).length(2)
      .describe("Exactamente 2 tarjetas: la 1 es el pago (en pago contra entrega, siempre pagar al recibir); la 2 es cambio o garantía, o despacho y seguimiento si no hay política de cambio."),
  }),
  realData: [
    "Que la política exista: shop.metafields.dropflex.policies (cod, return_days, warranty_months, free_shipping, whatsapp). Una tarjeta con una política ausente no se muestra.",
    "{return_days}, {warranty_months}, {threshold}: políticas de la tienda; {min} y {max}: logística (shop.metafields.dropflex.logistics).",
    "Logos de medios de pago: imágenes que sube el comerciante en el editor (con su texto alternativo), nunca la IA.",
  ],
  rules: [
    "Título = el hecho (qué); descripción = cómo te protege (por qué). La descripción no repite el título.",
    "Tono calmado y seguro, tuteo, sin exclamaciones ni emojis.",
    "Nombres de marcas de pago (Mercado Pago, Webpay) solo si están activos en la tienda.",
    "No repetir lo que dice benefit-usps (sobre el botón): aquí pago y garantía, allá envío, origen y soporte.",
  ],
  forbidden: [
    "Ofrecer menos que la ley o presentar lo legal como regalo: garantía legal de 6 meses (art. 21) y retracto de 10 días en compras a distancia (art. 3 bis, Ley 19.496).",
    "«100 % garantizado» sin política escrita; «devolución de tu dinero» si solo hay cambio.",
    "Sellos inventados («Compra segura certificada»).",
    "Escribir cifras: días, meses y montos son tokens.",
  ],
  examples: [
    {
      cards: [
        { icon: "cash", title: "Pagas al recibir", body: "Nada por adelantado: pagas cuando llega", policy: "cod" },
        { icon: "return", title: "{return_days} días para cambiarlo", body: "Si no te queda bien, lo cambiamos sin costo", policy: "returns" },
      ],
    },
    {
      cards: [
        { icon: "shield", title: "Compra sin riesgo", body: "Revisa tu pedido y paga solo al recibirlo", policy: "cod" },
        { icon: "truck", title: "Seguimiento incluido", body: "Te avisamos por WhatsApp cuando va en camino", policy: "whatsapp" },
      ],
    },
  ],
});
