// DropFlex · <df-review-slider>: botón de pausa y «no pelear con quien lee».
//
// El carrusel es el <df-slider> compartido (scroll-snap + flechas/puntos + autoplay con pausa por
// puntero, foco, pestaña oculta y fuera de pantalla). Esto agrega lo que WCAG 2.2.2 pide para
// contenido que se mueve más de 5 s: un botón visible para detenerlo. Además, la primera vez que
// el comprador arrastra, usa una flecha, un punto o abre una reseña completa, la rotación se
// detiene para siempre (queda el botón para reanudarla).
//
// Apaga y reanuda el autoplay con la API pública del <df-slider> compartido (setAutoplay).

if (!customElements.get('df-review-slider')) {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  class DfReviewSlider extends HTMLElement {
    connectedCallback() {
      this.events?.abort();
      this.events = new AbortController();
      const signal = this.events.signal;
      this.slider = this.querySelector('df-slider');
      this.pauseButton = this.querySelector('[data-df-pause]');
      this.delay = this.slider?.dataset.autoplay;
      this.page = this.querySelector('[data-df-review-page]');
      this.slider?.addEventListener('df-slider:change', this.updatePage, { signal });
      if (!this.slider || !this.delay) return;

      // Con movimiento reducido el slider nunca rota: el botón no tendría efecto.
      if (reducedMotion.matches && this.pauseButton) this.pauseButton.hidden = true;

      this.pauseButton?.addEventListener('click', this.onToggle, { signal });
      this.slider.querySelector('[data-df-track]')?.addEventListener('pointerdown', this.stop, { signal });
      for (const el of this.querySelectorAll('[data-df-prev], [data-df-next], [data-df-dots]')) {
        el.addEventListener('click', this.stop, { signal });
      }
      for (const el of this.querySelectorAll('details')) el.addEventListener('toggle', this.stop, { signal });
    }

    disconnectedCallback() {
      this.events?.abort();
      this.pauseButton?.removeEventListener('click', this.onToggle);
      this.slider?.removeEventListener('df-slider:change', this.updatePage);
    }

    setPlaying(playing) {
      this.playing = playing;
      this.pauseButton?.setAttribute('aria-pressed', String(!playing));
      this.pauseButton?.setAttribute('aria-label', playing ? 'Pausar reseñas' : 'Reanudar reseñas');
      this.slider.setAutoplay?.(playing);
    }

    onToggle = () => {
      this.setPlaying(this.pauseButton.getAttribute('aria-pressed') === 'true');
    };

    stop = () => {
      if (this.playing !== false) this.setPlaying(false);
    };

    updatePage = (event) => {
      if (this.page) this.page.textContent = `${event.detail.index + 1} / ${this.slider.slides.length}`;
    };
  }

  customElements.define('df-review-slider', DfReviewSlider);
}
