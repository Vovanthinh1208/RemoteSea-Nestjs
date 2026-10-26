import { createEmployerProfileSchema } from "./create-employer-profile.dto";
import { updateEmployerProfileSchema } from "./update-employer-profile.dto";
import { createWorkExperienceSchema } from "@/modules/work-experience/dto/create-work-experience.dto";
import { listTalentSearchSchema } from "@/modules/talent/dto/list-talent-search.dto";

// PB30 AC2: every onboarding field is required.
describe("createEmployerProfileSchema (PB30)", () => {
  const valid = {
    companyName: "Acme",
    websiteUrl: "https://acme.com",
    size: "11-50",
    hqCountry: "Singapore",
    description: "Remote-first product studio.",
  };

  it("accepts a complete company profile", () => {
    expect(createEmployerProfileSchema.safeParse(valid).success).toBe(true);
  });

  it.each(["websiteUrl", "size", "hqCountry", "description"])(
    "rejects a profile without %s",
    (field) => {
      const { [field as keyof typeof valid]: _omit, ...rest } = valid;
      expect(createEmployerProfileSchema.safeParse(rest).success).toBe(false);
    },
  );

  it("rejects a blank description and a non-http website", () => {
    expect(
      createEmployerProfileSchema.safeParse({ ...valid, description: "   " })
        .success,
    ).toBe(false);
    expect(
      createEmployerProfileSchema.safeParse({
        ...valid,
        websiteUrl: "javascript:alert(1)",
      }).success,
    ).toBe(false);
  });
});

// PB31 AC2: social links must point at their network; null clears a field.
describe("updateEmployerProfileSchema (PB31)", () => {
  it("accepts LinkedIn/Facebook links on their own domain", () => {
    const r = updateEmployerProfileSchema.safeParse({
      linkedinUrl: "https://www.linkedin.com/company/acme",
      facebookUrl: "https://facebook.com/acme",
      videoUrl: "https://www.youtube.com/watch?v=abc",
      benefits: ["Remote stipend", "Health insurance"],
      hqAddress: "1 Raffles Place",
    });
    expect(r.success).toBe(true);
  });

  it("rejects a LinkedIn field pointing elsewhere", () => {
    expect(
      updateEmployerProfileSchema.safeParse({
        linkedinUrl: "https://evil.example/linkedin.com",
      }).success,
    ).toBe(false);
    expect(
      updateEmployerProfileSchema.safeParse({
        facebookUrl: "https://notfacebook.com/acme",
      }).success,
    ).toBe(false);
  });

  it("accepts null to clear optional settings", () => {
    expect(
      updateEmployerProfileSchema.safeParse({
        linkedinUrl: null,
        videoUrl: null,
        coverImageUrl: null,
        hqAddress: null,
      }).success,
    ).toBe(true);
  });

  it("caps the benefits list", () => {
    expect(
      updateEmployerProfileSchema.safeParse({
        benefits: Array.from({ length: 16 }, (_, i) => `perk ${i}`),
      }).success,
    ).toBe(false);
  });
});

// PB24 RC2: start must be strictly before end.
describe("createWorkExperienceSchema (PB24)", () => {
  const base = { company: "Acme", title: "Engineer" };
  it("rejects equal start and end dates", () => {
    expect(
      createWorkExperienceSchema.safeParse({
        ...base,
        startDate: "2024-03-01",
        endDate: "2024-03-01",
      }).success,
    ).toBe(false);
  });
  it("accepts an end after the start, or no end (current role)", () => {
    expect(
      createWorkExperienceSchema.safeParse({
        ...base,
        startDate: "2024-03-01",
        endDate: "2024-04-01",
      }).success,
    ).toBe(true);
    expect(
      createWorkExperienceSchema.safeParse({ ...base, startDate: "2024-03-01" })
        .success,
    ).toBe(true);
  });
});

// PB29 AC2: maxSalary query parameter.
describe("listTalentSearchSchema maxSalary (PB29)", () => {
  it("coerces a positive integer and rejects junk", () => {
    expect(listTalentSearchSchema.parse({ maxSalary: "1500" }).maxSalary).toBe(
      1500,
    );
    expect(listTalentSearchSchema.safeParse({ maxSalary: "-5" }).success).toBe(
      false,
    );
  });
});
