import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createBoard, type Card } from '../src/board';
import { createAnnouncer } from '../src/a11y';

function makeAnnouncer() {
  return createAnnouncer(document);
}

function noOpCallbacks() {
  return {
    onMatch: vi.fn(),
    onMismatch: vi.fn(),
    onRoundCleared: vi.fn(),
  };
}

// Deterministic shuffle: return indices in original order so we know
// shuffled[0] === leaves[0], shuffled[1] === leaves[1], etc.
function identityShuffle(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i);
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('createBoard', () => {
  it('renders pairs × 2 cards with grid + gridcell roles', () => {
    const board = createBoard({
      pairs: 3,
      doc: document,
      announcer: makeAnnouncer(),
      callbacks: noOpCallbacks(),
      shuffle: identityShuffle,
    });
    document.body.appendChild(board.element);
    expect(board.element.getAttribute('role')).toBe('grid');
    expect(board.cards).toHaveLength(6);
    for (const card of board.cards) {
      expect(card.cell.getAttribute('role')).toBe('gridcell');
      expect(card.cell.getAttribute('aria-pressed')).toBe('false');
    }
  });

  it('throws when pairs exceeds distinct leaves available', () => {
    expect(() =>
      createBoard({
        pairs: 999,
        doc: document,
        announcer: makeAnnouncer(),
        callbacks: noOpCallbacks(),
        shuffle: identityShuffle,
      }),
    ).toThrow(/distinct leaves/);
  });

  it('flipping a single card sets aria-pressed=true and busy=false', () => {
    const cb = noOpCallbacks();
    const board = createBoard({
      pairs: 3,
      doc: document,
      announcer: makeAnnouncer(),
      callbacks: cb,
      shuffle: identityShuffle,
    });
    document.body.appendChild(board.element);

    (board.cards[0] as Card).cell.click();
    expect(board.cards[0]?.cell.getAttribute('aria-pressed')).toBe('true');
    expect(cb.onMatch).not.toHaveBeenCalled();
    expect(cb.onMismatch).not.toHaveBeenCalled();
  });

  it('matching two cards leaves both flipped + matched + disabled', () => {
    const cb = noOpCallbacks();
    // identityShuffle preserves [leaf0, leaf1, leaf2, leaf0, leaf1, leaf2].
    // So cards[0] and cards[3] share a leaf.
    const board = createBoard({
      pairs: 3,
      doc: document,
      announcer: makeAnnouncer(),
      callbacks: cb,
      shuffle: identityShuffle,
    });
    document.body.appendChild(board.element);

    (board.cards[0] as Card).cell.click();
    (board.cards[3] as Card).cell.click();

    expect(board.cards[0]?.matched).toBe(true);
    expect(board.cards[3]?.matched).toBe(true);
    expect(board.cards[0]?.cell.disabled).toBe(true);
    expect(board.cards[3]?.cell.disabled).toBe(true);
    expect(cb.onMatch).toHaveBeenCalledOnce();
    expect(cb.onRoundCleared).not.toHaveBeenCalled();
  });

  it('mismatch triggers onMismatch and flips back after delay', () => {
    vi.useFakeTimers();
    const cb = noOpCallbacks();
    const board = createBoard({
      pairs: 3,
      doc: document,
      announcer: makeAnnouncer(),
      callbacks: cb,
      shuffle: identityShuffle,
      flipBackDelayMs: 600,
    });
    document.body.appendChild(board.element);

    // cards[0] (leaf0) and cards[1] (leaf1) are a mismatch.
    (board.cards[0] as Card).cell.click();
    (board.cards[1] as Card).cell.click();

    expect(cb.onMismatch).toHaveBeenCalledOnce();
    expect(board.cards[0]?.flipped).toBe(true);
    expect(board.cards[1]?.flipped).toBe(true);

    vi.advanceTimersByTime(600);

    expect(board.cards[0]?.flipped).toBe(false);
    expect(board.cards[1]?.flipped).toBe(false);
    expect(board.cards[0]?.matched).toBe(false);
    expect(board.cards[1]?.matched).toBe(false);
    vi.useRealTimers();
  });

  it('round-cleared fires when every pair matched', () => {
    const cb = noOpCallbacks();
    const board = createBoard({
      pairs: 3,
      doc: document,
      announcer: makeAnnouncer(),
      callbacks: cb,
      shuffle: identityShuffle,
    });
    document.body.appendChild(board.element);

    // leaf0: cards 0+3
    (board.cards[0] as Card).cell.click();
    (board.cards[3] as Card).cell.click();
    // leaf1: cards 1+4
    (board.cards[1] as Card).cell.click();
    (board.cards[4] as Card).cell.click();
    // leaf2: cards 2+5
    (board.cards[2] as Card).cell.click();
    (board.cards[5] as Card).cell.click();

    expect(cb.onRoundCleared).toHaveBeenCalledOnce();
    expect(board.matches).toBe(3);
    expect(board.pairsRemaining).toBe(0);
  });

  it('arrow keys move focus across cells', () => {
    const board = createBoard({
      pairs: 3,
      doc: document,
      announcer: makeAnnouncer(),
      callbacks: noOpCallbacks(),
      shuffle: identityShuffle,
    });
    document.body.appendChild(board.element);

    (board.cards[0] as Card).cell.focus();
    expect(document.activeElement).toBe(board.cards[0]?.cell);

    const event = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true });
    (board.cards[0] as Card).cell.dispatchEvent(event);

    expect(document.activeElement).toBe(board.cards[1]?.cell);
  });

  it('destroy cancels pending flip-back', () => {
    vi.useFakeTimers();
    const cb = noOpCallbacks();
    const board = createBoard({
      pairs: 3,
      doc: document,
      announcer: makeAnnouncer(),
      callbacks: cb,
      shuffle: identityShuffle,
      flipBackDelayMs: 600,
    });
    document.body.appendChild(board.element);

    (board.cards[0] as Card).cell.click();
    (board.cards[1] as Card).cell.click();

    board.destroy();
    vi.advanceTimersByTime(600);

    // cells were left in their flipped state; no errors thrown.
    expect(board.cards[0]?.flipped).toBe(true);
    vi.useRealTimers();
  });
});
