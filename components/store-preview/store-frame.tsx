import "./store.generated.css";
import { accentVars } from "@/lib/store-preview/accent";
import { cn } from "@/lib/utils";

// EXCEPCIÓN A LA REGLA DE TOKENS (como OfferPreview): la vista previa es otra superficie, la tienda.
// Sus colores, medidas y tipografía salen del CSS del tema (store.generated.css, generado desde
// lib/shopify/components) y no cambian con el modo oscuro de DropFlex. El acento del producto llega
// por style con los mismos tonos que df-accent-vars.liquid.

export interface StoreFrameProps {
  /** Color de la página (#rrggbb); sin color, el botón del tema. */
  accent?: string | null;
  children: React.ReactNode;
  /**
   * Miniatura: la tienda se dibuja más ancha y se achica (0,75 = un teléfono de 457 px en una tarjeta
   * de 343). Los @container del tema miden el ancho sin achicar.
   */
  scale?: number;
  className?: string;
}

/**
 * El marco de tienda: fondo blanco, las variables del tema y un contenedor que hace de ventana (los
 * @media del tema miden el marco, no la pantalla). Decorativo: la pantalla describe el componente
 * en texto al lado.
 */
export function StoreFrame({ accent, children, scale, className }: StoreFrameProps) {
  return (
    <div aria-hidden inert className={cn("df-store", className)} style={{ ...accentVars(accent), ...(scale ? { zoom: scale } : {}) } as React.CSSProperties}>
      {children}
    </div>
  );
}
