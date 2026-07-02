/** Request/response example payloads for the Taxonomy module's Swagger docs. */

export const ListCategoriesResponseExample = [
  { id: "clcat1a2b3c4d5e6f7g8h9i0", name: "Engineering", slug: "engineering", icon: "code" },
  { id: "clcat2a2b3c4d5e6f7g8h9i0", name: "Design", slug: "design", icon: "palette" },
];

export const ListSkillsResponseExample = [
  { id: "clskl1a2b3c4d5e6f7g8h9i0", name: "TypeScript", slug: "typescript" },
  { id: "clskl2a2b3c4d5e6f7g8h9i0", name: "Python", slug: "python" },
];

export const TaxonomyValidationErrorExample = {
  error: { formErrors: [], fieldErrors: { q: ["Expected string, received number"] } },
};
