/*
 * DropFlex · oferta de salida (snippets/df-downsell.liquid) sobre el downsell de EasySell COD Form.
 *
 * EasySell decide cuándo aparece la oferta y aplica el descuento: al cerrar su formulario (y, en
 * escritorio, al llevar el mouse al borde superior) pone `display: block` en #es-downsell. Aquí:
 * - Se observa ese style. Cuando EasySell abre su popup, se oculta (atributo data-df-dso-hidden,
 *   visibility: hidden; nunca display: none, que le quita a EasySell la impresión del downsell) y
 *   se abre el <dialog> de la tienda con los montos del mismo cálculo de EasySell.
 * - «Aplicar descuento» hace clic en el botón real de aceptar de EasySell; «No, gracias», la X,
 *   Esc y el toque en el fondo, en el de rechazar. Así corre su código tal cual (aplica el
 *   descuento o cierra el formulario) y el pedido lleva el downsell como siempre. Nunca se llama
 *   a una función interna de la app ni se dispara un evento a mano.
 * - Una vez por sesión: rechazada, las siguientes veces que EasySell la abra se rechaza sola, en
 *   el mismo instante (su formulario se cierra, como pidió el comprador). Aceptada, puede volver
 *   después de recargar la página, porque EasySell olvida el descuento al recargar.
 *
 * Los montos: EasySell descuenta el porcentaje sobre el subtotal de productos (sin envío, recargo
 * ni productos extra) y resta ese descuento del total. Se leen de su estado (solo lectura) y se
 * formatean con su propio formateador (window.ES_FORMAT_CURRENCY), así el popup muestra lo mismo
 * que el resumen del formulario después de aceptar.
 * - Aceptado, el resumen del formulario muestra el descuento del downsell en su propia línea
 *   (EasySell lo suma al del pack en una sola).
 *
 * El DOM y el estado de una app de terceros no son un contrato: si algo no calza (otra versión de
 * EasySell, un descuento de monto fijo, un monto que no cuadra), no se oculta nada y queda el
 * popup de EasySell.
 */
