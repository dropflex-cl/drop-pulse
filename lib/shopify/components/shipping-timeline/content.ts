import * as z from "zod/v4";
import { defineComponent } from "../define";

const TOKENS = ["time", "ship", "arrive"] as const;

/** Texto sin dígitos (plazos y horas son reales) y solo con tokens conocidos. */
const plain = (field: string, allowed: readonly string[] = []) =>
  z.string()
    .refine((s) => !/\d/.test(s), { message: `${field}: sin números escritos; el tiempo y los días los pone la tienda` })
    .refine((s) => [...s.matchAll(/\{([a-z_]+)\}/g)].every((m) => allowed.includes(m[1])), {
      message: `${field}: tokens permitidos: ${allowed.map((t) => `{${t}}`).join(", ") || "ninguno"}`,
    });

export const shippingTimeline = defineComponent({
  id: "shipping-timeline",
  name: "DropFlex · Envío",
  kind: "block",
  file: "blocks/df-shipping-timeline.liquid",
  metafield: { namespace: "dropflex", key: "shipping_timeline", type: "json" },
  media: [],
  placement: "Columna del producto, justo bajo el botón de compra: reaseguro para quien duda con el dedo sobre el botón, con fechas concretas y el plazo de corte del día.",
  objection: "¿Cuándo me llega? (la duda número uno en pago contra entrega, por el miedo a esperas de semanas) y «lo pienso y compro después».",
  levers: [
    "Especificidad: fechas reales en vez de «envío rápido»; el comprador visualiza el día en que lo tiene en la mano.",
    "Urgencia legítima: la hora de corte es real; pedir después mueve el despacho un día (aversión a perder un día, sin mentir).",
    "Fluidez: tres pasos con íconos universales, se entiende de un vistazo.",
    "Proceso visible: la línea en movimiento comunica una operación en marcha y profesional.",
    "Compromiso: «Pedido · Hoy» pone al comprador ya en el primer paso.",
  ],
  content: z.object({
    countdown_template: plain("countdown_template", TOKENS).pipe(z.string().min(12).max(50).includes("{time}"))
      .describe("[Verbo imperativo] dentro de {time} + [cuándo lo recibe, con {arrive}]. {time} = tiempo al corte; {arrive} = primer día de entrega ya con artículo («mañana», «el martes»); {ship} = día de despacho, solo si suma. Ej.: «Pide dentro de {time} y recíbelo desde {arrive}»."),
    closed_template: plain("closed_template", ["ship", "arrive"]).pipe(z.string().min(10).max(50)).optional()
      .describe("Sin contador (fin de semana, feriado o corte lejano): invitación sin urgencia con {arrive}. Ej.: «Pide hoy y recíbelo desde {arrive}»."),
    node_ordered_label: plain("node_ordered_label").pipe(z.string().min(3).max(12))
      .describe("Hito 1, 1-2 palabras (participio o frase-beneficio). Ej.: «Pedido»."),
    node_ordered_sub: plain("node_ordered_sub").pipe(z.string().min(3).max(12))
      .describe("Bajo el hito 1: el momento del pedido. Ej.: «Hoy»."),
    node_shipped_label: plain("node_shipped_label").pipe(z.string().min(3).max(12))
      .describe("Hito 2, 1-2 palabras. Ej.: «Despachado», «En camino»."),
    node_delivered_label: plain("node_delivered_label").pipe(z.string().min(3).max(14))
      .describe("Hito 3, 1-2 palabras. Ej.: «Entregado», «En tu puerta»."),
    node_delivered_sub_suffix: plain("node_delivered_sub_suffix").pipe(z.string().min(4).max(20)).optional()
      .describe("Nota bajo las fechas de entrega, refuerzo del pago contra entrega. Ej.: «pagas al recibir»."),
  }),
  realData: [
    "Días de preparación, tránsito mínimo y máximo, hora de corte, feriados, zona horaria, solo días hábiles y reparto en sábado: logística de la tienda (shop.metafields.dropflex.logistics); los ajustes del bloque son el respaldo.",
    "Fecha y hora actuales: el navegador, convertidas a la zona de la tienda (America/Santiago por defecto).",
    "{time}, {ship}, {arrive} y las fechas de los hitos: calculados en df-shipping-timeline.js, nunca escritos.",
  ],
  rules: [
    "Tuteo, cercano, sin mayúsculas sostenidas ni emojis; sin signos de exclamación en las etiquetas.",
    "countdown_template y closed_template: el título habla de cuándo lo recibe ({arrive}, siempre precedido de «desde»: es el primer día posible), no de cuándo se despacha. {ship} solo como dato secundario; no escribas «hoy» salvo que la preparación sea de cero días.",
    "Etiquetas de hito: 1-2 palabras que formen una secuencia narrativa (pedido → despacho → entrega).",
    "node_delivered_sub_suffix: solo si la tienda tiene pago contra entrega activo.",
  ],
  forbidden: [
    "Escribir horas, días o fechas: el tiempo y las fechas salen de la logística real (Ley 19.496, arts. 12 y 28: el plazo informado es parte de la oferta).",
    "«Entrega garantizada mañana», «envío express» o «llega en 24 horas» si no es el servicio real.",
    "Contadores que se reinician al recargar o sin corte real.",
  ],
  examples: [
    {
      countdown_template: "Pide dentro de {time} y recíbelo desde {arrive}",
      closed_template: "Pide hoy y recíbelo desde {arrive}",
      node_ordered_label: "Pedido",
      node_ordered_sub: "Hoy",
      node_shipped_label: "Despachado",
      node_delivered_label: "Entregado",
      node_delivered_sub_suffix: "pagas al recibir",
    },
    {
      countdown_template: "Compra dentro de {time} y tenlo desde {arrive}",
      node_ordered_label: "Tu pedido",
      node_ordered_sub: "Hoy",
      node_shipped_label: "En camino",
      node_delivered_label: "En tu puerta",
    },
  ],
});
