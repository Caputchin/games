// Board rendering + flip mechanics + keyboard navigation.
// Owns the grid DOM and the per-cell state. Knows nothing about scoring
// or the bridge; game.ts wires those.

import { LEAF_IDS, type LeafId } from './leaves.js';
import type { Announcer } from './a11y.js';
import type { Strings } from './strings.js';

export interface Card {
  index: number;
  leaf: LeafId;
  flipped: boolean;
  matched: boolean;
  cell: HTMLButtonElement;
}

export interface BoardCallbacks {
  onMatch(): void;
  onMismatch(): void;
  onRoundCleared(): void;
}

export interface BoardOptions {
  pairs: number;
  cols: number;
  doc: Document;
  announcer: Announcer;
  /** Localized strings + direction. Pass-through from game.ts so the
   *  announcer, aria-labels, and any future board copy share one locale.
   *  Optional so tests that don't care about locale can omit it; we fall
   *  back to hardcoded English internally. */
  strings?: Strings;
  /** Inline-SVG markup per leaf id. Already decoded by game.ts from skin
   *  data URIs (customer override) or the bundled defaults. Optional so
   *  legacy tests can omit it; we fall back to the bundled defaults. */
  leafSvgs?: Readonly<Record<LeafId, string>>;
  callbacks: BoardCallbacks;
  shuffle?: (n: number) => number[];
  flipBackDelayMs?: number;
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
}

export interface Board {
  element: HTMLElement;
  cards: Card[];
  pairsRemaining: number;
  matches: number;
  mismatches: number;
  destroy(): void;
}

const DEFAULT_FLIP_BACK_MS = 600;

function defaultShuffle(n: number): number[] {
  const arr = Array.from({ length: n }, (_, i) => i);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const ai = arr[i] as number;
    const aj = arr[j] as number;
    arr[i] = aj;
    arr[j] = ai;
  }
  return arr;
}

