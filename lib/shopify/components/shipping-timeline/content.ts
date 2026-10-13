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
    "Urgencia legítima: el contador corresponde al corte real; al vencer se recalculan despacho y entrega con días hábiles y feriados.",
    "Jerarquía gráfica: contador destacado, calendario de la primera entrega posible y rangos por destino.",
    "Recorrido ilustrativo: el camión viaja una sola vez hacia una casa; no representa seguimiento de un pedido existente.",
  ],
  content: z.object({
    countdown_label: plain("countdown_label").pipe(z.string().min(3).max(40)).optional()
      .describe("Etiqueta sobre el contador grande. Ej.: «El próximo despacho cierra en». No contiene fechas ni cifras."),
    arrival_template: plain("arrival_template", ["arrive"]).pipe(z.string().min(12).max(60).includes("{arrive}")).optional()
      .describe("Titular junto al calendario: primera entrega posible, con «desde {arrive}». Ej.: «Recíbelo desde {arrive}»."),
    cutoff_template: plain("cutoff_template", ["cutoff"]).pipe(z.string().min(12).max(60).includes("{cutoff}")).optional()
      .describe("Plazo para confirmar. {cutoff} es el día y hora reales del próximo corte en la zona de la tienda. Ej.: «Confirma antes de {cutoff}»."),
    dispatch_template: plain("dispatch_template", ["ship"]).pipe(z.string().min(12).max(60).includes("{ship}")).optional()
      .describe("Pie de la ruta ilustrada, con el despacho estimado real. Ej.: «Despacho estimado: {ship}»."),
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
    "{time}, {ship}, {arrive}, {cutoff}, calendario y rangos: calculados en df-shipping-timeline.js, nunca escritos. {cutoff} incluye día y hora locales del corte.",
  ],
  rules: [
    "Tuteo, cercano, sin mayúsculas sostenidas ni emojis; sin signos de exclamación en las etiquetas.",
    "countdown_template y closed_template: el título habla de cuándo lo recibe ({arrive}, siempre precedido de «desde»: es el primer día posible), no de cuándo se despacha. {ship} solo como dato secundario; no escribas «hoy» salvo que la preparación sea de cero días.",
    "Etiquetas de hito: 1-2 palabras que formen una secuencia narrativa (pedido → despacho → entrega).",
    "node_delivered_sub_suffix: solo si la tienda tiene pago contra entrega activo.",
    "Tarjeta gráfica: countdown_label, arrival_template, cutoff_template y dispatch_template son opcionales; los textos de respaldo mantienen compatible el contenido guardado. arrival_template usa «desde {arrive}», nunca garantiza un día exacto.",
    "Los campos node_* permanecen compatibles; ya no se presentan tres hitos ni un estado de pedido realizado. La animación es ilustrativa, sin seguimiento, escasez ni porcentajes inventados.",
  ],
  forbidden: [],
  examples: [
    {
      countdown_label: "El próximo despacho cierra en",
      arrival_template: "Recíbelo desde {arrive}",
      cutoff_template: "Confirma antes de {cutoff}",
      dispatch_template: "Despacho estimado: {ship}",
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
