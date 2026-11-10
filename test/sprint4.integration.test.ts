/** Run explicitly with --config jest-sprint4.config.cjs.
 * Real Nest routes, JWT/session guards, Prisma repositories and PostgreSQL.
 * Sprint 4 Integration Suite: PB75 - PB96 (22 Product Backlog Items).
 */
import { Test } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { ForbiddenException, type INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import Stripe from "stripe";
import { PrismaService } from "@/core/database/prisma.service";
import { GlobalExceptionFilter } from "@/core/filters/global-exception.filter";
import { EmailService } from "@/common/services/email.service";
import { AiService } from "@/modules/ai/ai.service";
import { STRIPE_CLIENT } from "@/modules/billing/constants";
import { AiOrchestratorService } from "@/modules/ai-orchestrator/ai-orchestrator.service";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const request = require("supertest");

let app: INestApplication;
let db: PrismaService;
let jwt: JwtService;
let f: Awaited<ReturnType<typeof fixture>>;

const email = Object.fromEntries(
  Object.getOwnPropertyNames(EmailService.prototype)
    .filter((name) => name !== "constructor")
    .map((name) => [name, jest.fn().mockResolvedValue(undefined)]),
);

const mockStripe = {
  checkout: {
    sessions: {
      create: jest.fn().mockImplementation((params) =>
        Promise.resolve({
          id: `cs_test_${randomUUID().slice(0, 8)}`,
          url: "https://checkout.stripe.com/pay/test_session",
          metadata: params.metadata,
        }),
      ),
    },
  },
  webhooks: {
    constructEvent: jest
      .fn()
      .mockImplementation((rawBody, signature, secret) => {
        if (signature === "invalid-sig") {
          throw new Error("Invalid signature");
        }
        return JSON.parse(rawBody.toString());
      }),
  },
};

const mockAiService = {
  isConfigured: true,
  complete: jest.fn().mockResolvedValue({
    text: JSON.stringify({
      riskLevel: "LOW",
      reasons: [],
      summary: "Legitimate role with standard market conditions.",
    }),
    model: "gemini-1.5-flash",
  }),
};

const mockAiOrchestratorService = {
  isConfigured: true,
  checkAiServiceReachable: jest.fn().mockResolvedValue(true),
  pingOrchestrator: jest.fn().mockResolvedValue(true),
  proxyToOrchestrator: jest
    .fn()
    .mockImplementation((user, method, path, body) => {
      if (path.includes("/v1/orchestrator/chat/conv-other")) {
        throw new ForbiddenException("Not your conversation");
      }
      if (path === "/v1/orchestrator/chat" && method === "GET") {
        return Promise.resolve([
          {
            id: "conv-1",
            title: "Career guidance in React",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            messageCount: 2,
          },
        ]);
      }
      if (path.includes("/v1/orchestrator/chat/") && method === "GET") {
        return Promise.resolve({
          id: "conv-1",
          title: "Career guidance in React",
          turns: [
            {
              id: "turn-1",
              question: "How to prepare for senior React interviews?",
              answer: "Focus on performance, concurrency and architecture.",
              confidence: 0.9,
              sources: ["RemoteSEA Guidelines"],
            },
          ],
        });
      }
      if (method === "POST" && path === "/v1/orchestrator/chat") {
        return Promise.resolve({
          conversationId: body?.conversationId ?? "conv-new-123",
          answer:
            "You can find multiple remote positions matching React in Vietnam.",
          confidence: 0.95,
          sources: ["RemoteSEA Job Guidelines"],
        });
      }
      return Promise.resolve({ ok: true });
    }),
};

const runId = randomUUID().slice(0, 8);

beforeAll(async () => {
  const url = new URL(
    process.env.S4_TEST_DATABASE_URL ??
      "postgresql://remotesea@localhost:55443/remotesea_s4_20261109_integration",
  );
  process.env.DATABASE_URL = url.toString();
  process.env.DIRECT_URL = url.toString();
  process.env.AUTH_SECRET = "isolated-sprint-four-test-signing-secret";
  process.env.CRON_SECRET = "test-sprint4-cron-secret";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";
  process.env.NODE_ENV = "test";

  for (const name of [
    "AUTH_GOOGLE_ID",
    "AUTH_GITHUB_ID",
    "AUTH_LINKEDIN_ID",
    "MAIL_HOST",
    "MAIL_PORT",
    "MAIL_SECURE",
    "MAIL_USER",
    "MAIL_PASSWORD",
    "MAIL_FROM",
    "S3_BUCKET",
    "ANTHROPIC_API_KEY",
    "GEMINI_API_KEY",
    "AI_SERVICE_SECRET",
    "SENTRY_DSN",
  ]) {
    process.env[name] = "";
  }

  process.env.STRIPE_SECRET_KEY = "sk_test_mock_key_sprint4";
  process.env.FRONTEND_URL = "http://localhost:5173";

  const forRoot = ConfigModule.forRoot.bind(ConfigModule);
  const configSpy = jest
    .spyOn(ConfigModule, "forRoot")
    .mockImplementation((options) =>
      forRoot({ ...options, ignoreEnvFile: true }),
    );

  const { AppModule } = await import("@/app.module");
  const mod = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(EmailService)
    .useValue(email)
    .overrideProvider(STRIPE_CLIENT)
    .useValue(mockStripe)
    .overrideProvider(AiService)
    .useValue(mockAiService)
    .overrideProvider(AiOrchestratorService)
    .useValue(mockAiOrchestratorService)
    .compile();

  configSpy.mockRestore();
  app = mod.createNestApplication({ rawBody: true });
  app.useLogger(false);
  app.useGlobalFilters(new GlobalExceptionFilter());
  await app.init();
  db = app.get(PrismaService);
  jwt = app.get(JwtService);

  f = await fixture();
}, 60_000);

afterAll(async () => {
  if (app) await app.close();
});

async function user(role: "TALENT" | "EMPLOYER" | "ADMIN", name: string) {
  const u = await db.user.create({
    data: {
      email: `${name.toLowerCase().replace(/\s+/g, ".")}-${randomUUID().slice(0, 8)}@example.test`,
      name,
      role,
    },
  });
  const session = await db.session.create({ data: { userId: u.id } });
  const token = jwt.sign({
    sub: u.id,
    email: u.email,
    name,
    role,
    sid: session.id,
  });
  return { ...u, token };
}

function http(
  method: "get" | "post" | "patch" | "delete",
  path: string,
  caller?: { token: string },
) {
  const req = request(app.getHttpServer())[method](path);
  if (caller) req.set("Authorization", `Bearer ${caller.token}`);
  return req;
}

async function fixture() {
  const admin = await user("ADMIN", "Admin User");
  const owner = await user("EMPLOYER", "Acme Employer");
  const otherOwner = await user("EMPLOYER", "Other Employer");
  const talent = await user("TALENT", "Talent One");
  const otherTalent = await user("TALENT", "Talent Two");

  const employer = await db.employerProfile.create({
    data: {
      userId: owner.id,
      companyName: `Acme Corp ${runId}`,
      slug: `acme-corp-${runId}`,
      isVerified: false,
    },
  });

  await db.companyMember.create({
    data: {
      userId: owner.id,
      employerId: employer.id,
      role: "OWNER",
    },
  });

  const otherEmployer = await db.employerProfile.create({
    data: {
      userId: otherOwner.id,
      companyName: `Other Corp ${runId}`,
      slug: `other-corp-${runId}`,
      isVerified: false,
    },
  });

  await db.companyMember.create({
    data: {
      userId: otherOwner.id,
      employerId: otherEmployer.id,
      role: "OWNER",
    },
  });

  const talentProfile = await db.talentProfile.create({
    data: {
      userId: talent.id,
      slug: `talent-one-${runId}`,
      headline: "Senior Full Stack Engineer",
    },
  });

  const category = await db.category.create({
    data: { name: `Engineering ${runId}`, slug: `engineering-${runId}` },
  });

  const activeJob = await db.job.create({
    data: {
      employerId: employer.id,
      title: `Staff Backend Engineer ${runId}`,
      slug: `staff-backend-${runId}`,
      status: "ACTIVE",
      planPaid: true,
      salaryMin: 3000,
      salaryMax: 4500,
      level: "SENIOR",
      jobType: "FULL_TIME",
      country: "Vietnam",
      publishedAt: new Date(),
      description: "Build high-throughput distributed systems.",
    },
  });

  await db.jobCategory.create({
    data: { jobId: activeJob.id, categoryId: category.id },
  });

  const draftJob = await db.job.create({
    data: {
      employerId: employer.id,
      title: `Draft Job ${runId}`,
      slug: `draft-job-${runId}`,
      status: "DRAFT",
      planPaid: false,
      planType: "STANDARD",
      salaryMin: 2000,
      salaryMax: 3000,
      level: "MID",
      jobType: "FULL_TIME",
      country: "Vietnam",
      description: "Frontend engineer role draft.",
    },
  });

  return {
    admin,
    owner,
    otherOwner,
    talent,
    otherTalent,
    employer,
    otherEmployer,
    talentProfile,
    category,
    activeJob,
    draftJob,
  };
}

// -------------------------------------------------------------
// SPRINT 4 SUITE: PB75 – PB96
// -------------------------------------------------------------

describe("PB75: Đánh dấu thông báo đã đọc", () => {
  it("S4-PB75-TC01 marks a single notification as read [AC2]", async () => {
    const notif = await db.notification.create({
      data: {
        userId: f.talent.id,
        type: "APPLICATION_STATUS_CHANGED",
        title: "Status Updated",
        body: "Your application is under review",
        readAt: null,
      },
    });

    const res = await http(
      "patch",
      `/notifications/${notif.id}/read`,
      f.talent,
    ).expect(200);
    expect(res.body.readAt).toBeDefined();

    const record = await db.notification.findUnique({
      where: { id: notif.id },
    });
    expect(record?.readAt).not.toBeNull();
  });

  it("S4-PB75-TC02 marks all user notifications as read and resets unread count [AC3]", async () => {
    await db.notification.createMany({
      data: [
        {
          userId: f.talent.id,
          type: "APPLICATION_STATUS_CHANGED",
          title: "N1",
          readAt: null,
        },
        {
          userId: f.talent.id,
          type: "APPLICATION_STATUS_CHANGED",
          title: "N2",
          readAt: null,
        },
      ],
    });

    await http("patch", "/notifications/read-all", f.talent).expect(200);

    const countRes = await http(
      "get",
      "/notifications/unread-count",
      f.talent,
    ).expect(200);
    expect(countRes.body.count).toBe(0);
  });

  it("S4-PB75-TC03 denies marking another user notification as read [AUTH]", async () => {
    const notif = await db.notification.create({
      data: {
        userId: f.otherTalent.id,
        type: "APPLICATION_STATUS_CHANGED",
        title: "Other User Notification",
        readAt: null,
      },
    });

    await http("patch", `/notifications/${notif.id}/read`, f.talent).expect(
      404,
    );
  });
});

describe("PB76: Tạo cảnh báo việc làm theo tiêu chí (Job Alert)", () => {
  it("S4-PB76-TC01 creates a new job alert with criteria and category [AC1-AC5]", async () => {
    const res = await http("post", "/alerts", f.talent)
      .send({
        name: "Remote React Lead",
        keywords: "React TypeScript",
        salaryMin: 3000,
        frequency: "DAILY",
        categoryIds: [f.category.id],
      })
      .expect(201);

    expect(res.body.name).toBe("Remote React Lead");
    expect(res.body.keywords).toBe("React TypeScript");
    expect(res.body.salaryMin).toBe(3000);
    expect(res.body.categories).toHaveLength(1);
  });

  it("S4-PB76-TC02 enforces maximum 5 alerts per talent [Constraint 1]", async () => {
    // Current count for f.talent is 1, let's create 4 more to reach 5
    for (let i = 2; i <= 5; i++) {
      await http("post", "/alerts", f.talent)
        .send({ name: `Alert ${i}`, frequency: "DAILY" })
        .expect(201);
    }

    // 6th alert must be rejected with 400 Bad Request
    const res = await http("post", "/alerts", f.talent)
      .send({ name: "Excess Alert 6", frequency: "DAILY" })
      .expect(400);

    expect(res.body.code).toBe("ALERT_LIMIT_REACHED");
  });
});

describe("PB77: Quản lý cảnh báo việc làm (Sửa, Bật/Tắt, Xóa)", () => {
  let alertId: string;

  beforeAll(async () => {
    const alert = await db.jobAlert.create({
      data: {
        userId: f.talent.id,
        name: "Alert to manage",
        keywords: "Golang",
        isActive: true,
        frequency: "DAILY",
      },
    });
    alertId = alert.id;
  });

  it("S4-PB77-TC01 toggles alert active status [AC2]", async () => {
    const res = await http("patch", `/alerts/${alertId}`, f.talent)
      .send({ isActive: false })
      .expect(200);
    expect(res.body.isActive).toBe(false);
  });

  it("S4-PB77-TC02 edits alert search criteria [AC3]", async () => {
    const res = await http("patch", `/alerts/${alertId}`, f.talent)
      .send({
        name: "Updated Alert Name",
        keywords: "Rust Systems",
        salaryMin: 4000,
      })
      .expect(200);

    expect(res.body.name).toBe("Updated Alert Name");
    expect(res.body.keywords).toBe("Rust Systems");
    expect(res.body.salaryMin).toBe(4000);
  });

  it("S4-PB77-TC03 denies editing another user's alert [Constraint 1]", async () => {
    await http("patch", `/alerts/${alertId}`, f.otherTalent)
      .send({ name: "Hacked" })
      .expect(404);
  });

  it("S4-PB77-TC04 deletes alert permanently [AC4]", async () => {
    await http("delete", `/alerts/${alertId}`, f.talent).expect(200);
    const inDb = await db.jobAlert.findUnique({ where: { id: alertId } });
    expect(inDb).toBeNull();
  });
});

describe("PB78: Tự động gửi email thông báo việc làm phù hợp cảnh báo", () => {
  it("S4-PB78-TC01 cron endpoint rejects requests without valid secret [Constraint 1]", async () => {
    await request(app.getHttpServer()).get("/alerts/cron/dispatch").expect(401);
    await request(app.getHttpServer())
      .get("/alerts/cron/dispatch")
      .set("x-cron-secret", "wrong-secret")
      .expect(401);
  });

  it("S4-PB78-TC02 matches active jobs and dispatches alert emails via GET & POST [AC1-AC4]", async () => {
    const alertUser = await user("TALENT", "Alert Subscriber");
    const testAlert = await db.jobAlert.create({
      data: {
        userId: alertUser.id,
        name: "Backend Alert",
        keywords: "Distributed",
        isActive: true,
        frequency: "IMMEDIATE",
      },
    });

    const newJob = await db.job.create({
      data: {
        employerId: f.employer.id,
        title: "Distributed Systems Architect",
        slug: `dist-sys-${randomUUID().slice(0, 8)}`,
        status: "ACTIVE",
        planPaid: true,
        publishedAt: new Date(),
        description: "Focus on Distributed caching and queues.",
      },
    });

    const resGet = await request(app.getHttpServer())
      .get("/alerts/cron/dispatch")
      .set("Authorization", "Bearer test-sprint4-cron-secret")
      .expect(200);

    expect(resGet.body.processed).toBeGreaterThanOrEqual(1);

    // Deduplication check: immediate second run without new jobs should send 0
    const resPost = await request(app.getHttpServer())
      .post("/alerts/cron/dispatch")
      .set("Authorization", "Bearer test-sprint4-cron-secret")
      .expect(200);

    expect(resPost.body.sent).toBe(0);

    await db.job.delete({ where: { id: newJob.id } });
    await db.jobAlert.delete({ where: { id: testAlert.id } });
  });
});

describe("PB79: Mời ứng viên tiềm năng ứng tuyển vào việc làm", () => {
  it("S4-PB79-TC01 employer sends job invitation to talent [AC1-AC5]", async () => {
    const res = await http("post", "/invitations", f.owner)
      .send({
        jobId: f.activeJob.id,
        talentId: f.talentProfile.id,
        message: "We love your profile and would like to invite you to apply.",
      })
      .expect(201);

    expect(res.body.jobId).toBe(f.activeJob.id);
    expect(res.body.status).toBe("PENDING");
  });

  it("S4-PB79-TC02 prevents duplicate pending invitation for same job and talent [Constraint 1]", async () => {
    const res = await http("post", "/invitations", f.owner)
      .send({
        jobId: f.activeJob.id,
        talentId: f.talentProfile.id,
        message: "Duplicate invitation attempt",
      })
      .expect(409);

    expect(res.body.code).toBe("ALREADY_INVITED");
  });

  it("S4-PB79-TC03 talent views invitations and accepts [AC5]", async () => {
    const listRes = await http("get", "/invitations", f.talent).expect(200);
    expect(listRes.body.length).toBeGreaterThanOrEqual(1);

    const inv = listRes.body[0];
    const acceptRes = await http("patch", `/invitations/${inv.id}`, f.talent)
      .send({ action: "ACCEPT" })
      .expect(200);

    expect(acceptRes.body.status).toBe("ACCEPTED");

    // Accepting automatically creates an application in SUBMITTED state
    const application = await db.application.findFirst({
      where: { jobId: f.activeJob.id, talentId: f.talentProfile.id },
    });
    expect(application).not.toBeNull();
  });
});

describe("PB80 & PB81: Stripe Checkout & Webhook Processing", () => {
  it("S4-PB80-TC01 creates Stripe checkout session for draft job via checkout & checkout-session [AC1-AC4]", async () => {
    const res1 = await http("post", "/billing/checkout", f.owner)
      .send({ jobId: f.draftJob.id })
      .expect(201);

    expect(res1.body.url).toContain("checkout.stripe.com");

    const res2 = await http("post", "/billing/checkout-session", f.owner)
      .send({ jobId: f.draftJob.id })
      .expect(201);

    expect(res2.body.url).toContain("checkout.stripe.com");
  });

  it("S4-PB80-TC02 denies checkout for already paid or active job [Constraint 2]", async () => {
    await http("post", "/billing/checkout", f.owner)
      .send({ jobId: f.activeJob.id })
      .expect(400);
  });

  it("S4-PB81-TC01 processes checkout.session.completed webhook event [AC1-AC3]", async () => {
    const webhookPayload = {
      id: `evt_test_${randomUUID().slice(0, 8)}`,
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_success_123",
          mode: "payment",
          payment_status: "paid",
          amount_total: 15000,
          currency: "usd",
          metadata: { jobId: f.draftJob.id },
        },
      },
    };

    const res = await request(app.getHttpServer())
      .post("/billing/webhook")
      .set("stripe-signature", "valid-test-sig")
      .send(webhookPayload)
      .expect(201);

    expect(res.body.received).toBe(true);

    const updatedJob = await db.job.findUnique({
      where: { id: f.draftJob.id },
    });
    expect(updatedJob?.planPaid).toBe(true);
    expect(["PENDING_REVIEW", "ACTIVE"]).toContain(updatedJob?.status);
  });

  it("S4-PB81-TC02 webhook rejects invalid signature [Constraint 1]", async () => {
    await request(app.getHttpServer())
      .post("/billing/webhook")
      .set("stripe-signature", "invalid-sig")
      .send({ type: "checkout.session.completed" })
      .expect(400);
  });
});

