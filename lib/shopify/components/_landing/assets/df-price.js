// DropFlex · <df-price>: muestra el precio de la variante elegida.
//
// Sin fetch: los montos de cada variante vienen embebidos y formateados por Liquid. Escucha el
// evento estándar `shopify:product:select` y, como respaldo (packs de df-pack-offers, otros
// temas), el `change` del formulario /cart/add.

if (!customElements.get('df-price')) {
  class DfPrice extends HTMLElement {
    connectedCallback() {
      try {
        this.variants = JSON.parse(this.querySelector('[data-df-variants]')?.textContent || '{}');
      } catch {
        this.variants = {};
      }
      this.scope = this.closest('.shopify-section') || document;
      this.scope.addEventListener('shopify:product:select', this.onSelect);
      this.form = this.scope.querySelector('form[action*="/cart/add"]');
      this.form?.addEventListener('change', this.onFormChange);
    }

    disconnectedCallback() {
      this.scope?.removeEventListener('shopify:product:select', this.onSelect);
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

    onFormChange = () => {
      requestAnimationFrame(() => {
        const id = this.form?.querySelector('[name="id"]')?.value;
        if (id) this.render(id);
      });
    };

    render(rawId) {
      const v = this.variants[String(rawId).split('/').pop()];
      if (!v) return;
      const now = this.querySelector('[data-df-now]');
      const was = this.querySelector('[data-df-was]');
      const wasWrap = this.querySelector('[data-df-was-wrap]');
      const badge = this.querySelector('[data-df-badge]');
      if (now) now.textContent = v.p;
      if (was) was.textContent = v.c || '';
      if (wasWrap) wasWrap.hidden = !v.c;
      if (badge) {
        badge.hidden = !v.s;
        if (v.s) badge.textContent = (this.dataset.badge || '').replaceAll('{amount}', v.s).replaceAll('{percent}', String(v.pc));
      }
    }
  }

  customElements.define('df-price', DfPrice);
}
