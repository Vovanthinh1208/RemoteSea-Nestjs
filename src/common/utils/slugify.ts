import { nanoid } from "nanoid";

export const slugify = (text: string): string => {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/^-+|-+$/g, "");
};

export const uniqueSlug = (text: string): string => {
  return `${slugify(text)}-${nanoid(6)}`;
};
