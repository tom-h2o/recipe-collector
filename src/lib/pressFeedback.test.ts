import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initPressFeedback, RELEASE_MS } from './pressFeedback';

/**
 * Touch feedback is two attributes, set from pointer events. The styles in
 * index.css hang off them, so what matters here is which element gets them,
 * when they go away, and which elements never get them.
 */
let stop: () => void;

function pointer(type: string, target: Element, init: Partial<PointerEventInit> = {}) {
  target.dispatchEvent(new MouseEvent(type, { bubbles: true, button: 0, ...init }));
}

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '';
  stop = initPressFeedback();
});

afterEach(() => {
  stop();
  vi.useRealTimers();
});

function add(html: string): HTMLElement {
  document.body.insertAdjacentHTML('beforeend', html);
  return document.body.lastElementChild as HTMLElement;
}

describe('press feedback', () => {
  it('marks a button while it is held and for a moment after it is let go', () => {
    const button = add('<button>Save</button>');

    pointer('pointerdown', button);
    expect(button.hasAttribute('data-pressed')).toBe(true);

    pointer('pointerup', button);
    expect(button.hasAttribute('data-pressed')).toBe(false);
    expect(button.hasAttribute('data-released')).toBe(true);

    vi.advanceTimersByTime(RELEASE_MS);
    expect(button.hasAttribute('data-released')).toBe(false);
  });

  it('marks the control, not the icon inside it that was actually touched', () => {
    const button = add('<button><svg><path /></svg></button>');
    pointer('pointerdown', button.querySelector('path')!);
    expect(button.hasAttribute('data-pressed')).toBe(true);
  });

  it('marks the nearest control when one sits inside another', () => {
    // A recipe card is tappable and so is the favourite star on it. Touching
    // the star must not light up the whole card.
    const card = add('<div data-pressable="surface"><button>★</button><p>Pizza</p></div>');
    const star = card.querySelector('button')!;

    pointer('pointerdown', star);
    expect(star.hasAttribute('data-pressed')).toBe(true);
    expect(card.hasAttribute('data-pressed')).toBe(false);
    pointer('pointerup', star);

    pointer('pointerdown', card.querySelector('p')!);
    expect(card.hasAttribute('data-pressed')).toBe(true);
  });

  it('gives no feedback on something that cannot be used', () => {
    const disabled = add('<button disabled>Save</button>');
    const ariaDisabled = add('<a href="/x" aria-disabled="true">Link</a>');
    pointer('pointerdown', disabled);
    pointer('pointerdown', ariaDisabled);
    expect(disabled.hasAttribute('data-pressed')).toBe(false);
    expect(ariaDisabled.hasAttribute('data-pressed')).toBe(false);
  });

  it('gives no feedback on plain content', () => {
    const text = add('<p>Just a paragraph</p>');
    pointer('pointerdown', text);
    expect(text.hasAttribute('data-pressed')).toBe(false);
  });

  it('ignores the secondary mouse button', () => {
    const button = add('<button>Save</button>');
    pointer('pointerdown', button, { button: 2 });
    expect(button.hasAttribute('data-pressed')).toBe(false);
  });

  it('lets go when a touch turns into a scroll', () => {
    // The browser cancels the pointer when a finger starts scrolling. Without
    // this a card would stay faded for the whole scroll.
    const card = add('<div data-pressable="surface">Pizza</div>');
    pointer('pointerdown', card);
    pointer('pointercancel', card);
    expect(card.hasAttribute('data-pressed')).toBe(false);
  });

  it('lets go when the window loses focus mid-press', () => {
    const button = add('<button>Save</button>');
    pointer('pointerdown', button);
    window.dispatchEvent(new Event('blur'));
    expect(button.hasAttribute('data-pressed')).toBe(false);
  });

  it('never leaves two things pressed at once', () => {
    const first = add('<button>One</button>');
    const second = add('<button>Two</button>');
    pointer('pointerdown', first);
    pointer('pointerdown', second);
    expect(first.hasAttribute('data-pressed')).toBe(false);
    expect(second.hasAttribute('data-pressed')).toBe(true);
  });

  it('restarts cleanly when the same control is pressed again before it has recovered', () => {
    const button = add('<button>Save</button>');
    pointer('pointerdown', button);
    pointer('pointerup', button);
    vi.advanceTimersByTime(RELEASE_MS / 2);

    pointer('pointerdown', button);
    expect(button.hasAttribute('data-released')).toBe(false);
    expect(button.hasAttribute('data-pressed')).toBe(true);

    // The timer from the first release must not clear the second one early.
    pointer('pointerup', button);
    vi.advanceTimersByTime(RELEASE_MS / 2 + 10);
    expect(button.hasAttribute('data-released')).toBe(true);
    vi.advanceTimersByTime(RELEASE_MS);
    expect(button.hasAttribute('data-released')).toBe(false);
  });

  it('stops listening when torn down', () => {
    const button = add('<button>Save</button>');
    stop();
    pointer('pointerdown', button);
    expect(button.hasAttribute('data-pressed')).toBe(false);
  });
});
