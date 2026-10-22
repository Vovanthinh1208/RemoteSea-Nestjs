import nodemailer from "nodemailer";
import { EmailService } from "./email.service";

jest.mock("nodemailer", () => ({
  __esModule: true,
  default: { createTransport: jest.fn() },
}));

describe("EmailService", () => {
  const sendMail = jest.fn();
  const verify = jest.fn();
  const transport = { sendMail, verify };

  const makeService = (overrides: Record<string, unknown> = {}) => {
    jest.clearAllMocks();
    (nodemailer.createTransport as jest.Mock).mockReturnValue(transport);
    const values: Record<string, unknown> = {
      MAIL_HOST: "smtp.example.com",
      MAIL_PORT: 587,
      MAIL_SECURE: false,
      MAIL_USER: "smtp-user",
      MAIL_PASSWORD: "smtp-secret",
      MAIL_FROM: "RemoteSEA <noreply@example.com>",
      FRONTEND_URL: "https://app.example.com",
      ...overrides,
    };
    const config = {
      get: jest.fn((key: string) => values[key]),
    };
    return { service: new EmailService(config as never), config };
  };

  it("creates authenticated STARTTLS transport on port 587", async () => {
    const { service } = makeService();
    sendMail.mockResolvedValue({ messageId: "mail-1" });

    await service.sendWelcomeEmail("alice@example.com", "Alice");

    expect(nodemailer.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "smtp.example.com",
        port: 587,
        secure: false,
        requireTLS: true,
        auth: { user: "smtp-user", pass: "smtp-secret" },
        tls: { minVersion: "TLSv1.2" },
      }),
    );
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "RemoteSEA <noreply@example.com>",
        to: "alice@example.com",
        subject: "Welcome to RemoteSEA",
        text: expect.stringContaining("Hi Alice"),
        html: expect.stringContaining("Hi Alice"),
      }),
    );
  });

  it("uses implicit TLS on port 465 when MAIL_SECURE is unset", async () => {
    makeService({ MAIL_PORT: 465, MAIL_SECURE: undefined });
    expect(nodemailer.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ port: 465, secure: true }),
    );
  });

  it("verifies SMTP connectivity without sending a message", async () => {
    const { service } = makeService();
    verify.mockResolvedValue(true);

    await expect(service.verifyConnection()).resolves.toBeUndefined();
    expect(verify).toHaveBeenCalledTimes(1);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("does not attempt mail delivery when SMTP is not configured", async () => {
    const { service } = makeService({
      MAIL_HOST: undefined,
      MAIL_USER: undefined,
      MAIL_PASSWORD: undefined,
    });

    await expect(
      service.sendWelcomeEmail("alice@example.com", "Alice"),
    ).resolves.toBeUndefined();
    await expect(service.verifyConnection()).rejects.toThrow(
      "SMTP is not configured",
    );
    expect(nodemailer.createTransport).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("rejects invalid recipient addresses before calling SMTP", async () => {
    const { service } = makeService();

    await expect(
      service.sendWelcomeEmail("bad\r\nBcc:x@example.com", "A"),
    ).rejects.toThrow("Invalid email recipient");
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("surfaces SMTP failures and opens the circuit after repeated failures", async () => {
    const { service } = makeService();
    sendMail.mockRejectedValue(new Error("SMTP unavailable"));

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(
        service.sendWelcomeEmail("alice@example.com", "Alice"),
      ).rejects.toThrow("SMTP unavailable");
    }
    expect(sendMail).toHaveBeenCalledTimes(5);

    await service.sendWelcomeEmail("alice@example.com", "Alice");
    expect(sendMail).toHaveBeenCalledTimes(5);
  });

  it("escapes dynamic template fields and encodes tokens in links", async () => {
    const { service } = makeService();
    sendMail.mockResolvedValue({ messageId: "mail-2" });

    await service.sendTalentVerificationEmail(
      "alice@example.com",
      "token&value",
    );

    const message = sendMail.mock.calls[0][0] as { html: string; text: string };
    expect(message.html).toContain("token%26value");
    expect(message.html).toContain("RemoteSEA");
    expect(message.text).toContain("Verify email");
    expect(message.text).toContain(
      "https://app.example.com/talent/verify?token=token%26value",
    );
    expect(message.html).not.toContain("token&amp;value");
  });

  it("builds a password reset link on the frontend reset route", async () => {
    const { service } = makeService({
      FRONTEND_URL: "https://app.example.com/",
    });
    sendMail.mockResolvedValue({ messageId: "mail-reset" });

    await service.sendPasswordResetEmail("alice@example.com", "reset&token");

    const message = sendMail.mock.calls[0][0] as { html: string; text: string };
    const resetUrl =
      "https://app.example.com/reset-password?token=reset%26token";
    expect(message.html).toContain(`href="${resetUrl}"`);
    expect(message.text).toContain(resetUrl);
  });
});
