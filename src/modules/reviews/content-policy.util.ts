// PB71 BR2: a public review may not contain profanity or abusive language.
// The backlog names the rule but no word list, so this is a baseline of
// common English and Vietnamese profanity — extend it here as the product
// owner's moderation policy is defined. Terms are matched as whole words
// (Unicode letters/digits as the word characters), case-insensitively, with
// Vietnamese diacritics kept: stripping them would turn short syllables
// such as "đụ" into "du" and block ordinary words.
export const BLOCKED_REVIEW_TERMS: readonly string[] = [
  // English
  "fuck",
  "fucking",
  "fucked",
  "motherfucker",
  "shit",
  "bullshit",
  "bitch",
  "asshole",
  "bastard",
  "cunt",
  "dickhead",
  "retard",
  // Vietnamese (with and without common abbreviations)
  "địt",
  "đụ",
  "đĩ",
  "lồn",
  "buồi",
  "cặc",
  "đéo",
  "óc chó",
  "đồ chó",
  "chó chết",
  "mẹ mày",
  "đm",
  "đmm",
  "dmm",
  "vcl",
  "vkl",
  "clgt",
  "cmm",
];

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const BLOCKED_PATTERN = new RegExp(
  `(?<![\\p{L}\\p{N}])(?:${BLOCKED_REVIEW_TERMS.map(escapeRegExp).join("|")})(?![\\p{L}\\p{N}])`,
  "iu",
);

/** True when any of the given texts contains a blocked term. */
export const containsBlockedTerm = (
  ...texts: (string | undefined | null)[]
): boolean =>
  texts.some((text) => !!text && BLOCKED_PATTERN.test(text.normalize("NFC")));
