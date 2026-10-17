import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { Liquid } from 'liquidjs';
import { parseHTML } from 'linkedom';
import { describe, expect, it, vi } from 'vitest';

const source = readFileSync(new URL('./snippets/df-easysell.liquid', import.meta.url), 'utf8');
const runtime = source.match(/<script>\s*([\s\S]*?)<\/script>/)![1];
const liquid = new Liquid({ root: new URL('../_shared/snippets/', import.meta.url).pathname, extname: '.liquid' });
liquid.registerFilter('asset_url', (name: string) => `/assets/${name}`);
liquid.registerFilter('stylesheet_tag', (url: string) => `<link rel="stylesheet" href="${url}">`);
const truck = liquid.parseAndRenderSync(
  readFileSync(new URL('../_shared/snippets/df-icon.liquid', import.meta.url), 'utf8')
    .replace(/{%-? doc -?%}[\s\S]*?{%-? enddoc -?%}/, ''),
  { name: 'truck' },
);
const render = (shop = 'qs060z-e7.myshopify.com', enabled = true) => liquid.parseAndRender(
  source.replace(/{%-? doc -?%}[\s\S]*?{%-? enddoc -?%}/, '')
    .replace('{% style %}', '<style>').replace('{% endstyle %}', '</style>')
    .replace("{% render 'df-icon', name: 'truck' %}", truck),
  { settings: { df_easysell: enabled }, shop: { permanent_domain: shop } },
);

async function mount(shop?: string) {
  const { window, document } = parseHTML(`<html><body><div id="easysell"><form class="es-form">
    <div class="es-header-group"><div><!-- Vue --></div></div>
    <div class="es-cart_content-group"><div></div></div>
    <input id="es-first_name" value="María"><input type="checkbox" id="priority">
    <div class="es-shipping-line"><span class="label-value">Free</span></div>
    <div class="es-cta-group"><button type="button" class="es-cta-btn">Confirmar pedido · $21.990</button></div>
  </form></div>${await render(shop)}</body></html>`);
  const observers: { callback: () => void; target?: unknown }[] = [];
  class Mutation {
    constructor(callback: () => void) { this.entry = { callback, target: undefined as unknown }; observers.push(this.entry); }
    entry: (typeof observers)[number];
    observe(target: unknown) { this.entry.target = target; }
  }
  // Linkedom no conserva prioridades CSS; los tamaños y el cascade se verifican en navegador.
  const stylePrototype = Object.getPrototypeOf(document.body.style);
  if (!stylePrototype.getPropertyPriority) stylePrototype.getPropertyPriority = () => 'important';
  Object.assign(window, { getComputedStyle: () => ({
    backgroundColor: 'rgb(31, 75, 216)', color: 'rgb(255, 255, 255)', borderTopColor: 'rgb(31, 75, 216)',
    borderBottomColor: 'rgb(21, 23, 28)', outlineColor: 'rgb(255, 255, 255)',
    borderTopLeftRadius: '10px', borderTopRightRadius: '14px', minHeight: '48px',
    padding: '12px 16px', fontSize: '16px', lineHeight: '22px', boxShadow: 'none',
  }) });
  const button = document.querySelector('button')!;
  const confirm = vi.fn(); button.addEventListener('click', confirm);
  runInNewContext(runtime, { document, window, MutationObserver: Mutation, Element: window.Element, setTimeout });
  const refresh = () => observers.find(entry => entry.target === document.documentElement)!.callback();
  return { document, window, button, confirm, refresh };
}

describe('presentación del formulario COD', () => {
  it('limita los transportistas confirmados a Datazo y respeta el ajuste de EasySell', async () => {
    expect(await render()).toContain('id="df-es-carriers-template"');
    expect(await render('otra-tienda.myshopify.com')).not.toContain('id="df-es-carriers-template"');
    expect(await render('qs060z-e7.myshopify.com', false)).not.toContain('id="df-es-carriers-template"');
  });

  it('agrega un único apoyo por montaje, sin sustituir campos, decisiones ni el botón', async () => {
    const view = await mount();
    const input = view.document.querySelector('#es-first_name');
    const priority = view.document.querySelector<HTMLInputElement>('#priority')!;
    priority.checked = true;
    view.refresh(); view.refresh();
    expect(view.document.querySelectorAll('form [data-df-es-carriers]')).toHaveLength(1);
    expect(view.document.querySelector('#es-first_name')).toBe(input);
    expect(input?.getAttribute('value')).toBe('María');
    expect(priority.checked).toBe(true);
    expect(view.confirm).not.toHaveBeenCalled();
    view.button.dispatchEvent(new view.window.Event('click'));
    expect(view.confirm).toHaveBeenCalledOnce();
    view.document.querySelector('form [data-df-es-carriers]')!.remove();
    view.refresh();
    expect(view.document.querySelectorAll('form [data-df-es-carriers]')).toHaveLength(1);
  });

  it('traduce Free sin cambiar tarifas pagadas y recupera espacio al aparecer contenido', async () => {
    const view = await mount();
    const shipping = view.document.querySelector('.label-value')!;
    expect(shipping.textContent).toBe('Gratis');
    shipping.textContent = '$1.990'; view.refresh();
    expect(shipping.textContent).toBe('$1.990');
    expect(shipping.parentElement!.hasAttribute('data-df-es-free')).toBe(false);
    const cart = view.document.querySelector('.es-cart_content-group')!;
    expect(cart.hasAttribute('data-df-es-empty-group')).toBe(true);
    cart.innerHTML = '<div>Pack elegido · $29.990</div>'; view.refresh();
    expect(cart.hasAttribute('data-df-es-empty-group')).toBe(false);
  });
});
