import { DECOR_PATHS } from "@/lib/events/decor";
import { formatMoney } from "@/lib/store-preview/facts";
import type { EventDecorUi, EventLook } from "@/lib/types";

// La ficha con la capa del evento (docs/spec-eventos.md): la barra de aviso, la bajada del evento,
// la etiqueta con el % real y la cuenta regresiva. Repite el marcado de
// lib/shopify/components/_event (df-event-bar, df-event-badge, df-event-countdown) y de los bloques
// de _landing para que el CSS generado del tema lo dibuje igual. Sin las clases df-ev-only/df-ev-off:
// aquí se ve siempre lo que la pantalla pide («Con evento» o «Normal»). Va dentro de StoreFrame.

export interface EventLayerPreviewProps {
  /** null = la ficha sin evento. */
  look: EventLook | null;
  layers: { tokens: boolean; countdown: boolean; decor: boolean };
  /** «Termina en» y lo que falta («3 días 04:12:00»); null sin contador. */
  countdown: { label: string; time: string } | null;
  product: { title: string; subtitle: string; eventSubtitle?: string | null; price: number | null; compareAt: number | null; currency: string; image?: string };
}

function Decor({ name }: { name: EventDecorUi }) {
  return (
    <svg className="df-event-decor" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={DECOR_PATHS[name]} />
    </svg>
  );
}

export function EventLayerPreview({ look, layers, countdown, product }: EventLayerPreviewProps) {
  const { price, compareAt, currency } = product;
  const save = price != null && compareAt != null && compareAt > price ? compareAt - price : 0;
  const percent = save > 0 && compareAt ? Math.round((save * 100) / compareAt) : 0;
  const decor = look && layers.decor ? look.decor : null;
  const vars = look
    ? ({
        "--df-event-surface": look.surface,
        "--df-event-on-surface": look.onSurface,
        // En la tienda el evento cambia el botón del tema (--color-primary-button-*); aquí el botón es el del acento.
        ...(layers.tokens ? { "--df-event-accent": look.accent, "--df-event-on-accent": look.onAccent, "--df-product-accent": look.accent, "--df-product-on-accent": look.onAccent } : {}),
      } as React.CSSProperties)
    : undefined;
  const subtitle = look && product.eventSubtitle ? product.eventSubtitle : product.subtitle;

  return (
    <div className="df flex flex-col pb-4" style={vars}>
      {look ? (
        <aside className="df df-event-bar">
          {decor ? <Decor name={decor} /> : null}
          <p className="df-event-bar__text">{look.announcement}</p>
          {decor ? <Decor name={decor} /> : null}
        </aside>
      ) : null}
      <div className="aspect-video w-full overflow-hidden bg-(--df-surface)">
        {/* eslint-disable-next-line @next/next/no-img-element -- vista de la tienda: la foto tal cual, como en el tema. */}
        {product.image ? <img src={product.image} alt="" className="size-full object-cover" /> : null}
      </div>
      <div className="flex flex-col gap-3 px-4 pt-3">
        <p className="df df-heading df-title">{product.title}</p>
        {subtitle ? <p className="df df-subtitle">{subtitle}</p> : null}
        <hr className="m-0 border-0 border-t border-(--df-hairline)" />
        {price != null ? (
          <div className="df df-price">
            <span className="df-price__now">{formatMoney(price, currency)}</span>
            {save > 0 ? (
              <>
                <span className="df-price__was">
                  <s>{formatMoney(compareAt!, currency)}</s>
                </span>
                <span className="df-price__badge">Ahorras {formatMoney(save, currency)}</span>
              </>
            ) : null}
            {look ? (
              <span className="df-event-badge">
                {decor ? <Decor name={decor} /> : null}
                <span>{look.badge}</span>
                {percent > 0 ? <span>−{percent} %</span> : null}
              </span>
            ) : null}
            {look && countdown ? (
              <p className="df-event-countdown">
                <span>{countdown.label}</span>
                <span className="df-event-countdown__time">{countdown.time}</span>
              </p>
            ) : null}
          </div>
        ) : null}
        <div className="grid h-12 place-items-center rounded-(--df-radius) bg-(--df-accent) text-small font-semibold text-(--df-on-accent)">Comprar ahora</div>
      </div>
    </div>
  );
}
