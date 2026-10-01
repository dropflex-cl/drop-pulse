// DropFlex · movimiento compartido de los componentes (docs/spec-movimiento-tienda.md §3).
//
// - Revelado al desplazar: todo [data-df-reveal] entra una sola vez (sube 12px y aparece; o
//   `fade`, `scale`, `left`, `right`). Lo que entra junto (una fila, una tanda) se escalona en el
//   orden del documento, 60ms cada uno y hasta 5; lo que entra solo no espera. Solo se oculta lo que, cuando corre
//   el script, está más abajo que la ventana: lo que ya se ve nunca parpadea y, sin JS, todo está a
//   la vista. Las secciones que Shopify inserta después se toman con un MutationObserver.
// - Fundido de imágenes: las <img loading="lazy"> dentro de .df que todavía no cargaron aparecen
//   con un fundido al cargar.
// - Contador de cifras: [data-df-count] (una cifra REAL ya escrita por el servidor, «4,6/5», «1.234»)
//   cuenta desde 0 hasta su valor una sola vez, al verse al 60 %. Va aria-hidden junto a una copia
//   oculta con el valor final; el ancho queda fijo para que nada salte. Nunca en precios.
// - dfMotion.ok(): se puede animar (sin prefers-reduced-motion ni <html data-df-motion="off">).
// - dfMotion.enter(elementos): la misma entrada, ya mismo (lo que se descubre con un botón).
// - dfMotion.flash(el): un destello del acento suave que confirma el destino de un ancla.
// - dfMotion.afterScroll(fn): fn cuando termina el desplazamiento suave (scrollend o un respaldo).
//
// Nada con prefers-reduced-motion ni con el ajuste «Animaciones de DropFlex» apagado. En el editor
// de temas no hay revelado: todo tiene que estar a la vista para editarlo. Sin dependencias; cada
// componente lo carga con `defer` y la primera copia es la que queda.

