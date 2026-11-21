// Deterministic token counter.
// Ported from `count_tokens` in nuclear_grade/tokens.py of Nuclear-grade
// Context Engineering (MIT, Copyright (c) 2026 FlyFission;
// https://github.com/FlyFission/nuclear-grade-context-engineering, commit
// 395aa6ed161b773f1cf24abbf85e1c9ff95b969c). License text retained in
// third_party/licenses/FlyFission__nuclear-grade-context-engineering/LICENSE;
// see docs/third-party/register.md.
//
// Text is split into runs the way Python's `[^\W\d_]+|\d+|\s+|[^\s\w]+` splits a
// str: letters, decimal digits, whitespace, and symbols. Characters matched by
// none of these (the underscore) are skipped. Each run costs ceil(length / k)
// tokens: k = 3 when its first character is a digit, 4 for a run of letters
// only, 2 otherwise. Whitespace is free. Lengths count code points, as Python's
// len() does.
//
// Python's classes, written with Unicode properties:
//   \w   letters (L*) and numbers (N*), plus "_"
//   \d   decimal digits (Nd)
//   \s   the characters str.isspace() accepts, listed in SPACE (JS \s differs)
// Python's str.isdigit() is true for Nd and also for the No characters that
// carry a digit value (superscript, subscript and circled digits). Those are
// listed in DIGIT_NO, as ranges printed by Python's unicodedata; the exhaustive
// check in scripts/test/token-count.test.mjs confirms the list.

const SPACE = "\\t-\\r\\x1c-\\x20\\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000";
const SEGMENT = new RegExp(
  `[\\p{L}\\p{Nl}\\p{No}]+|\\p{Nd}+|[${SPACE}]+|[^${SPACE}\\p{L}\\p{N}_]+`,
  "gu",
);
const IS_SPACE = new RegExp(`^[${SPACE}]`, "u");
const IS_ALPHA = /^\p{L}+$/u;
const IS_ND = /^\p{Nd}/u;

// Code point ranges [first, last] of No characters for which Python's
// str.isdigit() is true, as printed by Python 3.13 (Unicode 15.1.0).
const DIGIT_NO = [
  [0xb2, 0xb3], [0xb9, 0xb9], [0x1369, 0x1371], [0x19da, 0x19da], [0x2070, 0x2070],
  [0x2074, 0x2079], [0x2080, 0x2089], [0x2460, 0x2468], [0x2474, 0x247c], [0x2488, 0x2490],
  [0x24ea, 0x24ea], [0x24f5, 0x24fd], [0x24ff, 0x24ff], [0x2776, 0x277e], [0x2780, 0x2788],
  [0x278a, 0x2792], [0x10a40, 0x10a43], [0x10e60, 0x10e68], [0x11052, 0x1105a], [0x1f100, 0x1f10a],
];

function isDigit(char) {
  if (IS_ND.test(char)) return true;
  const cp = char.codePointAt(0);
  return DIGIT_NO.some(([first, last]) => cp >= first && cp <= last);
}

export function countTokens(text) {
  let total = 0;
  for (const [segment] of String(text).matchAll(SEGMENT)) {
    if (IS_SPACE.test(segment)) continue;
    const length = [...segment].length;
    if (isDigit(String.fromCodePoint(segment.codePointAt(0)))) total += Math.ceil(length / 3);
    else if (IS_ALPHA.test(segment)) total += Math.ceil(length / 4);
    else total += Math.ceil(length / 2);
  }
  return total;
}
