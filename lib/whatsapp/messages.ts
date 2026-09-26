// Mensajes de WhatsApp para confirmar y seguir los pedidos (etapa WhatsApp, /products/[id]/whatsapp).
// Plantillas fijas: los datos del producto y de Ajustes › Envíos y políticas se completan solos; los
// del cliente los escribe el comerciante en la pantalla (no se guardan). El texto sale con el formato
// de WhatsApp (*negrita*, saltos de línea, emojis), listo para pegar. Puro: lo usan la pantalla y los tests.
//
// Sintaxis de una línea:
// - `{token}`: un dato. Un dato del cliente vacío queda como «[nombre]», para completarlo en WhatsApp.
// - `[ … ]`: tramo opcional; se quita si alguno de sus datos está vacío (un plazo que no está en
//   Ajustes no se promete). Una línea que queda vacía se quita; "" es un párrafo nuevo.

import { money } from "@/lib/format";

export type MessageGroup = "confirm" | "shipping" | "issues" | "after";

export const MESSAGE_GROUPS: { id: MessageGroup; title: string; desc: string }[] = [
  { id: "confirm", title: "Confirmación", desc: "Antes de confirmar el pedido en Dropi: que lo quiere, que la dirección está bien y que tendrá el efectivo." },
  { id: "shipping", title: "Seguimiento", desc: "Mientras el pedido va en camino." },
  { id: "issues", title: "Novedades", desc: "Tienes 48 horas para resolverlas en Dropi; si no, el pedido vuelve y pierdes el envío." },
  { id: "after", title: "Después de la entrega", desc: "Para que vuelva a comprar y te deje su opinión." },
];

export interface MessageTemplate {
  id: string;
  group: MessageGroup;
  title: string;
  /** Cuándo se manda. */
  when: string;
  lines: string[];
}

