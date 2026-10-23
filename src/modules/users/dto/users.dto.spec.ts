import { deleteAccountSchema } from "./delete-account.dto";
import { updateAccountSchema } from "./update-account.dto";
import { updateNotificationPreferencesSchema } from "./update-notification-preferences.dto";
import { updateUserSchema } from "./update-user.dto";

describe("PB13 display-name validation", () => {
  it("accepts trimmed names at the 2 and 100 character boundaries", () => {
    expect(updateUserSchema.safeParse({ name: " AB " }).data).toEqual({
      name: "AB",
    });
    expect(updateUserSchema.safeParse({ name: "N".repeat(100) }).success).toBe(
      true,
    );
  });

  it.each(["", " ", "A", "N".repeat(101), "<script>alert(1)</script>"])(
    "rejects an invalid display name: %s",
    (name) => {
      expect(updateUserSchema.safeParse({ name }).success).toBe(false);
    },
  );
});

describe("PB14 account-profile validation", () => {
  it("accepts E.164 phone values and clears a phone with an empty string", () => {
    expect(
      updateAccountSchema.safeParse({ phone: "+84901234567" }).success,
    ).toBe(true);
    expect(updateAccountSchema.safeParse({ phone: "  " }).data).toEqual({
      phone: null,
    });
  });

  it.each(["0901234567", "+0123456", "+8490123456789012"])(
    "rejects a non-E.164 phone value: %s",
    (phone) => {
      expect(updateAccountSchema.safeParse({ phone }).success).toBe(false);
    },
  );

  it("rejects an empty patch and unsupported account preference enums", () => {
    expect(updateAccountSchema.safeParse({}).success).toBe(false);
    expect(updateAccountSchema.safeParse({ language: "French" }).success).toBe(
      false,
    );
  });
});

describe("PB15 notification-preference validation", () => {
  it("accepts explicit boolean preferences", () => {
    expect(
      updateNotificationPreferencesSchema.safeParse({
        applicationUpdates: false,
        productNews: true,
      }).success,
    ).toBe(true);
  });

  it("rejects empty updates and non-boolean values", () => {
    expect(updateNotificationPreferencesSchema.safeParse({}).success).toBe(
      false,
    );
    expect(
      updateNotificationPreferencesSchema.safeParse({ weeklyDigest: "false" })
        .success,
    ).toBe(false);
  });
});

describe("PB20 account-deletion confirmation validation", () => {
  it("requires the exact DELETE confirmation string", () => {
    expect(
      deleteAccountSchema.safeParse({ confirmation: "DELETE" }).success,
    ).toBe(true);
    expect(
      deleteAccountSchema.safeParse({ confirmation: "delete" }).success,
    ).toBe(false);
    expect(deleteAccountSchema.safeParse({}).success).toBe(false);
  });
});
