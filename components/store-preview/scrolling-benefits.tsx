import { fill, policyActive } from "@/lib/store-preview/facts";
import { px, settingsOf } from "@/lib/store-preview/settings";
import { DfIcon } from "./primitives";
import type { PreviewProps } from "./types";

// sections/df-scrolling-benefits.liquid + snippets/df-scrolling-benefits-item.liquid, quieta en su
// primer cuadro: el set y su copia (como los dibuja el Liquid) con la pista detenida al inicio.

interface Item {
  icon?: string;
  text?: string;
  requires?: string;
}

interface Content {
  heading?: string;
  items?: Item[];
}

export function ScrollingBenefitsPreview({ content, facts }: PreviewProps<Content>) {
  const s = settingsOf("scrolling-benefits");

  // Un ítem atado a una política que la tienda no tiene no se dibuja (lo que falta, con su ejemplo).
  const items = (content.items ?? [])
    .slice(0, 8)
    .filter((it) => policyActive(it?.requires, facts))
    .map((it) => ({ icon: it?.icon, text: fill((it?.text || "").trim(), facts) }))
    .filter((it) => it.text);

  const count = items.length;
  if (!count) {
    return (
      <div className="df df-scrolling-benefits" style={{ "--df-sb-pt": px(s.padding_top), "--df-sb-pb": px(s.padding_bottom) } as React.CSSProperties}>
        <p className="df-placeholder">
          Cinta de beneficios: agrega bloques «Beneficio» o genera el contenido desde DropFlex. Los ítems atados a una política que la tienda no tiene no se muestran.
        </p>
      </div>
    );
  }

  const heading = s.show_heading ? fill(content.heading || String(s.heading ?? ""), facts) : "";
  const isStatic = count < 3;
  // Duración estimada sin JS (~220 px por ítem), como el Liquid.
  const estimate = Math.max(8, Math.floor((count * 220) / (Number(s.speed) || 50)));

  const classes = ["df", "df-scrolling-benefits"];
  if (isStatic) classes.push("df-scrolling-benefits--static");
  if (s.pause_on_hover) classes.push("df-scrolling-benefits--hover-pause");
  if (s.fade_edges) classes.push("df-scrolling-benefits--fade");
  if (s.direction === "right") classes.push("df-scrolling-benefits--right");

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
      className={classes.join(" ")}
      style={
        {
          "--df-sb-pt": px(s.padding_top),
          "--df-sb-pb": px(s.padding_bottom),
          "--df-sb-gap": px(s.item_gap),
          "--df-sb-text": px(s.text_size),
          "--df-sb-icon": px(s.icon_size),
          "--df-marquee-duration": `${estimate}s`,
        } as React.CSSProperties
      }
      data-speed={String(s.speed)}
      data-static={isStatic ? "" : undefined}
      // La vista previa no se mueve: data-paused detiene la animación del CSS del tema en su
      // primer cuadro (el botón queda como al cargar, con el ícono de pausa).
      data-paused={isStatic ? undefined : ""}
    >
      {heading && (
        <h2 className="df-heading df-scrolling-benefits__heading">
          {heading.split("**").map((part, i) => (i === 1 || i === 3 ? <span key={i} className="df-scrolling-benefits__hl">{part}</span> : part))}
        </h2>
      )}
      <div className="df-scrolling-benefits__bar">
        <div className="df-scrolling-benefits__viewport">
          <div className="df-scrolling-benefits__track" data-df-track="">
            <ul className="df-scrolling-benefits__set" role="list" data-df-set="">
              {set}
            </ul>
            {!isStatic && (
              <ul className="df-scrolling-benefits__set" role="list" aria-hidden inert>
                {set}
              </ul>
            )}
          </div>
        </div>
      </div>
    </df-scrolling-benefits>
  );
}