export const MESSAGES: MessageTemplate[] = [
  {
    id: "confirm",
    group: "confirm",
    title: "Confirmar pedido",
    when: "Apenas entra el pedido",
    lines: [
      "Hola[ {name}] 👋 Te escribimos[ de *{store}*] para confirmar tu pedido:",
      "",
      "🛍️ *{units} × {product}*",
      "💵 Total: *{total}*. Pagas en efectivo al recibir.",
      "📍 Envío a: {address}, {area}",
      "",
      "¿Nos confirmas que los datos están bien y que tendrás el efectivo el día de la entrega? Responde *SÍ* y lo dejamos listo para despacho.",
    ],
  },
  {
    id: "reminder",
    group: "confirm",
    title: "Recordatorio",
    when: "Unas horas después, si no responde",
    lines: [
      "Hola[ {name}], te escribimos de nuevo[ de *{store}*].",
      "",
      "Tu pedido de *{product}* está reservado y solo falta tu confirmación para despacharlo. ¿Nos respondes con un *SÍ*?",
      "",
      "Si necesitas cambiar algo, como la dirección o la cantidad, dinos por aquí.",
    ],
  },
  {
    id: "last-call",
    group: "confirm",
    title: "Último aviso",
    when: "Al día siguiente, antes de anularlo",
    lines: [
      "Hola[ {name}], este es nuestro último aviso: todavía no recibimos la confirmación de tu pedido de *{product}*.",
      "",
      "Si no sabemos de ti hoy, tendremos que anularlo. Si aún lo quieres, responde *SÍ* y lo despachamos.",
    ],
  },
  {
    id: "address",
    group: "confirm",
    title: "Completar datos de envío",
    when: "Si la dirección llegó incompleta",
    lines: [
      "Hola[ {name}], para que tu pedido llegue sin problemas necesitamos completar tu dirección. ¿Nos envías estos datos?",
      "",
      "• Calle y número",
      "• Depto o casa (si aplica)",
      "• {areaLabel}",
      "• Una referencia (ej.: portón negro, frente a la plaza)",
      "",
      "Con eso lo despachamos.",
    ],
  },
  {
    id: "confirmed",
    group: "confirm",
    title: "Pedido confirmado",
    when: "Cuando responde que sí",
    lines: [
      "Listo[, {name}], tu pedido quedó confirmado ✅",
      "",
      "🛍️ *{units} × {product}*",
      "💵 *{total}*, en efectivo al recibir.",
      "[🚚 Te llega en *{delivery}*.]",
      "",
      "Te avisaremos por aquí cuando salga, con tu número de seguimiento. Si ese día no vas a estar, puedes dejar el efectivo con alguien de confianza para que lo reciba.",
    ],
  },
  {
    id: "doubts",
    group: "confirm",
    title: "Cliente con dudas",
    when: "Si duda o quiere cancelar",
    lines: [
      "Entendemos[, {name}]. Para que lo decidas con calma: *no pagas nada por adelantado*, solo pagas en efectivo cuando tienes el producto en tus manos.[ Además, tienes *{returnDays} días* para cambios o devoluciones.]",
      "",
      "¿Hay algo del producto que te genere dudas? Te respondemos lo que necesites.",
    ],
  },
  {
    id: "shipped",
    group: "shipping",
    title: "Pedido despachado",
    when: "Cuando Dropi genera la guía",
    lines: [
      "Hola[ {name}], tu pedido de *{product}* ya va en camino 🚚",
      "",
      "N.º de seguimiento: *{tracking}*",
      "[Puedes ver dónde va aquí: {trackingUrl}]",
      "",
      "Recuerda tener *{total}* en efectivo para el repartidor.",
    ],
  },
  {
    id: "today",
    group: "shipping",
    title: "Llega hoy",
    when: "Cuando sale a reparto",
    lines: [
      "Hola[ {name}], tu pedido llega hoy 📦",
      "",
      "Mantén el teléfono a mano por si el repartidor te llama, y ten listo el pago de *{total}* en efectivo.",
      "",
      "Si no vas a estar, deja el efectivo con alguien de confianza en la dirección.",
    ],
  },
  {
    id: "delay",
    group: "shipping",
    title: "Retraso",
    when: "Si la entrega se atrasa",
    lines: [
      "Hola[ {name}], queremos avisarte que tu pedido de *{product}* viene con un retraso de la transportadora.",
      "",
      "Ya está en camino y te llegará en los próximos días. Te seguimos avisando por aquí. Disculpa la espera 🙏",
    ],
  },
  {
    id: "missed",
    group: "issues",
    title: "No te encontramos",
    when: "Novedad: nadie en casa",
    lines: [
      "Hola[ {name}], el repartidor pasó hoy con tu pedido de *{product}*, pero no pudo entregarlo.",
      "",
      "Hará un nuevo intento en las próximas *24 a 48 horas*. ¿Nos confirmas que estarás en la dirección, o nos dices un mejor horario o con quién dejarlo?",
    ],
  },
  {
    id: "bad-address",
    group: "issues",
    title: "Problema con la dirección",
    when: "Novedad: dirección incorrecta o sin ubicar",
    lines: [
      "Hola[ {name}], la transportadora no pudo ubicar tu dirección para entregar tu pedido de *{product}*. Para no perder el envío, necesitamos que nos confirmes *hoy*:",
      "",
      "• Calle y número",
      "• {areaLabel}",
      "• Una referencia",
      "",
      "Tenemos poco tiempo para corregirla, así que te agradecemos responder apenas puedas.",
    ],
  },
  {
    id: "delivered",
    group: "after",
    title: "Entregado y consejo de uso",
    when: "Cuando Dropi lo marca entregado",
    lines: [
      "Hola[ {name}], vimos que tu pedido de *{product}* ya llegó 🙌 Gracias por comprar[ en *{store}*].",
      "",
      "[💡 Un consejo para sacarle el máximo: {tip}]",
      "",
      "Si tienes cualquier duda, escríbenos por aquí.[ Recuerda que tienes *{warranty}* de garantía.]",
    ],
  },
  {
    id: "review",
    group: "after",
    title: "Pedir reseña",
    when: "3 a 5 días después de la entrega",
    lines: [
      "Hola[ {name}], ¿cómo te ha ido con tu *{product}*? 😊",
      "",
      "Nos ayudaría mucho que nos cuentes tu experiencia en una línea y, si quieres, con una foto 📸 Tu opinión ayuda a otros clientes a decidir.",
    ],
  },
];

/** El mensaje que lleva el consejo de uso que escribe la IA. */
export const TIP_MESSAGE = "delivered";

/** Lo que se completa solo: el producto, la tienda y Ajustes › Envíos y políticas. */
export interface MessageFacts {
  /** Nombre de la tienda en Shopify; null = el mensaje no la nombra. */
  store: string | null;
  /** El nombre corto de la ficha aprobada o, si no hay, el título del producto. */
  product: string;
  currency: string;
  /** Precio de cada pack (1 unidad primero). Vacío = sin precio guardado. */
  packs: { units: number; price: number }[];
  /** Días de entrega (despacho + tránsito); null = no se promete plazo. */
  delivery: { min: number; max: number; businessDays: boolean } | null;
  returnDays: number | null;
  warrantyMonths: number | null;
  /** País del mercado: nombra la comuna (Chile) o la ciudad. */
  countryCode: string;
  /** El consejo de uso aprobado; null = el mensaje va sin él. */
  tip: string | null;
}

/** Lo que escribe el comerciante para un pedido (no se guarda). */
export interface OrderFields {
  name: string;
  units: number;
  address: string;
  area: string;
  tracking: string;
  trackingUrl: string;
}

export const EMPTY_ORDER: OrderFields = { name: "", units: 1, address: "", area: "", tracking: "", trackingUrl: "" };

