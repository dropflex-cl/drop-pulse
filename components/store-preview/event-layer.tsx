import { Fragment } from "react";
import { DECOR_PATHS } from "@/lib/events/decor";
import type { TickerItem } from "@/lib/events/ticker";
import { formatMoney } from "@/lib/store-preview/facts";
import type { EventDecorUi, EventLook } from "@/lib/types";
import { DfIcon } from "./primitives";

// La ficha con la capa del evento (docs/spec-eventos.md): la barra (aviso, o título + ahorro + reloj
// en cajas), la cinta de avisos, la bajada del evento, la etiqueta con el % real y la cuenta
// regresiva. Repite el marcado de lib/shopify/components/_event (df-event-bar, df-event-ticker,
// df-event-badge, df-event-countdown) y de los bloques
// de _landing para que el CSS generado del tema lo dibuje igual. Sin las clases df-ev-only/df-ev-off:
// aquí se ve siempre lo que la pantalla pide («Con evento» o «Normal»). Va dentro de StoreFrame.

export interface EventLayerPreviewProps {
  /** null = la ficha sin evento. */
  look: EventLook | null;
  layers: { tokens: boolean; countdown: boolean; decor: boolean };
  /** Lo que muestra df-event.js: antesala sin reloj, o «Termina en» y lo que falta; null sin contador. */
  countdown: { label: string; time: string; phase: "early" | "calm" | "urgent" } | null;
  /** Reloj de la barra (días, horas, minutos, segundos) hasta el término; null sin evento. */
  clock?: [string, string, string, string] | null;
  /** Antesala: sin ahorro, la barra dice el texto de la antesala bajo el título. */
  early?: boolean;
  /** La cinta de avisos: aviso, mensajes propios y políticas (lib/events/ticker.ts). */
  ticker?: TickerItem[];
  product: { title: string; subtitle: string; eventSubtitle?: string | null; price: number | null; compareAt: number | null; currency: string; image?: string };
}

function Decor({ name }: { name: EventDecorUi }) {
  return (
    <svg className="df-event-decor" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={DECOR_PATHS[name]} />
    </svg>
  );
}

const UNITS = ["Días", "Hrs", "Min", "Seg"];

/** snippets/df-event-bar.liquid con la capa de la cuenta regresiva. */
function ClockBar({ look, decor, clock, early, saving }: { look: EventLook; decor: EventDecorUi | null; clock: [string, string, string, string] | null; early: boolean; saving: string | null }) {
  return (
    <aside className="df df-event-bar df-event-bar--clock" aria-label={look.headline}>
      <div className="df-event-bar__inner">
        <div className="df-event-bar__lead">
          <p className="df-event-bar__headline">
            <span>{look.headline}</span>
            {decor ? <Decor name={decor} /> : null}
          </p>
          {saving ? <p className="df-event-bar__sub">{saving}</p> : early ? <p className="df-event-bar__sub">{look.earlyLabel}</p> : null}
        </div>
        {clock ? (
          <div className="df-event-bar__clock">
            <div className="df-event-bar__boxes" aria-hidden="true">
              {clock.map((n, i) => (
                <Fragment key={UNITS[i]}>
                  {i > 0 ? <span className="df-event-bar__sep">:</span> : null}
                  <span className="df-event-bar__box">
                    <span className="df-event-bar__num">{n}</span>
                    <span className="df-event-bar__unit">{UNITS[i]}</span>
                  </span>
                </Fragment>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </aside>
  );
}

/** snippets/df-event-ticker.liquid, quieta en su primer cuadro (como la vista previa de la cinta de beneficios). */
function Ticker({ items }: { items: TickerItem[] }) {
  const isStatic = items.length < 2;
  const set = items.map((it, i) => (
    <li key={i} className="df-scrolling-benefits__item">
      <span className="df-scrolling-benefits__icon">
        <DfIcon name={it.icon} />
      </span>
      <span className="df-scrolling-benefits__text">{it.text}</span>
    </li>
  ));
  return (
    <df-scrolling-benefits
      className={`df df-scrolling-benefits df-scrolling-benefits--hover-pause df-event-ticker${isStatic ? " df-scrolling-benefits--static" : ""}`}
      style={{ "--df-sb-pt": "0px", "--df-sb-pb": "0px", "--df-sb-gap": "40px", "--df-sb-text": "13px", "--df-sb-icon": "18px" } as React.CSSProperties}
      data-static={isStatic ? "" : undefined}
      // Como la vista previa de la cinta de beneficios: detenida en su primer cuadro.
      data-paused={isStatic ? undefined : ""}
    >
      <div className="df-scrolling-benefits__bar">
        <div className="df-scrolling-benefits__viewport">
          <div className="df-scrolling-benefits__track">
            <ul className="df-scrolling-benefits__set" role="list">
              {set}
            </ul>
            {isStatic ? null : (
              <ul className="df-scrolling-benefits__set" role="list" aria-hidden="true">
                {set}
              </ul>
            )}
          </div>
        </div>
        {isStatic ? null : (
          <span className="df-event-ticker__pause" aria-hidden="true">
            <span className="df-event-ticker__icon-pause">
              <DfIcon name="pause" />
            </span>
          </span>
        )}
      </div>
    </df-scrolling-benefits>
  );
}

export function EventLayerPreview({ look, layers, countdown, clock = null, early = false, ticker = [], product }: EventLayerPreviewProps) {
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
      {look && layers.countdown ? (
        <>
          <ClockBar look={look} decor={decor} clock={clock} early={early} saving={percent > 0 ? `Ahorra ${percent} %` : null} />
          {ticker.length ? <Ticker items={ticker} /> : null}
        </>
      ) : look ? (
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
              <p className={`df-event-countdown${countdown.phase === "calm" ? "" : ` df-event-countdown--${countdown.phase}`}`}>
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
