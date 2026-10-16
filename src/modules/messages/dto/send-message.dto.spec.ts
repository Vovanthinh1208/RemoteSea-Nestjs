import { sendMessageSchema } from "./send-message.dto";

describe("PB68 documented message boundaries", () => {
  it.each(["", " ", "\n\t"])("S3-PB68-TC07 rejects blank text %j", (body) => {
    expect(sendMessageSchema.safeParse({ body }).success).toBe(false);
  });
  it("S3-PB68-TC08 accepts 2000 characters and rejects 2001", () => {
    expect(
      sendMessageSchema.safeParse({ body: "a".repeat(2000) }).success,
    ).toBe(true);
    expect(
      sendMessageSchema.safeParse({ body: "a".repeat(2001) }).success,
    ).toBe(false);
  });
});
