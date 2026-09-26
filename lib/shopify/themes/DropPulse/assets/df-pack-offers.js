// DropFlex · <df-pack-offers>: elegir un pack es elegir cuántas unidades lleva el pedido.
//
// Un pack es la variante de 1 unidad × N, nunca una variante propia: Dropify (Dropi) enlaza el
// producto entero con un solo id y manda la cantidad de la línea, así que una variante «2 unidades»
// llegaba a Dropi como 1 unidad. El precio del pack lo cobra EasySell con su oferta por cantidad: al
// abrir su formulario lee la variante y la cantidad del formulario del producto y elige la oferta de
// esa cantidad (su propia sincronización con el tema, `Lt` en easysell.js). Aquí:
// - Se deja la variante de 1 unidad en input[name="id"] y la cantidad del pack en
//   input[name="quantity"] (el selector de cantidad del tema, oculto). Se repone antes de cada clic
//   (en captura, antes que EasySell), por si el tema la reescribe.
// - Cada tarjeta se compara con la oferta de EasySell (window.EASYSELL_QUANTITY_OFFERS, solo
//   lectura, con su mismo cálculo). La que EasySell no cobra igual no se muestra: la página nunca
//   dice un precio distinto del que cobra el formulario. Sin oferta, con una opción preseleccionada
//   o mostrada junto al botón (en esos casos EasySell no lee la cantidad), o con el formulario fuera
//   de un popup, no se muestra el bloque y la cantidad queda en 1. En el editor de temas se dice por qué.
// - df-price muestra el pack elegido (evento df:pack) y la barra fija del tema, su precio y nombre.
//
// El estado de una app de terceros no es un contrato: si algo no calza, se esconde, nunca se adivina.

