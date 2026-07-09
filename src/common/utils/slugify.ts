import { nanoid } from "nanoid";

export const slugify = (text: string): string => {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/^-+|-+$/g, "");
};

export const withUniqueSuffix = (base: string): string => `${base}-${nanoid(6)}`;

export const uniqueSlug = (text: string): string => withUniqueSuffix(slugify(text));
