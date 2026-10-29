import {
  DEFAULT_BANNED_KEYWORDS,
  findBannedKeyword,
  isEligibleForAutoApproval,
  parseBannedKeywords,
} from "./job-verification.util";

const baseJob = {
  description: "x".repeat(100),
  salaryMin: 1000,
  categoryCount: 1,
};

describe("isEligibleForAutoApproval", () => {
  it("passes when the employer is verified and all 4 criteria are met", () => {
    expect(isEligibleForAutoApproval(baseJob, true)).toBe(true);
  });

  it("fails when the employer is not verified", () => {
    expect(isEligibleForAutoApproval(baseJob, false)).toBe(false);
  });

  it("fails when the description is too short", () => {
    expect(
      isEligibleForAutoApproval({ ...baseJob, description: "too short" }, true),
    ).toBe(false);
  });

  it("fails when salaryMin is null", () => {
    expect(
      isEligibleForAutoApproval({ ...baseJob, salaryMin: null }, true),
    ).toBe(false);
  });

  it("fails when there are no categories", () => {
    expect(
      isEligibleForAutoApproval({ ...baseJob, categoryCount: 0 }, true),
    ).toBe(false);
  });

  it("fails when the title or description contains a banned keyword (PB44 AC2.1)", () => {
    const banned = ["upfront fee"];
    expect(
      isEligibleForAutoApproval(
        {
          ...baseJob,
          description: `Pay an UPFRONT FEE first. ${baseJob.description}`,
        },
        true,
        banned,
      ),
    ).toBe(false);
    expect(
      isEligibleForAutoApproval(
        { ...baseJob, title: "Upfront fee required" },
        true,
        banned,
      ),
    ).toBe(false);
    expect(isEligibleForAutoApproval(baseJob, true, banned)).toBe(true);
  });
});

describe("parseBannedKeywords", () => {
  it("splits, trims, lowercases and de-duplicates the configured list", () => {
    expect(parseBannedKeywords(" Casino, ,casino,Đa cấp ")).toEqual([
      "casino",
      "đa cấp",
    ]);
  });

  it("uses the default list when unset; an empty value disables the check", () => {
    expect(parseBannedKeywords(undefined)).toEqual(DEFAULT_BANNED_KEYWORDS);
    expect(parseBannedKeywords("")).toEqual([]);
    expect(parseBannedKeywords("   ")).toEqual([]);
  });

  it("default list catches typical scam wording but not ordinary job text", () => {
    const list = parseBannedKeywords(undefined);
    expect(
      findBannedKeyword("Candidates must pay a registration fee first", list),
    ).toBe("registration fee");
    expect(findBannedKeyword("Yêu cầu đặt cọc trước khi nhận việc", list)).toBe(
      "đặt cọc",
    );
    expect(
      findBannedKeyword(
        "Senior React engineer, remote, health insurance and a home-office stipend. Apply with your CV.",
        list,
      ),
    ).toBeNull();
  });
});

describe("findBannedKeyword", () => {
  it("matches whole words only, case-insensitively, including Vietnamese", () => {
    expect(findBannedKeyword("Better pay", ["bet"])).toBeNull();
    expect(findBannedKeyword("Place a BET today", ["bet"])).toBe("bet");
    expect(findBannedKeyword("Kinh doanh Đa Cấp", ["đa cấp"])).toBe("đa cấp");
    expect(findBannedKeyword("nothing here", [])).toBeNull();
  });

  it("treats regex metacharacters in keywords literally", () => {
    expect(findBannedKeyword("earn $$$ fast", ["$$$"])).toBe("$$$");
    expect(findBannedKeyword("a.b", ["a*b"])).toBeNull();
  });
});
