import type { Listing } from "@/lib/copy/listing";
import { formatMoney } from "@/lib/store-preview/facts";
import type { PreviewProps } from "./types";

// La ficha en la tienda: foto, título, precio, la frase de la oferta, la descripción corta y el
// botón. No es un componente del catálogo (son los campos nativos que dibuja el tema): se arma con
// las variables del tema (--df-*) para que siga el acento igual que los componentes.

export function ListingPreview({ content, facts }: PreviewProps<Partial<Listing>>) {
  const off = facts.compareAt && facts.compareAt > facts.price ? Math.round((1 - facts.price / facts.compareAt) * 100) : 0;
  return (
    <div className="df flex flex-col gap-3 pb-4">
      <div className="aspect-square w-full bg-(--df-surface)">
        {/* eslint-disable-next-line @next/next/no-img-element -- vista de la tienda: la foto tal cual, como en el tema. */}
        {facts.productImage ? <img src={facts.productImage} alt="" className="size-full object-cover" /> : null}
      </div>
      <div className="flex flex-col gap-2 px-4">
        <h2 className="df-heading text-title">{content.title || facts.productName}</h2>
        <div className="flex items-baseline gap-2">
          <span className="text-heading font-semibold">{formatMoney(facts.price, facts.currency)}</span>
          {off > 0 ? (
            <>
              <s className="text-small text-(--df-muted)">{formatMoney(facts.compareAt!, facts.currency)}</s>
              <span className="text-caption font-semibold text-(--df-positive)">−{off}%</span>
            </>
          ) : null}
        </div>
        {content.offer_line ? <p className="text-small font-semibold text-(--df-accent-ink)">{content.offer_line}</p> : null}
        {content.short_description ? <p className="df-text text-small">{content.short_description}</p> : null}
        <div className="mt-1 grid h-12 place-items-center rounded-(--df-radius-sm) bg-(--df-accent) text-small font-semibold text-(--df-on-accent)">Agregar al carrito</div>
      </div>
    </div>
  );
}
