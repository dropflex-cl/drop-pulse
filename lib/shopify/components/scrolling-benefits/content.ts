import * as z from "zod/v4";
import { defineComponent, ICON_KEYS } from "../define";

/** Tokens que llena la tienda con datos reales, y la política que cada uno exige. */
const TOKEN_REQUIRES = {
  "{min}": "delivery",
  "{max}": "delivery",
  "{return_days}": "returns",
  "{warranty_months}": "warranty",
  "{threshold}": "free_shipping",
} as const;
const TOKENS = /\{(min|max|return_days|warranty_months|threshold)\}/g;

/** Largo visible: cada token ocupa lo que ocupará su valor (días: 2; monto: 7, «$29.990»). */
const visibleLength = (s: string) =>
  s.replaceAll(TOKENS, (token) => (token === "{threshold}" ? "0000000" : "00")).length;

const REQUIRES = ["cod", "free_shipping", "returns", "warranty", "whatsapp", "delivery"] as const;

const item = z
  .object({
    icon: z.enum(ICON_KEYS).describe("Ícono del beneficio: cash (pago al recibir), truck, return, shield, headset, lock…"),
    text: z
      .string()
      .min(6)
      .max(48)
      .refine((s) => visibleLength(s) <= 32, { message: "Máximo 32 caracteres con los tokens reemplazados" })
      .refine((s) => !/\d/.test(s.replaceAll(TOKENS, "")), {
        message: "Los números van como token ({min}, {max}, {return_days}, {warranty_months}, {threshold}), nunca escritos",
      })
      .refine((s) => !/[.!¡]$/.test(s.trim()), { message: "Sin punto final ni exclamación" })
      .describe("[dato real como token opcional] + [beneficio de servicio], 2 a 5 palabras. Ej.: «Llega en {min} a {max} días hábiles»."),
    requires: z
      .enum(REQUIRES)
      .optional()
      .describe("Política real que hace verdadero el ítem; si la tienda no la tiene, el ítem no se publica."),
  })
  .refine(
    (it) =>
      Object.entries(TOKEN_REQUIRES).every(([token, req]) => !it.text.includes(token) || it.requires === req),
    { message: "Un texto con token debe declarar la política que lo respalda en requires" },
  );

export const scrollingBenefits = defineComponent({
  id: "scrolling-benefits",
  name: "DropFlex · Cinta ventajas",
  kind: "section",
  file: "sections/df-scrolling-benefits.liquid",
  metafield: { namespace: "dropflex", key: "scrolling_benefits", type: "json" },
  media: [],
  placement:
    "Franja de ancho completo justo bajo el bloque de compra o la galería, o entre dos secciones largas: recuerda las garantías mientras el comprador hace scroll, sin cortar el ritmo.",
  objection: "¿Llegará? ¿Y si no me sirve? ¿Es seguro comprarle a una tienda que no conozco?",
  levers: [
    "Reducción de riesgo: pago al recibir, cambios y garantía repetidos donde la duda aparece.",
    "Fluidez cognitiva: 2 a 5 palabras + ícono se leen en la visión periférica sin esfuerzo.",
    "Mera exposición: el loop repite los mismos mensajes; la repetición aumenta la credibilidad (por eso deben ser verdad).",
    "Saliencia por movimiento: una banda que se mueve capta la mirada sin interrumpir.",
    "Señal de legitimidad: formato típico de tiendas establecidas.",
  ],
  content: z.object({
    heading: z
      .string()
      .max(40)
      .refine((s) => !/\d/.test(s), { message: "Sin números en el título" })
      .optional()
      .describe("Opcional (el editor lo oculta por defecto). Una palabra destacada con **…**. Ej.: «Compra **sin riesgo**»."),
    items: z
      .array(item)
      .min(3)
      .max(6)
      .describe("3 a 6 ítems de largo parecido. Orden: pago al recibir, envío (plazo real), cambio o garantía, soporte, atributo del producto."),
  }),
  realData: [
    "Pago contra entrega, envío gratis, días de cambio, meses de garantía y WhatsApp: shop.metafields.dropflex.policies. Un ítem con `requires` que la tienda no cumple no se dibuja.",
    "{min} y {max}: días de preparación + tránsito de shop.metafields.dropflex.logistics (sin logística, el ítem se oculta).",
    "{threshold}: monto del envío gratis de policies.free_shipping_threshold, en el formato de dinero de la tienda.",
  ],
  rules: [
    "Fórmula: [dato real como token, opcional] + [beneficio de servicio]. Sin verbos cuando se pueda: «Pago al recibir», «Envío a todo el país».",
    "Largo ideal 12 a 26 caracteres (máximo 32) y parecido entre ítems (±10) para un ritmo parejo.",
    "El primer ítem es el pago al recibir si la tienda lo ofrece (requires: cod).",
    "Todo ítem que menciona una política declara `requires`; todo número es un token.",
    "Tuteo implícito, sin mayúsculas sostenidas, sin emojis, sin exclamaciones ni punto final.",
    "Máximo un ítem sobre el producto (atributo verificable), el resto sobre el servicio de la tienda.",
  ],
  forbidden: [
    "Superlativos sin respaldo: «n.º 1», «el mejor del país», «el más vendido».",
    "«100 % garantizado», «envío inmediato», «24/7» o cualquier plazo o monto escrito a mano (Ley 19.496, arts. 28 y 33).",
    "Presentar la garantía legal como beneficio extra u ofrecer menos que la legal.",
    "Claims de salud («alivia el dolor», «corrige la columna»).",
  ],
  examples: [
    {
      items: [
        { icon: "cash", text: "Pagas al recibir", requires: "cod" },
        { icon: "truck", text: "Llega en {min} a {max} días hábiles", requires: "delivery" },
        { icon: "return", text: "Cambio sin costo en {return_days} días", requires: "returns" },
        { icon: "headset", text: "Atención por WhatsApp", requires: "whatsapp" },
        { icon: "ruler", text: "Ajustable a tu talla" },
      ],
    },
    {
      heading: "Compra **sin riesgo**",
      items: [
        { icon: "truck", text: "Envío gratis sobre {threshold}", requires: "free_shipping" },
        { icon: "cash", text: "Pago contra entrega", requires: "cod" },
        { icon: "shield", text: "Garantía de {warranty_months} meses", requires: "warranty" },
        { icon: "lock", text: "Tus datos protegidos" },
      ],
    },
  ],
});
