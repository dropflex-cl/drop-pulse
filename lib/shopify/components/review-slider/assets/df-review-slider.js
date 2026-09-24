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
      this.slider = this.querySelector('df-slider');
      this.pauseButton = this.querySelector('[data-df-pause]');
      this.delay = this.slider?.dataset.autoplay;
      if (!this.slider || !this.delay) return;

      // Con movimiento reducido el slider nunca rota: el botón no tendría efecto.
      if (reducedMotion.matches && this.pauseButton) this.pauseButton.hidden = true;

      this.pauseButton?.addEventListener('click', this.onToggle);
      this.slider.querySelector('[data-df-track]')?.addEventListener('pointerdown', this.stop);
      for (const el of this.querySelectorAll('[data-df-prev], [data-df-next], [data-df-dots]')) {
        el.addEventListener('click', this.stop);
      }
      for (const el of this.querySelectorAll('details')) el.addEventListener('toggle', this.stop);
    }

    disconnectedCallback() {
      this.pauseButton?.removeEventListener('click', this.onToggle);
    }

    setPlaying(playing) {
      this.playing = playing;
      this.pauseButton?.setAttribute('aria-pressed', String(!playing));
      this.slider.setAutoplay?.(playing);
    }

    onToggle = () => {
      this.setPlaying(this.pauseButton.getAttribute('aria-pressed') === 'true');
    };

    stop = () => {
      if (this.playing !== false) this.setPlaying(false);
    };
  }

  customElements.define('df-review-slider', DfReviewSlider);
}
