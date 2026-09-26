// DropFlex · <df-review-wall>: «Ver más» en el texto recortado y «Ver más testimonios».
//
// El servidor ya dibuja el muro recortado (text_lines) y con las publicaciones de más ocultas
// (`hidden`); esto solo:
// - muestra el «Ver más» de cada texto que de verdad quedó cortado (se mide: depende del ancho de
//   la tarjeta y de la fuente) y, al tocarlo, lo abre entero, como Facebook;
// - «Ver más testimonios» descubre la siguiente tanda (data-step) y lleva el foco a la primera
//   publicación nueva, sin mover la pantalla, para que el teclado siga desde ahí.

if (!customElements.get('df-review-wall')) {
  class DfReviewWall extends HTMLElement {
    connectedCallback() {
      this.more = this.querySelector('[data-df-rw-more]');
      this.more?.addEventListener('click', this.onMore);
      this.addEventListener('click', this.onExpand);
      // El alto cambia al girar el teléfono, al cargar la fuente y al descubrir publicaciones.
      this.observer = new ResizeObserver(() => this.measure());
      this.observer.observe(this);
      document.fonts?.ready.then(() => this.measure());
      this.measure();
    }

    disconnectedCallback() {
      this.observer?.disconnect();
      this.more?.removeEventListener('click', this.onMore);
      this.removeEventListener('click', this.onExpand);
    }

    measure() {
      for (const text of this.querySelectorAll('[data-df-rw-text]:not(.is-expanded)')) {
        const button = text.nextElementSibling;
        if (!button?.matches('[data-df-rw-expand]') || text.closest('[hidden]')) continue;
        button.hidden = text.scrollHeight <= text.clientHeight + 1;
      }
    }

    onExpand = (event) => {
      const button = event.target.closest('[data-df-rw-expand]');
      if (!button) return;
      const text = button.previousElementSibling;
      text.classList.add('is-expanded');
      // El botón desaparece: el foco pasa a la publicación para no perderse en el <body>.
      const post = button.closest('article');
      button.remove();
      post?.focus({ preventScroll: true });
    };

    onMore = () => {
      const hidden = this.querySelectorAll('[data-df-rw-post][hidden]');
      const step = Number(this.more.dataset.step) || 6;
      const next = Array.prototype.slice.call(hidden, 0, step);
      for (const cell of next) cell.hidden = false;
      if (hidden.length <= step) this.more.parentElement.hidden = true;
      this.measure();
      next[0]?.querySelector('article')?.focus({ preventScroll: true });
    };
  }

  customElements.define('df-review-wall', DfReviewWall);
}
