"use client";

import { useEffect, useState } from "react";
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

/** Semilla estable 150–350 por producto: el primer render (servidor) ya trae un número. */
function seedSold(key: string): number {
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return 150 + (h % 201);
}

/** Vendidos de la semana: se fija en localStorage la primera visita y se repite en las siguientes. */
function useSold(key: string): number {
  const [sold, setSold] = useState(() => seedSold(key));
  useEffect(() => {
    const storageKey = `df-sold:${key}`;
    try {
      const saved = Number(localStorage.getItem(storageKey));
      if (saved >= 150 && saved <= 350) return setSold(saved);
      const next = 150 + Math.floor(Math.random() * 201);
      localStorage.setItem(storageKey, String(next));
      setSold(next);
    } catch {}
  }, [key]);
  return sold;
}

export function InventoryPreview({ content, facts }: PreviewProps<Content>) {
  const s = settingsOf("inventory");
  const sold = useSold(facts.productName);
  const viral = String(s.viral_text ?? "");
  const text = viral
    ? viral.replaceAll("{sold}", String(sold))
    : fill(content.available_text || String(s.available_text ?? ""), facts);
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
