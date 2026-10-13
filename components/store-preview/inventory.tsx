"use client";

import { fill } from "@/lib/store-preview/facts";
import { px, settingsOf } from "@/lib/store-preview/settings";
import type { PreviewProps } from "./types";

// Mensaje comercial fijo y disponibilidad operativa: el mismo marcado que el Liquid.

interface Content {
  urgency_text?: string;
  available_text?: string;
  limited_text?: string;
  sold_out_text?: string;
  preorder_text?: string;
}

export function InventoryPreview({ content, facts }: PreviewProps<Content>) {
  const s = settingsOf("inventory");
  const urgency = content.urgency_text ?? String(s.urgency_text ?? "");
  const style = { "--df-inventory-size": px(s.text_size), marginBlock: `${px(s.margin_top)} ${px(s.margin_bottom)}` } as React.CSSProperties;
  const urgencyLine = urgency.trim() ? <p className="df-inventory-urgency"><span className="df-inventory__dot" aria-hidden /><span>{urgency}</span></p> : null;
  if (!facts.inventory) return <div className="df df-inventory-group" style={style}>{urgencyLine}<p className="df df-placeholder" data-df-live="inventory">La disponibilidad se actualiza en Shopify.</p></div>;
  const inventory = facts.inventory;
  const tracked = inventory.management === "shopify";
  const quantity = inventory.quantity ?? 0;
  const status = !inventory.available ? "sold_out"
    : tracked && quantity <= 0 && inventory.policy === "continue" ? "preorder"
    : tracked && quantity > 0 && quantity <= Number(s.low_stock_threshold ?? 10) ? "limited"
    : "available";
  const key = status === "limited" && s.show_quantity === false ? "available_text" : `${status}_text`;
  const template = content[key as keyof Content] || String(s[key] ?? "");
  const fallback = status === "preorder" ? "Disponible para reservar" : status === "limited" ? `Quedan ${quantity} unidades` : "Disponible";
  const text = (template.includes("{min}") || template.includes("{max}")) && !facts.logistics
    ? fallback : fill(template.replaceAll("{qty}", String(quantity)), facts);
  return (
    <div className="df df-inventory-group" style={style}>
      {urgencyLine}
      <df-inventory
        className={`df df-inventory df-inventory--${status}${s.pulse ? " df-inventory--pulse" : ""}`}
        hidden={inventory.management !== undefined && !tracked && s.show_when_untracked === false}
      >
        <span className="df-inventory__dot" aria-hidden />
        <span className="df-inventory__text" role="status" aria-live="polite">{text}</span>
      </df-inventory>
    </div>
  );
}
