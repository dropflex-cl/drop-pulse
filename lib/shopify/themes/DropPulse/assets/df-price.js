// DropFlex · <df-price>: muestra el precio de la variante elegida o del pack elegido.
//
// Sin fetch: los montos de cada variante vienen embebidos y formateados por Liquid. Escucha el
// evento estándar `shopify:product:select` y, como respaldo (otros temas), el `change` del
// formulario /cart/add. Con packs (df-pack-offers, la variante de 1 unidad × N) manda el pack: su
// evento `df:pack` trae los montos ya formateados y ningún cambio de variante los pisa.
//
// Movimiento (docs/spec-movimiento-tienda.md §4.1): cuando el monto cambia, el nuevo entra subiendo
// 4px, el tachado hace un fundido y el sello de ahorro un pequeño pop. Nunca un contador de cifras:
// mostraría precios que no existen. Nada con prefers-reduced-motion ni con «Animaciones de DropFlex»
// apagado, ni si el texto no cambió.

if (!customElements.get('df-price')) {
  const canAnimate = () =>
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches && document.documentElement.dataset.dfMotion !== 'off';
  const EASE = 'cubic-bezier(0, 0, 0, 1)';

  /** Escribe el texto y, si cambió, anima el nodo con los cuadros dados. */
  const swap = (el, text, frames) => {
    if (!el || el.textContent === text) return;
    el.textContent = text;
    if (frames && canAnimate() && !el.closest('[hidden]')) el.animate(frames, { duration: 200, easing: EASE });
  };

  class DfPrice extends HTMLElement {
    connectedCallback() {
      try {
        this.variants = JSON.parse(this.querySelector('[data-df-variants]')?.textContent || '{}');
      } catch {
        this.variants = {};
      }
      this.scope = this.closest('.shopify-section') || document;
      this.scope.addEventListener('shopify:product:select', this.onSelect);
      this.scope.addEventListener('df:pack', this.onPack);
      this.form = this.scope.querySelector('form[action*="/cart/add"]');
      this.form?.addEventListener('change', this.onFormChange);
    }

    disconnectedCallback() {
      this.scope?.removeEventListener('shopify:product:select', this.onSelect);
      this.scope?.removeEventListener('df:pack', this.onPack);
      this.form?.removeEventListener('change', this.onFormChange);
    }

    onSelect = (event) => {
      if (event.detail?.variantId) this.render(event.detail.variantId);
      event.promise
        ?.then((result) => {
          const id = result?.variant?.id ?? result?.detail?.resource?.id;
          if (id) this.render(id);
        })
        .catch(() => {});
    };

    onPack = (event) => {
      this.pack = event.detail;
      this.render();
    };

    onFormChange = () => {
      requestAnimationFrame(() => {
        const id = this.form?.querySelector('[name="id"]')?.value;
        if (id) this.render(id);
      });
    };

    render(rawId) {
      const v = this.pack || this.variants[String(rawId).split('/').pop()];
      if (!v) return;
      const now = this.querySelector('[data-df-now]');
      const was = this.querySelector('[data-df-was]');
      const wasWrap = this.querySelector('[data-df-was-wrap]');
      const badge = this.querySelector('[data-df-badge]');
      swap(now, v.p, [
        { opacity: 0, translate: '0 4px' },
        { opacity: 1, translate: '0 0' },
      ]);
      if (wasWrap) wasWrap.hidden = !v.c;
      swap(was, v.c || '', [{ opacity: 0 }, { opacity: 1 }]);
      if (badge) {
        const appearing = badge.hidden && Boolean(v.s);
        badge.hidden = !v.s;
        if (v.s) {
          const pop = [
            { opacity: 0.6, scale: '0.92' },
            { opacity: 1, scale: '1' },
          ];
          const text = (this.dataset.badge || '').replaceAll('{amount}', v.s).replaceAll('{percent}', String(v.pc));
          if (appearing && badge.textContent === text && canAnimate()) badge.animate(pop, { duration: 200, easing: EASE });
          else swap(badge, text, pop);
        }
      }
      // Eventos: la etiqueta del evento lleva el mismo % real de la variante.
      const eventPc = this.querySelector('[data-df-event-pc]');
      if (eventPc) {
        eventPc.hidden = !v.pc;
        if (v.pc) eventPc.textContent = `−${v.pc} %`;
      }
    }
  }

  customElements.define('df-price', DfPrice);
}
