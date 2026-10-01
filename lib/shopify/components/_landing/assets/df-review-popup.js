// DropFlex · <df-review-popup>: reseñas reales de a una, abajo a la izquierda (snippets/df-review-popup).
//
// Ritmo: espera `data-delay` s, muestra una reseña `data-duration` s, la oculta, espera `data-gap` s
// y sigue con la próxima, hasta `data-max` por visita (sin repetir). Un reloj de 250 ms descuenta el
// tiempo solo mientras se puede: con la pestaña oculta, un <dialog> abierto o el formulario de
// EasySell abierto, espera; si se bloquea con una reseña a la vista, la oculta. Con el mouse encima
// o el foco dentro, la reseña no se va. La barra fija de compra se mide en cada vuelta: si aparece
// con una reseña a la vista, la tarjeta sube.
//
// Sesión (sessionStorage):
// - 'df:review-popup' = 'closed' cuando el comprador la cierra: no vuelve en la visita.
// - 'df:review-popup:<producto>' = la próxima reseña, para no empezar por la misma al recargar.

if (!customElements.get('df-review-popup')) {
  const TICK = 250;
  const CLOSED_KEY = 'df:review-popup';

  const read = (key) => {
    try {
      return sessionStorage.getItem(key);
    } catch {
      return null;
    }
  };

  const write = (key, value) => {
    try {
      sessionStorage.setItem(key, value);
    } catch {
      // Sin sessionStorage (modo privado): vale solo para esta página.
    }
  };

  const seconds = (value, fallback) => {
    const n = Number(value);
    return (Number.isFinite(n) && n > 0 ? n : fallback) * 1000;
  };

  const canAnimate = () =>
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches &&
    document.documentElement.dataset.dfMotion !== 'off';

  // El formulario de EasySell es un .es-modal propio (no un <dialog>). Con position: fixed no tiene
  // offsetParent: se mira si ocupa lugar en pantalla.
  const easySellOpen = () =>
    [...document.querySelectorAll('.es-modal')].some((el) => {
      if (!el.getClientRects().length) return false;
      const style = getComputedStyle(el);
      return style.visibility !== 'hidden' && style.opacity !== '0';
    });

  class DfReviewPopup extends HTMLElement {
    connectedCallback() {
      if (read(CLOSED_KEY) === 'closed') return;

      this.items = [...this.querySelectorAll('template[data-df-rp-item]')];
      if (!this.items.length) return;

      this.stage = this.querySelector('[data-df-rp-slot]');
      this.more = this.querySelector('[data-df-rp-more]');
      this.delay = seconds(this.dataset.delay, 8);
      this.duration = seconds(this.dataset.duration, 6);
      this.gap = seconds(this.dataset.gap, 15);
      this.limit = Math.min(Number(this.dataset.max) || 6, this.items.length);
      this.nextKey = `df:review-popup:${this.dataset.productId}`;
      this.next = (Number(read(this.nextKey)) || 0) % this.items.length;
      this.shown = 0;
      this.phase = 'wait';
      this.left = this.delay;
      this.hovered = false;

      this.addEventListener('pointerenter', () => (this.hovered = true));
      this.addEventListener('pointerleave', () => (this.hovered = false));
      this.querySelector('[data-df-rp-close]')?.addEventListener('click', () => this.close());
      this.more?.addEventListener('click', () => this.openWall());

      this.timer = setInterval(() => this.tick(), TICK);
    }

    disconnectedCallback() {
      this.stop();
    }

    stop() {
      clearInterval(this.timer);
      cancelAnimationFrame(this.frame);
      this.timer = null;
    }

    blocked() {
      return document.hidden || Boolean(document.querySelector('dialog[open]')) || easySellOpen();
    }

    held() {
      return this.hovered || this.contains(document.activeElement);
    }

    tick() {
      if (this.phase === 'wait') {
        if (this.blocked()) return;
        this.left -= TICK;
        if (this.left <= 0) this.show();
        return;
      }

      // Reseña a la vista.
      if (this.blocked()) {
        this.hide();
        return;
      }
      this.liftAboveStickyBar();
      if (this.held()) return;
      this.left -= TICK;
      if (this.left <= 0) this.hide();
    }

    show() {
      const template = this.items[this.next];
      this.stage.replaceChildren(template.content.cloneNode(true));
      this.next = (this.next + 1) % this.items.length;
      write(this.nextKey, String(this.next));
      this.shown += 1;

      if (this.more) this.more.hidden = !document.querySelector('df-review-wall');
      this.liftAboveStickyBar();
      this.hidden = false;
      // Un cuadro después de quitar `hidden`, para que la entrada tenga desde dónde animar.
      this.frame = requestAnimationFrame(() => {
        this.frame = requestAnimationFrame(() => (this.dataset.state = 'in'));
      });
      this.phase = 'show';
      this.left = this.duration;
    }

    hide() {
      delete this.dataset.state;
      this.phase = 'wait';
      this.left = this.gap;
      if (this.shown >= this.limit) this.stop();
      // Fuera del flujo de foco y de lectura cuando termina la salida.
      const out = canAnimate() ? 200 : 0;
      setTimeout(() => {
        if (this.dataset.state !== 'in') this.hidden = true;
      }, out);
    }

    close() {
      write(CLOSED_KEY, 'closed');
      this.stop();
      delete this.dataset.state;
      this.hidden = true;
    }

    openWall() {
      const wall = document.querySelector('df-review-wall');
      if (!wall) return;
      wall.scrollIntoView({ behavior: canAnimate() ? 'smooth' : 'auto', block: 'start' });
      this.hide();
    }

    // La barra fija de compra del tema (abajo en móvil, flotante en escritorio): la tarjeta va encima
    // mientras está a la vista.
    liftAboveStickyBar() {
      const bar = document.querySelector('.sticky-add-to-cart__bar[data-stuck="true"]');
      let lift = 0;
      if (bar) {
        const rect = bar.getBoundingClientRect();
        if (rect.height > 0 && rect.top < window.innerHeight) lift = Math.max(0, window.innerHeight - rect.top);
      }
      this.style.setProperty('--df-rp-lift', `${Math.round(lift)}px`);
    }
  }

  customElements.define('df-review-popup', DfReviewPopup);
}
