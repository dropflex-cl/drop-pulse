import { ratingLabel } from "@/lib/reviews/copy";
import { cn } from "@/lib/utils";

// reference/bundle.js → P.star (grilla de 24).
const STAR = "M12 4l2.4 5 5.3.6-3.9 3.7 1 5.2L12 16l-4.8 2.5 1-5.2-3.9-3.7 5.3-.6z";

export interface StarsProps {
  /** De 1 a 5; se redondea para dibujar. */
  value: number;
  size?: "lg";
  /** Vista de tienda: colores fijos de tienda (reviews-store-preview). */
  store?: boolean;
  className?: string;
}

/**
 * Calificación con estrellas en tinta (`foreground`), no en amarillo: un solo acento y contraste en
 * ambos temas. Texto accesible: “4,6 de 5 estrellas”.
 */
export function Stars({ value, size, store, className }: StarsProps) {
  const on = Math.round(value || 0);
  return (
    <span
      role="img"
      aria-label={`${Number.isInteger(value) ? value : ratingLabel(value)} de 5 estrellas`}
      className={cn("inline-flex shrink-0 gap-px align-middle", store ? "text-(--store-ink)" : "text-foreground", className)}
    >
      {[1, 2, 3, 4, 5].map((i) => (
        <svg
          key={i}
          viewBox="0 0 24 24"
          aria-hidden
          strokeWidth={1.25}
          strokeLinejoin="round"
          className={cn(
            size === "lg" ? "size-4.5" : "size-3.5",
            i <= on
              ? "fill-current stroke-current"
              : store
                ? "fill-(--store-line) stroke-(--store-line-strong)"
                : "fill-muted stroke-input",
          )}
        >
          <path d={STAR} />
        </svg>
      ))}
    </span>
  );
}