(() => {
  const dialog = document.getElementById('df-dso');
  if (!dialog || typeof dialog.showModal !== 'function') return;

  const HOST_ID = 'es-downsell';
  const SESSION_KEY = 'df:downsell';
  const HIDDEN = 'data-df-dso-hidden';

  /** El popup de EasySell (lo monta su app; puede moverlo al final del <body>). */
  let host = null;
  /** Los botones de EasySell del downsell abierto en este momento. */
  let pending = null;

  const session = {
    get() {
      try {
        return sessionStorage.getItem(SESSION_KEY);
      } catch {
        return null;
      }
    },
    set(value) {
      try {
        sessionStorage.setItem(SESSION_KEY, value);
      } catch {
        // Sin almacenamiento (navegación privada): la oferta puede volver a aparecer.
      }
    },
  };

  /** EasySell muestra y oculta su popup escribiendo style.display («block» / «none»). */
  const isOpen = (el) => el.style.display !== '' && el.style.display !== 'none';

  /** Aceptar y rechazar: los dos son AnimatedButton de EasySell, en ese orden. */
  const buttonsOf = (el) => {
    const all = el.querySelectorAll('.es-downsell-buttons .es-animated-button');
    return all.length === 2 ? { accept: all[0], reject: all[1] } : null;
  };

  const format = (money, value) => {
    const text = money(value);
    return typeof text === 'string' && /\d/.test(text) ? text : null;
  };

  /**
   * El ahorro tal como se ve: la resta de los dos totales ya redondeados por el formateador de
   * EasySell (toFixed con los decimales de la moneda). EasySell redondea cada monto por separado
   * ($55.990 al 5 %: descuento $2.799,5 → «$2.800», total $53.190,5 → «$53.191»); con esto las
   * cifras cuadran: $55.990 − $2.799 = $53.191, lo mismo que dicen su resumen y su botón.
   */
  const shownDifference = (money, before, after) => {
    const decimals = /[.,]5\d?\D*$/.test(money(0.5)) ? 2 : 0;
    return Number(before.toFixed(decimals)) - Number(after.toFixed(decimals));
  };

  const percentText = (value) => {
    const lang = document.documentElement.lang || undefined;
    return `${new Intl.NumberFormat(lang, { maximumFractionDigits: 2 }).format(value)}%`;
  };

  /**
   * La oferta con el cálculo de EasySell (getters de su store, solo lectura):
   *   descuento = (subtotal − descuento por cantidad) × % ; total nuevo = total − descuento.
   * null si falta cualquier pieza o el descuento no es un porcentaje.
   */
  const readOffer = (el) => {
    const money = window.ES_FORMAT_CURRENCY;
    const getters = el.__vue__?.$store?.getters;
    if (typeof money !== 'function' || !getters) return null;

    const discount = getters['downsells/getDownsell']?.settings?.discount;
    if (discount?.type !== 'percentage') return null;

    const percent = Number.parseFloat(discount.value);
    const base = Number(getters['calculator/subtotal']) - (Number(getters['calculator/offerDiscountValue']) || 0);
    const total = Number(getters['calculator/total']);
    if (!(percent > 0 && percent < 100) || !(base > 0) || !(total > 0)) return null;

    const newTotal = total - (base * percent) / 100;
    if (!(newTotal > 0)) return null;

    const texts = {
      total: format(money, total),
      'new-total': format(money, newTotal),
      savings: format(money, shownDifference(money, total, newTotal)),
    };
    if (Object.values(texts).includes(null)) return null;
    return { percentText: percentText(percent), texts };
  };

  /* ---- El descuento del downsell en el resumen del formulario ----
     EasySell suma el descuento del downsell al que ya había (el del pack) y muestra UNA línea
     («Ahorrado −$16.090»): el comprador acepta y no ve su descuento. Con el downsell aceptado, esa
     línea muestra el resto (lo que no es downsell) y debajo va una línea propia con el del
     downsell. Si no había otro descuento, la línea de EasySell se oculta y queda la propia. Solo
     la vista: el monto lo calcula y lo cobra EasySell; aquí se leen sus mismos valores (solo
     lectura) y su código no lee estos nodos. */
  const LINE = 'data-df-dso-line';
  const MERGED = 'data-df-dso-merged';

  const syncSummary = () => {
    const row = document.querySelector('#easysell .es-discount-row');
    const current = document.querySelector(`[${LINE}]`);
    const store = host?.__vue__?.$store;
    const money = window.ES_FORMAT_CURRENCY;
    const active = store?.getters?.['downsells/getActiveDownsell'];
    const downsell = Number(store?.getters?.['calculator/downsellDiscountValue']);
    const discount = store?.state?.calculator?.discount;
    const total = Number(store?.getters?.['calculator/total']);
    if (!row || !active || !(downsell > 0) || !discount || !(total >= 0) || typeof money !== 'function') {
      current?.remove();
      row?.removeAttribute(MERGED);
      return;
    }

    const rest = Number(discount.amount) - downsell;
    if (rest >= 0.5) {
      row.removeAttribute(MERGED);
      const amount = row.querySelector('.money');
      const text = `-${format(money, rest)}`;
      if (amount && amount.textContent !== text) amount.textContent = text;
    } else if (!row.hasAttribute(MERGED)) {
      row.setAttribute(MERGED, '');
    }

    const value = active.settings?.discount;
    const label = (dialog.dataset.line || 'Descuento extra ({percent})').replace(
      /\s*(\()?\{percent\}(\))?/g,
      value?.type === 'percentage' ? (_, open, close) => ` ${open || ''}${percentText(Number.parseFloat(value.value))}${close || ''}` : ''
    );
    const amountText = `-${format(money, shownDifference(money, total + downsell, total))}`;

    let line = current;
    if (!line) {
      line = document.createElement('div');
      line.className = 'df-dso-line';
      line.setAttribute(LINE, '');
      line.append(document.createElement('span'), document.createElement('span'));
      line.firstChild.className = 'df-dso-line__label';
      line.lastChild.className = 'df-dso-line__value';
    }
    if (line.firstChild.textContent !== label.trim()) line.firstChild.textContent = label.trim();
    if (line.lastChild.textContent !== amountText) line.lastChild.textContent = amountText;
    if (row.nextElementSibling !== line) row.after(line);
  };

  const fill = (offer) => {
    const title = dialog.querySelector('#df-dso-title');
    if (title) title.textContent = (dialog.dataset.title || '').replaceAll('{percent}', offer.percentText);
    for (const [key, text] of Object.entries(offer.texts)) {
      const slot = dialog.querySelector(`[data-df-dso="${key}"]`);
      if (slot) slot.textContent = text;
    }
  };

  const onHostChange = () => {
    if (!host) return;

    if (!isOpen(host)) {
      host.removeAttribute(HIDDEN);
      // EasySell cerró su popup por su cuenta: el nuestro se cierra sin tocar sus botones.
      if (dialog.open) {
        pending = null;
        dialog.close();
      }
      return;
    }

    if (dialog.open || host.hasAttribute(HIDDEN)) return;
    const buttons = buttonsOf(host);
    if (!buttons) return;

    if (session.get() === 'declined') {
      host.setAttribute(HIDDEN, '');
      buttons.reject.click();
      return;
    }

    const offer = readOffer(host);
    if (!offer) return;

    fill(offer);
    host.setAttribute(HIDDEN, '');
    pending = buttons;
    dialog.returnValue = '';
    try {
      dialog.showModal();
    } catch {
      pending = null;
      host.removeAttribute(HIDDEN);
    }
  };

  // Todo cierre pasa por aquí: el botón principal cierra con «accept»; la X, «No, gracias», Esc y
  // el toque en el fondo, con cualquier otro valor.
  dialog.addEventListener('close', () => {
    const buttons = pending;
    pending = null;
    if (!buttons) return;
    const accepted = dialog.returnValue === 'accept';
    session.set(accepted ? 'accepted' : 'declined');
    (accepted ? buttons.accept : buttons.reject).click();
  });

  // Un toque en el velo: el objetivo es el propio <dialog> (el panel lo cubre por dentro).
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close('decline');
  });

  /** EasySell monta su popup después de cargar; se busca de nuevo si lo reemplaza. */
  const attach = () => {
    const el = document.getElementById(HOST_ID);
    if (el === host) return;
    host = el;
    if (!el) return;
    new MutationObserver(onHostChange).observe(el, { attributes: true, attributeFilter: ['style'] });
    onHostChange();
  };

  // Aceptar hace que EasySell vuelva a dibujar su resumen (monta la línea o cambia su texto): el
  // mismo observador pone la línea del downsell. Nuestras propias escrituras lo despiertan una vez
  // más y esa vuelta ya no cambia nada.
  const onDocumentChange = () => {
    attach();
    syncSummary();
  };

  onDocumentChange();
  new MutationObserver(onDocumentChange).observe(document.documentElement, { childList: true, subtree: true });
})();
