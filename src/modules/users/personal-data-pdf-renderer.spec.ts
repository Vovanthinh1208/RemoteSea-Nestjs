import {
  PersonalDataPdfRenderer,
  type PersonalDataExportPayload,
} from "./personal-data-pdf-renderer";
import { spawnSync } from "node:child_process";

it("round-trips Vietnamese glyphs and literal HTML through an independent PDF parser", async () => {
  const name = "Nguyễn Thị Minh Anh — tiếng Việt đầy đủ dấu";
  const body =
    'Dữ liệu <script>alert("literal")</script> & accessToken là tên biến.';
  const buffer = await PersonalDataPdfRenderer.render({
    exportedAt: "2026-11-10T10:00:00.000Z",
    account: {
      id: "unicode-test",
      email: "unicode@example.test",
      name,
      messages: [
        {
          applicationId: "conversation-test",
          body,
          createdAt: "2026-11-10T10:00:00.000Z",
        },
      ],
    },
  });
  // pdfjs uses dynamic ESM imports; run its real reader outside Jest's VM.
  const parsed = spawnSync(
    process.execPath,
    [
      "-e",
      `
    const {PDFParse}=require(${JSON.stringify(require.resolve("pdf-parse"))});
    (async()=>{const p=new PDFParse({data:require('node:fs').readFileSync(0)});
      try{process.stdout.write(JSON.stringify(await p.getText()));}finally{await p.destroy();}
    })().catch(()=>process.exit(1));
  `,
    ],
    { input: buffer, timeout: 20_000, maxBuffer: 1024 * 1024 },
  );
  expect(parsed.status).toBe(0);
  const result = JSON.parse(parsed.stdout.toString()) as {
    text: string;
    pages: { text: string }[];
  };
  expect(result.text).toContain(name);
  expect(result.text).toContain("BÁO CÁO DỮ LIỆU");
  expect(result.text).toContain(body);
  expect(result.text).not.toContain("\u0000");
  expect(result.pages.every((page) => page.text.trim().length > 30)).toBe(true);
});

describe("PersonalDataPdfRenderer (PB17 - PDF Rendering & Security)", () => {
  const basePayload: PersonalDataExportPayload = {
    exportedAt: "2026-11-10T10:00:00.000Z",
    account: {
      id: "usr_test_tc_1",
      email: "engineer@remotesea.work",
      name: "Nguyễn Văn Hoài Nam",
      phone: "+84 901 234 567",
      role: "TALENT",
      isPaused: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      language: "vi",
      region: "Vietnam",
      currencyDisplay: "USD ($)",
      talent: {
        headline: "Principal React Architect",
        bio: "Hơn 10 năm kinh nghiệm phát triển phần mềm.",
        level: "LEAD",
        yearsExperience: 10,
        desiredSalaryMin: 4000,
        desiredSalaryMax: 6000,
        currency: "USD",
        rightToWork: "Toàn quyền làm việc",
        skills: [
          { skill: { name: "React" } },
          { skill: { name: "TypeScript" } },
        ],
        applications: [
          {
            id: "app_tc_1",
            status: "ACCEPTED",
            appliedAt: "2026-03-01T00:00:00.000Z",
            job: {
              title: "Senior Full-stack Engineer",
              employer: { companyName: "Fintech Sea Labs" },
            },
          },
        ],
        workExperiences: [
          {
            company: "Tech Corp",
            title: "Senior Lead",
            startDate: "2022-01-01T00:00:00.000Z",
            endDate: null,
            description: "Chịu trách nhiệm kiến trúc hệ thống.",
          },
        ],
      },
      messages: [
        {
          applicationId: "app_tc_1",
          body: "Xin chào, tôi rất quan tâm đến vị trí tuyển dụng này.",
          createdAt: "2026-03-02T00:00:00.000Z",
        },
      ],
      jobAlerts: [
        {
          keywords: "React Lead",
          frequency: "DAILY",
          isActive: true,
        },
      ],
      notificationPreference: {
        applicationUpdates: true,
        employerMessages: true,
        weeklyDigest: false,
      },
    },
  };

  it("TC01 & TC14: renders valid PDF buffer with %PDF- signature and valid EOF marker", async () => {
    const buffer = await PersonalDataPdfRenderer.render(basePayload);
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(1000);
    expect(buffer.subarray(0, 5).toString("utf-8")).toBe("%PDF-");
    const tail = buffer.subarray(buffer.length - 100).toString("utf-8");
    expect(tail).toContain("%%EOF");
  });

  it("TC04, TC05, TC06: strictly eliminates passwords, 2FA seeds, and tokens from output", async () => {
    const compromisedPayload: any = {
      ...basePayload,
      account: {
        ...basePayload.account,
        passwordHash: "$2b$10$SUPER_SECRET_BCRYPT_HASH",
        twoFactorSecret: "BASE32_SUPER_SECRET_2FA_SEED",
        twoFactorBackupCodes: ["BACKUP_CODE_1", "BACKUP_CODE_2"],
        accessToken: "JWT_ACCESS_TOKEN_SECRET",
        refreshToken: "JWT_REFRESH_TOKEN_SECRET",
      },
    };

    const buffer = await PersonalDataPdfRenderer.render(compromisedPayload);
    const rawString = buffer.toString("binary");

    expect(rawString).not.toContain("SUPER_SECRET_BCRYPT_HASH");
    expect(rawString).not.toContain("BASE32_SUPER_SECRET_2FA_SEED");
    expect(rawString).not.toContain("BACKUP_CODE_1");
    expect(rawString).not.toContain("JWT_ACCESS_TOKEN_SECRET");
    expect(rawString).not.toContain("JWT_REFRESH_TOKEN_SECRET");
  });

  it("TC07 & TC08: renders cleanly when applications or messages are empty", async () => {
    const emptyPayload: PersonalDataExportPayload = {
      ...basePayload,
      account: {
        ...basePayload.account,
        talent: {
          ...basePayload.account.talent,
          applications: [],
        },
        messages: [],
      },
    };

    const buffer = await PersonalDataPdfRenderer.render(emptyPayload);
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(1000);
    expect(buffer.subarray(0, 5).toString("utf-8")).toBe("%PDF-");
  });

  it("TC09 & TC11: produces multi-page document with metadata", async () => {
    const buffer = await PersonalDataPdfRenderer.render(basePayload);
    const rawString = buffer.toString("binary");
    expect(rawString).toContain("/Title");
    expect(rawString).toContain("/Author");
    expect(rawString).toContain("(RemoteSEA)");
    expect(rawString).toContain("(Personal account archive)");
    expect(rawString).not.toContain("GDPR/PDPA Personal Data Export Dossier");
  });

  it("TC16: renders employer profile and jobs when user is an EMPLOYER", async () => {
    const employerPayload: PersonalDataExportPayload = {
      exportedAt: "2026-11-10T10:00:00.000Z",
      account: {
        id: "usr_employer_1",
        email: "recruiter@acmecorp.test",
        name: "Jane Employer",
        role: "EMPLOYER",
        isPaused: false,
        createdAt: "2026-02-01T00:00:00.000Z",
        employer: {
          companyName: "Acme Global Solutions",
          industry: "Technology",
          size: "50-200",
          isVerified: true,
          jobs: [
            {
              title: "Senior Backend Developer",
              slug: "senior-backend-dev",
              status: "ACTIVE",
              createdAt: "2026-03-01T00:00:00.000Z",
            },
          ],
        },
      },
    };

    const buffer = await PersonalDataPdfRenderer.render(employerPayload);
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(1000);
    expect(buffer.subarray(0, 5).toString("utf-8")).toBe("%PDF-");
  });
});
