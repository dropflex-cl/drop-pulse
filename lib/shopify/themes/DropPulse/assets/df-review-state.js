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
    const count = Number(data.summary?.count ?? 0);
    if (!/^\d+$/.test(data.product_id) || !Number.isSafeInteger(count) || count < 0) return;
    const key = `df:reviews:${data.product_id}`;
    const previous = read(key);
    const state = { version: 1, count, rating: data.summary?.rating ?? null, order: Array.isArray(previous?.order) ? previous.order.filter(id => typeof id === 'string') : [] };
    write(key, state);
    document.querySelectorAll('[data-df-review-count]').forEach(el => { el.textContent = format.format(count); });
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
