// DropFlex · <df-slider>: carrusel sobre scroll-snap nativo.
//
// El arrastre, la inercia y el teclado los da el navegador; esto solo agrega flechas, puntos y
// autoplay. Sin dependencias ni imports del tema, para que funcione igual en cualquier tema.
//
// Marcado esperado:
//   <df-slider data-autoplay="5000" data-loop>
//     <div class="df-slider__track" data-df-track> …slides… </div>
//     <div class="df-slider__controls">
//       <button data-df-prev>…</button><div data-df-dots></div><button data-df-next>…</button>
//     </div>
//   </df-slider>
//
// Autoplay: se pausa con el puntero encima, con el foco dentro, con la pestaña oculta, fuera de
// pantalla y siempre con prefers-reduced-motion. Emite `df-slider:change` con { index }.
// API pública: `slider.setAutoplay(false)` lo detiene (botón de pausa, primer gesto del usuario) y
// `setAutoplay(true)` lo reanuda; `slider.go(i)` navega.

if (!customElements.get('df-slider')) {
  class DfSlider extends HTMLElement {
    connectedCallback() {
      this.track = this.querySelector('[data-df-track]');
      if (!this.track) return;
      this.slides = Array.from(this.track.children);
      this.prev = this.querySelector('[data-df-prev]');
      this.next = this.querySelector('[data-df-next]');
      this.dotsHost = this.querySelector('[data-df-dots]');
      this.index = 0;
      this.paused = false;
      this.autoplayOff = false;
      this.loop = this.hasAttribute('data-loop');
      this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

      this.buildDots();
      this.prev?.addEventListener('click', () => this.go(this.index - 1));
      this.next?.addEventListener('click', () => this.go(this.index + 1));
      this.track.addEventListener('scroll', this.onScroll, { passive: true });

      for (const type of ['pointerenter', 'focusin']) this.addEventListener(type, this.pause);
      for (const type of ['pointerleave', 'focusout']) this.addEventListener(type, this.resume);
      document.addEventListener('visibilitychange', this.onVisibility);

      this.observer = new IntersectionObserver(([entry]) => {
        this.visible = entry.isIntersecting;
        this.schedule();
      });
      this.observer.observe(this);
      this.update();
    }

    disconnectedCallback() {
      clearTimeout(this.timer);
      this.observer?.disconnect();
      this.track?.removeEventListener('scroll', this.onScroll);
      document.removeEventListener('visibilitychange', this.onVisibility);
    }

    get perView() {
      const first = this.slides[0];
      if (!first) return 1;
      return Math.max(1, Math.round(this.track.clientWidth / first.getBoundingClientRect().width));
    }

    get lastIndex() {
      return Math.max(0, this.slides.length - this.perView);
    }

    buildDots() {
      if (!this.dotsHost) return;
      this.dotsHost.replaceChildren();
      this.dots = this.slides.map((_, i) => {
        const dot = document.createElement('button');
        dot.type = 'button';
        dot.className = 'df-slider__dot';
        dot.setAttribute('aria-label', `${this.dataset.dotLabel || 'Ir a'} ${i + 1}`);
        dot.addEventListener('click', () => this.go(i));
        this.dotsHost.append(dot);
        return dot;
      });
    }

    go(target) {
      const last = this.lastIndex;
      let index = target;
      if (index > last) index = this.loop ? 0 : last;
      if (index < 0) index = this.loop ? last : 0;
      const slide = this.slides[index];
      if (!slide) return;
      const behavior = this.reducedMotion.matches ? 'auto' : 'smooth';
      this.track.scrollTo({ left: slide.offsetLeft - this.track.offsetLeft - this.insetPx(), behavior });
    }

    insetPx() {
      return parseFloat(getComputedStyle(this.track).scrollPaddingInlineStart) || 0;
    }

    onScroll = () => {
      cancelAnimationFrame(this.frame);
      this.frame = requestAnimationFrame(() => {
        const left = this.track.scrollLeft + this.insetPx();
        let closest = 0;
        let best = Infinity;
        this.slides.forEach((slide, i) => {
          const distance = Math.abs(slide.offsetLeft - this.track.offsetLeft - left);
          if (distance < best) {
            best = distance;
            closest = i;
          }
        });
        if (closest !== this.index) {
          this.index = closest;
          this.update();
          this.dispatchEvent(new CustomEvent('df-slider:change', { detail: { index: closest }, bubbles: true }));
        }
      });
    };

    update() {
      const last = this.lastIndex;
      this.dots?.forEach((dot, i) => {
        dot.hidden = i > last;
        dot.setAttribute('aria-current', String(i === Math.min(this.index, last)));
      });
      if (this.prev) this.prev.disabled = !this.loop && this.index <= 0;
      if (this.next) this.next.disabled = !this.loop && this.index >= last;
      this.schedule();
    }

    schedule() {
      clearTimeout(this.timer);
      const delay = Number(this.dataset.autoplay);
      if (!delay || this.autoplayOff || this.paused || !this.visible || document.hidden || this.reducedMotion.matches) return;
      this.timer = setTimeout(() => this.go(this.index >= this.lastIndex ? 0 : this.index + 1), delay);
    }

    setAutoplay(on) {
      this.autoplayOff = !on;
      this.schedule();
    }

    pause = () => {
      this.paused = true;
      clearTimeout(this.timer);
    };

    resume = (event) => {
      if (event?.type === 'focusout' && this.contains(event.relatedTarget)) return;
      this.paused = false;
      this.schedule();
    };

    onVisibility = () => this.schedule();
  }

  customElements.define('df-slider', DfSlider);
}
