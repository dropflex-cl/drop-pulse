/* EasySell bundles: solo presentación y teclado. Los precios, productos, selección,
   descuentos, píxeles y pedido siguen en EasySell; nunca se escribe en su store. */
(function () {
  var ROOT = '#easysell .es-b-preview-stack, #easysell-embedded-bundles .es-b-preview-stack';
  var CARD = '.es-b-standard-row, .es-b-card';
  var formatter = new Intl.NumberFormat('es-CL');
  var scheduled = false;

  function attr(node, key, value) {
    if (value === null) {
      if (node.hasAttribute(key)) node.removeAttribute(key);
    } else if (node.getAttribute(key) !== value) node.setAttribute(key, value);
  }

  /* Solo montos enteros inequívocos de la moneda visible. Otra notación conserva la vista
     de EasySell sin inferir decimales o moneda. El ahorro compara los DOS precios del pack,
     nunca los precios individuales ni el descuento que cobra el resumen del formulario. */
  function amount(node) {
    if (!node) return null;
    var match = node.textContent.trim().match(/^([^\d]*)(\d{1,3}(?:\.\d{3})+|\d+)([^\d.,]*)$/);
    if (!match || /[−-]/.test(match[1])) return null;
    var value = Number(match[2].replace(/\./g, ''));
    return Number.isSafeInteger(value) ? { value: value, prefix: match[1], suffix: match[3] } : null;
  }

  function sync() {
    scheduled = false;
    document.querySelectorAll(ROOT).forEach(function (group) {
      attr(group, 'role', 'radiogroup');
      attr(group, 'aria-label', 'Elige tu pack');
      Array.from(group.children).filter(function (card) { return card.matches(CARD); }).forEach(function (card) {
        var selected = card.hasAttribute('offer-selected') && card.getAttribute('offer-selected') !== 'false';
        attr(card, 'role', 'radio');
        attr(card, 'tabindex', '0');
        attr(card, 'aria-checked', String(selected));
        card.querySelectorAll('.es-b-badge').forEach(function (badge) {
          attr(badge, 'data-df-es-highlight', /\b(?:gratis|regalos?)\b/i.test(badge.textContent) ? 'gift' : null);
        });
        var prices = card.querySelector('.es-b-price-stack');
        if (!prices) return;
        var current = amount(prices.querySelector('.es-b-price-value'));
        var compare = amount(prices.querySelector('.es-b-price-compare'));
        var saving = current && compare && current.prefix === compare.prefix && current.suffix === compare.suffix && compare.value > current.value
          ? 'Ahorras ' + current.prefix + formatter.format(compare.value - current.value) + current.suffix : null;
        attr(prices, 'data-df-es-saving', saving);
        attr(prices, 'role', saving ? 'group' : null);
        attr(prices, 'aria-label', saving ? 'Precio del pack ' + prices.querySelector('.es-b-price-value').textContent.trim() +
          '; precio normal ' + prices.querySelector('.es-b-price-compare').textContent.trim() + '; ' + saving : null);
      });
    });
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(sync);
  }

  document.addEventListener('keydown', function (event) {
    var card = event.target instanceof Element ? event.target.closest(CARD) : null;
    if (!card || !card.parentElement.matches(ROOT) || event.target !== card) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      card.click();
    } else if (['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      var cards = Array.from(card.parentElement.children).filter(function (node) { return node.matches(CARD); });
      var index = cards.indexOf(card);
      var next = event.key === 'Home' ? 0 : event.key === 'End' ? cards.length - 1
        : (index + (event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 1) + cards.length) % cards.length;
      cards[next].focus();
      cards[next].click();
    }
  });

  function start() {
    sync();
    /* Montajes tardíos, remontajes de Vue y selección programática en ambas superficies.
       No observa los data/aria que escribe sync, por lo que no se retroalimenta. */
    new MutationObserver(function (changes) {
      if (changes.some(function (change) {
        var node = change.target.nodeType === 1 ? change.target : change.target.parentElement;
        return node && (node.closest('#easysell, #easysell-embedded-bundles') ||
          Array.from(change.addedNodes).some(function (added) {
            return added.nodeType === 1 && (added.matches('#easysell, #easysell-embedded-bundles') || added.querySelector(ROOT));
          }));
      })) schedule();
    }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['offer-selected'] });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
