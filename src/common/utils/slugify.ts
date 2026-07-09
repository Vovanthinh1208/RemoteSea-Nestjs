import { nanoid } from "nanoid";
import { transliterate } from "@/common/utils/transliterate";

// Without transliterating first, slugify stripped every accented letter outright
// (they aren't ASCII \w) instead of reducing them to a base letter — "Hà Nội
// Tech" became "h-ni-tech", silently deleting "à" and "ộ" rather than "a"/"o".
// That's broken for exactly the audience this product serves.
export const slugify = (text: string): string => {
  return transliterate(text)
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/^-+|-+$/g, "");
};

export const withUniqueSuffix = (base: string): string =>
  `${base}-${nanoid(6)}`;

export const uniqueSlug = (text: string): string =>
  withUniqueSuffix(slugify(text));
