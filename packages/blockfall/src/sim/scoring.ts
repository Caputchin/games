// Line-clear scoring. Standard arcade values; the formula is a mechanic, not
// protected expression. Multi-line clears are worth disproportionately more, to
// reward clearing the wall's slots together.
const LINE_POINTS = [0, 100, 300, 500, 800] as const;

/** Points for clearing `cleared` (0-4) lines. */
export function lineScore(cleared: number): number {
  return LINE_POINTS[Math.max(0, Math.min(4, cleared))] ?? 0;
}
