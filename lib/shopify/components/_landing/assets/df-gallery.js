/*
 * DropFlex · galería de la ficha: fundido entre fotos y avance automático.
 *
 * El slideshow del tema (assets/slideshow.js) cambia de foto deslizando. Aquí:
 * - Avance automático cada `data-speed` segundos. Se detiene mientras la persona usa la galería
 *   (toque, arrastre, teclado, mouse encima) y vuelve pasados IDLE_MS sin tocarla; también fuera
 *   de pantalla, con la pestaña oculta, con un diálogo abierto (zoom, EasySell) o con un video
 *   sonando.
 * - Fundido: el avance automático, las miniaturas y las flechas saltan a la foto nueva sin
 *   deslizar y la anterior se desvanece encima (una copia de su <img> que se borra al terminar).
 *   Deslizar con el dedo sigue siendo un deslizamiento.
 * - Con prefers-reduced-motion no hay avance automático ni fundido: queda el tema tal cual.
 *
 * Usa solo la API pública del slideshow (select, current, slides, nextIndex, refs). Si falta
 * algo, no hace nada y la galería queda como la del tema.
 */
(() => {
  const script = document.currentScript;
  const SPEED_MS = Math.max(2, Number(script?.dataset.speed) || 4) * 1000;
  const AUTOPLAY = script?.dataset.autoplay !== 'false';
  const FADE_MS = 450;
  const IDLE_MS = 8000;
  const SELECTOR = '.product-information media-gallery slideshow-component[ref="slideshow"]';

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  let busy = false;
  let lastInteraction = 0;
  let lastAdvance = performance.now();
  let hovering = false;
  let inView = true;

  /** El slideshow se busca cada vez: el tema lo reemplaza al cambiar de variante. */
  const findSlideshow = () => {
    const el = document.querySelector(SELECTOR);
    if (!el || typeof el.select !== 'function' || el.disabled) return null;
    if (!el.slides || el.slides.length < 2 || el.offsetParent === null) return null;
    return el;
  };

  const imgOf = (slide) => slide?.querySelector('img');

  const whenReady = (img) => {
    if (!img) return Promise.resolve();
    img.loading = 'eager';
    const ready = img.complete && img.naturalWidth ? Promise.resolve() : img.decode().catch(() => {});
    return Promise.race([ready, new Promise((r) => setTimeout(r, 1500))]);
  };

  /** Una copia de la foto actual, fija encima, que se desvanece mientras la nueva queda debajo. */
  const coverWithCurrent = (slideshow) => {
    const img = imgOf(slideshow.slides[slideshow.current]);
    const host = slideshow.refs?.slideshowContainer;
    if (!img || !host || !img.currentSrc) return null;

    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';

    const box = img.getBoundingClientRect();
    const hostBox = host.getBoundingClientRect();
    const cs = getComputedStyle(img);
    const ghost = document.createElement('img');
    ghost.src = img.currentSrc;
    ghost.alt = '';
    ghost.setAttribute('aria-hidden', 'true');
    ghost.setAttribute('data-df-gallery-ghost', '');
    Object.assign(ghost.style, {
      position: 'absolute',
      left: `${box.left - hostBox.left}px`,
      top: `${box.top - hostBox.top}px`,
      width: `${box.width}px`,
      height: `${box.height}px`,
      objectFit: cs.objectFit,
      objectPosition: cs.objectPosition,
      borderRadius: cs.borderRadius,
      pointerEvents: 'none',
      zIndex: '2',
      opacity: '1',
      transition: `opacity ${FADE_MS}ms ease`,
    });
    host.append(ghost);
    return ghost;
  };

  /** La miniatura elegida a la vista, deslizando solo la tira (nunca la página). */
  const revealThumbnail = (slideshow, index) => {
    const thumb = slideshow.refs?.thumbnails?.[index];
    const strip = slideshow.refs?.thumbnailsContainer;
    if (!thumb || !strip) return;
    const left = thumb.offsetLeft - (strip.clientWidth - thumb.offsetWidth) / 2;
    strip.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
  };

  const fadeTo = async (slideshow, requested, event) => {
    if (busy) return;
    const { slides } = slideshow;
    const last = slides.length - 1;
    const index = requested < 0 ? last : requested > last ? 0 : requested;
    if (index === slideshow.current) return;

    busy = true;
    try {
      await whenReady(imgOf(slides[index]));
      const ghost = coverWithCurrent(slideshow);
      await slideshow.select(index, event, { animate: false });
      revealThumbnail(slideshow, index);
      if (ghost) {
        requestAnimationFrame(() => requestAnimationFrame(() => (ghost.style.opacity = '0')));
        setTimeout(() => ghost.remove(), FADE_MS + 80);
      }
    } finally {
      setTimeout(() => (busy = false), FADE_MS);
    }
  };

  const markInteraction = () => (lastInteraction = performance.now());

  // Miniaturas y flechas: fundido en lugar de deslizar. El tema resuelve on:click en captura sobre
  // document; este clic se toma antes, en captura sobre window, y no le llega.
  window.addEventListener(
    'click',
    (event) => {
      const button = event.target instanceof Element ? event.target.closest('button[on\\:click]') : null;
      if (!button) return;
      const slideshow = button.closest(SELECTOR) && findSlideshow();
      if (!slideshow || !slideshow.contains(button)) return;

      const action = button.getAttribute('on:click') || '';
      const match = action.match(/^\/(select|next|previous)(?:\/(\d+))?$/);
      if (!match) return;

      const [, kind, n] = match;
      const target =
        kind === 'select' ? Number(n) : kind === 'next' ? slideshow.nextIndex : slideshow.previousIndex;

      event.stopPropagation();
      event.preventDefault();
      markInteraction();
      fadeTo(slideshow, target, event);
    },
    true
  );

  if (!AUTOPLAY) return;

  for (const type of ['pointerdown', 'keydown', 'focusin', 'wheel']) {
    document.addEventListener(
      type,
      (event) => {
        if (event.target instanceof Element && event.target.closest('.product-information media-gallery')) {
          markInteraction();
        }
      },
      { capture: true, passive: true }
    );
  }

  document.addEventListener('pointerover', (event) => {
    if (event.pointerType !== 'mouse') return;
    hovering = event.target instanceof Element && Boolean(event.target.closest(SELECTOR));
  });

  let observed = null;
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) inView = entry.isIntersecting;
  });

  const blocked = (slideshow) => {
    if (document.hidden || hovering || !inView || busy) return true;
    if (slideshow.hasAttribute('dragging')) return true;
    if (document.querySelector('dialog[open]')) return true;
    const current = slideshow.slides[slideshow.current];
    return [...(current?.querySelectorAll('video') ?? [])].some((v) => !v.paused);
  };

  setInterval(() => {
    const slideshow = findSlideshow();
    if (!slideshow) return;

    if (observed !== slideshow) {
      if (observed) observer.unobserve(observed);
      observer.observe(slideshow);
      observed = slideshow;
    }

    const now = performance.now();
    if (now - lastInteraction < IDLE_MS || now - lastAdvance < SPEED_MS) return;
    if (blocked(slideshow)) return;

    lastAdvance = now;
    fadeTo(slideshow, slideshow.current + 1);
  }, 250);
})();
