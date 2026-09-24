// DropFlex · <df-buy-link>: el botón del hero baja al formulario de compra de la misma página.
//
// El enlace ya apunta a la ficha del producto (funciona sin JS). En la ficha, en vez de recargarla,
// se desplaza hasta el primer formulario /cart/add visible y le pasa el foco a su botón de compra,
// para que teclado y lector de pantalla sigan el mismo camino que la vista.
// Sin formulario en la página, el enlace sigue su curso normal.

if (!customElements.get('df-buy-link')) {
  class DfBuyLink extends HTMLElement {
    connectedCallback() {
      this.link = this.querySelector('a');
      this.link?.addEventListener('click', this.onClick);
    }

    disconnectedCallback() {
      this.link?.removeEventListener('click', this.onClick);
    }

    onClick = (event) => {
      const form = Array.from(document.querySelectorAll('form[action*="/cart/add"]')).find(
        (candidate) => !this.closest('.shopify-section')?.contains(candidate) && candidate.getClientRects().length > 0,
      );
      if (!form) return;
      event.preventDefault();
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      form.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
      const target = form.querySelector('[type="submit"]:not([disabled]), button[name="add"]') || form;
      if (target === form && !form.hasAttribute('tabindex')) form.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    };
  }

  customElements.define('df-buy-link', DfBuyLink);
}
