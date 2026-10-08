// DropFlex · <df-inventory>: recalcula el estado al cambiar de variante.
//
// Sin fetch ni sondeo: el inventario de cada variante viene embebido por Liquid al renderizar.
// Escucha el evento estándar de Shopify `shopify:product:select` (Horizon/Pitch) y, como
// respaldo para otros temas, el `change` del input[name="id"] del formulario del producto.
// Soporta varias instancias en la página: cada una busca solo dentro de sí misma.
//
// Movimiento (docs/spec-movimiento-tienda.md): el halo del punto late 3 veces al entrar en pantalla
// y otras 3 al cambiar de estado (nunca en bucle), y el texto nuevo entra con un fundido. Nada con
// prefers-reduced-motion ni con el ajuste «Animaciones de DropFlex» apagado.

if (!customElements.get('df-inventory')) {
  const read = (el, selector) => {
    try {
      return JSON.parse(el.querySelector(selector)?.textContent || '{}');
    } catch {
      return {};
    }
  };

  const canAnimate = () =>
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches && document.documentElement.dataset.dfMotion !== 'off';

  class DfInventory extends HTMLElement {
    connectedCallback() {
      this.variants = read(this, '[data-df-variants]');
      this.texts = read(this, '[data-df-texts]');
      this.textEl = this.querySelector('.df-inventory__text');
      this.scope = this.closest('.shopify-section') || document;

      this.scope.addEventListener('shopify:product:select', this.onSelect);
      this.form = this.scope.querySelector('form[action*="/cart/add"]');
      this.form?.addEventListener('change', this.onFormChange);

      // El primer latido, cuando el comprador lo ve (no al cargar fuera de pantalla).
      if ('IntersectionObserver' in window) {
        this.observer = new IntersectionObserver(
          (entries) => {
            if (!entries.some((entry) => entry.isIntersecting)) return;
            this.observer.disconnect();
            this.ping();
          },
          { threshold: 0.5 },
        );
        this.observer.observe(this);
      }
    }

    ping() {
      if (!this.classList.contains('df-inventory--pulse') || !canAnimate()) return;
      this.classList.remove('is-ping');
      void this.offsetWidth; // reinicia la animación del ::after
      this.classList.add('is-ping');
    }

    disconnectedCallback() {
      this.observer?.disconnect();
      this.scope?.removeEventListener('shopify:product:select', this.onSelect);
      this.form?.removeEventListener('change', this.onFormChange);
    }

    onSelect = (event) => {
      const syncId = event.detail?.variantId;
      if (syncId) this.render(syncId);
      event.promise?.then((result) => {
        const id = result?.variant?.id ?? result?.detail?.resource?.id;
        if (id) this.render(id);
      }).catch(() => {});
    };

    onFormChange = () => {
      // El tema actualiza el input después del evento; se lee en el siguiente frame.
      requestAnimationFrame(() => {
        const id = this.form?.querySelector('[name="id"]')?.value;
        if (id) this.render(id);
      });
    };

    status(v) {
      const threshold = Number(this.dataset.threshold);
      const tracked = v.m === 'shopify';
      if (!tracked && this.dataset.showUntracked === 'false') return 'hidden';
      if (!v.a) return 'sold_out';
      if (tracked && v.q <= 0 && v.p === 'continue') return 'preorder';
      if (tracked && v.q > 0 && v.q <= threshold) {
        return this.dataset.showQuantity === 'false' ? 'available' : 'limited';
      }
      return 'available';
    }

    render(rawId) {
      const id = String(rawId).split('/').pop();
      const v = this.variants[id];
      if (!v) return;
      const status = this.status(v);
      this.hidden = status === 'hidden';
      if (this.hidden) return;

      const template = this.texts[status] || this.texts.available || '';
      const text = template
        .replaceAll('{qty}', String(v.q))
        .replaceAll('{min}', this.dataset.min)
        .replaceAll('{max}', this.dataset.max);

      const changed = !this.classList.contains(`df-inventory--${status}`);
      this.className = this.className.replace(/df-inventory--(available|limited|sold_out|preorder|hidden)/, `df-inventory--${status}`);
      if (this.textEl && this.textEl.textContent !== text) {
        this.textEl.textContent = text;
        if (canAnimate()) this.textEl.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'cubic-bezier(0.2, 0, 0, 1)' });
      }
      if (changed) this.ping();
    }
  }

  customElements.define('df-inventory', DfInventory);
}
