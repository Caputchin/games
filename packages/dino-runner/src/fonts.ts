// Maps a resolved-locale language tag to an ordered list of native CJK UI
// fonts. Identical rationale to leaf-memory's fonts helper: the bundle ships
// no font (iframe CSP allows only `font-src data:`, and a full CJK face is
// too large to base64-inline), so CJK glyphs come from the visitor's OS. The
// base stack in styles.ts covers Latin / Cyrillic / Arabic everywhere; CJK
// needs named native fonts plus locale-correct ordering (Han unification
// draws one codepoint differently per language), paired with the root `lang`
// attribute so the engine picks the right regional glyph.
//
// Returns null for non-CJK locales (the base stack already handles them).
// Every returned stack ends in `sans-serif` so the value is a complete,
// valid font-family tail when substituted into the `--dr-cjk` custom
// property that styles.ts appends to `font-family`.

const SIMPLIFIED =
  '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", "Noto Sans CJK SC", "Source Han Sans SC", sans-serif';
const TRADITIONAL =
  '"PingFang TC", "Microsoft JhengHei", "Noto Sans TC", "Noto Sans CJK TC", "Source Han Sans TC", sans-serif';
const JAPANESE =
  '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", "Meiryo", "Noto Sans JP", "Noto Sans CJK JP", sans-serif';
const KOREAN =
  '"Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", "Noto Sans CJK KR", sans-serif';

// Subtags under `zh` that mark Traditional Chinese (script `Hant`; regions
// Taiwan / Hong Kong / Macau). Everything else under `zh` is Simplified.
const TRADITIONAL_SUBTAGS: ReadonlySet<string> = new Set(['hant', 'tw', 'hk', 'mo']);

/** Native CJK font stack for a locale language tag, or null when the locale
 *  is not CJK. Case-insensitive; accepts `-` or `_` subtag separators. */
export function cjkFontStack(lang: string | null | undefined): string | null {
  if (!lang) return null;
  const parts = lang.toLowerCase().split(/[-_]/).filter(Boolean);
  const primary = parts[0];
  if (!primary) return null;
  switch (primary) {
    case 'zh':
      return parts.slice(1).some((p) => TRADITIONAL_SUBTAGS.has(p)) ? TRADITIONAL : SIMPLIFIED;
    case 'ja':
      return JAPANESE;
    case 'ko':
      return KOREAN;
    default:
      return null;
  }
}