if (!customElements.get('df-pack-offers')) {
  const unitsText = (n) => `${n} ${n === 1 ? 'unidad' : 'unidades'}`;

  /** Tasa de la moneda de la tienda a la del comprador, como la aplica EasySell a un monto fijo. */
  const currencyRate = () => (window.ES_SKIP_CURRENCY_CONVERSION ? 1 : Number(window.Shopify?.currency?.rate) || 1);

  const formatCents = (cents) => {
    try {
      return new Intl.NumberFormat(document.documentElement.lang || undefined, {
        style: 'currency',
        currency: window.Shopify?.currency?.active || 'CLP',
      }).format(cents / 100);
    } catch {
      return String(cents / 100);
    }
  };

  /**
   * La oferta por cantidad de EasySell del producto, con su misma búsqueda (`wi` en easysell.js).
   * undefined: EasySell no está en la página. null: no hay oferta para este producto.
   */
  const quantityOfferFor = (productId) => {
    const all = window.EASYSELL_QUANTITY_OFFERS;
    if (!Array.isArray(all)) return undefined;
    const gid = `gid://shopify/Product/${productId}`;
    return all.find((o) => o?.productIds?.includes?.(gid)) || all.find((o) => o?.enabled && o.productId === `${productId}`) || null;
  };

  /** Lo que cobra EasySell por `units` unidades de la variante (`getPrice` en easysell.js), en centavos. */
  const chargedCents = (offer, units, unitCents) => {
    const full = (unitCents / 100) * units;
    const { type, value } = offer.discount || {};
    const amount = Number.parseFloat(String(value ?? '').replace(',', '.'));
    let price = full;
    if (type === 'percentage' && Number.isFinite(amount)) price = full - (full * amount) / 100;
    else if ((type === 'fixed_amount' || type === 'fixed') && Number.isFinite(amount)) price = full - amount * currencyRate();
    return Math.round(price * 100);
  };

  /**
   * Qué tarjetas cobra EasySell tal cual y, de las demás, por qué no. Sin tarjetas buenas, `problems`
   * dice qué cambiar en EasySell.
   */
  const reconcile = (el, radios) => {
    const none = (problem) => ({ ok: [], problems: [problem] });
    const qo = quantityOfferFor(el.dataset.product);
    if (qo === undefined) return none('EasySell no está activo en la página. Los packs se venden con su formulario.');
    if (!qo) return none('Crea en EasySell una oferta por cantidad para este producto, con una opción por pack.');

    const formType = window.EASYSELL_CONFIG?.form_type;
    if (formType && formType !== 'popup') return none('El formulario de EasySell tiene que abrirse como popup: si va en la página, no toma el pack elegido.');

    const design = qo.design || {};
    const embedded = window.ES_EMBEDDED_OFFERS ?? design.placement?.includes?.('button') ?? design.embedded ?? false;
    if (embedded) return none('En EasySell, muestra la oferta por cantidad solo en el formulario, no junto al botón: el pack lo eligen estas tarjetas.');

    const offers = Array.isArray(qo.offers) ? qo.offers : [];
    if (offers.some((o) => o?.preselected)) return none('En EasySell, quita «preseleccionada» de la oferta por cantidad: con una opción preseleccionada, el formulario no toma el pack elegido aquí.');

    const unitCents = Number(el.dataset.unitCents);
    const ok = [];
    const problems = [];
    for (const radio of radios) {
      const units = Number.parseInt(radio.value, 10);
      const offer = offers.find((o) => Number.parseInt(o?.quantity, 10) === units);
      if (!offer) {
        problems.push(`${unitsText(units)}: falta la opción de ${unitsText(units)} en la oferta por cantidad de EasySell.`);
        continue;
      }
      const charged = chargedCents(offer, units, unitCents);
      // Un centavo de margen por el redondeo del punto flotante.
      if (!(Math.abs(charged - Number(radio.dataset.cents)) <= 1)) {
        problems.push(`${unitsText(units)}: EasySell cobra ${formatCents(charged)} y la tarjeta dice ${radio.dataset.price}.`);
        continue;
      }
      ok.push(radio);
    }
    return { ok, problems };
  };

  class DfPackOffers extends HTMLElement {
    connectedCallback() {
      this.radios = [...this.querySelectorAll('.df-pack-offers__radio')];
      const { ok, problems } = reconcile(this, this.radios);
      this.usable = ok.length > 1;

      for (const radio of this.radios) {
        const card = radio.closest('.df-pack-offers__card');
        if (card) card.hidden = this.usable && !ok.includes(radio);
      }
      if (this.usable && !ok.some((r) => r.checked)) ok[0].checked = true;

      if (problems.length) {
        console.warn('[df-pack-offers]', problems.join(' '));
        this.explain(problems);
      }
      if (!this.usable) {
        // En el editor se ve el aviso; en la tienda, nada.
        const set = this.querySelector('.df-pack-offers__set');
        if (window.Shopify?.designMode && set) set.hidden = true;
        else this.hidden = true;
      }

      this.addEventListener('change', this.onChange);
      window.addEventListener('click', this.onAnyClick, true);
      this.apply();
      this.announce();
    }

    disconnectedCallback() {
      this.removeEventListener('change', this.onChange);
      window.removeEventListener('click', this.onAnyClick, true);
    }

    /** La tarjeta elegida; ninguna si el bloque no se muestra (el pedido va de 1 unidad). */
    selected() {
      return this.usable ? this.radios.find((r) => r.checked && !r.closest('.df-pack-offers__card')?.hidden) : undefined;
    }

    /** El formulario del producto lleva la variante de 1 unidad y la cantidad del pack. */
    apply() {
      const variant = this.dataset.variant;
      const units = this.selected()?.value || '1';
      const scope = this.closest('.shopify-section') || document;
      for (const form of scope.querySelectorAll('form[action*="/cart/add"]')) {
        const id = form.querySelector('input[name="id"]');
        if (id && variant && id.value !== variant) {
          id.value = variant;
          id.dispatchEvent(new Event('change', { bubbles: true }));
        }
        let quantity = form.querySelector('[name="quantity"]');
        if (!quantity) {
          quantity = document.createElement('input');
          quantity.type = 'hidden';
          quantity.name = 'quantity';
          form.append(quantity);
        }
        if (quantity.value !== units) quantity.value = units;
      }
    }

    /** df-price y la barra fija del tema muestran el pack elegido. */
    announce() {
      const radio = this.selected();
      if (!radio) return;
      const { price, was, save, pc, label } = radio.dataset;
      this.dispatchEvent(new CustomEvent('df:pack', { bubbles: true, detail: { p: price, c: was || null, s: save || null, pc: Number(pc) || 0 } }));

      const sticky = document.querySelector('sticky-add-to-cart');
      if (sticky) {
        if (this.dataset.variant) sticky.setAttribute('data-current-variant-id', this.dataset.variant);
        const priceEl = sticky.querySelector('.sticky-add-to-cart__price');
        const variantEl = sticky.querySelector('.sticky-add-to-cart__variant');
        if (priceEl && price) priceEl.textContent = price;
        if (variantEl && label) {
          variantEl.textContent = label;
          variantEl.style.removeProperty('display');
        }
      }
    }

    /** Solo en el editor de temas: qué cambiar en EasySell para que los packs se muestren. */
    explain(problems) {
      const notice = this.querySelector('[data-df-notice]');
      if (!notice || !window.Shopify?.designMode) return;
      const title = document.createElement('strong');
      title.textContent = this.usable ? 'Algunos packs no se muestran en la tienda' : 'Los packs no se muestran en la tienda';
      const list = document.createElement('ul');
      for (const problem of problems) {
        const item = document.createElement('li');
        item.textContent = problem;
        list.append(item);
      }
      notice.replaceChildren(title, list);
      notice.hidden = false;
    }

    onChange = (event) => {
      const radio = event.target;
      if (!(radio instanceof HTMLInputElement) || radio.type !== 'radio' || !radio.checked) return;
      event.stopPropagation();
      this.apply();
      this.announce();
    };

    // EasySell lee la cantidad al abrir su formulario: se repone justo antes de cualquier clic.
    onAnyClick = () => this.apply();
  }

  customElements.define('df-pack-offers', DfPackOffers);
}
