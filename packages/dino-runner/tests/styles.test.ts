import { describe, it, expect } from 'vitest';
import { STYLES } from '../src/styles.js';

// The hover tints on the overlay buttons and the sound toggle fade over 150ms
// ease-out (docs/brand/design.md, Motion), and reduced motion turns the fade
// off. Parse the exported stylesheet through the DOM's CSSOM so a rewrite
// that drops either rule fails here instead of shipping silently.
function parseRules(css = STYLES): CSSRule[] {
  const style = document.createElement('style');
  style.textContent = css;
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

function isReducedMotion(rule: CSSMediaRule): boolean {
  return /prefers-reduced-motion:\s*reduce/.test(rule.conditionText);
}

function reducedMotionRules(rules: CSSRule[]): CSSStyleRule[] {
  return rules
    .filter((r): r is CSSMediaRule => r instanceof CSSMediaRule && isReducedMotion(r))
    .flatMap((m) => Array.from(m.cssRules))
    .filter((r): r is CSSStyleRule => r instanceof CSSStyleRule);
}

// happy-dom has no CSSGroupingRule class, so any rule with child rules
// (@media, @supports, @container) counts as a grouping rule.
function isGroupingRule(rule: CSSRule): rule is CSSGroupingRule {
  return 'cssRules' in rule;
}

// Every style rule under `rule`, at any depth, skipping reduced-motion blocks
// when `skipReducedMotion` is set.
function nestedStyleRules(rule: CSSRule, skipReducedMotion: boolean): CSSStyleRule[] {
  if (rule instanceof CSSStyleRule) return [rule];
  if (!isGroupingRule(rule)) return [];
  if (skipReducedMotion && rule instanceof CSSMediaRule && isReducedMotion(rule)) return [];
  return Array.from(rule.cssRules).flatMap((r) => nestedStyleRules(r, skipReducedMotion));
}

// A rule sets a transition through the shorthand or any `transition-*`
// longhand; the shorthand reads '' when only longhands are set.
function setsTransition(rule: CSSStyleRule): boolean {
  if (rule.style.getPropertyValue('transition') !== '') return true;
  return Array.from({ length: rule.style.length }, (_, i) => rule.style.item(i)).some(
    (name) => name.startsWith('transition-') && rule.style.getPropertyValue(name) !== '',
  );
}

// Top-level index of each rule that holds a base transition for `selector`,
// however deeply it is nested outside a reduced-motion block.
function baseTransitionIndexes(rules: CSSRule[], selector: string): number[] {
  return rules.flatMap((r, index) =>
    nestedStyleRules(r, true).some((s) => selectors(s).includes(selector) && setsTransition(s))
      ? [index]
      : [],
  );
}

// A rule turns motion off with `transition: none`, `transition-property: none`
// or a zero `transition-duration` for every listed transition. happy-dom keeps
// the shorthand and each longhand as written instead of cascading them, so
// cascade by hand: a longhand counts only when declared after the shorthand,
// `transition: none` resets the property to none and the duration to 0s, and
// any other shorthand is taken to keep motion. happy-dom keeps a repeated
// property at its first position, so a rule that declares the same transition
// property twice is out of scope.
function disablesTransition(rule: CSSStyleRule): boolean {
  const style = rule.style;
  const names = Array.from({ length: style.length }, (_, i) => style.item(i));
  const shorthand = names.lastIndexOf('transition');
  const none = style.getPropertyValue('transition') === 'none';
  const cascaded = (longhand: string, reset: string): string | null => {
    if (names.lastIndexOf(longhand) > shorthand) return style.getPropertyValue(longhand);
    if (shorthand === -1) return '';
    return none ? reset : null;
  };
  if (cascaded('transition-property', 'none') === 'none') return true;
  const durations = cascaded('transition-duration', '0s');
  const zero = /^[+-]?(0+\.?0*|\.0+)m?s$/;
  return !!durations && durations.split(',').every((d) => zero.test(d.trim()));
}

// Top-level index of each rule that holds a reduced-motion override disabling
// the transition for `selector`, at any depth.
function overrideIndexes(rules: CSSRule[], selector: string): number[] {
  const overrides = (rule: CSSRule): boolean => {
    if (!isGroupingRule(rule)) return false;
    if (rule instanceof CSSMediaRule && isReducedMotion(rule)) {
      return nestedStyleRules(rule, false).some(
        (s) => selectors(s).includes(selector) && disablesTransition(s),
      );
    }
    return Array.from(rule.cssRules).some(overrides);
  };
  return rules.flatMap((r, index) => (overrides(r) ? [index] : []));
}

function overrideComesLast(rules: CSSRule[], selector: string): boolean {
  const base = baseTransitionIndexes(rules, selector);
  const override = overrideIndexes(rules, selector);
  return base.length > 0 && override.length > 0 && Math.max(...override) > Math.max(...base);
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

  // The override has the same specificity as the base rule, so it only wins
  // when it comes later in the sheet. A base rule inside @media, @supports or
  // @container blocks counts at its outermost block's position.
  it('places the reduced-motion override after every base transition rule', () => {
    const rules = parseRules();
    expect(baseTransitionIndexes(rules, selector).length).toBeGreaterThan(0);
    expect(overrideIndexes(rules, selector).length).toBeGreaterThan(0);
    expect(overrideComesLast(rules, selector)).toBe(true);
  });
});

