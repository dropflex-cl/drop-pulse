"use client";

import { useLayoutEffect, useRef, useState } from "react";

/**
 * El ancho real de un bloque (no el de la ventana): cambia al abrir el asistente o el costo de IA como
 * panel lateral. Sirve para decidir cuántas columnas caben.
 */
export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.getBoundingClientRect().width);
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}
