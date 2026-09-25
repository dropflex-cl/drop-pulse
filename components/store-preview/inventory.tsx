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
  const text = fill(content.available_text || String(s.available_text ?? ""), facts);
  return (
    <df-inventory
      className={`df df-inventory df-inventory--available${s.pulse ? " df-inventory--pulse" : ""}`}
      style={{ "--df-inventory-size": px(s.text_size), marginBlock: `${px(s.margin_top)} ${px(s.margin_bottom)}` } as React.CSSProperties}
    >
      <span className="df-inventory__dot" aria-hidden />
      <span className="df-inventory__text">{text}</span>
    </df-inventory>
  );
}
