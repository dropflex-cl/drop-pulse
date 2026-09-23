import Image from "next/image";
import { Icon } from "./icon";
import { Stars } from "./stars";
import { money } from "@/lib/format";
import { countryLabel, ratingLabel } from "@/lib/reviews/copy";

// EXCEPCIÓN A LA REGLA DE TOKENS (design-system/reference/OfferPreview/README.md):
// es una vista de otra superficie (la tienda), con colores fijos de tienda (blanco y tinta)
// que no cambian con el modo oscuro de DropFlex. Valores de reference/bundle.css → .df-offer* y
// .df-rv-store* (la vista de reseñas en la tienda, más abajo).
const STORE = {
  bg: "#ffffff",
  ink: "#15171c",
  muted: "#5a606b",
  imageBg: "#f3f4f6",
  off: "#12784a",
  onInk: "#ffffff",
  line: "#e4e6eb",
  lineStrong: "#c3c7cf",
  ctaRadius: 8,
} as const;

export interface OfferPreviewProps {
  title: string;
  price: number;
  /** Precio tachado. */
  compareAt?: number;
  image?: string;
  store?: string;
  cta?: string;
}

/** Cómo verá la oferta el comprador en la tienda. Siempre incluye “Paga al recibir”. */
export function OfferPreview({ title, price, compareAt, image, store = "tutienda.cl", cta = "Pedir ahora, pagar al recibir" }: OfferPreviewProps) {
  const off = compareAt && compareAt > price ? Math.round((1 - price / compareAt) * 100) : 0;
  return (
    <figure aria-label="Vista del comprador">
      <figcaption className="mb-2 flex justify-between text-micro text-muted-foreground">
        <span>Vista del comprador</span>
        <span>{store}</span>
      </figcaption>
      <div className="overflow-hidden rounded-lg border" style={{ background: STORE.bg, color: STORE.ink }}>
        <div className="relative aspect-4/3 w-full" style={{ background: STORE.imageBg }}>
          {image ? <Image src={image} alt="" fill unoptimized sizes="(min-width: 1024px) 360px, 100vw" className="object-cover" /> : null}
        </div>
        <div className="flex flex-col gap-1.5 px-4 pt-3 pb-4">
          <div className="text-row font-semibold">{title}</div>
          <div className="flex items-baseline gap-2">
            <span className="text-title tracking-normal">{money(price)}</span>
            {compareAt ? (
              <span className="text-label font-normal line-through" style={{ color: STORE.muted }}>
                {money(compareAt)}
              </span>
            ) : null}
            {off > 0 ? (
              <span className="text-caption font-semibold" style={{ color: STORE.off }}>
                −{off}%
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-1 text-caption" style={{ color: STORE.muted }}>
            <Icon name="truck" size="sm" />
            Paga al recibir · Envío gratis
          </div>
          <div
            className="mt-1.5 grid h-10 place-items-center text-small font-semibold"
            style={{ background: STORE.ink, color: STORE.onInk, borderRadius: STORE.ctaRadius }}
          >
            {cta}
          </div>
        </div>
      </div>
    </figure>
  );
}

export interface ReviewsStorePreviewProps {
  average: number;
  count: number;
  reviews: { text: string; rating: number; author: string; country?: string }[];
}

/**
 * Así se verán las reseñas aprobadas en la tienda (reference/bundle.js → RvDesk). Siempre con la
 * fuente visible: presentar reseñas de otra tienda como propias puede infringir normas de protección
 * al consumidor (arquitectura.md › 9, Honestidad).
 */
export function ReviewsStorePreview({ average, count, reviews }: ReviewsStorePreviewProps) {
  const vars = { "--store-ink": STORE.ink, "--store-line": STORE.line, "--store-line-strong": STORE.lineStrong } as React.CSSProperties;
  return (
    <figure aria-label="Así se verán en tu tienda">
      <figcaption className="mb-2 flex justify-between text-micro text-muted-foreground">
        <span>Así se verán en tu tienda</span>
        <span>{count === 1 ? "1 aprobada" : `${count} aprobadas`}</span>
      </figcaption>
      <div className="flex flex-col gap-3 overflow-hidden rounded-lg border p-4" style={{ background: STORE.bg, color: STORE.ink, ...vars }}>
        {count ? (
          <>
            <div className="flex items-center gap-2 text-label font-normal" style={{ color: STORE.muted }}>
              <b className="text-title" style={{ color: STORE.ink }}>
                {ratingLabel(average)}
              </b>
              <Stars value={average} store />
              <span>{count === 1 ? "1 reseña" : `${count} reseñas`}</span>
            </div>
            <p className="-mt-2 text-caption" style={{ color: STORE.muted }}>
              Reseñas de compradores del mismo producto en AliExpress
            </p>
            {reviews.map((r, i) => (
              <div key={i} className="border-t pt-3" style={{ borderColor: STORE.line }}>
                <Stars value={r.rating} store />
                <p className="my-1 line-clamp-3 text-small">{r.text}</p>
                <small className="text-caption" style={{ color: STORE.muted }}>
                  {r.author}
                  {r.country ? ` · ${countryLabel(r.country)}` : ""}
                </small>
              </div>
            ))}
          </>
        ) : (
          <p className="text-small" style={{ color: STORE.muted }}>
            Aprueba reseñas para verlas aquí.
          </p>
        )}
      </div>
    </figure>
  );
}
