// DropFlex · <df-ugc-slider>: pista de videos + reproductor.
//
// La pista es el <df-slider> compartido (scroll-snap); aquí va lo propio del video:
//   · Paginación en barra (scrollLeft / recorrido) y ocultar controles si todo cabe.
//   · Vista previa opcional: crea un <video muted> solo en las tarjetas visibles (≥ 50 %), lo
//     pausa al salir; nunca con prefers-reduced-motion ni con ahorro de datos.
//   · Reproductor: UN solo <video> en un <dialog>. «Pantalla completa» = showModal() (el resto
//     de la página queda inerte: foco atrapado, Esc cierra). «Flotante» = show() en la esquina,
//     sin bloquear la página; se mueve a <body> mientras está abierto para escapar de los
//     contextos de apilamiento del tema. «Automático» = pantalla completa bajo 750 px.
//   · Sonido: el toque que abre el video es la acción del comprador, así que arranca con sonido;
//     si el navegador lo rechaza, sigue en silencio y el botón de sonido lo activa.
//   · Navegación: botones, flechas del teclado y deslizar (horizontal en pantalla completa,
//     vertical en flotante, como las historias y los reels). Pausa con la pestaña oculta.

if (!customElements.get('df-ugc-slider')) {
  const mobile = window.matchMedia('(max-width: 749px)');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const SWIPE = 40;

  class DfUgcSlider extends HTMLElement {
    connectedCallback() {
      this.cards = Array.from(this.querySelectorAll('[data-df-ugc-card]'));
      this.track = this.querySelector('[data-df-track]');
      this.bar = this.querySelector('[data-df-ugc-bar]');
      this.dialog = this.querySelector('[data-df-ugc-dialog]');
      if (!this.dialog || !this.cards.length) return;

      this.video = this.dialog.querySelector('[data-df-ugc-video]');
      this.stage = this.dialog.querySelector('[data-df-ugc-stage]');
      this.captionEl = this.dialog.querySelector('[data-df-ugc-caption]');
      this.counterEl = this.dialog.querySelector('[data-df-ugc-counter]');
      this.progressEl = this.dialog.querySelector('[data-df-ugc-progress]');
      this.soundButton = this.dialog.querySelector('[data-df-ugc-sound]');
      this.toggleButton = this.dialog.querySelector('[data-df-ugc-toggle]');
      this.closeButton = this.dialog.querySelector('[data-df-ugc-close]');
      this.index = 0;
      this.muted = false;

      this.cards.forEach((card, i) => card.addEventListener('click', () => this.open(i, card)));
      this.closeButton?.addEventListener('click', this.close);
      this.dialog.querySelector('[data-df-ugc-prev]')?.addEventListener('click', () => this.show(this.index - 1));
      this.dialog.querySelector('[data-df-ugc-next]')?.addEventListener('click', () => this.show(this.index + 1));
      this.soundButton?.addEventListener('click', () => this.setMuted(!this.muted));
      this.toggleButton?.addEventListener('click', this.togglePlay);

      this.dialog.addEventListener('close', this.onClose);
      this.dialog.addEventListener('click', this.onBackdrop);
      this.dialog.addEventListener('keydown', this.onKey);
      this.stage?.addEventListener('pointerdown', this.onPointerDown);
      this.stage?.addEventListener('pointerup', this.onPointerUp);
      this.video.addEventListener('timeupdate', this.onTime);
      this.video.addEventListener('play', this.syncToggle);
      this.video.addEventListener('pause', this.syncToggle);
      document.addEventListener('visibilitychange', this.onVisibility);

      this.track?.addEventListener('scroll', this.onScroll, { passive: true });
      this.resizeObserver = new ResizeObserver(this.onScroll);
      if (this.track) this.resizeObserver.observe(this.track);
      this.onScroll();

      const saveData = navigator.connection?.saveData === true;
      if (this.dataset.previewMotion === 'true' && !reducedMotion.matches && !saveData) {
        this.previewObserver = new IntersectionObserver(this.onPreview, { threshold: 0.5 });
        this.cards.forEach((card) => this.previewObserver.observe(card));
      }
    }

    disconnectedCallback() {
      this.resizeObserver?.disconnect();
      this.previewObserver?.disconnect();
      document.removeEventListener('visibilitychange', this.onVisibility);
      // En el editor el bloque se vuelve a dibujar: el reproductor flotante no queda huérfano.
      if (this.dialog && this.dialog.parentElement === document.body) {
        this.video?.pause();
        this.dialog.remove();
      }
    }

    // ── Pista ────────────────────────────────────────────────────────────────────────────

    onScroll = () => {
      if (!this.track) return;
      const range = this.track.scrollWidth - this.track.clientWidth;
      this.toggleAttribute('data-fits', range <= 1);
      if (!this.bar) return;
      const thumb = Math.min(1, this.track.clientWidth / Math.max(1, this.track.scrollWidth));
      const ratio = range > 1 ? Math.min(1, Math.max(0, this.track.scrollLeft / range)) : 0;
      this.bar.style.setProperty('--df-ugc-thumb', thumb.toFixed(3));
      this.bar.style.setProperty('--df-ugc-scroll', ratio.toFixed(3));
    };

    onPreview = (entries) => {
      for (const { target: card, isIntersecting } of entries) {
        let preview = card.querySelector('video');
        if (isIntersecting) {
          if (!preview) {
            if (!card.dataset.preview) continue;
            preview = document.createElement('video');
            Object.assign(preview, { muted: true, loop: true, playsInline: true, preload: 'none' });
            preview.setAttribute('aria-hidden', 'true');
            preview.setAttribute('tabindex', '-1');
            if (card.dataset.poster) preview.poster = card.dataset.poster;
            preview.src = card.dataset.preview;
            card.querySelector('[data-df-ugc-media]')?.append(preview);
          }
          preview.play().then(() => card.classList.add('is-previewing')).catch(() => {});
        } else if (preview) {
          preview.pause();
          card.classList.remove('is-previewing');
        }
      }
    };

    pausePreviews() {
      for (const preview of this.querySelectorAll('[data-df-ugc-media] video')) preview.pause();
    }

    // ── Reproductor ──────────────────────────────────────────────────────────────────────

    get floating() {
      const mode = this.dataset.player;
      return mode === 'floating' || (mode === 'auto' && !mobile.matches);
    }

    open(index, trigger) {
      this.trigger = trigger;
      this.muted = false; // abrir es un toque del comprador: se intenta con sonido
      this.pausePreviews();
      // Ya abierto (flotante, con la página activa): solo cambia de video.
      if (this.dialog.open) {
        this.show(index);
        return;
      }

      const floating = this.floating;
      this.dialog.classList.toggle('is-floating', floating);
      if (floating) {
        if (this.dialog.parentElement !== document.body) document.body.append(this.dialog);
        this.dialog.show();
      } else {
        this.dialog.showModal();
      }
      this.show(index);
      this.closeButton?.focus({ preventScroll: true });
    }

    show(index) {
      const total = this.cards.length;
      this.index = ((index % total) + total) % total;
      const card = this.cards[this.index];

      this.video.pause();
      this.video.poster = card.dataset.poster || '';
      this.video.src = card.dataset.src;
      this.video.setAttribute('aria-label', card.dataset.label || '');
      this.video.muted = this.muted;
      if (this.captionEl) this.captionEl.textContent = card.dataset.caption || '';
      if (this.counterEl) this.counterEl.textContent = `Video ${this.index + 1} de ${total}`;
      this.progressEl?.style.setProperty('--df-ugc-progress', '0');
      this.syncSound();

      this.video.play().catch((error) => {
        // Sin permiso para sonido: sigue en silencio. (AbortError = se cambió de video, se ignora.)
        if (error?.name !== 'NotAllowedError') return;
        this.muted = true;
        this.video.muted = true;
        this.syncSound();
        this.video.play().catch(() => {});
      });
    }

    close = () => {
      if (this.dialog.open) this.dialog.close();
    };

    onClose = () => {
      this.video.pause();
      this.video.removeAttribute('src');
      this.video.load(); // corta la descarga
      if (this.dialog.parentElement !== this) this.append(this.dialog);
      this.trigger?.focus({ preventScroll: true });
    };

    onBackdrop = (event) => {
      // En pantalla completa, un clic fuera del video (en el ::backdrop) cierra.
      if (event.target === this.dialog && !this.dialog.classList.contains('is-floating')) this.close();
    };

    onKey = (event) => {
      const floating = this.dialog.classList.contains('is-floating');
      switch (event.key) {
        case 'Escape':
          // showModal() ya cierra con Esc; el flotante (show()) no, así que se hace aquí.
          if (floating) {
            event.preventDefault();
            this.close();
          }
          break;
        case 'ArrowRight':
        case 'ArrowDown':
          event.preventDefault();
          this.show(this.index + 1);
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
          event.preventDefault();
          this.show(this.index - 1);
          break;
      }
    };

    onPointerDown = (event) => {
      if (event.target.closest('button')) return;
      this.start = { x: event.clientX, y: event.clientY };
    };

    onPointerUp = (event) => {
      if (!this.start || event.target.closest('button')) return;
      const dx = event.clientX - this.start.x;
      const dy = event.clientY - this.start.y;
      this.start = null;
      const vertical = this.dialog.classList.contains('is-floating');
      const delta = vertical ? dy : dx;
      if (Math.abs(delta) >= SWIPE && Math.abs(delta) > Math.abs(vertical ? dx : dy)) {
        this.show(this.index + (delta < 0 ? 1 : -1));
      } else if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
        this.togglePlay(); // toque simple sobre el video
      }
    };

    togglePlay = () => {
      if (this.video.paused) this.video.play().catch(() => {});
      else this.video.pause();
    };

    setMuted(muted) {
      this.muted = muted;
      this.video.muted = muted;
      this.syncSound();
      if (!muted && this.video.paused) this.video.play().catch(() => {});
    }

    syncSound() {
      if (!this.soundButton) return;
      // Botón de alternancia: etiqueta fija («Silenciar») y el estado en aria-pressed.
      this.soundButton.setAttribute('aria-pressed', String(this.muted));
    }

    syncToggle = () => {
      if (!this.toggleButton) return;
      this.toggleButton.setAttribute('aria-pressed', String(this.video.paused));
    };

    onTime = () => {
      if (!this.progressEl || !this.video.duration) return;
      this.progressEl.style.setProperty('--df-ugc-progress', (this.video.currentTime / this.video.duration).toFixed(3));
    };

    onVisibility = () => {
      if (document.hidden) {
        this.video?.pause();
        this.pausePreviews();
      }
    };
  }

  customElements.define('df-ugc-slider', DfUgcSlider);
}
