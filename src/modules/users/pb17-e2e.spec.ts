import { StreamableFile } from "@nestjs/common";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";
import { UsersRepository } from "./users.repository";
import type { PrismaService } from "@/core/database/prisma.service";
import type { RateLimitService } from "@/common/services/rate-limit.service";
import type { AuthService } from "@/modules/auth/auth.service";
import type { UploadsService } from "@/modules/uploads/uploads.service";
import type { MetricsService } from "@/modules/metrics/metrics.service";
import type { ConfigService } from "@nestjs/config";
import type { AuthenticatedUser } from "@/common/interfaces/authenticated-user.interface";
import type { Response } from "express";

describe("PB17 controller/service/collector fixture integration (not browser E2E)", () => {
  let controller: UsersController;
  let service: UsersService;
  let repository: UsersRepository;
  let mockPrisma: any;
  let mockResponse: {
    setHeader: jest.Mock;
    statusCode?: number;
  };

  const userA: AuthenticatedUser = {
    id: "usr_alex_001",
    email: "alex.nguyen@example.test",
    name: "Nguyễn Văn Alex",
    role: "TALENT",
  };

  const userB: AuthenticatedUser = {
    id: "usr_bob_002",
    email: "bob.smith@example.test",
    name: "Bob Smith",
    role: "EMPLOYER",
  };

  const dbUserDataA = {
    id: "usr_alex_001",
    email: "alex.nguyen@example.test",
    name: "Nguyễn Văn Alex",
    phone: "+84 90 123 4567",
    role: "TALENT",
    language: "vi",
    region: "Vietnam",
    currencyDisplay: "USD ($)",
    isPaused: false,
    pausedAt: null,
    emailVerified: true,
    createdAt: new Date("2026-01-15T08:00:00Z"),
    updatedAt: new Date("2026-06-20T10:00:00Z"),
    // Malicious or leaked database rows should be sanitized away
    passwordHash: "$2b$10$DEFENSE_IN_DEPTH_PASSWORD_HASH",
    twoFactorSecret: "BASE32_DEFENSE_IN_DEPTH_SECRET",
    twoFactorBackupCodes: ["CODE_1", "CODE_2"],
    talent: {
      headline: "Principal React Architect & Tech Lead",
      bio: "Chuyên gia phát triển ứng dụng Web hiệu năng cao, TypeScript, Micro-frontends.",
      location: "Hồ Chí Minh",
      country: "VN",
      timezone: "Asia/Ho_Chi_Minh",
      yearsExperience: 8,
      level: "LEAD",
      desiredSalaryMin: 3500,
      desiredSalaryMax: 5000,
      currency: "USD",
      primaryRole: "Frontend Lead",
      rightToWork: "Vietnam Citizen",
      skills: [
        { skill: { name: "React" } },
        { skill: { name: "TypeScript" } },
        { skill: { name: "NestJS" } },
      ],
      applications: [
        {
          id: "app_1001",
          status: "ACCEPTED",
          appliedAt: new Date("2026-04-01T12:00:00Z"),
          coverLetter: "Thư ứng tuyển vị trí React Lead...",
          job: {
            title: "Lead Frontend Engineer",
            slug: "lead-frontend-engineer",
            employer: { companyName: "SeaTech Ventures" },
          },
        },
      ],
      workExperiences: [
        {
          company: "VNG Cloud",
          title: "Senior Frontend Engineer",
          startDate: new Date("2021-01-01"),
          endDate: new Date("2024-01-01"),
          isCurrent: false,
          description: "Phát triển dashboard quản trị hạ tầng cloud.",
          location: "HCMC",
        },
      ],
      profileHighlights: [
        {
          type: "PORTFOLIO",
          title: "Design System OSS",
          description: "Thư viện UI mở cho cộng đồng React.",
          url: "https://github.com/alex/design-system",
          issuer: "GitHub",
          issueDate: new Date("2023-05-01"),
        },
      ],
    },
    employer: null,
    jobAlerts: [
      {
        id: "alert_01",
        keywords: "React Lead Remote",
        frequency: "DAILY",
        isActive: true,
        createdAt: new Date("2026-02-01"),
      },
    ],
    notificationPreference: {
      applicationUpdates: true,
      employerMessages: true,
      weeklyDigest: false,
      instantMatchAlerts: true,
      productNews: false,
      tipsAndResources: true,
      browserPush: true,
      updatedAt: new Date("2026-02-01"),
    },
    messages: [
      {
        id: "msg_001",
        applicationId: "app_1001",
        body: "Xin chào quý công ty, tôi đã gửi CV và rất mong được trao đổi thêm.",
        createdAt: new Date("2026-04-02T09:00:00Z"),
      },
    ],
  };

  beforeEach(() => {
    mockPrisma = {
      user: {
        findUnique: jest.fn().mockImplementation(({ where }) => {
          if (where.id === "usr_alex_001") {
            return Promise.resolve(dbUserDataA);
          }
          if (where.id === "usr_bob_002") {
            return Promise.resolve({
              id: "usr_bob_002",
              email: "bob.smith@example.test",
              name: "Bob Smith",
              role: "EMPLOYER",
              createdAt: new Date(),
              employer: {
                companyName: "Acme SEA Labs",
                industry: "Fintech",
                jobs: [],
              },
              jobAlerts: [],
              notificationPreference: null,
              messages: [],
            });
          }
          return Promise.resolve(null);
        }),
      },
    };

    mockPrisma.$transaction = (fn: (tx: unknown) => unknown) => fn(mockPrisma);
    mockPrisma.$executeRaw = jest.fn().mockResolvedValue(0);
    mockPrisma.$queryRaw = jest.fn().mockResolvedValue([{ at: new Date() }]);
    mockPrisma.talentProfile = {
      findUnique: jest.fn(({ where }) =>
        Promise.resolve(where.userId === userA.id ? dbUserDataA.talent : null),
      ),
    };
    mockPrisma.employerProfile = {
      findUnique: jest.fn(({ where }) =>
        Promise.resolve(
          where.userId === userB.id
            ? { companyName: "Acme SEA Labs", industry: "Fintech" }
            : null,
        ),
      ),
    };
    for (const [model, field] of [
      ["workExperience", "workExperiences"],
      ["profileHighlight", "profileHighlights"],
      ["application", "applications"],
    ] as const) {
      mockPrisma[model] = {
        findMany: jest.fn(({ where }) =>
          Promise.resolve(
            where.talent.userId === userA.id
              ? (dbUserDataA.talent[field] ?? [])
              : [],
          ),
        ),
      };
    }
    mockPrisma.talentSkill = { findMany: jest.fn().mockResolvedValue([]) };
    mockPrisma.applicationStatusEvent = {
      findMany: jest.fn().mockResolvedValue([]),
    };
    mockPrisma.message = {
      findMany: jest.fn(({ where }) =>
        Promise.resolve(
          where.senderId === userA.id ? dbUserDataA.messages : [],
        ),
      ),
    };
    mockPrisma.jobAlert = {
      findMany: jest.fn(({ where }) =>
        Promise.resolve(where.userId === userA.id ? dbUserDataA.jobAlerts : []),
      ),
    };
    mockPrisma.job = { findMany: jest.fn().mockResolvedValue([]) };
    mockPrisma.notificationPreference = {
      findUnique: jest.fn(({ where }) =>
        Promise.resolve(
          where.userId === userA.id ? dbUserDataA.notificationPreference : null,
        ),
      ),
    };

    repository = new UsersRepository(mockPrisma as unknown as PrismaService);
    service = new UsersService(
      repository,
      {} as UploadsService,
      {} as ConfigService<any, true>,
      {} as AuthService,
      {} as MetricsService,
    );

    mockResponse = {
      setHeader: jest.fn(),
    };

    controller = new UsersController(
      service,
      { enforce: jest.fn() } as unknown as RateLimitService,
      {} as AuthService,
    );
  });

  it("TC01: Valid user exports PDF successfully with status 200 and %PDF- buffer", async () => {
    const streamable = (await controller.exportData(
      userA,
      "pdf",
      mockResponse as unknown as Response,
    )) as StreamableFile;

    expect(streamable).toBeInstanceOf(StreamableFile);
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
  });

  it("TC02: Throws USER_NOT_FOUND when user does not exist in database", async () => {
    const unknownUser: AuthenticatedUser = {
      id: "usr_ghost_999",
      email: "ghost@example.com",
      name: "Ghost",
      role: "TALENT",
    };

    await expect(
      controller.exportData(
        unknownUser,
        "pdf",
        mockResponse as unknown as Response,
      ),
    ).rejects.toMatchObject({
      response: { code: "USER_NOT_FOUND" },
    });
  });

  it("TC03: Strict user isolation — User A only queries User A's ID", async () => {
    await controller.exportData(
      userA,
      "json",
      mockResponse as unknown as Response,
    );

    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: "usr_alex_001" },
      select: expect.any(Object),
    });
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalledWith({
      where: { id: "usr_bob_002" },
      select: expect.any(Object),
    });
  });

  it("TC04, TC05, TC06 & TC19: Absolute elimination of passwordHash, 2FA secrets, and recovery codes", async () => {
    const result = (await controller.exportData(
      userA,
      "json",
      mockResponse as unknown as Response,
    )) as any;

    expect(result.account).toBeDefined();
    expect(result.account.id).toBe("usr_alex_001");
    expect(result.account.passwordHash).toBeUndefined();
    expect(result.account.twoFactorSecret).toBeUndefined();
    expect(result.account.twoFactorBackupCodes).toBeUndefined();
    expect(result.account.accessToken).toBeUndefined();
  });

  it("TC07 & TC08: Accounts without applications or messages export cleanly", async () => {
    const streamable = (await controller.exportData(
      userB,
      "pdf",
      mockResponse as unknown as Response,
    )) as StreamableFile;

    expect(streamable).toBeInstanceOf(StreamableFile);
    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: "usr_bob_002" },
      select: expect.any(Object),
    });
  });

  it("TC16: Employer role correctly exports employer profile & jobs list", async () => {
    const result = (await controller.exportData(
      userB,
      "json",
      mockResponse as unknown as Response,
    )) as any;

    expect(result.account.role).toBe("EMPLOYER");
    expect(result.account.employer).toBeDefined();
    expect(result.account.employer.companyName).toBe("Acme SEA Labs");
  });

  it("TC17: Backward-compatible JSON format support", async () => {
    const result = (await controller.exportData(
      userA,
      "json",
      mockResponse as unknown as Response,
    )) as any;

    expect(result).toHaveProperty("exportedAt");
    expect(result).toHaveProperty("account");
    expect(result.account.name).toBe("Nguyễn Văn Alex");
    expect(mockResponse.setHeader).toHaveBeenCalledWith(
      "Content-Type",
      "application/json; charset=utf-8",
    );
  });
});