(() => {
  if (window.dfMotion) return;

  const root = document.documentElement;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const ok = () => !reduced.matches && root.dataset.dfMotion !== 'off';
  const inEditor = () => Boolean(window.Shopify?.designMode) || root.classList.contains('shopify-design-mode');

  const REVEAL_MS = 480;
  const STAGGER_MS = 60;
  const EASE_ENTER = 'cubic-bezier(0, 0, 0, 1)';
  const EASE_STANDARD = 'cubic-bezier(0.2, 0, 0, 1)';
  const FROM = {
    fade: {},
    scale: { scale: '0.98' },
    left: { translate: '-8px 0' },
    right: { translate: '8px 0' },
  };

  /** La entrada de [data-df-reveal], ya mismo y con Web Animations (no depende de las clases). */
  const enter = (elements) => {
    if (!ok()) return;
    Array.from(elements).forEach((el, i) => {
      const from = FROM[el.dataset.dfReveal] || { translate: '0 12px' };
      el.animate([{ opacity: 0, ...from }, { opacity: 1, translate: '0 0', scale: '1' }], {
        duration: REVEAL_MS,
        delay: Math.min(i, 5) * STAGGER_MS,
        easing: EASE_ENTER,
        fill: 'backwards',
      });
    });
  };

  const flash = (el) => {
    if (!el || !ok()) return;
    const soft = getComputedStyle(el).getPropertyValue('--df-accent-soft').trim() || 'rgba(31, 75, 216, 0.1)';
    el.animate(
      [
        { backgroundColor: soft, boxShadow: `0 0 0 8px ${soft}` },
        { backgroundColor: 'transparent', boxShadow: '0 0 0 8px transparent' },
      ],
      { duration: 900, easing: EASE_STANDARD },
    );
  };

  const afterScroll = (fn) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.removeEventListener('scrollend', finish);
      fn();
    };
    window.addEventListener('scrollend', finish, { once: true });
    // Sin scrollend, o si no hubo desplazamiento (ya estaba ahí): un respaldo.
    setTimeout(finish, 'onscrollend' in window ? 1200 : 650);
  };

  window.dfMotion = { ok, enter, flash, afterScroll };

  if (!ok() || !('IntersectionObserver' in window)) return;

  // ---------- Revelado al desplazar ----------

  const show = (el, order) => {
    el.style.setProperty('--df-i', String(order));
    el.classList.add('df-reveal-run');
    el.classList.remove('df-reveal-pending');
    setTimeout(() => el.classList.remove('df-reveal-run'), REVEAL_MS + order * STAGGER_MS + 100);
  };

  const before = (a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);

  const revealer = new IntersectionObserver(
    (entries) => {
      const entering = entries.filter((entry) => entry.isIntersecting).map((entry) => entry.target);
      entering.sort(before).forEach((el, i) => {
        revealer.unobserve(el);
        show(el, Math.min(i, 5));
      });
    },
    { rootMargin: '0px 0px -10% 0px' },
  );

  const prepare = (elements) => {
    if (inEditor()) return;
    // Primero se leen todas las posiciones y después se escribe: un solo cálculo de diseño.
    const below = elements.filter((el) => {
      if (el.dfRevealSeen) return false;
      el.dfRevealSeen = true;
      const box = el.getBoundingClientRect();
      // Oculto (display: none) mide 0: no se toca. Se revela solo lo que está bajo la ventana.
      return (box.width || box.height) && box.top >= window.innerHeight;
    });
    for (const el of below) {
      el.classList.add('df-reveal-pending');
      revealer.observe(el);
    }
  };

  // ---------- Fundido de imágenes ----------

  const fadeImage = (img) => {
    if (img.dfFadeSeen) return;
    img.dfFadeSeen = true;
    if (img.complete) return;
    img.classList.add('df-img-loading');
    const done = () => {
      img.classList.add('df-img-fading');
      img.classList.remove('df-img-loading');
      setTimeout(() => img.classList.remove('df-img-fading'), 400);
    };
    img.addEventListener('load', done, { once: true });
    img.addEventListener('error', done, { once: true });
  };

  // ---------- Contador de cifras ----------

  /** «4,6/5» → { before: '', value: 4.6, decimals: 1, grouped: false, after: '/5' } (formato es-CL). */
  const parseCount = (text) => {
    const m = text.match(/(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d+))?/);
    if (!m) return null;
    return {
      before: text.slice(0, m.index),
      after: text.slice(m.index + m[0].length),
      value: Number(m[1].replaceAll('.', '') + (m[2] ? `.${m[2]}` : '')),
      decimals: m[2]?.length || 0,
      grouped: m[1].includes('.'),
    };
  };

  const formatCount = (n, c) => {
    const [int, dec] = n.toFixed(c.decimals).split('.');
    const grouped = c.grouped ? int.replace(/\B(?=(\d{3})+(?!\d))/g, '.') : int;
    return `${c.before}${grouped}${dec ? `,${dec}` : ''}${c.after}`;
  };

  const count = (el) => {
    const final = el.textContent;
    const c = parseCount(final);
    if (!c || !c.value) return;
    el.style.display = 'inline-block';
    el.style.minWidth = `${el.getBoundingClientRect().width}px`;
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / 900);
      const eased = 1 - (1 - t) ** 3;
      el.textContent = t < 1 ? formatCount(c.value * eased, c) : final;
      if (t < 1) requestAnimationFrame(step);
    };
    el.textContent = formatCount(0, c);
    requestAnimationFrame(step);
  };

  const counter = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        counter.unobserve(entry.target);
        count(entry.target);
      }
    },
    { threshold: 0.6 },
  );

  const REVEAL = '[data-df-reveal]';
  const LAZY = '.df img[loading="lazy"]';
  const COUNT = '[data-df-count]';

  const scan = (node) => {
    const reveal = [];
    if (node.matches?.(REVEAL)) reveal.push(node);
    if (node.querySelectorAll) reveal.push(...node.querySelectorAll(REVEAL));
    if (reveal.length) prepare(reveal);
    if (node.matches?.(LAZY)) fadeImage(node);
    node.querySelectorAll?.(LAZY).forEach(fadeImage);
    if (inEditor()) return;
    for (const el of [...(node.matches?.(COUNT) ? [node] : []), ...(node.querySelectorAll?.(COUNT) ?? [])]) {
      if (el.dfCountSeen) continue;
      el.dfCountSeen = true;
      counter.observe(el);
    }
  };

  scan(document);
  new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) if (node.nodeType === 1) scan(node);
    }
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
