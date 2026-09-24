import * as z from "zod/v4";
import { defineComponent, ICON_KEYS } from "../define";

/** Tokens que la tienda reemplaza con datos reales (logística y políticas). */
const TOKENS = ["min", "max", "return_days", "warranty_months", "threshold"];

/** Política real que afirma el ítem; la tienda lo oculta si no está activa. */
const POLICIES = ["cod", "free_shipping", "returns", "warranty", "whatsapp", "shipping_time", "none"] as const;

/** Largo visible: cada token cuenta como su valor típico ("$19.990" o "30"); la negrita no suma. */
const visibleLength = (s: string) =>
  s.replaceAll("{threshold}", "$00.000").replaceAll(/\{[a-z_]+\}/g, "00").replaceAll("**", "").length;

const benefitText = z.string().max(60)
  .refine((s) => !/\d/.test(s.replaceAll(/\{[a-z_]+\}/g, "")), {
    message: "text: las cifras van como token ({min}, {max}, {return_days}, {warranty_months}, {threshold}), nunca escritas",
  })
  .refine((s) => [...s.matchAll(/\{([a-z_]+)\}/g)].every((m) => TOKENS.includes(m[1])), {
    message: `text: tokens permitidos: ${TOKENS.map((t) => `{${t}}`).join(", ")}`,
  })
  .refine((s) => [0, 2].includes(s.split("**").length - 1), { message: "text: a lo más una **negrita**" })
  .refine((s) => visibleLength(s) >= 8 && visibleLength(s) <= 34, { message: "text: entre 8 y 34 caracteres visibles (tokens como su valor)" });

export const benefitUsps = defineComponent({
  id: "benefit-usps",
  name: "DropFlex · Beneficios",
  kind: "block",
  file: "blocks/df-benefit-usps.liquid",
  metafield: { namespace: "dropflex", key: "benefit_usps", type: "json" },
  media: [],
  placement: "Columna del producto, entre el precio y el botón: justo después de ver el precio, cuando aparece «¿vale la pena, qué riesgo corro?».",
  objection: "Costos ocultos (¿cuánto sale el envío?), riesgo (¿y si no me sirve?), desconfianza hacia una tienda desconocida y, en pago contra entrega, «¿tengo que pagar antes?».",
  levers: [
    "Reducción de riesgo: envío, cambio y pago al recibir quitan fricción financiera justo después del precio.",
    "Pagar después: el pago contra entrega reduce el dolor de pagar.",
    "Endogrupo: el origen local («Tienda chilena») da confianza por cercanía.",
    "Fluidez: ícono + frase de 3 a 5 palabras, se lee en dos segundos.",
    "Regla de tres: tres ítems se perciben completos sin saturar.",
  ],
  content: z.object({
    items: z.array(z.object({
      icon: z.enum(ICON_KEYS).describe("Ícono que representa el beneficio (cash = pago, truck = envío, return = cambios, flag = origen, headset = soporte)."),
      text: benefitText.describe("[Beneficio concreto] + [cuantificador real como token] o [verbo] + [objeto]. 2-5 palabras, ≤ 34 caracteres visibles (cada token cuenta como su valor), una **negrita** opcional. Ej.: «Cambio gratis por {return_days} días»."),
      policy: z.enum(POLICIES).describe("Política real que afirma el texto; la tienda oculta el ítem si no está activa. none = no depende de una política (origen, atención)."),
    })).min(3).max(5)
      .describe("Un ítem por objeción, en orden: pago contra entrega, envío, cambios o garantía, origen local, soporte."),
  }),
  realData: [
    "Que la política exista: shop.metafields.dropflex.policies (cod, free_shipping, return_days, warranty_months, whatsapp). Los ítems con una política ausente no se muestran.",
    "{min} y {max}: días de preparación + tránsito de la logística de la tienda (shop.metafields.dropflex.logistics).",
    "{return_days}, {warranty_months} y {threshold} (monto del envío gratis): políticas de la tienda.",
    "Íconos: la IA elige una clave de ICON_KEYS; la imagen propia de cada ítem solo se sube en el editor.",
  ],
  rules: [
    "Tuteo, afirmativo, sin exclamaciones, mayúsculas sostenidas ni emojis (el ícono ya hace ese trabajo).",
    "Sustantivos concretos, sin adjetivos vacíos; cada ítem responde una objeción distinta.",
    "Orden recomendado en pago contra entrega: pago al recibir, envío, cambios o garantía, origen local, soporte por WhatsApp.",
    "No repetir lo que dice benefit-double-box (bajo el botón): aquí envío, origen y soporte; allá pago y garantía cuando ambos están.",
  ],
  forbidden: [
    "Beneficios que la tienda no ofrece: cada uno es oferta vinculante (Ley 19.496).",
    "Presentar la garantía legal de 6 meses como beneficio exclusivo de la tienda.",
    "Superlativos no verificables («el mejor», «calidad premium», «#1 en ventas»), sellos o certificaciones no demostrables, «aprobado por médicos».",
    "Promesas de salud («corrige la escoliosis»).",
    "Escribir cifras: días, meses y montos son tokens.",
  ],
  examples: [
    {
      items: [
        { icon: "cash", text: "Pagas al recibir en tu casa", policy: "cod" },
        { icon: "truck", text: "**Envío gratis** a todo Chile", policy: "free_shipping" },
        { icon: "return", text: "Cambio gratis por {return_days} días", policy: "returns" },
      ],
    },
    {
      items: [
        { icon: "flag", text: "Tienda chilena, despacho local", policy: "none" },
        { icon: "cash", text: "Sin pagar nada por adelantado", policy: "cod" },
        { icon: "clock", text: "Recíbelo en {min} a {max} días hábiles", policy: "shipping_time" },
        { icon: "headset", text: "Soporte por WhatsApp", policy: "whatsapp" },
      ],
    },
  ],
});
