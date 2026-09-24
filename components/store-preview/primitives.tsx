import { Fragment } from "react";
import { boldParts } from "@/lib/store-preview/settings";
import { ICON_PATHS } from "@/lib/store-preview/theme.generated";

// Los snippets compartidos del tema, en React: df-icon, df-stars y el **destacado**. El marcado es
// el mismo que el Liquid para que el CSS del tema aplique igual.

const STAR = "M10 1.5l2.6 5.5 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L1.4 7.8l6-.8z";

/** snippets/df-icon.liquid. Una clave desconocida no dibuja nada. */
export function DfIcon({ name, className }: { name: string | undefined; className?: string }) {
  const d = name ? ICON_PATHS[name] : undefined;
  if (!d) return null;
  return (
    <svg
      className={className ? `df-icon ${className}` : "df-icon"}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      // Dibujos fijos del tema (theme.generated.ts), nunca texto de la IA ni del comerciante.
      dangerouslySetInnerHTML={{ __html: d }}
    />
  );
}

/** snippets/df-stars.liquid: 5 estrellas con relleno parcial. */
export function DfStars({ rating, size }: { rating: number; size?: string }) {
  const value = Math.min(5, Math.max(0, rating || 0));
  const row = Array.from({ length: 5 }, (_, i) => (
    <svg key={i} viewBox="0 0 20 20" aria-hidden focusable="false">
      <path fill="currentColor" d={STAR} />
    </svg>
  ));
  return (
    <span className="df-stars" style={{ "--df-stars-fill": `${value * 20}%`, ...(size ? { "--df-stars-size": size } : {}) } as React.CSSProperties}>
      <span className="df-stars__row df-stars__row--empty">{row}</span>
      <span className="df-stars__row df-stars__row--full">{row}</span>
      <span className="df-visually-hidden">{`${String(Math.round(value * 10) / 10).replace(".", ",")} de 5 estrellas`}</span>
    </span>
  );
}

/** Un texto con **destacados**, como `split: '**'` del Liquid. `mark` dibuja cada destacado. */
export function Bold({ text, mark }: { text: string; mark: (part: string, key: number) => React.ReactNode }) {
  return (
    <>
      {boldParts(text).map((p, i) => (p.bold ? mark(p.text, i) : <Fragment key={i}>{p.text}</Fragment>))}
    </>
  );
}
