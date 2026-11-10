import { StreamableFile } from "@nestjs/common";
import { UsersController } from "./users.controller";
import type { UsersService } from "./users.service";
import type { RateLimitService } from "@/common/services/rate-limit.service";
import type { AuthService } from "@/modules/auth/auth.service";
import type { AuthenticatedUser } from "@/common/interfaces/authenticated-user.interface";
import { BadRequestApiException } from "@/common/exceptions/api.exception";
import { ErrorCode } from "@/common/exceptions/error-codes";
import type { Response } from "express";

describe("UsersController.exportData (PB17 - PDF Only)", () => {
  let controller: UsersController;
  let mockUsersService: Partial<Record<keyof UsersService, jest.Mock>>;
  let mockResponse: {
    setHeader: jest.Mock;
  };

  const mockUser: AuthenticatedUser = {
    id: "usr_mock_1",
    email: "test@example.com",
    name: "Test User",
    role: "TALENT",
  };

  beforeEach(() => {
    mockUsersService = {
      exportData: jest.fn().mockResolvedValue({
        exportedAt: "2026-11-10T10:00:00.000Z",
        account: { id: "usr_mock_1", email: "test@example.com" },
      }),
      exportDataAsPdf: jest
        .fn()
        .mockResolvedValue(Buffer.from("%PDF-mock-pdf")),
    };

    mockResponse = {
      setHeader: jest.fn(),
    };

    controller = new UsersController(
      mockUsersService as unknown as UsersService,
      { enforce: jest.fn() } as unknown as RateLimitService,
      {} as AuthService,
    );
  });

  it("TC01 & TC15: exports PDF when format=pdf is requested", async () => {
    const result = await controller.exportData(
      mockUser,
      "pdf",
      mockResponse as unknown as Response,
    );

    expect(mockUsersService.exportDataAsPdf).toHaveBeenCalledWith(
      "usr_mock_1",
      "vi",
    );
    expect(mockResponse.setHeader).toHaveBeenCalledWith(
      "Content-Type",
      "application/pdf",
    );
    expect(mockResponse.setHeader).toHaveBeenCalledWith(
      "Content-Disposition",
      expect.stringMatching(
        /attachment; filename="remotesea-personal-data-\d{4}-\d{2}-\d{2}\.pdf"/,
      ),
    );
    expect(mockResponse.setHeader).toHaveBeenCalledWith(
      "Cache-Control",
      "no-store",
    );
    expect(mockResponse.setHeader).toHaveBeenCalledWith(
      "X-Content-Type-Options",
      "nosniff",
    );
    expect(result).toBeInstanceOf(StreamableFile);
  });

  it("TC08 & TC17: rejects JSON export with HTTP 400 when format=json is requested", async () => {
    await expect(
      controller.exportData(
        mockUser,
        "json",
        mockResponse as unknown as Response,
      ),
    ).rejects.toThrow(BadRequestApiException);

    try {
      await controller.exportData(
        mockUser,
        "json",
        mockResponse as unknown as Response,
      );
    } catch (err: any) {
      expect(err).toBeInstanceOf(BadRequestApiException);
      expect(err.getStatus()).toBe(400);
      expect(err.getResponse()).toMatchObject({
        error:
          "JSON export is no longer supported. Please export your personal data as PDF.",
        code: ErrorCode.VALIDATION_ERROR,
      });
    }
    expect(mockUsersService.exportDataAsPdf).not.toHaveBeenCalled();
  });

  it("rejects JSON export case-insensitively (e.g. format=JSON)", async () => {
    await expect(
      controller.exportData(
        mockUser,
        "JSON",
        mockResponse as unknown as Response,
      ),
    ).rejects.toThrow(BadRequestApiException);
  });

  it("defaults to PDF export when format is omitted", async () => {
    const result = await controller.exportData(
      mockUser,
      undefined as any,
      mockResponse as unknown as Response,
    );

    expect(mockUsersService.exportDataAsPdf).toHaveBeenCalledWith(
      "usr_mock_1",
      "vi",
    );
    expect(mockResponse.setHeader).toHaveBeenCalledWith(
      "Content-Type",
      "application/pdf",
    );
    expect(result).toBeInstanceOf(StreamableFile);
  });

  it("rejects unsupported format with HTTP 400", async () => {
    await expect(
      controller.exportData(
        mockUser,
        "xml",
        mockResponse as unknown as Response,
      ),
    ).rejects.toThrow(BadRequestApiException);
  });

  it("downloadData endpoint returns PDF by default", async () => {
    const result = await controller.downloadData(
      mockUser,
      { format: "pdf", locale: "vi" },
      mockResponse as unknown as Response,
    );

    expect(mockUsersService.exportDataAsPdf).toHaveBeenCalledWith(
      "usr_mock_1",
      "vi",
    );
    expect(result).toBeInstanceOf(StreamableFile);
  });
});
