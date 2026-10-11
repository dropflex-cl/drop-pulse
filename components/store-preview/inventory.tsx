"use client";

import { fill } from "@/lib/store-preview/facts";
import { px, settingsOf } from "@/lib/store-preview/settings";
import type { PreviewProps } from "./types";

// blocks/df-inventory.liquid en el estado más común: disponible (el stock real lo decide la tienda).

interface Content {
  available_text?: string;
  limited_text?: string;
  sold_out_text?: string;
  preorder_text?: string;
}

export function InventoryPreview({ content, facts }: PreviewProps<Content>) {
  const s = settingsOf("inventory");
  if (!facts.inventory) return <p className="df df-placeholder" data-df-live="inventory">La disponibilidad se actualiza en Shopify.</p>;
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
    <df-inventory
      className={`df df-inventory df-inventory--${status}${s.pulse ? " df-inventory--pulse" : ""}`}
      hidden={inventory.management !== undefined && !tracked && s.show_when_untracked === false}
      style={{ "--df-inventory-size": px(s.text_size), marginBlock: `${px(s.margin_top)} ${px(s.margin_bottom)}` } as React.CSSProperties}
    >
      <span className="df-inventory__dot" aria-hidden />
      <span className="df-inventory__text" role="status" aria-live="polite">{text}</span>
    </df-inventory>
  );
}
