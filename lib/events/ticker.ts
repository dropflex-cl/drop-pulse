// Eventos › cinta de avisos (docs/spec-eventos.md › Tienda): la franja que se desplaza bajo la barra
// con cuenta regresiva. Repite lo que dibuja _event/snippets/df-event-ticker.liquid para la vista
// previa de la app (un test compara los textos). Puro.
//
// Orden: el aviso del evento, los mensajes propios del comerciante y las políticas REALES de la
// tienda (Ajustes › Envíos y políticas). Una política vacía no se promete: su mensaje no sale.
import { deliveryDays, type StorePolicies } from "@/lib/settings/policies";
import { formatMoney } from "@/lib/store-preview/facts";

export interface TickerItem {
  /** Clave de df-icon (lib/shopify/components/define.ts › ICON_KEYS). */
  icon: string;
  text: string;
}

/** Íconos fijos de la cinta (los mismos del Liquid). */
export const TICKER_ICONS = { announcement: "sparkles", own: "check" } as const;

/** Textos de las políticas, con los tokens que llena la tienda. Iguales en df-event-ticker.liquid (test). */
export const TICKER_POLICY_TEXT = {
  cod: "Pagas al recibir",
  freeShipping: "Envío gratis",
  freeShippingFrom: "Envío gratis desde {threshold}",
  deliveryRange: "Llega en {min} a {max} días hábiles",
  deliveryExact: "Llega en {max} días hábiles",
  returns: "{return_days} días para cambios",
  warrantyOne: "Garantía de 1 mes",
  warranty: "Garantía de {warranty_months} meses",
  whatsapp: "Atención por WhatsApp",
} as const;

/** Los mensajes de las políticas, en el orden del Liquid. El pago al recibir va siempre (es la operación de DropFlex). */
export function tickerPolicyItems(p: StorePolicies, currency: string): TickerItem[] {
  const T = TICKER_POLICY_TEXT;
  const out: TickerItem[] = [{ icon: "cash", text: T.cod }];
  if (p.freeShipping) {
    out.push({ icon: "truck", text: p.freeShippingThreshold ? T.freeShippingFrom.replace("{threshold}", formatMoney(p.freeShippingThreshold, currency)) : T.freeShipping });
  }
  const days = deliveryDays(p);
  if (days) {
    const text = days.min === days.max ? T.deliveryExact : T.deliveryRange;
    out.push({ icon: "calendar", text: text.replace("{min}", String(days.min)).replace("{max}", String(days.max)) });
  }
  if (p.returnDays) out.push({ icon: "return", text: T.returns.replace("{return_days}", String(p.returnDays)) });
  if (p.warrantyMonths) out.push({ icon: "shield", text: p.warrantyMonths === 1 ? T.warrantyOne : T.warranty.replace("{warranty_months}", String(p.warrantyMonths)) });
  if (p.whatsapp) out.push({ icon: "chat", text: T.whatsapp });
  return out;
}

/** La cinta completa: aviso del evento → mensajes propios → políticas. */
export function tickerItems(announcement: string, own: string[], policies: TickerItem[]): TickerItem[] {
  return [
    { icon: TICKER_ICONS.announcement, text: announcement },
    ...own.filter((t) => t.trim()).map((text) => ({ icon: TICKER_ICONS.own, text: text.trim() })),
    ...policies,
  ];
}
