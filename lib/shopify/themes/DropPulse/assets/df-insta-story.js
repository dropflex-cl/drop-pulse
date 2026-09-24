// DropFlex · <df-insta-story>: fila de círculos + visor de historias en un <dialog> nativo.
//
// El <dialog> (showModal) da gratis la trampa de foco, Esc y el fondo. Esto agrega:
//   - barras segmentadas (una por historia) animadas con la Web Animations API: se pausan con
//     .pause() y el fin de la animación ES el avance, sin setTimeout que se desincronice;
//   - toque en el tercio izquierdo = anterior, resto = siguiente; mantener = pausa; deslizar hacia
//     abajo = cerrar; deslizar en horizontal = anterior/siguiente; flechas del teclado;
//   - videos: se crean desde su <template> recién al abrir la historia (preload="none", póster),
//     la barra sigue al video (timeupdate) y `ended` avanza; si play() falla, queda en pausa con
//     el botón de reproducir visible;
//   - pausa con el botón, al mantener, con la pestaña oculta. prefers-reduced-motion: sin avance
//     automático (la barra marca el paso sin animarse; se navega a mano).
// Varias instancias por página: todo el estado vive en cada elemento.

if (!customElements.get('df-insta-story')) {
  const HOLD_MS = 220;
  const SWIPE_PX = 60;

  class DfInstaStory extends HTMLElement {
    connectedCallback() {
      this.dialog = this.querySelector('dialog');
      if (!this.dialog) return;
      this.stage = this.dialog.querySelector('[data-df-stage]');
      this.slides = Array.from(this.dialog.querySelectorAll('[data-df-slide]'));
      this.fills = Array.from(this.dialog.querySelectorAll('[data-df-fill]'));
      this.items = Array.from(this.querySelectorAll('[data-df-story]'));
      this.status = this.dialog.querySelector('[data-df-status]');
      this.pauseButton = this.dialog.querySelector('[data-df-pause]');
      this.muteButton = this.dialog.querySelector('[data-df-mute]');
      this.prevButton = this.dialog.querySelector('[data-df-prev]');
      this.nextButton = this.dialog.querySelector('[data-df-next]');

      this.duration = Number(this.dataset.duration) || 5000;
      this.muted = this.dataset.startMuted !== 'false';
      this.closeAtEnd = this.dataset.closeAtEnd !== 'false';
      this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
      this.index = -1;
      this.userPaused = false;
      this.holding = false;

      this.querySelectorAll('[data-df-open]').forEach((button) => {
        button.addEventListener('click', () => this.open(Number(button.dataset.dfOpen), button));
      });
      this.dialog.querySelector('[data-df-close]')?.addEventListener('click', () => this.close());
      this.prevButton?.addEventListener('click', () => this.go(this.index - 1));
      this.nextButton?.addEventListener('click', () => this.go(this.index + 1));
      this.pauseButton?.addEventListener('click', () => {
        this.userPaused = !this.userPaused;
        this.sync();
      });
      this.muteButton?.addEventListener('click', () => {
        this.muted = !this.muted;
        if (this.video) this.video.muted = this.muted;
        this.muteButton.setAttribute('aria-pressed', String(this.muted));
      });

      this.dialog.addEventListener('close', this.onClose);
      this.dialog.addEventListener('keydown', this.onKey);
      this.dialog.addEventListener('click', this.onDialogClick);
      this.stage?.addEventListener('pointerdown', this.onPointerDown);
      this.stage?.addEventListener('pointerup', this.onPointerUp);
      this.stage?.addEventListener('pointercancel', this.onPointerCancel);
      this.stage?.addEventListener('contextmenu', this.onContextMenu);
      document.addEventListener('visibilitychange', this.sync);
      document.addEventListener('shopify:block:select', this.onBlockSelect);
      document.addEventListener('shopify:block:deselect', this.onBlockDeselect);
    }

    disconnectedCallback() {
      this.stop();
      if (this.dialog?.open) this.dialog.close();
      this.unlockScroll();
      document.removeEventListener('visibilitychange', this.sync);
      document.removeEventListener('shopify:block:select', this.onBlockSelect);
      document.removeEventListener('shopify:block:deselect', this.onBlockDeselect);
    }

    open(index, opener) {
      this.opener = opener || null;
      if (!this.dialog.open) {
        this.dialog.showModal();
        this.lockScroll();
      }
      this.userPaused = false;
      this.index = -1;
      this.go(index);
    }

    close() {
      if (this.dialog.open) this.dialog.close();
    }

    onClose = () => {
      this.stop();
      this.unlockScroll();
      this.slides.forEach((slide) => (slide.hidden = true));
      this.dialog.classList.remove('is-holding');
      this.holding = false;
      this.index = -1;
      this.opener?.focus({ preventScroll: true });
    };

    go(target) {
      if (!this.slides.length) return;
      if (target >= this.slides.length) {
        // Terminó la última: se cierra (o queda en la última, completa).
        if (this.closeAtEnd) this.close();
        return;
      }
      const index = Math.max(0, target);
      this.stop();
      this.index = index;

      this.slides.forEach((slide, i) => (slide.hidden = i !== index));
      this.fills.forEach((fill, i) => (fill.style.transform = `scaleX(${i < index ? 1 : 0})`));
      this.items[index]?.classList.add('is-seen');
      if (this.prevButton) this.prevButton.disabled = index === 0;
      if (this.nextButton) this.nextButton.disabled = index === this.slides.length - 1 && !this.closeAtEnd;

      const slide = this.slides[index];
      if (this.status) this.status.textContent = `Historia ${index + 1} de ${this.slides.length}: ${slide.dataset.label || ''}`;

      this.video = slide.dataset.type === 'video' ? this.mountVideo(slide) : null;
      if (this.muteButton) {
        this.muteButton.hidden = !this.video;
        this.muteButton.setAttribute('aria-pressed', String(this.muted));
      }
      this.preloadNext(index + 1);
      this.start();
    }

    /** Crea el <video> desde su <template> la primera vez que se abre la historia. */
    mountVideo(slide) {
      let video = slide.querySelector('video');
      if (!video) {
        const template = slide.querySelector('template[data-df-video]');
        if (!template) return null;
        slide.prepend(template.content.cloneNode(true));
        video = slide.querySelector('video');
        if (!video) return null;
        video.playsInline = true;
        video.loop = false;
        video.controls = false;
        video.setAttribute('aria-label', slide.dataset.label || '');
        video.addEventListener('timeupdate', () => {
          if (video !== this.video || !video.duration) return;
          this.fills[this.index].style.transform = `scaleX(${Math.min(1, video.currentTime / video.duration)})`;
        });
        video.addEventListener('ended', () => {
          if (video !== this.video) return;
          this.fills[this.index].style.transform = 'scaleX(1)';
          if (!this.reducedMotion.matches) this.go(this.index + 1);
        });
      }
      video.muted = this.muted;
      return video;
    }

    /** Solo la imagen siguiente: los videos siguen sin descargarse hasta abrirlos. */
    preloadNext(index) {
      const img = this.slides[index]?.querySelector('img[loading="lazy"]');
      if (img) img.loading = 'eager';
    }

    start() {
      const fill = this.fills[this.index];
      if (this.video) {
        this.video.currentTime = 0;
      } else if (fill) {
        if (this.reducedMotion.matches) {
          fill.style.transform = 'scaleX(1)';
        } else {
          this.animation = fill.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], {
            duration: this.duration,
            easing: 'linear',
            fill: 'forwards',
          });
          const current = this.animation;
          current.finished.then(() => {
            if (current === this.animation) this.go(this.index + 1);
          }).catch(() => {});
        }
      }
      this.sync();
    }

    stop() {
      this.animation?.cancel();
      this.animation = null;
      if (this.video) {
        this.video.pause();
        this.video = null;
      }
    }

    /** Aplica el estado de pausa efectivo (botón, mantener presionado, pestaña oculta). */
    sync = () => {
      if (!this.dialog?.open || this.index < 0) return;
      const paused = this.userPaused || this.holding || document.hidden;
      this.pauseButton?.setAttribute('aria-pressed', String(this.userPaused));
      this.dialog.classList.toggle('is-holding', this.holding);
      if (this.video) {
        if (paused) {
          this.video.pause();
        } else {
          this.video.play().catch(() => {
            // Autoplay bloqueado (ahorro de datos, modo de bajo consumo): queda en pausa con ▶ visible.
            this.userPaused = true;
            this.pauseButton?.setAttribute('aria-pressed', 'true');
          });
        }
      }
      if (this.animation) {
        if (paused) this.animation.pause();
        else if (this.animation.playState === 'paused') this.animation.play();
      }
    };

    onKey = (event) => {
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        this.go(this.index + 1);
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        this.go(this.index - 1);
      }
    };

    onDialogClick = (event) => {
      // Clic en el fondo (fuera del escenario) = cerrar.
      if (event.target === this.dialog) {
        this.close();
        return;
      }
      // Un botón a un #ancla de esta página: se cierra el visor y luego se navega.
      const link = event.target.closest('a[data-df-cta]');
      const href = link?.getAttribute('href') || '';
      if (href.startsWith('#') && href.length > 1) {
        event.preventDefault();
        this.opener = null;
        this.close();
        const target = document.getElementById(decodeURIComponent(href.slice(1)));
        if (target) {
          target.scrollIntoView({ behavior: this.reducedMotion.matches ? 'auto' : 'smooth', block: 'start' });
          history.replaceState(null, '', href);
        } else {
          location.hash = href;
        }
      }
    };

    onPointerDown = (event) => {
      if (event.button !== 0 || event.target.closest('button, a')) return;
      this.pointer = { x: event.clientX, y: event.clientY };
      // Captura: el gesto termina aquí aunque el dedo salga del escenario.
      this.stage.setPointerCapture?.(event.pointerId);
      clearTimeout(this.holdTimer);
      this.holdTimer = setTimeout(() => {
        this.holding = true;
        this.sync();
      }, HOLD_MS);
    };

    onPointerUp = (event) => {
      if (!this.pointer) return;
      clearTimeout(this.holdTimer);
      const dx = event.clientX - this.pointer.x;
      const dy = event.clientY - this.pointer.y;
      const wasHolding = this.holding;
      this.pointer = null;
      this.holding = false;

      if (dy > SWIPE_PX && Math.abs(dy) > Math.abs(dx)) {
        this.close();
      } else if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy)) {
        this.go(this.index + (dx < 0 ? 1 : -1));
      } else if (wasHolding) {
        this.sync();
      } else {
        const rect = this.stage.getBoundingClientRect();
        this.go(this.index + (event.clientX - rect.left < rect.width / 3 ? -1 : 1));
      }
    };

    onPointerCancel = () => {
      clearTimeout(this.holdTimer);
      this.pointer = null;
      this.holding = false;
      this.sync();
    };

    onContextMenu = (event) => event.preventDefault();

    // Editor de temas: seleccionar un bloque «Historia» abre el visor en esa historia.
    onBlockSelect = (event) => {
      const item = event.target instanceof Element ? event.target.closest('[data-df-story]') : null;
      if (!item || !this.contains(item)) return;
      this.open(Number(item.dataset.dfStory), item.querySelector('[data-df-open]'));
    };

    onBlockDeselect = (event) => {
      if (event.target instanceof Element && this.contains(event.target)) this.close();
    };

    lockScroll() {
      if (this.scrollLocked) return;
      this.scrollLocked = true;
      this.previousOverflow = document.documentElement.style.overflow;
      document.documentElement.style.overflow = 'hidden';
    }

    unlockScroll() {
      if (!this.scrollLocked) return;
      this.scrollLocked = false;
      document.documentElement.style.overflow = this.previousOverflow || '';
    }
  }

  customElements.define('df-insta-story', DfInstaStory);
}
