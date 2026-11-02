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

// Media features are case-insensitive and happy-dom keeps the author's case.
function isReducedMotion(rule: CSSMediaRule): boolean {
  return /prefers-reduced-motion:\s*reduce/i.test(rule.conditionText);
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

// A rule sets a transition through the shorthand or any `transition-*`
// longhand; the shorthand reads '' when only longhands are set.
function setsTransition(rule: CSSStyleRule): boolean {
  if (rule.style.getPropertyValue('transition') !== '') return true;
  return Array.from({ length: rule.style.length }, (_, i) => rule.style.item(i)).some(
    (name) => name.startsWith('transition-') && rule.style.getPropertyValue(name) !== '',
  );
}

// A base rule marks a transition shorthand or longhand !important. Any one
// counts, which can only make the order check stricter.
function importantTransition(rule: CSSStyleRule): boolean {
  return Array.from({ length: rule.style.length }, (_, i) => rule.style.item(i)).some(
    (name) =>
      (name === 'transition' || name.startsWith('transition-')) &&
      rule.style.getPropertyPriority(name) === 'important',
  );
}

// A matching style rule's position, as its index in each enclosing rule list
// from the top level down, and whether it is !important.
interface Match {
  path: number[];
  important: boolean;
}

// Every style rule under `rules`, at any depth, with its path. Reduced-motion
// blocks are skipped or entered only, per `reducedMotion`.
function positionedStyleRules(
  rules: CSSRule[],
  reducedMotion: 'skip' | 'only',
  inReducedMotion = false,
  path: number[] = [],
): { rule: CSSStyleRule; path: number[] }[] {
  return rules.flatMap((rule, index) => {
    const at = [...path, index];
    if (rule instanceof CSSStyleRule) {
      return inReducedMotion === (reducedMotion === 'only') ? [{ rule, path: at }] : [];
    }
    if (!isGroupingRule(rule)) return [];
    const reduced = rule instanceof CSSMediaRule && isReducedMotion(rule);
    if (reduced && reducedMotion === 'skip') return [];
    return positionedStyleRules(
      Array.from(rule.cssRules),
      reducedMotion,
      inReducedMotion || reduced,
      at,
    );
  });
}

// Each base transition for `selector`, however deeply it is nested outside a
// reduced-motion block.
function baseTransitions(rules: CSSRule[], selector: string): Match[] {
  return positionedStyleRules(rules, 'skip')
    .filter(({ rule }) => selectors(rule).includes(selector) && setsTransition(rule))
    .map(({ rule, path }) => ({ path, important: importantTransition(rule) }));
}

function baseTransitionIndexes(rules: CSSRule[], selector: string): number[] {
  return baseTransitions(rules, selector).map((m) => m.path[0]!);
}

// Split on whitespace or commas outside parentheses, so `cubic-bezier(0, 0, 1, 1)`
// and `steps(4, end)` stay one token.
function splitOutsideParens(value: string, separator: RegExp): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of value) {
    if (char === '(') depth++;
    if (char === ')') depth--;
    if (depth === 0 && separator.test(char)) {
      parts.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  return [...parts, current].map((p) => p.trim()).filter((p) => p !== '');
}

const TIME = /^[+-]?(\d+\.?\d*|\.\d+)m?s$/;
const NOT_PROPERTY = new Set([
  'ease',
  'ease-in',
  'ease-out',
  'ease-in-out',
  'linear',
  'step-start',
  'step-end',
  'normal',
  'allow-discrete',
]);

// The transition-property and transition-duration lists a `transition`
// shorthand sets. happy-dom keeps the shorthand as written without expanding
// it, so expand by hand: per item the property is its one token that is not a
// time, timing function or behavior (default `all`) and the duration is its
// first time (default 0s). A CSS-wide keyword (`inherit` and the like) or a
// function other than a timing function (`var()`, `calc()`) could be anything,
// so it returns null and counts as keeping motion.
function shorthandLonghands(shorthand: string): Record<string, string> | null {
  if (/^(inherit|initial|unset|revert|revert-layer)$/.test(shorthand.trim())) return null;
  const items = splitOutsideParens(shorthand, /,/).map((item) => splitOutsideParens(item, /\s/));
  const opaque = (t: string) => t.includes('(') && !/^(cubic-bezier|steps|linear)\(/.test(t);
  if (items.flat().some(opaque)) return null;
  const expanded = items.map((tokens) => ({
    property:
      tokens.find((t) => !TIME.test(t) && !t.includes('(') && !NOT_PROPERTY.has(t)) ?? 'all',
    duration: tokens.find((t) => TIME.test(t)) ?? '0s',
  }));
  return {
    'transition-property': expanded.map((i) => i.property).join(', '),
    'transition-duration': expanded.map((i) => i.duration).join(', '),
  };
}

// A rule turns motion off with `transition-property: none` or a zero
// `transition-duration` for every listed transition, set directly or through
// the shorthand (`transition: none`, `transition: all 0s`). happy-dom keeps
// the shorthand and each longhand as written instead of cascading them, so
// cascade by hand: a longhand counts only when it beats the shorthand (it is
// !important and the shorthand is not, or both match and it comes later),
// else the shorthand's expansion counts. happy-dom keeps a repeated property
// at its first position, so a rule that declares the same transition property
// twice is out of scope. Returns null when motion stays on, else whether a
// declaration that turns it off is !important: when both the property and the
// duration turn it off, the stronger one decides. Keywords and units are
// case-insensitive and happy-dom keeps the author's case, so values are
// lowercased first.
function disabling(rule: CSSStyleRule): { important: boolean } | null {
  const style = rule.style;
  const value = (name: string) => style.getPropertyValue(name).toLowerCase();
  const names = Array.from({ length: style.length }, (_, i) => style.item(i));
  const rank = (name: string): number => {
    const index = names.lastIndexOf(name);
    return index !== -1 && style.getPropertyPriority(name) === 'important'
      ? index + names.length
      : index;
  };
  const shorthand = rank('transition');
  const expanded = shorthandLonghands(value('transition'));
  const declared = (name: string, declaredValue = value(name)) => ({
    value: declaredValue,
    important: style.getPropertyPriority(name) === 'important',
  });
  const cascaded = (longhand: string) => {
    if (rank(longhand) > shorthand) return declared(longhand);
    if (shorthand === -1) return { value: '', important: false };
    return expanded ? declared('transition', expanded[longhand]) : null;
  };
  const property = cascaded('transition-property');
  const durations = cascaded('transition-duration');
  const zero = /^[+-]?(0+\.?0*|\.0+)m?s$/;
  const off = [
    property?.value === 'none' ? property : null,
    durations?.value && durations.value.split(',').every((d) => zero.test(d.trim()))
      ? durations
      : null,
  ].filter((d) => d !== null);
  return off.length > 0 ? { important: off.some((d) => d.important) } : null;
}

function disablesTransition(rule: CSSStyleRule): boolean {
  return disabling(rule) !== null;
}

// Each reduced-motion override disabling the transition for `selector`, at
// any depth.
function overrides(rules: CSSRule[], selector: string): Match[] {
  return positionedStyleRules(rules, 'only')
    .filter(({ rule }) => selectors(rule).includes(selector) && disablesTransition(rule))
    .map(({ rule, path }) => ({ path, important: disabling(rule)!.important }));
}

function overrideIndexes(rules: CSSRule[], selector: string): number[] {
  return overrides(rules, selector).map((m) => m.path[0]!);
}

// Paths of two style rules in one sheet order them by sheet position: the
// first differing index decides, since neither rule can enclose the other.
function comesAfter(a: number[], b: number[]): boolean {
  const i = a.findIndex((index, depth) => index !== b[depth]);
  return i !== -1 && a[i]! > b[i]!;
}

// Every base transition needs an override that beats it: an !important
// override beats a normal base wherever it sits, a normal override never beats
// an !important base, and otherwise the later rule wins.
function overrideComesLast(rules: CSSRule[], selector: string): boolean {
  const base = baseTransitions(rules, selector);
  const override = overrides(rules, selector);
  const beats = (o: Match, b: Match): boolean =>
    o.important !== b.important ? o.important : comesAfter(o.path, b.path);
  return (
    base.length > 0 &&
    override.length > 0 &&
    base.every((b) => override.some((o) => beats(o, b)))
  );
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
  // when it comes later in the sheet, at any nesting depth.
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

  it('recognises an override under an uppercase media condition', () => {
    const upper = '@media (PREFERS-REDUCED-MOTION: REDUCE) { .x { transition: none; } }';
    const base = '.x { transition: color 1s; }';
    expect(overrideComesLast(parseRules(`${base} ${upper}`), '.x')).toBe(true);
    expect(overrideComesLast(parseRules(`${upper} ${base}`), '.x')).toBe(false);
  });

  it.each([
    ['transition: none', 'transition: none'],
    ['transition-property: none', 'transition-property: none'],
    ['transition-duration: 0s', 'transition-duration: 0s'],
    ['a zero transition-duration list', 'transition-duration: 0ms, 0s'],
    ['uppercase transition: NONE', 'transition: NONE'],
    ['uppercase transition-property: NONE', 'transition-property: NONE'],
    ['uppercase transition-duration units', 'transition-duration: 0S, 0MS'],
    ['a zero transition-duration after the shorthand', 'transition: color 1s; transition-duration: 0s'],
    ['transition-property: none after the shorthand', 'transition: color 1s; transition-property: none'],
    ['transition: none then a transition-property', 'transition: none; transition-property: color'],
    ['transition: none then a transition-duration', 'transition: none; transition-duration: 1s'],
    ['a zero-duration shorthand', 'transition: 0s'],
    ['transition: all 0s', 'transition: all 0s'],
    ['transition: none 0s', 'transition: none 0s'],
    ['a shorthand with no duration', 'transition: color'],
    ['a zero-duration shorthand with a delay', 'transition: color 0s ease-out 1s'],
    [
      'a zero-duration shorthand list',
      'transition: color 0s cubic-bezier(0, 0, 1, 1), opacity 0ms steps(4, end)',
    ],
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
    ['an uppercase non-zero transition-duration', 'transition-duration: 1S'],
    ['only a transition-delay', 'transition-delay: 0s'],
    ['a zero transition-duration before the shorthand', 'transition-duration: 0s; transition: color 1s'],
    ['transition-property: none before the shorthand', 'transition-property: none; transition: color 1s'],
    ['transition: none then a non-zero property and duration', 'transition: none; transition-property: color; transition-duration: 1s'],
    [
      'a zero transition-duration after an important shorthand',
      'transition: color 1s !important; transition-duration: 0s',
    ],
    ['a partly zero shorthand list', 'transition: color 1s, opacity 0s'],
    ['a shorthand whose zero time is the delay', 'transition: 1s 0s'],
    [
      'a non-zero transition-duration after a zero shorthand',
      'transition: all 0s; transition-duration: 1s',
    ],
    ['a CSS-wide keyword shorthand', 'transition: inherit'],
    ['an uppercase non-zero shorthand', 'transition: COLOR 1S'],
    ['an uppercase shorthand whose zero time is the delay', 'transition: 1S 0S'],
    ['a custom-property shorthand', 'transition: var(--motion)'],
    ['a custom-property duration', 'transition: color var(--duration)'],
    ['a calc() duration', 'transition: color calc(0s + 1s)'],
  ])('ignores an override that keeps motion with %s', (_, declaration) => {
    const kept = `@media (prefers-reduced-motion: reduce) { .x { ${declaration}; } }`;
    expect(overrideIndexes(parseRules(`.x { transition: color 1s; } ${kept}`), '.x')).toEqual([]);
  });

  it('weighs !important between the base transition and the override', () => {
    const base = '.x { transition: color 1s; }';
    const importantBase = '.x { transition: color 1s !important; }';
    const reduced = (declaration: string) =>
      `@media (prefers-reduced-motion: reduce) { .x { ${declaration}; } }`;
    const normal = reduced('transition: none');
    const important = reduced('transition: none !important');
    expect(overrideComesLast(parseRules(`${importantBase} ${normal}`), '.x')).toBe(false);
    expect(overrideComesLast(parseRules(`${importantBase} ${important}`), '.x')).toBe(true);
    expect(overrideComesLast(parseRules(`${important} ${importantBase}`), '.x')).toBe(false);
    expect(overrideComesLast(parseRules(`${important} ${base}`), '.x')).toBe(true);
    const longhand = reduced('transition-duration: 0s !important; transition: color 1s');
    expect(overrideComesLast(parseRules(`${base} ${longhand}`), '.x')).toBe(true);
    const delay = reduced('transition: none; transition-delay: 0s !important');
    expect(overrideComesLast(parseRules(`${importantBase} ${delay}`), '.x')).toBe(false);
    expect(overrideComesLast(parseRules(`${delay} ${base}`), '.x')).toBe(false);
    expect(overrideComesLast(parseRules(`${base} ${importantBase} ${important}`), '.x')).toBe(true);
    expect(overrideComesLast(parseRules(`${importantBase} ${normal} ${base} ${normal}`), '.x')).toBe(
      false,
    );
  });

  // Both longhands turn motion off and only one is !important: that one still
  // beats an !important base, so the override wins.
  it('takes the stronger priority when the property and the duration both disable', () => {
    const importantBase = '.x { transition: color 1s !important; }';
    const reduced = (declaration: string) =>
      `@media (prefers-reduced-motion: reduce) { .x { ${declaration}; } }`;
    const duration = reduced('transition-property: none; transition-duration: 0s !important');
    expect(overrideComesLast(parseRules(`${importantBase} ${duration}`), '.x')).toBe(true);
    const property = reduced('transition-property: none !important; transition-duration: 0s');
    expect(overrideComesLast(parseRules(`${importantBase} ${property}`), '.x')).toBe(true);
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

  it('orders a base transition and the override inside the same block', () => {
    expect(overrideComesLast([supports([base, reduced()])], '.x')).toBe(true);
    expect(overrideComesLast([supports([reduced(), base])], '.x')).toBe(false);
    const deep = (children: CSSRule[]) => supports([media('(min-width: 1px)', children)]);
    expect(overrideComesLast([deep([base, reduced()])], '.x')).toBe(true);
    expect(overrideComesLast([deep([reduced(), base])], '.x')).toBe(false);
    expect(overrideComesLast([supports([base, media('(min-width: 1px)', [reduced()])])], '.x')).toBe(
      true,
    );
    expect(overrideComesLast([supports([media('(min-width: 1px)', [reduced()]), base])], '.x')).toBe(
      false,
    );
  });

  it('skips a reduced-motion block nested inside another block when finding base rules', () => {
    const nested = supports([media('(min-width: 1px)', [reduced()])]);
    expect(baseTransitionIndexes([nested], '.x')).toEqual([]);
  });
});
