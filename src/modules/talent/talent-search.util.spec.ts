import { buildTalentSearchWhere } from "./talent-search.util";
import type { ListTalentSearchDto } from "./dto/list-talent-search.dto";

describe("buildTalentSearchWhere", () => {
  const baseQuery: ListTalentSearchDto = { page: 1, limit: 20 };

  it("always requires isOpenToWork, regardless of filters", () => {
    const where = buildTalentSearchWhere(baseQuery, false);
    expect(where).toMatchObject({ isOpenToWork: true });
  });

  it("restricts to PUBLIC-only when the caller isn't a verified employer", () => {
    const where = buildTalentSearchWhere(baseQuery, false);
    expect(where).toMatchObject({ visibility: "PUBLIC" });
  });

  it("includes VERIFIED_EMPLOYERS profiles when the caller is a verified employer", () => {
    const where = buildTalentSearchWhere(baseQuery, true);
    expect(where).toMatchObject({
      visibility: { in: ["PUBLIC", "VERIFIED_EMPLOYERS"] },
    });
  });

  it("omits the AND clause entirely when no optional filter is given", () => {
    const where = buildTalentSearchWhere(baseQuery, false);
    expect(where).not.toHaveProperty("AND");
  });

  it("filters by a single skill the same as multiple", () => {
    const where = buildTalentSearchWhere(
      { ...baseQuery, skills: ["skill-1"] },
      false,
    );
    expect(where).toMatchObject({
      AND: [{ skills: { some: { skillId: { in: ["skill-1"] } } } }],
    });
  });

  it("filters by level", () => {
    const where = buildTalentSearchWhere(
      { ...baseQuery, level: ["SENIOR", "LEAD"] },
      false,
    );
    expect(where).toMatchObject({
      AND: [{ level: { in: ["SENIOR", "LEAD"] } }],
    });
  });

  it("filters by country", () => {
    const where = buildTalentSearchWhere(
      { ...baseQuery, country: ["Vietnam"] },
      false,
    );
    expect(where).toMatchObject({ AND: [{ country: { in: ["Vietnam"] } }] });
  });

  it("filters employmentTypes with hasSome (any overlap), not exact match", () => {
    const where = buildTalentSearchWhere(
      { ...baseQuery, employmentTypes: ["FULL_TIME"] },
      false,
    );
    expect(where).toMatchObject({
      AND: [{ employmentTypes: { hasSome: ["FULL_TIME"] } }],
    });
  });

  it("filters timezoneOverlap with hasSome", () => {
    const where = buildTalentSearchWhere(
      { ...baseQuery, timezoneOverlap: ["SG_HOURS"] },
      false,
    );
    expect(where).toMatchObject({
      AND: [{ timezoneOverlap: { hasSome: ["SG_HOURS"] } }],
    });
  });

  it("filters noticePeriod with in (exact bucket match)", () => {
    const where = buildTalentSearchWhere(
      { ...baseQuery, noticePeriod: ["Immediate", "2 weeks"] },
      false,
    );
    expect(where).toMatchObject({
      AND: [{ noticePeriod: { in: ["Immediate", "2 weeks"] } }],
    });
  });

  it("searches q against headline OR the user's name", () => {
    const where = buildTalentSearchWhere({ ...baseQuery, q: "backend" }, false);
    expect(where).toMatchObject({
      AND: [
        {
          OR: [
            { headline: { contains: "backend", mode: "insensitive" } },
            { user: { name: { contains: "backend", mode: "insensitive" } } },
          ],
        },
      ],
    });
  });
});
