(() => {
  if (window.DropFlexReviews) return;
  const memory = new Map();
  const format = new Intl.NumberFormat('es-CL');
  const read = (key) => {
    try { return JSON.parse(localStorage.getItem(key)); } catch { return memory.get(key); }
  };
  const write = (key, value) => {
    memory.set(key, value);
    try {
      const serialized = JSON.stringify(value);
      if (localStorage.getItem(key) !== serialized) localStorage.setItem(key, serialized);
    } catch { /* Navegación privada. */ }
  };
  const sync = () => {
    for (const [id, selector] of [['review-slider', '[data-df-purchase-reviews]'], ['inventory', '[data-df-purchase-inventory]']]) {
      const slot = document.querySelector(selector);
      const existing = document.querySelector(`[data-df-pdp-component="${id}"]`);
      if (slot && existing && !slot.contains(existing)) slot.replaceChildren(existing);
    }
    const source = document.querySelector('[data-df-review-state]');
    if (!source) return;
    let data;
    try { data = JSON.parse(source.textContent); } catch { return; }
    const selection = window.DropFlexLanding?.selection?.() ?? {};
    const variants = data.summary?.variants ?? [];
    const binding = window.DropFlexPdp?.current?.sections.find(s => s.component === 'review-stars');
    const summary = (binding ? variants.find(v => v.key === binding.content_variant_key) : null)
      ?? (selection.angle && selection.hook ? variants.find(v => v.angle_id === selection.angle && v.hook_id === selection.hook) : null)
      ?? (selection.angle ? variants.find(v => v.angle_id === selection.angle && !v.hook_id) : null)
      ?? data.summary;
    const count = Number(summary?.count ?? 0);
    const rawRating = Number(summary?.rating ?? 0);
    if (!/^\d+$/.test(data.product_id) || !Number.isSafeInteger(count) || count < 0 || !Number.isFinite(rawRating)) return;
    const rating = summary?.rating == null ? 0 : Math.round(Math.min(4.9, Math.max(4.4, rawRating)) * 10) / 10;
    const key = `df:reviews:${data.product_id}`;
    const previous = read(key);
    const state = { version: 1, count, rating: summary?.rating == null ? null : rating, order: Array.isArray(previous?.order) ? previous.order.filter(id => typeof id === 'string') : [] };
    write(key, state);
    document.querySelectorAll('[data-df-review-count]').forEach(el => { el.textContent = format.format(count); });
    const scoreText = new Intl.NumberFormat('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(rating);
    for (const el of document.querySelectorAll('[data-df-rating-template]')) {
      const text = el.dataset.dfRatingTemplate.replaceAll('{rating}', scoreText).replaceAll('{count}', format.format(count));
      if (el.dataset.dfRatingHighlight) {
        el.replaceChildren(...text.split('**').map((part, i) => {
          if (i % 2 === 0) return document.createTextNode(part);
          const strong = document.createElement('strong'); strong.className = el.dataset.dfRatingHighlight; strong.textContent = part;
          return strong;
        }));
      } else if (el.textContent !== text) el.textContent = text;
    }
    for (const group of document.querySelectorAll('[data-df-rating-group]')) {
      group.hidden = rating <= 0 && !group.hasAttribute('data-df-rating-optional');
      const row = group.querySelector('.df-review-stars__row');
      if (row && rating > 0) row.setAttribute('aria-label', `Calificación ${scoreText} de 5, basada en ${format.format(count)} reseñas${row.hasAttribute('href') ? '. Ir a las reseñas' : ''}`);
    }
    for (const group of document.querySelectorAll('[data-df-rating-stars]')) {
      for (const stars of group.querySelectorAll('.df-stars')) {
        stars.style.setProperty('--df-stars-fill', `${rating * 20}%`);
        const label = stars.querySelector('.df-visually-hidden');
        if (label) label.textContent = `${scoreText} de 5 estrellas`;
      }
    }
    for (const track of document.querySelectorAll('[data-df-review-order]')) {
      const slides = [...track.children];
      const ids = slides.map(el => el.dataset.reviewId);
      const order = [...new Set(state.order)].filter(id => ids.includes(id));
      const added = ids.filter(id => !order.includes(id));
      for (let i = added.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [added[i], added[j]] = [added[j], added[i]];
      }
      order.push(...added);
      const changed = order.some((id, index) => id !== ids[index]);
      if (changed) for (const id of order) {
          const slide = slides.find(el => el.dataset.reviewId === id);
          if (slide) track.append(slide);
        }
      const slider = track.closest('df-slider');
      if (changed && slider?.slides) {
        slider.slides = [...track.children];
        slider.buildDots();
        slider.index = 0;
        slider.update();
      }
      state.order = order;
      write(key, state);
    }
  };
  window.DropFlexReviews = { sync };
  document.addEventListener('DOMContentLoaded', sync);
  document.addEventListener('shopify:section:load', sync);
  document.addEventListener('df:landing-selected', sync);
  document.addEventListener('df:experience-selected', sync);
  window.addEventListener('storage', event => { if (event.key?.startsWith('df:reviews:')) sync(); });
  window.addEventListener('popstate', sync);
  if (document.readyState !== 'loading') sync();
})();
