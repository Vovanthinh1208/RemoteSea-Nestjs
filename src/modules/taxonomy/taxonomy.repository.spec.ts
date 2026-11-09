import { TaxonomyRepository } from "./taxonomy.repository";

describe("PB52 complete skill taxonomy", () => {
  it("returns the full unfiltered taxonomy for canonical tag editors", async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const repository = new TaxonomyRepository({ skill: { findMany } } as never);
    await repository.findSkills();
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: undefined }),
    );
  });

  it("bounds filtered suggestions and keeps case-insensitive search criteria", async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const repository = new TaxonomyRepository({ skill: { findMany } } as never);
    const where = { name: { contains: "react", mode: "insensitive" as const } };
    await repository.findSkills(where);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where, take: 100 }),
    );
  });
});
