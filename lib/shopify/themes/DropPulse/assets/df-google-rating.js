(() => {
  if (window.DropFlexGoogleRating) return;
  const memory = new Map();
  const valid = value => Number.isInteger(value) && value >= 44 && value <= 50;
  const scoreFor = id => {
    const key = `df:google-rating:${id}`;
    let score;
    try { score = JSON.parse(localStorage.getItem(key)); } catch {}
    if (!valid(score)) {
      score = memory.get(key);
      if (!valid(score)) score = 44 + Math.floor(Math.random() * 7);
      try { localStorage.setItem(key, JSON.stringify(score)); } catch {}
    }
    memory.set(key, score);
    return score;
  };
  const sync = () => {
    for (const badge of document.querySelectorAll('[data-df-google-rating]')) {
      const id = badge.dataset.productId;
      if (!/^\d+$/.test(id || '')) continue;
      const score = scoreFor(id);
      const label = (score / 10).toFixed(1).replace('.', ',');
      badge.querySelectorAll('[data-df-google-score]').forEach(el => { el.textContent = label; });
      const stars = badge.querySelector('.df-stars');
      stars?.style.setProperty('--df-stars-fill', `${score * 2}%`);
      const accessible = stars?.querySelector('.df-visually-hidden');
      if (accessible) accessible.textContent = `${label} de 5 estrellas`;
    }
  };
  window.DropFlexGoogleRating = { sync };
  document.addEventListener('DOMContentLoaded', sync);
  document.addEventListener('shopify:section:load', sync);
  document.addEventListener('df:landing-selected', sync);
  document.addEventListener('df:experience-selected', sync);
  window.addEventListener('popstate', sync);
  window.addEventListener('storage', event => {
    if (event.key === null || event.key?.startsWith('df:google-rating:')) sync();
  });
  if (document.readyState !== 'loading') sync();
})();
