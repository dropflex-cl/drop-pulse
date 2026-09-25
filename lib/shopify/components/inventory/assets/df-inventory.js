// DropFlex · <df-inventory>: recalcula el estado al cambiar de variante.
//
// Sin fetch ni sondeo: el inventario de cada variante viene embebido por Liquid al renderizar.
// Escucha el evento estándar de Shopify `shopify:product:select` (Horizon/Pitch) y, como
// respaldo para otros temas, el `change` del input[name="id"] del formulario del producto.
// Soporta varias instancias en la página: cada una busca solo dentro de sí misma.

if (!customElements.get('df-inventory')) {
  const read = (el, selector) => {
    try {
      return JSON.parse(el.querySelector(selector)?.textContent || '{}');
    } catch {
      return {};
    }
  };

  // Vendidos de la semana por producto: se fija la primera visita y se repite en las siguientes.
  const soldFor = (el) => {
    const key = `df-sold:${el.dataset.productId}`;
    const fallback = Number(el.dataset.sold) || 150 + Math.floor(Math.random() * 201);
    try {
      const saved = Number(localStorage.getItem(key));
      if (saved >= 150 && saved <= 350) return saved;
      localStorage.setItem(key, String(fallback));
    } catch {}
    return fallback;
  };

  class DfInventory extends HTMLElement {
    connectedCallback() {
      this.sold = soldFor(this);
      this.variants = read(this, '[data-df-variants]');
      this.texts = read(this, '[data-df-texts]');
      this.textEl = this.querySelector('.df-inventory__text');
      this.scope = this.closest('.shopify-section') || document;

      this.scope.addEventListener('shopify:product:select', this.onSelect);
      this.form = this.scope.querySelector('form[action*="/cart/add"]');
      this.form?.addEventListener('change', this.onFormChange);

      if (this.textEl) this.textEl.textContent = this.textEl.textContent.replace(`${this.dataset.sold} vendidos`, `${this.sold} vendidos`);
    }

    disconnectedCallback() {
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
        .replaceAll('{sold}', String(this.sold))
        .replaceAll('{qty}', String(v.q))
        .replaceAll('{min}', this.dataset.min)
        .replaceAll('{max}', this.dataset.max);

      this.className = this.className.replace(/df-inventory--(available|limited|sold_out|preorder|hidden)/, `df-inventory--${status}`);
      if (this.textEl && this.textEl.textContent !== text) this.textEl.textContent = text;
    }
  }

  customElements.define('df-inventory', DfInventory);
}
