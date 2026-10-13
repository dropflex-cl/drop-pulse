import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { parseHTML } from 'linkedom';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./assets/df-easysell-bundles.js', import.meta.url), 'utf8');
const fixture = readFileSync(new URL('./fixtures/easysell-bundles.html', import.meta.url), 'utf8');

function mount() {
  const { window, document } = parseHTML(`<html><body><div id="easysell">${fixture}</div><div id="easysell-embedded-bundles">${fixture}</div></body></html>`);
  const frames: (() => void)[] = [];
  let observer: (changes: MutationRecord[]) => void = () => {};
  class Mutation {
    constructor(callback: typeof observer) { observer = callback; }
    observe() {}
  }
  runInNewContext(source, { document, Element: window.Element, Intl, MutationObserver: Mutation,
    requestAnimationFrame: (callback: () => void) => { frames.push(callback); } });
  const group = document.querySelector('#easysell .es-b-preview-stack')!;
  const cards = Array.from(group.children) as HTMLElement[];
  const update = (target: Element, type = 'attributes') => {
    observer([{ target, type, addedNodes: [] } as unknown as MutationRecord]);
    frames.splice(0).forEach(callback => callback());
  };
  const key = (card: HTMLElement, value: string) => {
    const event = new window.Event('keydown', { bubbles: true, cancelable: true });
    Object.assign(event, { key: value });
    card.dispatchEvent(event);
    return event.defaultPrevented;
  };
  return { document, window, group, cards, update, key };
}

describe('EasySell bundles: oferta real y selección de la app', () => {
  it('adapta ambas superficies sin cambiar textos, productos, precios ni preselección', () => {
    const { document, cards } = mount();
    expect(document.querySelectorAll('[role="radiogroup"]')).toHaveLength(2);
    expect(document.querySelectorAll('[role="radio"]')).toHaveLength(6);
    expect(cards.map(card => card.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false']);
    const original = parseHTML(`<html><body>${fixture}</body></html>`).document;
    expect(cards.map(card => card.textContent)).toEqual(Array.from(original.querySelector('.es-b-preview-stack')!.children).map(card => card.textContent));
    expect(document.querySelector('#easysell')!.querySelectorAll('*').length).toBe(original.body.querySelectorAll('*').length);
    expect(cards.map(card => card.querySelector('.es-b-price-stack')?.getAttribute('data-df-es-saving'))).toEqual(['Ahorras $8.000', 'Ahorras $18.990', 'Ahorras $33.980']);
    expect(document.querySelectorAll('.es-b-price-inline[data-df-es-saving]')).toHaveLength(0);
    expect(cards[1].querySelector('.es-b-price-stack')?.getAttribute('aria-label')).toContain('precio normal $56.980');
  });

  it('sigue una selección programática, incluyendo offer-selected="false", sin seleccionar por su cuenta', () => {
    const { cards, update } = mount();
    cards[1].setAttribute('offer-selected', 'false');
    cards[2].setAttribute('offer-selected', 'true');
    update(cards[2]);
    expect(cards.map(card => card.getAttribute('aria-checked'))).toEqual(['false', 'false', 'true']);
    expect(cards[1].getAttribute('offer-selected')).toBe('false');
  });

  it('destaca el regalo real sin cambiar su texto ni seleccionar el pack y sigue ediciones del badge', () => {
    const { cards, update } = mount();
    const badge = cards[2].querySelector('.es-b-badge')!;
    const text = 'Gratis MAsCARILLA Nocturna colageno';
    badge.textContent = text;
    update(badge, 'characterData');
    expect(badge.getAttribute('data-df-es-highlight')).toBe('gift');
    expect(badge.textContent).toBe(text);
    expect(cards[2].getAttribute('aria-checked')).toBe('false');
    expect(cards[2].querySelector('.es-b-price-value')?.textContent).toBe('$47.990');
    expect(cards[1].querySelector('.es-b-badge')?.hasAttribute('data-df-es-highlight')).toBe(false);
    badge.textContent = 'Incluye un regalo';
    update(badge, 'characterData');
    expect(badge.getAttribute('data-df-es-highlight')).toBe('gift');
    badge.textContent = 'El ritual más completo';
    update(badge, 'characterData');
    expect(badge.hasAttribute('data-df-es-highlight')).toBe(false);
  });

  it('actualiza el ahorro si la app cambia el precio y retira cifras ambiguas', () => {
    const { cards, update } = mount();
    const price = cards[1].querySelector('.es-b-price-value')!;
    price.textContent = '$39.990';
    update(price, 'characterData');
    expect(cards[1].querySelector('.es-b-price-stack')?.getAttribute('data-df-es-saving')).toBe('Ahorras $16.990');
    for (const value of ['$56.980', '$60.000', '$24,99', '$24.99', '−$24.990', 'USD 24.990', 'Consulta el precio']) {
      price.textContent = value;
      update(price, 'characterData');
      expect(cards[1].querySelector('.es-b-price-stack')?.hasAttribute('data-df-es-saving')).toBe(false);
      expect(cards[1].querySelector('.es-b-price-stack')?.hasAttribute('aria-label')).toBe(false);
    }
  });

  it('Espacio, Enter y flechas usan el clic existente; no envían formularios', () => {
    const { cards, key } = mount();
    const clicks: number[] = [];
    cards.forEach((card, index) => {
      card.addEventListener('click', () => clicks.push(index));
      card.focus = () => {};
    });
    expect(key(cards[1], 'Enter')).toBe(true);
    expect(key(cards[1], ' ')).toBe(true);
    expect(key(cards[1], 'ArrowRight')).toBe(true);
    expect(key(cards[0], 'ArrowLeft')).toBe(true);
    expect(key(cards[1], 'Home')).toBe(true);
    expect(key(cards[1], 'End')).toBe(true);
    expect(key(cards[1], 'Escape')).toBe(false);
    expect(clicks).toEqual([1, 1, 2, 2, 0, 2]);
  });

  it('vuelve a adaptar la oferta si EasySell remonta su contenido', () => {
    const { group, update } = mount();
    group.innerHTML = parseHTML(`<html><body>${fixture}</body></html>`).document.querySelector('.es-b-preview-stack')!.innerHTML;
    update(group, 'childList');
    expect(group.querySelectorAll('[role="radio"]')).toHaveLength(3);
    expect(group.querySelectorAll('[data-df-es-saving]')).toHaveLength(3);
  });
});
