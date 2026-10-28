import { describe, it, expect } from 'vitest';
import { STYLES } from '../src/styles.js';

// The hover tints on the overlay buttons and the sound toggle fade over 150ms
// ease-out (docs/brand/design.md, Motion), and reduced motion turns the fade
// off. Parse the exported stylesheet through the DOM's CSSOM so a rewrite
// that drops either rule fails here instead of shipping silently.
function parseRules(): CSSRule[] {
  const style = document.createElement('style');
  style.textContent = STYLES;
  document.head.appendChild(style);
  const rules = Array.from(style.sheet!.cssRules);
  style.remove();
  return rules;
}

function selectors(rule: CSSStyleRule): string[] {
  return rule.selectorText.split(',').map((s) => s.trim());
}

function styleRulesFor(rules: CSSRule[], selector: string): CSSStyleRule[] {
  return rules.filter(
    (r): r is CSSStyleRule => r instanceof CSSStyleRule && selectors(r).includes(selector),
  );
}

function reducedMotionRules(rules: CSSRule[]): CSSStyleRule[] {
  return rules
    .filter(
      (r): r is CSSMediaRule =>
        r instanceof CSSMediaRule && /prefers-reduced-motion:\s*reduce/.test(r.conditionText),
    )
    .flatMap((m) => Array.from(m.cssRules))
    .filter((r): r is CSSStyleRule => r instanceof CSSStyleRule);
}

describe.each(['.dr-sound', '.dr-button'])('dino-runner %s hover transition', (selector) => {
  it('fades background-color over 150ms ease-out', () => {
    const transitions = styleRulesFor(parseRules(), selector).map((r) =>
      r.style.getPropertyValue('transition'),
    );
    expect(transitions).toContain('background-color 150ms ease-out');
  });

  it('drops the transition under prefers-reduced-motion: reduce', () => {
    const transitions = reducedMotionRules(parseRules())
      .filter((r) => selectors(r).includes(selector))
      .map((r) => r.style.getPropertyValue('transition'));
    expect(transitions).toContain('none');
  });
});
