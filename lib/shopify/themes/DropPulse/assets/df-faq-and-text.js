// DropFlex · <df-faq-and-text>: una pregunta abierta a la vez.
//
// El acordeón es <details>/<summary> nativo (teclado, lector de pantalla y buscar en la página
// gratis). La exclusividad ya es nativa con el atributo `name` (Chrome 120+, Safari 17.2+,
// Firefox 130+); esto es el respaldo para navegadores anteriores: al abrir una, cierra las demás
// de ESTA sección. Solo se carga con el ajuste «Una abierta a la vez».

if (!customElements.get('df-faq-and-text')) {
  class DfFaqAndText extends HTMLElement {
    connectedCallback() {
      // `toggle` no burbujea: se escucha en captura.
      this.addEventListener('toggle', this.onToggle, true);
    }

    disconnectedCallback() {
      this.removeEventListener('toggle', this.onToggle, true);
    }

    onToggle = (event) => {
      const opened = event.target;
      if (!(opened instanceof HTMLDetailsElement) || !opened.open || !this.hasAttribute('data-exclusive')) return;
      for (const other of this.querySelectorAll('details[open]')) {
        if (other !== opened) other.open = false;
      }
    };
  }

  customElements.define('df-faq-and-text', DfFaqAndText);
}
