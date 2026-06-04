// Pure geometry for the drag control. Kept out of render.ts so it can be unit
// tested without KAPLAY: the live handler steps the active piece ONE column per
// pointer-move toward the integer column this returns.
//
// The target is the leftmost board column the piece should occupy so it sits
// under the finger. It MUST be an integer compared against the piece's integer
// leftmost column. The original bug compared the finger column against the
// piece's CENTER - (min+max)/2 - which is a half-integer for an even-width piece
// (the O spans two columns, centre x.5). The finger column could then be both
// "greater than" the centre after a left step and "less than" it after a right
// step, so the piece flipped between two columns every move event forever. An
// integer target with a stop-when-equal rule converges instead.

/**
 * The leftmost column an `pieceWidth`-wide piece should occupy to sit under the
 * finger at board column `fingerCol`, clamped to the board. Integer in, integer
 * out - so stepping the piece toward it (and stopping when equal) cannot oscillate.
 */
export function dragTargetLeft(fingerCol: number, pieceWidth: number, cols: number): number {
  const centred = fingerCol - Math.floor((pieceWidth - 1) / 2);
  return Math.max(0, Math.min(cols - pieceWidth, centred));
}