/** La división de la dirección que pide la transportadora: comuna en Chile, ciudad en el resto. */
export const areaLabel = (countryCode: string) => (countryCode.toUpperCase() === "CL" ? "Comuna" : "Ciudad");

/** Lo que se cobra al recibir: el precio del pack de esa cantidad (o el de 1 unidad × N). */
export function orderTotal(facts: Pick<MessageFacts, "packs">, units: number): number | null {
  const pack = facts.packs.find((p) => p.units === units);
  if (pack) return pack.price;
  const one = facts.packs.find((p) => p.units === 1);
  return one ? one.price * units : null;
}

/** «2 a 4 días hábiles» · «3 días hábiles» · «2 a 5 días». */
export function deliveryText(d: NonNullable<MessageFacts["delivery"]>): string {
  const unit = d.businessDays ? (d.max === 1 ? "día hábil" : "días hábiles") : d.max === 1 ? "día" : "días";
  return d.min === d.max ? `${d.max} ${unit}` : `${d.min} a ${d.max} ${unit}`;
}

/** «1 mes» · «6 meses». */
const monthsText = (n: number) => (n === 1 ? "1 mes" : `${n} meses`);

/** El consejo va después de dos puntos: empieza con minúscula (salvo una sigla) y termina en punto. */
export function tipText(tip: string): string {
  const t = tip.trim().replace(/\s+/g, " ");
  if (!t) return "";
  const first = /^\p{Lu}\p{Ll}/u.test(t) ? t[0].toLowerCase() + t.slice(1) : t;
  return /[.!?…]$/.test(first) ? first : `${first}.`;
}

/** Datos del cliente: si faltan, quedan como «[nombre]» para completarlos en WhatsApp. */
const ORDER_TOKENS: Record<string, string> = {
  name: "nombre",
  address: "dirección",
  area: "",
  tracking: "n.º de seguimiento",
  trackingUrl: "link de seguimiento",
};

export interface RenderedMessage {
  text: string;
  /** Los datos del cliente que quedaron como «[…]», en el orden en que aparecen. */
  missing: string[];
}

function tokenValues(facts: MessageFacts, order: OrderFields): Record<string, string> {
  const units = Number.isInteger(order.units) && order.units > 0 ? order.units : 1;
  const total = orderTotal(facts, units);
  return {
    name: order.name.trim(),
    units: String(units),
    address: order.address.trim(),
    area: order.area.trim(),
    tracking: order.tracking.trim(),
    trackingUrl: order.trackingUrl.trim(),
    store: facts.store?.trim() ?? "",
    product: facts.product.trim(),
    total: total == null ? "" : money(total, facts.currency),
    delivery: facts.delivery ? deliveryText(facts.delivery) : "",
    returnDays: facts.returnDays ? String(facts.returnDays) : "",
    warranty: facts.warrantyMonths ? monthsText(facts.warrantyMonths) : "",
    tip: facts.tip ? tipText(facts.tip) : "",
    areaLabel: areaLabel(facts.countryCode),
  };
}

const TOKEN = /\{(\w+)\}/g;
const OPTIONAL = /\[([^\[\]]*)\]/g;

/** El mensaje con los datos, listo para pegar en WhatsApp. */
export function renderMessage(template: Pick<MessageTemplate, "lines">, facts: MessageFacts, order: OrderFields = EMPTY_ORDER): RenderedMessage {
  const values = tokenValues(facts, order);
  const missing: string[] = [];
  const fill = (s: string) =>
    s.replace(TOKEN, (_, key: string) => {
      const v = values[key];
      if (v) return v;
      if (key in ORDER_TOKENS) {
        const label = key === "area" ? areaLabel(facts.countryCode).toLowerCase() : ORDER_TOKENS[key];
        if (!missing.includes(label)) missing.push(label);
        return `[${label}]`;
      }
      return "";
    });
  const out: string[] = [];
  for (const line of template.lines) {
    if (!line) {
      out.push("");
      continue;
    }
    // Primero los tramos opcionales (se quitan si les falta un dato); después, el resto de la línea.
    const kept = line.replace(OPTIONAL, (_, inner: string) => ([...inner.matchAll(TOKEN)].every((m) => values[m[1]]) ? inner : ""));
    const filled = fill(kept).trim();
    if (filled) out.push(filled);
  }
  // Un solo salto entre párrafos, aunque se haya quitado una línea entera.
  const text = out
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { text, missing };
}

/** Qué falta en Ajustes para que los mensajes digan plazos, cambios y garantía. */
export function missingPolicies(facts: Pick<MessageFacts, "delivery" | "returnDays" | "warrantyMonths">): string[] {
  return [facts.delivery ? null : "los plazos de entrega", facts.returnDays ? null : "los días para cambios", facts.warrantyMonths ? null : "la garantía"].filter((x): x is string => Boolean(x));
}
