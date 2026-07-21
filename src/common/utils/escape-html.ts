const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/**
 * Escapes the 5 characters that matter for safely interpolating a plain-text
 * value into an HTML string. Used by EmailService, whose templates are hand-
 * built strings (not a templating engine that escapes by default) — user-
 * controlled values (a talent's name, a job title) go straight into HTML sent
 * to a *different* user (an employer, an applicant), so an unescaped `<img
 * src=x onerror=...>` in one person's name would run in whatever renders the
 * other person's inbox.
 */
export const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
