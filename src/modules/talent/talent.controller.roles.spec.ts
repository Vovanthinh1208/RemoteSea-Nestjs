import { ROLES_KEY } from "@/core/decorators/roles.decorator";
import { TalentController } from "./talent.controller";

describe("TalentController role restrictions (PB21)", () => {
  it("only lets TALENT create or update a talent profile", () => {
    const roles = Reflect.getMetadata(
      ROLES_KEY,
      TalentController.prototype.upsertProfile,
    );
    expect(roles).toEqual(["TALENT"]);
  });
});