// Prove the order check sees base transitions wherever a rewrite could put
// them. happy-dom drops @layer blocks entirely, so @layer is not covered.
describe('reduced-motion order check', () => {
  const override = '@media (prefers-reduced-motion: reduce) { .x { transition: none; } }';

  it.each([
    ['a top-level rule', '.x { transition: color 1s; }'],
    ['an @media block', '@media (hover: hover) { .x { transition: color 1s; } }'],
    ['an @supports block', '@supports (display: grid) { .x { transition: color 1s; } }'],
    ['an @container block', '@container (min-width: 1px) { .x { transition: color 1s; } }'],
    ['a transition-duration longhand', '.x { transition-duration: 1s; }'],
    ['a transition-property longhand', '.x { transition-property: color; }'],
  ])('orders a base transition in %s against the override', (_, base) => {
    expect(overrideComesLast(parseRules(`${base} ${override}`), '.x')).toBe(true);
    expect(overrideComesLast(parseRules(`${override} ${base}`), '.x')).toBe(false);
  });

  it.each([
    ['transition: none', 'transition: none'],
    ['transition-property: none', 'transition-property: none'],
    ['transition-duration: 0s', 'transition-duration: 0s'],
    ['a zero transition-duration list', 'transition-duration: 0ms, 0s'],
    ['a zero transition-duration after the shorthand', 'transition: color 1s; transition-duration: 0s'],
    ['transition-property: none after the shorthand', 'transition: color 1s; transition-property: none'],
    ['transition: none then a transition-property', 'transition: none; transition-property: color'],
    ['transition: none then a transition-duration', 'transition: none; transition-duration: 1s'],
  ])('recognises an override written as %s', (_, declaration) => {
    const disabled = `@media (prefers-reduced-motion: reduce) { .x { ${declaration}; } }`;
    const base = '.x { transition: color 1s; }';
    expect(overrideComesLast(parseRules(`${base} ${disabled}`), '.x')).toBe(true);
    expect(overrideComesLast(parseRules(`${disabled} ${base}`), '.x')).toBe(false);
  });

  it.each([
    ['a non-zero transition-duration', 'transition-duration: 1s'],
    ['a partly zero transition-duration list', 'transition-duration: 0s, 1s'],
    ['a transition-property other than none', 'transition-property: color'],
    ['only a transition-delay', 'transition-delay: 0s'],
    ['a zero transition-duration before the shorthand', 'transition-duration: 0s; transition: color 1s'],
    ['transition-property: none before the shorthand', 'transition-property: none; transition: color 1s'],
    ['transition: none then a non-zero property and duration', 'transition: none; transition-property: color; transition-duration: 1s'],
  ])('ignores an override that keeps motion with %s', (_, declaration) => {
    const kept = `@media (prefers-reduced-motion: reduce) { .x { ${declaration}; } }`;
    expect(overrideIndexes(parseRules(`.x { transition: color 1s; } ${kept}`), '.x')).toEqual([]);
  });

  // happy-dom flattens nested blocks (`@supports { @media { … } }` parses as an
  // empty @supports followed by the @media), so build nested trees by hand.
  function group<T extends CSSGroupingRule>(
    proto: T,
    conditionText: string,
    children: CSSRule[],
  ): CSSRule {
    return Object.create(proto, {
      conditionText: { value: conditionText },
      cssRules: { value: children },
    });
  }
  const supports = (children: CSSRule[]) =>
    group(CSSSupportsRule.prototype, '(display: grid)', children);
  const media = (condition: string, children: CSSRule[]) =>
    group(CSSMediaRule.prototype, condition, children);
  const base = parseRules('.x { transition-duration: 1s; }')[0]!;
  const none = parseRules('.x { transition: none; }')[0]!;
  const reduced = () => media('(prefers-reduced-motion: reduce)', [none]);

  it('orders a base transition nested two blocks deep against the override', () => {
    const nested = supports([media('(hover: hover)', [media('(min-width: 1px)', [base])])]);
    expect(overrideComesLast([nested, reduced()], '.x')).toBe(true);
    expect(overrideComesLast([reduced(), nested], '.x')).toBe(false);
  });

  it('finds an override nested two blocks deep', () => {
    const nested = supports([media('(min-width: 1px)', [reduced()])]);
    expect(overrideComesLast([base, nested], '.x')).toBe(true);
    expect(overrideComesLast([nested, base], '.x')).toBe(false);
  });

  it('skips a reduced-motion block nested inside another block when finding base rules', () => {
    const nested = supports([media('(min-width: 1px)', [reduced()])]);
    expect(baseTransitionIndexes([nested], '.x')).toEqual([]);
  });
});
