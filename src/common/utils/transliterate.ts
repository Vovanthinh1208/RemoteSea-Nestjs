// Vietnamese đ/Đ don't decompose via NFD (Unicode treats them as their own base
// letter, not "d" + a diacritic), so they need an explicit swap before the NFD
// step below — every other Vietnamese diacritic (à, ạ, ộ, ...) does decompose.
const swapDStroke = (text: string): string =>
  text.replace(/đ/g, "d").replace(/Đ/g, "D");

// Combining diacritical marks block (U+0300–U+036F) — what NFD decomposition
// produces for an accented letter like "à" (-> "a" + U+0300).
const COMBINING_MARKS = /[̀-ͯ]/g;

/**
 * Reduces accented Latin text (Vietnamese especially) to its closest plain-ASCII
 * form — "Hà Nội" -> "Ha Noi" — instead of deleting the accented letters outright,
 * which is what a bare `[^\w]` strip does to precomposed characters like "à".
 * Non-Latin scripts (CJK, etc.) still reduce to nothing; callers that need a
 * guaranteed-non-empty result must handle that case themselves.
 */
export const transliterate = (text: string): string =>
  swapDStroke(text).normalize("NFD").replace(COMBINING_MARKS, "");