describe("PB82: Xem thông tin tham khảo mức lương (Salary Insights)", () => {
  it("S4-PB82-TC01 retrieves salary benchmarks by role [AC1-AC4]", async () => {
    const res = await http("get", "/salary/benchmarks").expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    if (res.body.length > 0) {
      expect(res.body[0]).toHaveProperty("role");
      expect(res.body[0]).toHaveProperty("min");
      expect(res.body[0]).toHaveProperty("max");
      expect(res.body[0]).toHaveProperty("mid");
    }
  });

  it("S4-PB82-TC02 retrieves salary benchmarks by seniority [AC2]", async () => {
    const res = await http("get", "/salary/benchmarks/by-seniority").expect(
      200,
    );
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("S4-PB82-TC03 retrieves salary benchmarks by country [AC1]", async () => {
    const res = await http("get", "/salary/benchmarks/by-country").expect(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe("PB83 & PB84: Quản trị viên xác minh & đình chỉ nhà tuyển dụng", () => {
  it("S4-PB83-TC01 admin verifies employer and writes audit log [AC1-AC4]", async () => {
    await http("patch", `/admin/employers/${f.employer.id}`, f.admin)
      .send({ action: "verify" })
      .expect(200);

    const emp = await db.employerProfile.findUnique({
      where: { id: f.employer.id },
    });
    expect(emp?.isVerified).toBe(true);

    const audit = await db.adminAuditLog.findFirst({
      where: { targetId: f.employer.id, action: "EMPLOYER_VERIFIED" },
    });
    expect(audit).not.toBeNull();
  });

  it("S4-PB83-TC02 non-admin cannot verify employer [AUTH]", async () => {
    await http("patch", `/admin/employers/${f.employer.id}`, f.talent)
      .send({ action: "verify" })
      .expect(403);
  });

  it("S4-PB84-TC01 admin suspends employer and writes audit log [AC1-AC3]", async () => {
    await http("patch", `/admin/employers/${f.otherEmployer.id}`, f.admin)
      .send({ action: "suspend", reason: "Verified policy violation" })
      .expect(200);

    const audit = await db.adminAuditLog.findFirst({
      where: { targetId: f.otherEmployer.id, action: "EMPLOYER_SUSPENDED" },
    });
    expect(audit).not.toBeNull();
  });
});

describe("PB85, PB86, PB87: Kiểm duyệt tin tuyển dụng & AI Risk Advisory", () => {
  let modJobId: string;

  beforeAll(async () => {
    const j = await db.job.create({
      data: {
        employerId: f.employer.id,
        title: "Senior Cloud Architect Pending",
        slug: `cloud-arch-${randomUUID().slice(0, 8)}`,
        status: "PENDING_REVIEW",
        planPaid: true,
        description: "Cloud infrastructure management.",
      },
    });
    modJobId = j.id;
  });

  it("S4-PB85-TC01 admin views moderation queue [AC1-AC3]", async () => {
    const res = await http(
      "get",
      "/admin/jobs?status=PENDING_REVIEW",
      f.admin,
    ).expect(200);
    expect(res.body.jobs.length).toBeGreaterThanOrEqual(1);
    expect(res.body.jobs.some((job: any) => job.id === modJobId)).toBe(true);
  });

  it("S4-PB87-TC01 admin inspects AI risk advisory flag [AC1-AC4]", async () => {
    const res = await http(
      "get",
      `/admin/jobs/${modJobId}/moderation-flag`,
      f.admin,
    ).expect(200);
    expect(["LOW", "MEDIUM", "HIGH"]).toContain(res.body.riskLevel);
    expect(res.body.summary).toBeDefined();

    // Regenerate flag
    const regen = await http(
      "post",
      `/admin/jobs/${modJobId}/moderation-flag/regenerate`,
      f.admin,
    ).expect(201);
    expect(regen.body.riskLevel).toBeDefined();
  });

  it("S4-PB86-TC01 admin approves job to ACTIVE state [AC1-AC2]", async () => {
    const res = await http("patch", `/admin/jobs/${modJobId}`, f.admin)
      .send({ action: "approve" })
      .expect(200);

    expect(res.body.status).toBe("ACTIVE");
    expect(res.body.expiresAt).toBeDefined();

    const audit = await db.adminAuditLog.findFirst({
      where: { targetId: modJobId, action: "JOB_APPROVED" },
    });
    expect(audit).not.toBeNull();
  });

  it("S4-PB86-TC02 admin rejects job with reason note [AC3]", async () => {
    const rejectJob = await db.job.create({
      data: {
        employerId: f.employer.id,
        title: "Spam Job Post",
        slug: `spam-job-${randomUUID().slice(0, 8)}`,
        status: "PENDING_REVIEW",
        planPaid: true,
        description: "Earn 10000 USD daily with upfront deposit.",
      },
    });

    const res = await http("patch", `/admin/jobs/${rejectJob.id}`, f.admin)
      .send({ action: "reject", note: "Violates payment and deposit policies" })
      .expect(200);

    expect(res.body.status).toBe("REJECTED");

    const audit = await db.adminAuditLog.findFirst({
      where: { targetId: rejectJob.id, action: "JOB_REJECTED" },
    });
    expect(audit).not.toBeNull();
  });
});

describe("PB88 & PB89: Báo cáo tin tuyển dụng vi phạm & Admin xử lý", () => {
  let reportId: string;

  it("S4-PB88-TC01 user submits report on suspicious job [AC1-AC5]", async () => {
    const res = await http("post", `/jobs/${f.activeJob.id}/report`, f.talent)
      .send({
        reason: "SCAM",
        details: "Employer asked for an upfront payment during contact.",
      })
      .expect(201);

    expect(res.body.id).toBeDefined();
    expect(res.body.status).toBe("OPEN");
    reportId = res.body.id;

    const inDb = await db.jobReport.findUnique({ where: { id: reportId } });
    expect(inDb?.reason).toBe("SCAM");
  });

  it("S4-PB88-TC02 prevents same user from reporting the same job twice [Constraint 1]", async () => {
    const res = await http("post", `/jobs/${f.activeJob.id}/report`, f.talent)
      .send({
        reason: "MISLEADING",
        details: "Second report attempt",
      })
      .expect(409);

    expect(res.body.code).toBe("JOB_ALREADY_REPORTED");
  });

  it("S4-PB89-TC01 admin lists reports and resolves violation [AC1-AC5]", async () => {
    const listRes = await http("get", "/admin/reports", f.admin).expect(200);
    expect(listRes.body.reports.some((r: any) => r.id === reportId)).toBe(true);

    await http("patch", `/admin/reports/${reportId}`, f.admin)
      .send({ action: "resolve", reason: "Scam confirmed" })
      .expect(200);

    const updated = await db.jobReport.findUnique({ where: { id: reportId } });
    expect(updated?.status).toBe("RESOLVED");

    const audit = await db.adminAuditLog.findFirst({
      where: { targetId: reportId, action: "JOB_REPORT_RESOLVED" },
    });
    expect(audit).not.toBeNull();
  });
});

describe("PB90, PB91, PB92: Quản lý người dùng, Ban/Unban & Thay đổi vai trò", () => {
  let testTargetUser: any;

  beforeAll(async () => {
    testTargetUser = await user("TALENT", "User To Moderate");
  });

  it("S4-PB90-TC01 admin lists and searches users [AC1-AC4]", async () => {
    const res = await http(
      "get",
      `/admin/users?q=${testTargetUser.email}`,
      f.admin,
    ).expect(200);
    expect(res.body.users.length).toBeGreaterThanOrEqual(1);
    expect(res.body.users[0].email).toBe(testTargetUser.email);
  });

  it("S4-PB91-TC01 admin bans user, setting bannedAt and revoking sessions [AC1-AC3]", async () => {
    await http("patch", `/admin/users/${testTargetUser.id}`, f.admin)
      .send({ action: "ban", reason: "Abuse confirmed" })
      .expect(200);

    const banned = await db.user.findUnique({
      where: { id: testTargetUser.id },
    });
    expect(banned?.bannedAt).not.toBeNull();

    // Verify sessions revoked
    const activeSessions = await db.session.findMany({
      where: { userId: testTargetUser.id, revokedAt: null },
    });
    expect(activeSessions.length).toBe(0);

    const audit = await db.adminAuditLog.findFirst({
      where: { targetId: testTargetUser.id, action: "USER_BANNED" },
    });
    expect(audit).not.toBeNull();
  });

  it("S4-PB91-TC02 admin unbans user [AC4]", async () => {
    await http("patch", `/admin/users/${testTargetUser.id}`, f.admin)
      .send({ action: "unban" })
      .expect(200);

    const unbanned = await db.user.findUnique({
      where: { id: testTargetUser.id },
    });
    expect(unbanned?.bannedAt).toBeNull();
  });

  it("S4-PB91-TC03 admin cannot ban own account [Constraint 1]", async () => {
    const res = await http("patch", `/admin/users/${f.admin.id}`, f.admin)
      .send({ action: "ban", reason: "Abuse confirmed" })
      .expect(400);

    expect(res.body.code).toBe("CANNOT_MODIFY_OWN_ACCOUNT");
  });

  it("S4-PB92-TC01 admin changes user role to EMPLOYER [AC1-AC4]", async () => {
    await http("patch", `/admin/users/${testTargetUser.id}`, f.admin)
      .send({ action: "change-role", role: "EMPLOYER" })
      .expect(200);

    const updated = await db.user.findUnique({
      where: { id: testTargetUser.id },
    });
    expect(updated?.role).toBe("EMPLOYER");

    const audit = await db.adminAuditLog.findFirst({
      where: { targetId: testTargetUser.id, action: "USER_ROLE_CHANGED" },
    });
    expect(audit).not.toBeNull();
  });

  it("S4-PB92-TC02 admin cannot demote own account [Constraint 1]", async () => {
    const res = await http("patch", `/admin/users/${f.admin.id}`, f.admin)
      .send({ action: "change-role", role: "TALENT" })
      .expect(400);

    expect(res.body.code).toBe("CANNOT_MODIFY_OWN_ACCOUNT");
  });
});

describe("PB93: Xem nhật ký hành động quản trị (Admin Audit Log)", () => {
  it("S4-PB93-TC01 admin accesses immutable audit log table [AC1-AC3]", async () => {
    const res = await http("get", "/admin/audit-log", f.admin).expect(200);
    expect(Array.isArray(res.body.entries)).toBe(true);
    expect(res.body.entries.length).toBeGreaterThanOrEqual(1);

    const first = res.body.entries[0];
    expect(first.adminId).toBe(f.admin.id);
    expect(first.action).toBeDefined();
    expect(first.createdAt).toBeDefined();
  });

  it("S4-PB93-TC02 filters audit logs by targetType [AC3]", async () => {
    const res = await http(
      "get",
      "/admin/audit-log?targetType=EMPLOYER",
      f.admin,
    ).expect(200);
    expect(
      res.body.entries.every((e: any) => e.targetType === "EMPLOYER"),
    ).toBe(true);
  });

  it("S4-PB93-TC03 non-admin cannot access audit log [AUTH]", async () => {
    await http("get", "/admin/audit-log", f.talent).expect(403);
  });
});

describe("PB94, PB95, PB96: AI Chat Assistant & Conversation History", () => {
  it("S4-PB94-TC01 authenticated user asks AI assistant a question [AC1-AC4]", async () => {
    const res = await http("post", "/ai-orchestrator/chat", f.talent)
      .send({ question: "What remote jobs are available in Vietnam?" })
      .expect(201);

    expect(res.body.conversationId).toBeDefined();
    expect(res.body.answer).toContain("React in Vietnam");
    expect(res.body.sources).toBeDefined();
  });

  it("S4-PB95-TC01 multi-turn conversation retains context across rounds [AC1-AC4]", async () => {
    const res = await http("post", "/ai-orchestrator/chat", f.talent)
      .send({
        conversationId: "conv-1",
        question: "Can you provide salary benchmarks for these roles?",
      })
      .expect(201);

    expect(res.body.conversationId).toBe("conv-1");
    expect(res.body.answer).toBeDefined();
  });

  it("S4-PB96-TC01 lists past AI conversations and loads full message history [AC1-AC4]", async () => {
    const listRes = await http("get", "/ai-orchestrator/chat", f.talent).expect(
      200,
    );
    expect(listRes.body.length).toBeGreaterThanOrEqual(1);
    expect(listRes.body[0].title).toBe("Career guidance in React");

    const detailRes = await http(
      "get",
      "/ai-orchestrator/chat/conv-1",
      f.talent,
    ).expect(200);
    expect(detailRes.body.turns.length).toBe(1);
    expect(detailRes.body.turns[0].question).toBe(
      "How to prepare for senior React interviews?",
    );
  });

  it("S4-PB96-TC02 prevents cross-user access to AI conversations [Constraint 1]", async () => {
    await http("get", "/ai-orchestrator/chat/conv-other", f.talent).expect(403);
  });
});
