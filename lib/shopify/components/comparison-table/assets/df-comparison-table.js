// DropFlex · <df-comparison-table>: «latido» opcional de la columna nuestra al entrar en pantalla.
//
// Solo se carga con el ajuste «Latido al aparecer». Agrega `is-visible` una vez, cuando la tabla
// está al menos 40 % visible; el CSS corre tres latidos y se detiene (nunca un bucle infinito) y
// no anima nada con prefers-reduced-motion. Sin la clase, la tabla se ve igual: es solo énfasis.

if (!customElements.get('df-comparison-table')) {
  class DfComparisonTable extends HTMLElement {
    connectedCallback() {
      if (!this.classList.contains('df-comparison-table--pulse') || !('IntersectionObserver' in window)) return;
      this.observer = new IntersectionObserver(
        (entries) => {
          if (!entries.some((entry) => entry.isIntersecting)) return;
          this.classList.add('is-visible');
          this.observer?.disconnect();
        },
        { threshold: 0.4 },
      );
      this.observer.observe(this);
    }

    disconnectedCallback() {
      this.observer?.disconnect();
    }
  }

  customElements.define('df-comparison-table', DfComparisonTable);
}
