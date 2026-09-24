// DropFlex · <df-pack-offers>: elegir un pack es elegir su variante.
//
// No depende del selector de variantes del tema: cambia el input[name="id"] del formulario del
// producto (lo que se agrega al carrito), lo avisa con un `change` que sube por el formulario
// (df-price y df-inventory lo escuchan), actualiza la barra fija de compra y deja la variante en la
// URL, como hace el tema.

if (!customElements.get('df-pack-offers')) {
  class DfPackOffers extends HTMLElement {
    connectedCallback() {
      this.addEventListener('change', this.onChange);
    }

    disconnectedCallback() {
      this.removeEventListener('change', this.onChange);
    }

    onChange = (event) => {
      const radio = event.target;
      if (!(radio instanceof HTMLInputElement) || radio.type !== 'radio' || !radio.checked) return;
      event.stopPropagation();

      const scope = this.closest('.shopify-section') || document;
      for (const input of scope.querySelectorAll('form[action*="/cart/add"] input[name="id"]')) {
        if (input.value === radio.value) continue;
        input.value = radio.value;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }

      // La barra fija de compra del tema (si existe) muestra el pack elegido; su botón aprieta el del
      // formulario, así que ya compra la variante correcta.
      const sticky = document.querySelector('sticky-add-to-cart');
      if (sticky) {
        sticky.setAttribute('data-current-variant-id', radio.value);
        const price = sticky.querySelector('.sticky-add-to-cart__price');
        const variant = sticky.querySelector('.sticky-add-to-cart__variant');
        if (price && radio.dataset.price) price.textContent = radio.dataset.price;
        if (variant && radio.dataset.label) {
          variant.textContent = radio.dataset.label;
          variant.style.removeProperty('display');
        }
      }

      const url = new URL(window.location.href);
      url.searchParams.set('variant', radio.value);
      history.replaceState(history.state, '', url.toString());
    };
  }

  customElements.define('df-pack-offers', DfPackOffers);
}
