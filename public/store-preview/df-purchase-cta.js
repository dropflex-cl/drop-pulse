// Un efecto de compra compartido por Shopify y React. Dos pasadas y se detiene; nunca altera el clic.
(() => {
  if (window.dfPurchaseCtaMounted) return;
  window.dfPurchaseCtaMounted = true;
  const disabled = document.querySelector('script[data-df-cta-motion="off"]');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const canAnimate = () => !disabled && !reduced.matches && document.documentElement.dataset.dfMotion !== 'off' && !window.Shopify?.designMode;
  const states = new Map();
  const stop = (state) => {
    state.timers.forEach(clearTimeout);
    state.timers = [];
    state.button.removeAttribute('data-df-es-shine');
  };
  const play = (state) => {
    if (state.played || !canAnimate() || document.visibilityState === 'hidden' || !state.visible || state.button.matches(':hover, :focus-within')) return;
    state.played = true;
    const style = getComputedStyle(state.button);
    const raw = style.getPropertyValue('--df-cta-reveal').trim();
    const reveal = parseFloat(raw) * (raw.endsWith('ms') ? 1 : 1000);
    if (!Number.isFinite(reveal) || reveal <= 0) return;
    for (const delay of [reveal, reveal * 5]) {
      state.timers.push(setTimeout(() => {
        if (!canAnimate() || !state.visible || document.visibilityState === 'hidden') return;
        state.button.setAttribute('data-df-es-shine', '');
        state.timers.push(setTimeout(() => state.button.removeAttribute('data-df-es-shine'), reveal * 2));
      }, delay));
    }
  };
  const observer = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
    entries.forEach(entry => {
      const state = states.get(entry.target);
      if (!state) return;
      state.visible = entry.isIntersecting && entry.intersectionRatio >= 0.6;
      if (state.visible) play(state); else stop(state);
    });
  }, { threshold: [0, 0.6] }) : null;
  const scan = () => {
    for (const [button, state] of states) if (!button.isConnected) { stop(state); observer?.unobserve(button); states.delete(button); }
    document.querySelectorAll('#es-popup-button, [data-df-purchase-cta]').forEach(button => {
      if (states.has(button)) return;
      const state = { button, timers: [], visible: false, played: false };
      states.set(button, state);
      button.setAttribute('data-df-es-motion', '');
      button.addEventListener('pointerenter', () => stop(state));
      button.addEventListener('focusin', () => stop(state));
      button.addEventListener('pointerleave', () => play(state));
      button.addEventListener('focusout', () => play(state));
      observer?.observe(button);
    });
  };
  const update = () => states.forEach(state => { if (canAnimate() && document.visibilityState !== 'hidden') play(state); else stop(state); });
  reduced.addEventListener('change', update);
  document.addEventListener('visibilitychange', update);
  new MutationObserver(update).observe(document.documentElement, { attributes: true, attributeFilter: ['data-df-motion'] });
  new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true });
  scan();
})();
