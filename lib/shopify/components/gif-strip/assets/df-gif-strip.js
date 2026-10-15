// Todas las demostraciones están expuestas. El canvas congela el cuadro fuera de vista sin transformar
// ni descargar otra imagen. No se leen píxeles: funciona también con imágenes CDN sin CORS.
if (!customElements.get('df-gif-strip')) {
  customElements.define('df-gif-strip', class extends HTMLElement {
    connectedCallback() {
      this.events?.abort();
      this.events = new AbortController();
      const signal = this.events.signal;
      this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
      this.frames = [...this.querySelectorAll('[data-df-gif-frame]')];
      this.visibleFrames = new Set();
      this.frames.forEach((frame, index) => {
        const image = frame.querySelector('img');
        const ready = () => {
          this.freeze(frame, index);
          this.autoPlay();
        };
        image.addEventListener('load', ready, { signal });
        if (image.complete && image.naturalWidth) ready();
        frame.querySelector('[data-df-gif-toggle]').addEventListener('click', () => {
          if (frame.hasAttribute('data-paused')) {
            delete frame.dataset.userPaused;
            this.play(frame, index);
          } else {
            frame.dataset.userPaused = 'true';
            this.freeze(frame, index);
          }
        }, { signal });
      });
      const stop = () => this.frames.forEach((frame, index) => this.freeze(frame, index));
      this.reduced.addEventListener('change', () => { stop(); this.autoPlay(); }, { signal });
      document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else this.autoPlay(); }, { signal });
      this.observer?.disconnect();
      this.observer = new IntersectionObserver(entries => {
        for (const entry of entries) {
          const frame = entry.target;
          if (entry.isIntersecting) this.visibleFrames.add(frame);
          else {
            this.visibleFrames.delete(frame);
            this.freeze(frame, this.frames.indexOf(frame));
          }
        }
        this.autoPlay();
      }, { threshold: 0.25 });
      this.frames.forEach(frame => this.observer.observe(frame));
    }
    autoPlay() {
      if (document.hidden || this.reduced.matches) return;
      this.frames.forEach((frame, index) => {
        if (this.visibleFrames.has(frame) && !frame.dataset.userPaused) this.play(frame, index);
      });
    }
    freeze(frame, index) {
      if (!frame) return;
      const image = frame.querySelector('img');
      if (!image.complete || !image.naturalWidth) return;
      const canvas = frame.querySelector('canvas');
      if (!frame.hasAttribute('data-paused')) {
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext('2d');
        if (!context) return;
        context.drawImage(image, 0, 0);
      }
      canvas.hidden = false;
      canvas.removeAttribute('aria-hidden');
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', image.alt);
      frame.setAttribute('data-paused', '');
      this.button(frame, index, false);
    }
    play(frame, index) {
      if (!frame) return;
      const image = frame.querySelector('img');
      if (!image.complete || !image.naturalWidth) return;
      frame.querySelector('canvas').hidden = true;
      frame.removeAttribute('data-paused');
      this.button(frame, index, true);
    }
    button(frame, index, playing) {
      const button = frame.querySelector('[data-df-gif-toggle]');
      button.hidden = false;
      button.setAttribute('aria-label', `${playing ? 'Pausar' : 'Reproducir'} animación ${index + 1}`);
      button.querySelector('[data-df-gif-pause]').hidden = !playing;
      button.querySelector('[data-df-gif-play]').hidden = playing;
    }
    disconnectedCallback() {
      this.events?.abort();
      this.observer?.disconnect();
      this.visibleFrames?.clear();
    }
  });
}
