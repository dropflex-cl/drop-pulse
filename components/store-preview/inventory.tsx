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
  const template = facts.inventory.available ? content.available_text || String(s.available_text ?? "") : content.sold_out_text || String(s.sold_out_text ?? "");
  const text = (template.includes("{min}") || template.includes("{max}")) && !facts.logistics
    ? "Disponible" : fill(template, facts);
  return (
    <df-inventory
      className={`df df-inventory df-inventory--${facts.inventory.available ? "available" : "soldout"}${s.pulse ? " df-inventory--pulse" : ""}`}
      style={{ "--df-inventory-size": px(s.text_size), marginBlock: `${px(s.margin_top)} ${px(s.margin_bottom)}` } as React.CSSProperties}
    >
      <span className="df-inventory__dot" aria-hidden />
      <span className="df-inventory__text">{text}</span>
    </df-inventory>
  );
}
