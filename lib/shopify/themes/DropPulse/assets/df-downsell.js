/*
 * DropFlex · oferta de salida (snippets/df-downsell.liquid) sobre el downsell de EasySell COD Form.
 *
 * EasySell decide cuándo aparece la oferta y aplica el descuento: al cerrar su formulario (y, en
 * escritorio, al llevar el mouse al borde superior) pone `display: block` en #es-downsell. Aquí:
 * - Se observa ese style. Cuando EasySell abre su popup, se oculta (atributo data-df-dso-hidden)
 *   y se abre el <dialog> de la tienda con los montos del mismo cálculo de EasySell.
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

    const savings = (base * percent) / 100;
    const newTotal = total - savings;
    if (!(newTotal > 0)) return null;

    const format = (value) => {
      const text = money(value);
      return typeof text === 'string' && /\d/.test(text) ? text : null;
    };
    const texts = { total: format(total), 'new-total': format(newTotal), savings: format(savings) };
    if (Object.values(texts).includes(null)) return null;

    const lang = document.documentElement.lang || undefined;
    const percentText = `${new Intl.NumberFormat(lang, { maximumFractionDigits: 2 }).format(percent)}%`;
    return { percentText, texts };
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

  attach();
  new MutationObserver(attach).observe(document.documentElement, { childList: true, subtree: true });
})();