export function createBoard(opts: BoardOptions): Board {
  const {
    pairs,
    cols,
    doc,
    announcer,
    callbacks,
    strings,
    leafSvgs,
    shuffle = defaultShuffle,
    flipBackDelayMs = DEFAULT_FLIP_BACK_MS,
    setTimeoutFn = setTimeout,
    clearTimeoutFn = clearTimeout,
  } = opts;

  // Defensive default: when no leaf map is passed (legacy tests), render
  // each card with an empty front. game.ts always passes a real map in
  // production via `resolveLeafSvgs(ctx.skin)`.
  const leafFor = (id: LeafId): string => leafSvgs?.[id] ?? '';

  // Each board-side string falls back to hardcoded English when no
  // strings helper is provided (legacy tests, defensive default).
  function tBoard(key: 'announceRoundPassed' | 'announceMatch' | 'announceNoMatch' | 'ariaCard' | 'ariaBoard', vars?: Record<string, string | number>): string {
    if (strings) return strings.t(key, vars);
    const fallback: Record<string, string> = {
      announceRoundPassed: 'Round passed',
      announceMatch: 'Match',
      announceNoMatch: 'No match',
      ariaCard: 'Card {index}',
      ariaBoard: 'Memory board',
    };
    const raw = fallback[key] ?? '';
    if (!vars) return raw;
    return raw.replace(/\{(\w+)\}/g, (_, name) => {
      const v = vars[name];
      return v === undefined ? `{${name}}` : String(v);
    });
  }

  if (pairs > LEAF_IDS.length) {
    throw new Error(
      `leaf-memory: requested ${pairs} pairs but only ${LEAF_IDS.length} distinct leaves available`,
    );
  }

  const root = doc.createElement('div');
  root.className = 'lm-grid';
  root.style.gridTemplateColumns = `repeat(${cols}, max-content)`;
  root.setAttribute('role', 'grid');
  root.setAttribute('aria-label', tBoard('ariaBoard'));

  const leaves = LEAF_IDS.slice(0, pairs);
  const deck: LeafId[] = [...leaves, ...leaves];
  const order = shuffle(deck.length);
  const shuffled = order.map((i) => deck[i] as LeafId);

  let flipBackTimer: ReturnType<typeof setTimeout> | null = null;
  let firstPick: Card | null = null;
  let busy = false;
  let matches = 0;
  let mismatches = 0;
  let destroyed = false;

  const cards: Card[] = shuffled.map((leaf, index) => {
    const cell = doc.createElement('button');
    cell.type = 'button';
    cell.className = 'lm-cell';
    cell.setAttribute('role', 'gridcell');
    cell.setAttribute('aria-label', tBoard('ariaCard', { index: index + 1 }));
    cell.setAttribute('aria-pressed', 'false');
    cell.dataset['flipped'] = 'false';
    cell.dataset['matched'] = 'false';
    cell.dataset['index'] = String(index);
    cell.innerHTML = `
      <span class="lm-face lm-back" aria-hidden="true">?</span>
      <span class="lm-face lm-front" aria-hidden="true">${leafFor(leaf)}</span>
    `;
    root.appendChild(cell);
    return { index, leaf, flipped: false, matched: false, cell };
  });

  function setFlipped(card: Card, value: boolean): void {
    card.flipped = value;
    card.cell.dataset['flipped'] = String(value);
    card.cell.setAttribute('aria-pressed', String(value));
  }

  function setMatched(card: Card): void {
    card.matched = true;
    card.cell.dataset['matched'] = 'true';
    card.cell.disabled = true;
  }

  function flipBackBoth(a: Card, b: Card): void {
    setFlipped(a, false);
    setFlipped(b, false);
    firstPick = null;
    busy = false;
  }

  function pick(card: Card): void {
    if (destroyed) return;
    if (busy || card.flipped || card.matched) return;

    setFlipped(card, true);

    if (!firstPick) {
      firstPick = card;
      return;
    }

    busy = true;

    if (firstPick.leaf === card.leaf) {
      setMatched(firstPick);
      setMatched(card);
      matches += 1;
      const cleared = matches === pairs;
      firstPick = null;
      busy = false;
      announcer.say(cleared ? tBoard('announceRoundPassed') : tBoard('announceMatch'));
      if (cleared) {
        callbacks.onRoundCleared();
      } else {
        callbacks.onMatch();
      }
    } else {
      mismatches += 1;
      announcer.say(tBoard('announceNoMatch'));
      callbacks.onMismatch();
      const a = firstPick;
      const b = card;
      flipBackTimer = setTimeoutFn(() => {
        if (destroyed) return;
        flipBackBoth(a, b);
      }, flipBackDelayMs);
    }
  }

  function focusNeighbor(from: number, delta: number): void {
    const next = (from + delta + cards.length) % cards.length;
    cards[next]?.cell.focus();
  }

  function onKeyDown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    const indexStr = target?.dataset?.['index'];
    if (!indexStr) return;
    const index = Number(indexStr);
    switch (event.key) {
      case 'ArrowRight':
        event.preventDefault();
        focusNeighbor(index, 1);
        break;
      case 'ArrowLeft':
        event.preventDefault();
        focusNeighbor(index, -1);
        break;
      case 'ArrowDown':
        event.preventDefault();
        focusNeighbor(index, cols);
        break;
      case 'ArrowUp':
        event.preventDefault();
        focusNeighbor(index, -cols);
        break;
      default:
        break;
    }
  }

  function onClick(event: MouseEvent): void {
    const target = (event.target as HTMLElement | null)?.closest(
      'button.lm-cell',
    ) as HTMLButtonElement | null;
    if (!target) return;
    const idx = Number(target.dataset['index']);
    const card = cards[idx];
    if (card) pick(card);
  }

  root.addEventListener('click', onClick);
  root.addEventListener('keydown', onKeyDown);

  const board: Board = {
    element: root,
    cards,
    get pairsRemaining(): number {
      return pairs - matches;
    },
    get matches(): number {
      return matches;
    },
    get mismatches(): number {
      return mismatches;
    },
    destroy(): void {
      destroyed = true;
      if (flipBackTimer !== null) {
        clearTimeoutFn(flipBackTimer);
        flipBackTimer = null;
      }
      root.removeEventListener('click', onClick);
      root.removeEventListener('keydown', onKeyDown);
    },
  };

  return board;
}

export function revealAll(board: Board): void {
  for (const card of board.cards) {
    card.flipped = true;
    card.cell.dataset['flipped'] = 'true';
    card.cell.setAttribute('aria-pressed', 'true');
  }
}

export function coverAll(board: Board): void {
  for (const card of board.cards) {
    if (card.matched) continue;
    card.flipped = false;
    card.cell.dataset['flipped'] = 'false';
    card.cell.setAttribute('aria-pressed', 'false');
  }
}
