// DropFlex · <df-review-stars>: el clic en las estrellas lleva a las reseñas completas.
//
// Sin JS ya funciona: es un <a href="#ancla"> nativo. Esto solo agrega lo que el ancla no hace:
// compensar el encabezado fijo del tema (--df-review-stars-offset), respetar
// prefers-reduced-motion y dejar el foco en las reseñas para teclado y lector de pantalla. Si el
// ancla no existe en la página, el enlace se desactiva en vez de llevar a ninguna parte.

if (!customElements.get('df-review-stars')) {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  class DfReviewStars extends HTMLElement {
    connectedCallback() {
      this.link = this.querySelector('[data-df-review-stars-link]');
      if (!this.link) return;
      // Se revisa después de que el resto de la página terminó de dibujarse.
      requestAnimationFrame(() => {
        if (!this.target()) this.disable();
      });
      this.link.addEventListener('click', this.onClick);
    }

    disconnectedCallback() {
      this.link?.removeEventListener('click', this.onClick);
    }

    target() {
      const id = decodeURIComponent(this.link.hash.slice(1));
      return id ? document.getElementById(id) : null;
    }

    disable() {
      this.link.removeAttribute('href');
      this.link.setAttribute('role', 'img');
    }

    onClick = (event) => {
      const target = this.target();
      if (!target) return;
      event.preventDefault();
      const offset = parseFloat(getComputedStyle(this).getPropertyValue('--df-review-stars-offset')) || 0;
      const top = target.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top, behavior: reducedMotion.matches ? 'auto' : 'smooth' });
      if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
      history.replaceState(null, '', this.link.hash);
    };
  }

  customElements.define('df-review-stars', DfReviewStars);
}
