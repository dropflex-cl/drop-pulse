import * as z from "zod/v4";
import { defineComponent } from "../define";

const noDigits = (field: string) =>
  z.string().refine((s) => !/\d/.test(s.replaceAll(/\{(qty|min|max)\}/g, "")), {
    message: `${field}: los números van como {qty}, {min} o {max}, nunca escritos`,
  });

export const inventory = defineComponent({
  id: "inventory",
  name: "DropFlex · Disponibilidad",
  kind: "block",
  file: "blocks/df-inventory.liquid",
  metafield: { namespace: "dropflex", key: "inventory", type: "json" },
  media: [],
  placement: "Columna del producto, bajo el botón: mensaje comercial de urgencia seguido de disponibilidad y entrega.",
  objection: "¿Está disponible? ¿Cuánto tarda? Y la postergación: «lo compro después».",
  levers: [
    "Reducción de incertidumbre: disponibilidad y plazo en una sola línea, sin buscar.",
    "Semáforo (verde, ámbar, rojo): se entiende en menos de un segundo.",
    "Punto que late: señal de dato en vivo que atrae la visión periférica hacia el botón.",
    "Escasez con número concreto (solo si es real): aversión a la pérdida + especificidad.",
  ],
  content: z.object({
    urgency_text: z.string().max(48).optional()
      .describe("Elemento comercial fijo bajo el botón, independiente del inventario. Ej.: «Últimas unidades disponibles». Omitido usa el texto del editor; vacío lo oculta. No reemplaza {qty} ni calcula cantidades."),
    available_text: noDigits("available_text").pipe(z.string().min(8).max(48))
      .describe("Estado positivo + promesa de entrega con {min} y {max} (días hábiles reales). Ej.: «En stock, recíbelo en {min} a {max} días hábiles»."),
    limited_text: noDigits("limited_text").pipe(z.string().min(8).max(40).includes("{qty}"))
      .describe("Escasez con la cantidad real como {qty}. Ej.: «Solo quedan {qty} unidades». Nunca un número escrito."),
    sold_out_text: noDigits("sold_out_text").pipe(z.string().min(6).max(40))
      .describe("Agotado + siguiente paso, sin prometer fecha. Ej.: «Agotado, vuelve pronto»."),
    preorder_text: noDigits("preorder_text").pipe(z.string().min(6).max(36)).optional()
      .describe("Sin stock pero con venta permitida (reposición real)."),
  }),
  realData: [
    "Estado y cantidad: variant.available, variant.inventory_quantity, inventory_management e inventory_policy (Liquid, por variante).",
    "«Quedan pocas» solo con inventario rastreado por Shopify y bajo el umbral del bloque.",
    "{min} y {max}: días de preparación + tránsito de la logística de la tienda (shop.metafields.dropflex.logistics).",
  ],
  rules: [
    "urgency_text es texto comercial manual: se muestra sin consultar el stock. Vacío lo oculta; no modifica disponibilidad, cantidades ni logística.",
    "Tuteo, sin mayúsculas sostenidas, máximo un signo de exclamación y sin emojis: el punto ya es el ícono.",
    "Cada texto cabe en una línea a 375 px (≤ 48 caracteres con los tokens reemplazados).",
    "El texto de disponible combina estado y plazo o estado y pago contra entrega.",
  ],
  forbidden: [],
  examples: [
    {
      urgency_text: "Últimas unidades disponibles",
      available_text: "En stock, recíbelo en {min} a {max} días hábiles",
      limited_text: "Solo quedan {qty} unidades",
      sold_out_text: "Agotado, vuelve muy pronto",
      preorder_text: "Reposición en camino",
    },
    {
      available_text: "Disponible, pagas al recibir en tu casa",
      limited_text: "Últimas {qty} unidades en bodega",
      sold_out_text: "Agotado por ahora",
    },
  ],
});
