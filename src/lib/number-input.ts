/**
 * Number fields show thousands separators while typing (3,000,000) but forms keep
 * the plain value ("3000000"). Pure helpers used by the shared Input component.
 */

/** Plain value from what the person typed: digits and, when allowed, one decimal point. */
export function parseNumberInput(text: string, allowDecimal: boolean): string {
  let out = "";
  let seenDot = false;
  for (const ch of text) {
    if (ch >= "0" && ch <= "9") out += ch;
    else if (ch === "." && allowDecimal && !seenDot) {
      seenDot = true;
      out += ch;
    }
  }
  return out;
}

/** Display form of a plain value: commas in the whole part, decimals as typed. */
export function formatNumberInput(raw: string): string {
  if (!raw) return "";
  const [whole = "", ...rest] = raw.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return rest.length ? `${grouped}.${rest.join("")}` : grouped;
}

/**
 * Where the caret belongs in the formatted text: after the same number of digits
 * (and decimal point) that were before it in what was typed, so commas appearing
 * or disappearing never move it.
 */
export function caretAfterFormat(typed: string, caret: number, formatted: string, allowDecimal: boolean): number {
  const meaningful = parseNumberInput(typed.slice(0, caret), allowDecimal).length;
  if (meaningful === 0) return 0;
  let seen = 0;
  for (let i = 0; i < formatted.length; i++) {
    if (formatted[i] !== ",") seen++;
    if (seen === meaningful) return i + 1;
  }
  return formatted.length;
}
