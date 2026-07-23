import { Resend } from "resend";
import { EmailService } from "./email.service";

jest.mock("resend");

// Circuit-breaker state/timing logic itself is covered directly in
// circuit-breaker.spec.ts — this only checks that EmailService actually wires
// it up: real sends still go through Resend, and a run of failures eventually
// makes send() skip the network call entirely instead of trying (and timing
// out) forever.
describe("EmailService", () => {
  const makeService = () => {
    const sendMock = jest.fn();
    (Resend as jest.Mock).mockImplementation(() => ({
      emails: { send: sendMock },
    }));

    const config = {
      get: jest.fn((key: string) => {
        if (key === "RESEND_API_KEY") return "re_test_key";
        if (key === "FRONTEND_URL") return "https://app.example.com";
        return undefined;
      }),
    };

    const service = new EmailService(config as never);
    return { service, sendMock };
  };

  it("sends through Resend on a healthy circuit", async () => {
    const { service, sendMock } = makeService();
    sendMock.mockResolvedValue({ id: "email_1" });

    await service.sendWelcomeEmail("a@b.com", "Alice");

    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it("stops calling Resend after enough consecutive failures", async () => {
    const { service, sendMock } = makeService();
    sendMock.mockRejectedValue(new Error("Resend is down"));

    // Enough consecutive failures to trip the breaker — each swallowed the
    // same way a real caller (runInBackground) would.
    for (let i = 0; i < 5; i += 1) {
      await service.sendWelcomeEmail("a@b.com", "Alice").catch(() => {});
    }
    expect(sendMock).toHaveBeenCalledTimes(5);

    // The circuit is now open: this call must not reach Resend at all.
    await service.sendWelcomeEmail("a@b.com", "Alice").catch(() => {});
    expect(sendMock).toHaveBeenCalledTimes(5);
  });
});
