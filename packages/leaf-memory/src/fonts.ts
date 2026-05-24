// Maps a resolved-locale ISO tag to an ordered list of native CJK UI fonts.
//
// Why this exists: the game bundle ships no font. The iframe CSP
// (widget/src/iframe/srcdoc.ts) allows only `font-src data:`, and a full
// CJK font is far too large to base64-inline, so CJK glyphs must come from
// the visitor's own OS. The base stack in styles.ts (`system-ui, ...`)
// already covers Latin / Cyrillic / Arabic everywhere, but CJK needs two
// things the bare generic `sans-serif` fallback can't guarantee:
//
//   1. Named native UI fonts, so a font-poor device cascade lands on the
//      OS's actual CJK face instead of tofu.
//   2. Locale-correct ordering. Han unification means one codepoint draws
//      differently per language (a JP and a zh device share kanji
//      codepoints), so the preferred font must follow the *content* locale,
//      not the device UI locale. Pairing this with the `lang` attribute on
//      the root (game.ts) lets the engine pick the right regional glyph.
//
// Returns null for non-CJK locales (the base stack already handles them).
// Every returned stack ends in `sans-serif` so the value is a complete,
// valid font-family tail when substituted into the `--lm-cjk` custom
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
// Taiwan / Hong Kong / Macau). Everything else under `zh` is treated as
// Simplified, the dominant default.
const TRADITIONAL_SUBTAGS: ReadonlySet<string> = new Set(['hant', 'tw', 'hk', 'mo']);

/** Native CJK font stack for a locale ISO tag, or null when the locale is
 *  not CJK. Case-insensitive; accepts `-` or `_` subtag separators
 *  (`zh-TW`, `zh_Hant`, `ZH`). */
export function cjkFontStack(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const parts = iso.toLowerCase().split(/[-_]/).filter(Boolean);
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
