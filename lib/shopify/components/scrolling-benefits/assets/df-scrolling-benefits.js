// DropFlex · <df-scrolling-benefits>: cinta infinita a velocidad constante.
//
// Liquid dibuja un set de ítems y una copia (aria-hidden + inert); el CSS anima la pista hasta
// −50 % con una duración estimada, así que sin JS ya se mueve. Esto solo lo afina:
//   1. mide el ancho real de un set y clona los que falten para cubrir la pantalla sin huecos;
//   2. fija --df-marquee-shift (un set, en px) y --df-marquee-duration = ancho / velocidad, para
//      que la velocidad en px/s sea la misma con textos cortos o largos;
//   3. pausa: botón visible (WCAG 2.2.2), fuera de pantalla, pestaña oculta y bloque elegido en el
//      editor. El puntero encima y el foco dentro pausan por CSS.
// Con prefers-reduced-motion no clona: el CSS deja una fila quieta y oculta las copias.

if (!customElements.get('df-scrolling-benefits')) {
  class DfScrollingBenefits extends HTMLElement {
    connectedCallback() {
      if (this.hasAttribute('data-static')) return;
      this.track = this.querySelector('[data-df-track]');
      this.set = this.querySelector('[data-df-set]');
      this.button = this.querySelector('[data-df-pause]');
      if (!this.track || !this.set) return;
      this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

      this.button?.addEventListener('click', this.onToggle);
      document.addEventListener('visibilitychange', this.onVisibility);
      document.addEventListener('shopify:block:select', this.onBlockSelect);
      document.addEventListener('shopify:block:deselect', this.onBlockDeselect);

      this.observer = new IntersectionObserver(([entry]) => {
        this.toggleAttribute('data-offscreen', !entry.isIntersecting);
      });
      this.observer.observe(this);

      this.resizer = new ResizeObserver(() => {
        clearTimeout(this.resizeTimer);
        this.resizeTimer = setTimeout(this.measure, 150);
      });
      this.resizer.observe(this);
      this.measure();
    }

    disconnectedCallback() {
      clearTimeout(this.resizeTimer);
      this.observer?.disconnect();
      this.resizer?.disconnect();
      document.removeEventListener('visibilitychange', this.onVisibility);
      document.removeEventListener('shopify:block:select', this.onBlockSelect);
      document.removeEventListener('shopify:block:deselect', this.onBlockDeselect);
    }

    measure = () => {
      if (this.reducedMotion.matches) return;
      // El set incluye su separación final (padding), así un set = un paso exacto del loop.
      const width = this.set.getBoundingClientRect().width;
      if (!width) return;
      const viewport = this.track.parentElement?.clientWidth || window.innerWidth;
      const needed = Math.ceil(viewport / width) + 1;
      let copies = this.track.children.length;
      while (copies < needed) {
        const clone = this.set.cloneNode(true);
        clone.removeAttribute('data-df-set');
        clone.setAttribute('aria-hidden', 'true');
        clone.inert = true;
        clone.querySelectorAll('[data-shopify-editor-block]').forEach((el) => el.removeAttribute('data-shopify-editor-block'));
        this.track.append(clone);
        copies += 1;
      }
      const speed = Number(this.dataset.speed) || 50;
      this.style.setProperty('--df-marquee-shift', `-${width}px`);
      this.style.setProperty('--df-marquee-duration', `${(width / speed).toFixed(2)}s`);
    };

    setPaused(paused) {
      this.toggleAttribute('data-paused', paused);
      this.button?.setAttribute('aria-pressed', String(paused));
    }

    onToggle = () => this.setPaused(!this.hasAttribute('data-paused'));

    onVisibility = () => this.toggleAttribute('data-tab-hidden', document.hidden);

    onBlockSelect = (event) => {
      if (!this.contains(event.target)) return;
      this.pausedByEditor = !this.hasAttribute('data-paused');
      this.setPaused(true);
    };

    onBlockDeselect = (event) => {
      if (!this.contains(event.target) || !this.pausedByEditor) return;
      this.pausedByEditor = false;
      this.setPaused(false);
    };
  }

  customElements.define('df-scrolling-benefits', DfScrollingBenefits);
}
