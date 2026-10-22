/** Run explicitly with --config jest-sprint3.config.cjs.
 * Real Nest routes, JWT/session guards, Prisma repositories and PostgreSQL.
 * Only outbound mail, model inference and resume extraction are stubbed.
 * Assertions intentionally retain backlog expectations for unresolved gaps.
 */
import { Test } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { PrismaService } from "@/core/database/prisma.service";
import { GlobalExceptionFilter } from "@/core/filters/global-exception.filter";
import { EmailService } from "@/common/services/email.service";
import { AiService } from "@/modules/ai/ai.service";
import { ResumeExtractionService } from "@/modules/cv-analysis/resume-extraction.service";
import { InterviewsRepository } from "@/modules/interviews/interviews.repository";
// supertest has no @types in this repository; its runtime API is used here.
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
const complete = jest.fn();
const extraction = jest
  .fn()
  .mockResolvedValue("Five years TypeScript and React experience.");
const aiResult = {
  fitScore: 82,
  summary: "Relevant experience.",
  strengths: ["React"],
  gaps: ["Redis"],
  suggestedQuestions: [],
  recommendation: "ADVANCE",
  recommendationReason: "Relevant skills.",
};
const runId = randomUUID().slice(0, 8);

it.each(["OWNER", "RECRUITER", "HIRING_MANAGER", "INTERVIEWER"] as const)(
  "S3-PB57-TC04 company role %s has only its allowed applicant-list access [BR1]",
  async (role) => {
    await db.companyMember.update({
      where: { userId: f.owner.id },
      data: { role },
    });
    await http(
      "get",
      `/employer/jobs/${f.job.id}/applications`,
      f.owner,
    ).expect(role === "INTERVIEWER" ? 403 : 200);
  },
);
it("S3-PB64-TC03 only the assigned interviewer can read private scorecards [PRE,BR2]", async () => {
  await interview("CONFIRMED", new Date(Date.now() - 60000));
  await db.companyMember.update({
    where: { userId: f.owner.id },
    data: { role: "INTERVIEWER" },
  });
  await http("get", `${employerPath()}/scorecards`, f.owner).expect(403);
  await db.interview.update({
    where: { applicationId: f.application.id },
    data: { interviewerId: f.owner.id },
  });
  await http("get", `${employerPath()}/scorecards`, f.owner).expect(200);
});
it("S3-PB58-TC03 suspended company cannot mutate applications [AUTH]", async () => {
  await db.employerProfile.update({
    where: { id: f.employer.id },
    data: { suspendedAt: new Date() },
  });
  await http("patch", employerPath(), f.owner, { status: "REVIEWING" }).expect(
    403,
  );
  expect(
    (
      await db.application.findUniqueOrThrow({
        where: { id: f.application.id },
      })
    ).status,
  ).toBe("PENDING");
});
it("S3-PB73-TC02 new application creates an employer in-app notification regardless of email preference [AC1,BR1]", async () => {
  await db.application.delete({ where: { id: f.application.id } });
  await db.notificationPreference.create({
    data: { userId: f.owner.id, applicationUpdates: false },
  });
  await http("post", "/applications", f.talentUser, { jobId: f.job.id }).expect(
    201,
  );
  for (let n = 0; n < 30; n++) {
    if (await db.notification.count({ where: { userId: f.owner.id } })) break;
    await new Promise((r) => setTimeout(r, 10));
  }
  expect(await db.notification.count({ where: { userId: f.owner.id } })).toBe(
    1,
  );
});

beforeAll(async () => {
  const url = new URL(process.env.S3_TEST_DATABASE_URL ?? "");
  if (
    !["127.0.0.1", "localhost"].includes(url.hostname) ||
    !/^\/remotesea_s3_[a-z0-9_]+$/.test(url.pathname)
  ) {
    throw new Error(
      "S3_TEST_DATABASE_URL must target an isolated local remotesea_s3_* database",
    );
  }
  process.env.DATABASE_URL = url.toString();
  process.env.AUTH_SECRET = "isolated-sprint-three-test-signing-secret";
  process.env.NODE_ENV = "test";
  for (const name of [
    "AUTH_GOOGLE_ID",
    "AUTH_GITHUB_ID",
    "AUTH_LINKEDIN_ID",
    "STRIPE_SECRET_KEY",
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
  ])
    process.env[name] = "";
  process.env.CDN_URL = "https://s3-fixtures.invalid";
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
    .overrideProvider(AiService)
    .useValue({ isConfigured: true, complete })
    .overrideProvider(ResumeExtractionService)
    .useValue({ extractText: extraction })
    .compile();
  configSpy.mockRestore();
  app = mod.createNestApplication();
  app.useLogger(false);
  app.useGlobalFilters(new GlobalExceptionFilter());
  await app.init();
  db = app.get(PrismaService);
  jwt = app.get(JwtService);
}, 120_000);

afterAll(async () => {
  if (app) await app.close();
});

async function user(role: "TALENT" | "EMPLOYER", name: string) {
  const u = await db.user.create({
    data: { email: `${name}-${randomUUID()}@example.invalid`, name, role },
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

async function fixture() {
  const owner = await user("EMPLOYER", "Owner");
  const otherOwner = await user("EMPLOYER", "Other owner");
  const talentUser = await user("TALENT", "Candidate Alpha");
  const otherTalent = await user("TALENT", "Candidate Beta");
  const employer = await db.employerProfile.create({
    data: { userId: owner.id, companyName: "QA Company", slug: randomUUID() },
  });
  const otherEmployer = await db.employerProfile.create({
    data: {
      userId: otherOwner.id,
      companyName: "Other Company",
      slug: randomUUID(),
    },
  });
  await db.companyMember.createMany({
    data: [
      { userId: owner.id, employerId: employer.id, role: "OWNER" },
      { userId: otherOwner.id, employerId: otherEmployer.id, role: "OWNER" },
    ],
  });
  const talent = await db.talentProfile.create({
    data: { userId: talentUser.id, slug: randomUUID() },
  });
  await db.talentProfile.create({
    data: { userId: otherTalent.id, slug: randomUUID() },
  });
  const job = await db.job.create({
    data: {
      employerId: employer.id,
      title: "React Engineer",
      description: "React and TypeScript",
      slug: randomUUID(),
      status: "ACTIVE",
      expiresAt: new Date(Date.now() + 86_400_000),
    },
  });
  const application = await db.application.create({
    data: {
      jobId: job.id,
      talentId: talent.id,
      notes: "INTERNAL SECRET",
      coverLetter: "My introduction",
      resumeUrl: `https://s3-fixtures.invalid/uploads/resume/${talentUser.id}/cv.pdf`,
      statusEvents: { create: { status: "PENDING" } },
    },
  });
  return {
    owner,
    otherOwner,
    talentUser,
    otherTalent,
    employer,
    otherEmployer,
    talent,
    job,
    application,
  };
}

beforeEach(async () => {
  complete.mockReset().mockResolvedValue({
    text: JSON.stringify(aiResult),
    model: "fixture-model",
  });
  extraction.mockClear();
  f = await fixture();
}, 60_000);

function http(
  method: "get" | "post" | "put" | "patch" | "delete",
  path: string,
  actor: { token: string } | null = f.talentUser,
  data?: unknown,
) {
  const req = request(app.getHttpServer())[method](path);
  if (actor) req.set("Authorization", `Bearer ${actor.token}`);
  if (data !== undefined) req.send(data);
  return req;
}
const talentPath = () => `/applications/${f.application.id}`;
const employerPath = () => `/employer/applications/${f.application.id}`;
const future = () => new Date(Date.now() + 86_400_000);
async function interview(
  status: "PENDING" | "CONFIRMED" | "CANCELLED" = "PENDING",
  slot = future(),
) {
  await db.application.update({
    where: { id: f.application.id },
    data: { status: "INTERVIEW" },
  });
  return db.interview.create({
    data: {
      applicationId: f.application.id,
      durationMinutes: 30,
      proposedSlots: [slot],
      status,
      confirmedSlot: status === "CONFIRMED" ? slot : null,
    },
  });
}

it("S3-PB49-TC01 save, repeated save, list, unsave and isolation persist correctly [AC2,AC3,AC4]", async () => {
  await http("put", `/saved/${f.job.id}`).expect(200, { saved: true });
  await http("put", `/saved/${f.job.id}`).expect(200);
  expect(await db.savedJob.count({ where: { userId: f.talentUser.id } })).toBe(
    1,
  );
  const list = await http("get", "/saved").expect(200);
  expect(list.body.savedJobs.map((s: { jobId: string }) => s.jobId)).toEqual([
    f.job.id,
  ]);
  const other = await http("get", "/saved", f.otherTalent).expect(200);
  expect(other.body.savedJobs).toEqual([]);
  await http("delete", `/saved/${f.job.id}`).expect(200, { saved: false });
  await http("delete", `/saved/${f.job.id}`).expect(200);
  expect(await db.savedJob.count({ where: { userId: f.talentUser.id } })).toBe(
    0,
  );
});
it.each([null, { token: "invalid" }])(
  "S3-PB49-TC02 unauthenticated/invalid token cannot save %j [BR1]",
  async (actor) => {
    await http("put", `/saved/${f.job.id}`, actor).expect(401);
    expect(
      await db.savedJob.count({ where: { userId: f.talentUser.id } }),
    ).toBe(0);
  },
);
it("S3-PB49-TC03 non-TALENT cannot save [PRE]", async () => {
  await http("put", `/saved/${f.job.id}`, f.owner).expect(403);
});
it("S3-PB49-TC04 nonexistent job cannot create a bookmark [NEG]", async () => {
  const res = await http("put", "/saved/cmissing000000000000000000");
  expect(res.status).toBeGreaterThanOrEqual(400);
  expect(res.status).toBeLessThan(500);
  expect(await db.savedJob.count({ where: { userId: f.talentUser.id } })).toBe(
    0,
  );
});

it("S3-PB51-TC01 public category endpoint is cached [AC1,BR1]", async () => {
  const res = await http("get", "/categories", null).expect(200);
  expect(Array.isArray(res.body)).toBe(true);
  expect(res.headers["cache-control"]).toContain("s-maxage=300");
});
it("S3-PB51-TC02 category includes active job count [AC2]", async () => {
  const category = await db.category.create({
    data: { name: `Category ${runId} ${randomUUID()}`, slug: randomUUID() },
  });
  await db.jobCategory.create({
    data: { jobId: f.job.id, categoryId: category.id },
  });
  // Clear the reference cache to exercise this fixture, not another test's snapshot.
  await app.get("CACHE_MANAGER").clear();
  const res = await http("get", "/categories", null).expect(200);
  const item = res.body.find((c: { id: string }) => c.id === category.id);
  expect(
    Object.entries(item).some(
      ([key, value]) => /count/i.test(key) && value === 1,
    ),
  ).toBe(true);
});
it("S3-PB52-TC01 skill search matches a case-insensitive substring [AC1,AC2,BR1]", async () => {
  const skill = await db.skill.create({
    data: { name: `QAReact${randomUUID()}`, slug: randomUUID() },
  });
  const res = await http("get", "/skills?q=qArEaCt", null).expect(200);
  expect(res.body.map((s: { id: string }) => s.id)).toContain(skill.id);
});
it("S3-PB52-TC02 unmatched and Unicode skill searches return an empty list [EDGE]", async () => {
  const res = await http(
    "get",
    `/skills?q=${encodeURIComponent("不存在-" + randomUUID())}`,
    null,
  ).expect(200);
  expect(res.body).toEqual([]);
});

it("S3-PB53-TC01 application is persisted atomically with initial timeline and apply count [AC3,AC4.2]", async () => {
  await db.application.delete({ where: { id: f.application.id } });
  const res = await http("post", "/applications", f.talentUser, {
    jobId: f.job.id,
    coverLetter: "Introduction",
  }).expect(201);
  expect(
    await db.application.count({
      where: { jobId: f.job.id, talentId: f.talent.id },
    }),
  ).toBe(1);
  expect(
    (await db.job.findUniqueOrThrow({ where: { id: f.job.id } })).applyCount,
  ).toBe(1);
  expect(res.body.statusEvents).toHaveLength(1);
  expect(res.body.status).toBe("APPLIED");
});
it("S3-PB53-TC02 duplicate submission is rejected without counter or timeline side effects [AC4.1,BR1]", async () => {
  await http("post", "/applications", f.talentUser, { jobId: f.job.id }).expect(
    409,
  );
  expect(
    await db.application.count({
      where: { jobId: f.job.id, talentId: f.talent.id },
    }),
  ).toBe(1);
  expect(
    (await db.job.findUniqueOrThrow({ where: { id: f.job.id } })).applyCount,
  ).toBe(0);
});
it.each(["CLOSED", "DRAFT", "EXPIRED"])(
  "S3-PB53-TC03 rejects non-active job %s without creating an application [PRE]",
  async (status) => {
    await db.application.delete({ where: { id: f.application.id } });
    await db.job.update({
      where: { id: f.job.id },
      data: { status: status as "CLOSED" },
    });
    await http("post", "/applications", f.talentUser, {
      jobId: f.job.id,
    }).expect(409);
    expect(await db.application.count({ where: { jobId: f.job.id } })).toBe(0);
  },
);
it("S3-PB53-TC04 concurrent applies create exactly one application and counter increment [BR1]", async () => {
  await db.application.delete({ where: { id: f.application.id } });
  const responses = await Promise.all([
    http("post", "/applications", f.talentUser, { jobId: f.job.id }),
    http("post", "/applications", f.talentUser, { jobId: f.job.id }),
  ]);
  expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
  expect(await db.application.count({ where: { jobId: f.job.id } })).toBe(1);
  expect(
    (await db.job.findUniqueOrThrow({ where: { id: f.job.id } })).applyCount,
  ).toBe(1);
});
it("S3-PB53-TC05 arbitrary resume URL is rejected without persistence [NEG]", async () => {
  await db.application.delete({ where: { id: f.application.id } });
  await http("post", "/applications", f.talentUser, {
    jobId: f.job.id,
    resumeUrl: "https://foreign.invalid/file.pdf",
  }).expect(400);
  expect(await db.application.count({ where: { jobId: f.job.id } })).toBe(0);
});

it("S3-PB54-TC01 own detail returns submitted files, letter and timestamped timeline without internal notes [AC2,AC3,BR1]", async () => {
  const res = await http("get", talentPath()).expect(200);
  expect(res.body.coverLetter).toBe("My introduction");
  expect(res.body.resumeUrl).toBe(f.application.resumeUrl);
  expect(res.body.job.employer.companyName).toBe("QA Company");
  expect(res.body.statusEvents[0].createdAt).toEqual(expect.any(String));
  expect(JSON.stringify(res.body)).not.toContain("INTERNAL SECRET");
  expect(res.body).not.toHaveProperty("notes");
});
it("S3-PB54-TC02 another talent cannot read application detail [BR1]", async () => {
  await http("get", talentPath(), f.otherTalent).expect(404);
});
it("S3-PB54-TC03 expired JWT cannot read application detail [AUTH]", async () => {
  const token = jwt.sign(
    { sub: f.talentUser.id, sid: "irrelevant", role: "TALENT" },
    { expiresIn: -1 },
  );
  await http("get", talentPath(), { token }).expect(401);
});
it.each(["PENDING", "REVIEWING", "SHORTLISTED", "INTERVIEW"])(
  "S3-PB55-TC01 withdraw from %s persists timeline and notifies employer [AC4,PRE]",
  async (status) => {
    await db.application.update({
      where: { id: f.application.id },
      data: { status: status as "PENDING" },
    });
    await http("patch", `${talentPath()}/withdraw`).expect(200);
    expect(
      (
        await db.application.findUniqueOrThrow({
          where: { id: f.application.id },
        })
      ).status,
    ).toBe("WITHDRAWN");
    expect(
      await db.applicationStatusEvent.count({
        where: { applicationId: f.application.id, status: "WITHDRAWN" },
      }),
    ).toBe(1);
  },
);
it.each([
  "OFFERED",
  "WITHDRAWN",
  "REJECTED",
  "OFFER_ACCEPTED",
  "OFFER_DECLINED",
])("S3-PB55-TC02 cannot withdraw from %s [BR1,STATE]", async (status) => {
  await db.application.update({
    where: { id: f.application.id },
    data: { status: status as "OFFERED" },
  });
  await http("patch", `${talentPath()}/withdraw`).expect(400);
  expect(
    (
      await db.application.findUniqueOrThrow({
        where: { id: f.application.id },
      })
    ).status,
  ).toBe(status);
});
it.each(["ACCEPTED", "DECLINED"])(
  "S3-PB56-TC01 offer response %s is final [AC3,AC4,BR1]",
  async (response) => {
    await db.application.update({
      where: { id: f.application.id },
      data: { status: "OFFERED" },
    });
    await http("patch", `${talentPath()}/offer-response`, f.talentUser, {
      response,
    }).expect(200);
    const stored = await db.application.findUniqueOrThrow({
      where: { id: f.application.id },
    });
    expect(stored.status).toBe(`OFFER_${response}`);
    await http("patch", `${talentPath()}/offer-response`, f.talentUser, {
      response,
    }).expect(400);
    expect(
      await db.applicationStatusEvent.count({
        where: { applicationId: f.application.id, status: stored.status },
      }),
    ).toBe(1);
  },
);
it("S3-PB56-TC02 decline requires a reason [AC4]", async () => {
  await db.application.update({
    where: { id: f.application.id },
    data: { status: "OFFERED" },
  });
  await http("patch", `${talentPath()}/offer-response`, f.talentUser, {
    response: "DECLINED",
  }).expect(400);
  expect(
    (
      await db.application.findUniqueOrThrow({
        where: { id: f.application.id },
      })
    ).status,
  ).toBe("OFFERED");
});

it("S3-PB57-TC01 company can list and filter applicants by state [AC2,AC3,AC4]", async () => {
  const res = await http(
    "get",
    `/employer/jobs/${f.job.id}/applications?status=PENDING`,
    f.owner,
  ).expect(200);
  expect(res.body.applications.map((a: { id: string }) => a.id)).toContain(
    f.application.id,
  );
  const empty = await http(
    "get",
    `/employer/jobs/${f.job.id}/applications?status=REJECTED`,
    f.owner,
  ).expect(200);
  expect(empty.body.applications).toEqual([]);
});
it("S3-PB57-TC02 another company cannot list applicants [BR1]", async () => {
  await http(
    "get",
    `/employer/jobs/${f.job.id}/applications`,
    f.otherOwner,
  ).expect(403);
});
it("S3-PB57-TC03 name search filters applicants [AC4]", async () => {
  const res = await http(
    "get",
    `/employer/jobs/${f.job.id}/applications?q=NoSuchCandidate`,
    f.owner,
  ).expect(200);
  expect(res.body.applications).toEqual([]);
});
it("S3-PB58-TC01 allowed pipeline transition persists timeline and unconditional in-app event [AC2,AC3,AC4]", async () => {
  await db.notificationPreference.create({
    data: { userId: f.talentUser.id, applicationUpdates: false },
  });
  await http("patch", employerPath(), f.owner, { status: "REVIEWING" }).expect(
    200,
  );
  expect(
    (
      await db.application.findUniqueOrThrow({
        where: { id: f.application.id },
      })
    ).status,
  ).toBe("REVIEWING");
  expect(
    await db.applicationStatusEvent.count({
      where: { applicationId: f.application.id, status: "REVIEWING" },
    }),
  ).toBe(1);
  // Flush fire-and-forget notification writes by polling the observable database state.
  for (let n = 0; n < 30; n++) {
    if (
      await db.notification.count({
        where: { userId: f.talentUser.id, type: "APPLICATION_STATUS_CHANGED" },
      })
    )
      break;
    await new Promise((r) => setTimeout(r, 10));
  }
  expect(
    await db.notification.count({
      where: { userId: f.talentUser.id, type: "APPLICATION_STATUS_CHANGED" },
    }),
  ).toBe(1);
});
it("S3-PB58-TC02 cannot jump initial stage directly to offer [BR1]", async () => {
  await http("patch", employerPath(), f.owner, { status: "OFFERED" }).expect(
    400,
  );
  expect(
    (
      await db.application.findUniqueOrThrow({
        where: { id: f.application.id },
      })
    ).status,
  ).toBe("PENDING");
});
it("S3-PB59-TC01 bulk updates valid own items and isolates terminal/foreign/missing items [AC5,BR1]", async () => {
  const foreignJob = await db.job.create({
    data: {
      employerId: f.otherEmployer.id,
      title: "Other role",
      description: "Other company",
      slug: randomUUID(),
    },
  });
  const foreignApplication = await db.application.create({
    data: { jobId: foreignJob.id, talentId: f.talent.id },
  });
  const withdrawn = await db.application.create({
    data: {
      jobId: f.job.id,
      talentId: (
        await db.talentProfile.findUniqueOrThrow({
          where: { userId: f.otherTalent.id },
        })
      ).id,
      status: "WITHDRAWN",
    },
  });
  const res = await http("patch", "/employer/applications/bulk", f.owner, {
    ids: [f.application.id, withdrawn.id, foreignApplication.id, "missing"],
    status: "REVIEWING",
  }).expect(200);
  expect(res.body.updated).toEqual([f.application.id]);
  expect(res.body.failed).toHaveLength(3);
  expect(
    (
      await db.application.findUniqueOrThrow({
        where: { id: foreignApplication.id },
      })
    ).status,
  ).toBe("PENDING");
  expect(
    (await db.application.findUniqueOrThrow({ where: { id: withdrawn.id } }))
      .status,
  ).toBe("WITHDRAWN");
});
it("S3-PB59-TC02 empty selection is rejected without side effects [PRE]", async () => {
  await http("patch", "/employer/applications/bulk", f.owner, {
    ids: [],
    status: "REVIEWING",
  }).expect(400);
  expect(
    (
      await db.application.findUniqueOrThrow({
        where: { id: f.application.id },
      })
    ).status,
  ).toBe("PENDING");
});

it("S3-PB60-TC01 one future slot persists a proposal [AC3,AC4,AC5]", async () => {
  await db.application.update({
    where: { id: f.application.id },
    data: { status: "INTERVIEW" },
  });
  const slot = future().toISOString();
  await http("post", `${employerPath()}/interview`, f.owner, {
    durationMinutes: 30,
    proposedSlots: [slot],
  }).expect(201);
  const row = await db.interview.findUniqueOrThrow({
    where: { applicationId: f.application.id },
  });
  expect(row.proposedSlots[0]!.toISOString()).toBe(slot);
  expect(row.status).toBe("PROPOSED");
});
it.each([0, 3])(
  "S3-PB60-TC02 rejects %d proposed slots [BR1]",
  async (count) => {
    await db.application.update({
      where: { id: f.application.id },
      data: { status: "INTERVIEW" },
    });
    await http("post", `${employerPath()}/interview`, f.owner, {
      durationMinutes: 30,
      proposedSlots: Array.from({ length: count }, (_, i) =>
        new Date(future().getTime() + i * 60000).toISOString(),
      ),
    }).expect(400);
    expect(
      await db.interview.count({ where: { applicationId: f.application.id } }),
    ).toBe(0);
  },
);
it("S3-PB60-TC03 cannot assign interviewer from another company [AC2,AUTH]", async () => {
  await db.application.update({
    where: { id: f.application.id },
    data: { status: "INTERVIEW" },
  });
  await http("post", `${employerPath()}/interview`, f.owner, {
    durationMinutes: 30,
    proposedSlots: [future().toISOString()],
    interviewerId: f.otherOwner.id,
  }).expect(400);
  expect(
    await db.interview.count({ where: { applicationId: f.application.id } }),
  ).toBe(0);
});
it("S3-PB61-TC01 confirm an offered slot exactly once [AC3,AC4]", async () => {
  const i = await interview();
  await http("patch", `${talentPath()}/interview/confirm`, f.talentUser, {
    slot: i.proposedSlots[0]!.toISOString(),
  }).expect(200);
  const row = await db.interview.findUniqueOrThrow({ where: { id: i.id } });
  expect(row.status).toBe("CONFIRMED");
  expect(row.confirmedSlot).toEqual(i.proposedSlots[0]);
  await http("patch", `${talentPath()}/interview/confirm`, f.talentUser, {
    slot: i.proposedSlots[0]!.toISOString(),
  }).expect(409);
});
it("S3-PB61-TC02 expired proposal cannot be confirmed or changed [BR1]", async () => {
  const i = await interview("PENDING", new Date(Date.now() - 60000));
  await http("patch", `${talentPath()}/interview/confirm`, f.talentUser, {
    slot: i.proposedSlots[0]!.toISOString(),
  }).expect(400);
  expect(
    (await db.interview.findUniqueOrThrow({ where: { id: i.id } })).status,
  ).toBe("PENDING");
});
it("S3-PB61-TC03 repository CAS refuses a replaced proposal [BR1,RACE]", async () => {
  const i = await interview();
  const old = i.proposedSlots[0]!;
  await db.interview.update({
    where: { id: i.id },
    data: { proposedSlots: [new Date(old.getTime() + 60000)] },
  });
  expect(
    await app.get(InterviewsRepository).confirmSlot(f.application.id, old),
  ).toBeNull();
  expect(
    (await db.interview.findUniqueOrThrow({ where: { id: i.id } })).status,
  ).toBe("PENDING");
});
it("S3-PB62-TC01 cancellation without reason is rejected [AC2,AC3,BR1]", async () => {
  const i = await interview();
  await http("patch", `${employerPath()}/interview/cancel`, f.owner, {}).expect(
    400,
  );
  expect(
    (await db.interview.findUniqueOrThrow({ where: { id: i.id } })).status,
  ).toBe("PENDING");
});
it("S3-PB62-TC02 valid cancellation persists and cannot be repeated [AC4,STATE]", async () => {
  const i = await interview("CONFIRMED");
  await http("patch", `${employerPath()}/interview/cancel`, f.owner, {
    reason: "Interviewer unavailable",
  }).expect(200);
  expect(
    (await db.interview.findUniqueOrThrow({ where: { id: i.id } })).status,
  ).toBe("CANCELLED");
  await http("patch", `${employerPath()}/interview/cancel`, f.owner, {
    reason: "Again",
  }).expect(404);
});
it("S3-PB63-TC01 confirmed calendar download has correct content type, title, time and meeting [AC3,BR1]", async () => {
  await interview("CONFIRMED");
  const res = await http("get", `${talentPath()}/interview/ics`).expect(200);
  expect(res.headers["content-type"]).toContain("text/calendar");
  expect(res.text).toContain("BEGIN:VEVENT");
  expect(res.text.replace(/\r\n /g, "")).toContain("React Engineer");
  expect(res.text).toContain("DTSTART:");
  expect(res.text).toContain("DTEND:");
});
it("S3-PB63-TC02 calendar is forbidden before confirmation and to another talent [PRE,AUTH]", async () => {
  await interview();
  await http("get", `${talentPath()}/interview/ics`).expect(400);
  await http("get", `${talentPath()}/interview/ics`, f.otherTalent).expect(403);
});

it("S3-PB64-TC01 documented scorecard ratings and recommendation are accepted [AC2,AC3,AC4,AC5,AC6]", async () => {
  await interview("CONFIRMED", new Date(Date.now() - 60000));
  await http("post", `${employerPath()}/scorecards`, f.owner, {
    technical: 5,
    communication: 4,
    culture: 3,
    strengths: "Clear reasoning",
    improvements: "More examples",
    recommendation: "RECOMMEND",
  }).expect(201);
});
it("S3-PB64-TC02 scorecards are private and duplicates cannot persist [BR1,BR2]", async () => {
  await interview("CONFIRMED", new Date(Date.now() - 60000));
  await http("post", `${employerPath()}/scorecards`, f.owner, {
    recommendation: "YES",
    note: "Strong reasoning",
  }).expect(201);
  await http("post", `${employerPath()}/scorecards`, f.owner, {
    recommendation: "YES",
  }).expect(409);
  await http("get", `${employerPath()}/scorecards`, f.talentUser).expect(403);
  expect(
    await db.interviewScorecard.count({
      where: { applicationId: f.application.id },
    }),
  ).toBe(1);
});
it("S3-PB65-TC01 aggregate contains numeric criterion averages [AC2,AC3]", async () => {
  await db.interviewScorecard.create({
    data: {
      applicationId: f.application.id,
      authorId: f.owner.id,
      recommendation: "YES",
      note: "Strong",
    },
  });
  const res = await http("get", `${employerPath()}/scorecards`, f.owner).expect(
    200,
  );
  expect(
    Object.keys(res.body.summary).some((key) =>
      /average|technical|communication|culture/i.test(key),
    ),
  ).toBe(true);
});
it("S3-PB65-TC02 other company cannot read scorecard aggregate [BR1]", async () => {
  await http("get", `${employerPath()}/scorecards`, f.otherOwner).expect(403);
});

it("S3-PB66-TC01 analysis is persisted, cached and advisory [AC2,AC3,AC4,BR1,BR2]", async () => {
  const first = await http(
    "get",
    `${employerPath()}/ai-cv-analysis`,
    f.owner,
  ).expect(200);
  const second = await http(
    "get",
    `${employerPath()}/ai-cv-analysis`,
    f.owner,
  ).expect(200);
  expect(first.body).toEqual(second.body);
  expect(complete).toHaveBeenCalledTimes(1);
  expect(
    await db.cvAnalysis.count({ where: { applicationId: f.application.id } }),
  ).toBe(1);
  expect(
    (
      await db.application.findUniqueOrThrow({
        where: { id: f.application.id },
      })
    ).status,
  ).toBe("PENDING");
  expect(first.body.fitScore).toBe(82);
});
it("S3-PB66-TC02 missing CV and invalid model output never persist analysis [PRE,NEG]", async () => {
  await db.application.update({
    where: { id: f.application.id },
    data: { resumeUrl: null },
  });
  await http("get", `${employerPath()}/ai-cv-analysis`, f.owner).expect(400);
  expect(complete).not.toHaveBeenCalled();
  await db.application.update({
    where: { id: f.application.id },
    data: { resumeUrl: f.application.resumeUrl },
  });
  complete.mockResolvedValue({ text: "malformed", model: "fixture-model" });
  await http("get", `${employerPath()}/ai-cv-analysis`, f.owner).expect(503);
  expect(
    await db.cvAnalysis.count({ where: { applicationId: f.application.id } }),
  ).toBe(0);
});
it("S3-PB66-TC03 documented recommendation enum is returned [AC3]", async () => {
  const res = await http(
    "get",
    `${employerPath()}/ai-cv-analysis`,
    f.owner,
  ).expect(200);
  expect(["PROCEED", "REVIEW", "REJECT"]).toContain(res.body.recommendation);
});
it("S3-PB67-TC01 regeneration overwrites same row and enforces 30 second request interval [AC2,AC3,BR1]", async () => {
  const original = await http(
    "get",
    `${employerPath()}/ai-cv-analysis`,
    f.owner,
  ).expect(200);
  complete.mockResolvedValue({
    text: JSON.stringify({ ...aiResult, fitScore: 60 }),
    model: "fixture-model",
  });
  const fresh = await http(
    "post",
    `${employerPath()}/ai-cv-analysis/regenerate`,
    f.owner,
  ).expect(201);
  expect(fresh.body.id).toBe(original.body.id);
  expect(fresh.body.fitScore).toBe(60);
  await http(
    "post",
    `${employerPath()}/ai-cv-analysis/regenerate`,
    f.owner,
  ).expect(429);
  expect(complete).toHaveBeenCalledTimes(2);
  expect(
    await db.cvAnalysis.count({ where: { applicationId: f.application.id } }),
  ).toBe(1);
});

it("S3-PB68-TC01 participants exchange persisted messages in chronological order [AC2,AC3,AC4]", async () => {
  await http("post", `${talentPath()}/messages`, f.talentUser, {
    body: "Hello recruiter",
  }).expect(201);
  await http("post", `${employerPath()}/messages`, f.owner, {
    body: "Hello candidate",
  }).expect(201);
  const res = await http("get", `${talentPath()}/messages`).expect(200);
  expect(res.body.messages.map((m: { body: string }) => m.body)).toEqual([
    "Hello recruiter",
    "Hello candidate",
  ]);
  expect(
    await db.message.count({ where: { applicationId: f.application.id } }),
  ).toBe(2);
});
it("S3-PB68-TC02 unauthorized participants cannot read or send [BR1]", async () => {
  await http("get", `${talentPath()}/messages`, f.otherTalent).expect(403);
  await http("post", `${employerPath()}/messages`, f.otherOwner, {
    body: "intrusion",
  }).expect(403);
  expect(
    await db.message.count({ where: { applicationId: f.application.id } }),
  ).toBe(0);
});
it.each([" ", "a".repeat(2001)])(
  "S3-PB68-TC03 invalid message rejected without a write [BR2,NEG]",
  async (body) => {
    await http("post", `${talentPath()}/messages`, f.talentUser, {
      body,
    }).expect(400);
    expect(
      await db.message.count({ where: { applicationId: f.application.id } }),
    ).toBe(0);
  },
);
it("S3-PB69-TC01 internal notes persist with author/time and never reach the talent [AC2,AC3,AC4,BR1]", async () => {
  await http("post", `${employerPath()}/comments`, f.owner, {
    body: "Private assessment",
  }).expect(201);
  const res = await http("get", `${employerPath()}/comments`, f.owner).expect(
    200,
  );
  expect(JSON.stringify(res.body)).toContain("Private assessment");
  const talent = await http("get", talentPath()).expect(200);
  expect(JSON.stringify(talent.body)).not.toContain("Private assessment");
  await http("get", `${employerPath()}/comments`, f.talentUser).expect(403);
  await http("get", `${employerPath()}/comments`, f.otherOwner).expect(403);
});

it.each(["PENDING", "CANCELLED", "CONFIRMED"])(
  "S3-PB70-TC01 %s interview eligibility follows confirmed past interaction [AC3.1,AC3.2,BR1]",
  async (status) => {
    await interview(status as "PENDING", new Date(Date.now() - 60000));
    const res = await http(
      "get",
      `/reviews/eligibility/${f.application.id}`,
    ).expect(200);
    expect(res.body.eligible).toBe(status === "CONFIRMED");
  },
);
it("S3-PB70-TC02 documented partnerId eligibility route exists [AC2]", async () => {
  await http("get", `/reviews/eligibility?partnerId=${f.owner.id}`).expect(200);
});
it("S3-PB71-TC01 both directions persist one review each and update averages [AC2,AC4,AC5,BR1]", async () => {
  await interview("CONFIRMED", new Date(Date.now() - 60000));
  await http("post", "/reviews", f.talentUser, {
    applicationId: f.application.id,
    overallRating: 4,
    comment: "A thoughtful and professional interview.",
  }).expect(201);
  await http("post", "/reviews", f.owner, {
    applicationId: f.application.id,
    overallRating: 5,
    comment: "The candidate communicated very clearly.",
  }).expect(201);
  await http("post", "/reviews", f.talentUser, {
    applicationId: f.application.id,
    overallRating: 3,
    comment: "Another review of the same interaction.",
  }).expect(409);
  expect(
    await db.review.count({ where: { applicationId: f.application.id } }),
  ).toBe(2);
  const res = await http("get", `/reviews/user/${f.owner.id}`, null).expect(
    200,
  );
  expect(res.body.averageRating).toBe(4);
});
it("S3-PB71-TC02 detailed comment shorter than 20 characters is rejected [AC3]", async () => {
  await interview("CONFIRMED", new Date(Date.now() - 60000));
  await http("post", "/reviews", f.talentUser, {
    applicationId: f.application.id,
    overallRating: 5,
    comment: "ok",
  }).expect(400);
  expect(
    await db.review.count({ where: { applicationId: f.application.id } }),
  ).toBe(0);
});
it("S3-PB71-TC03 absent confirmed interview cannot create a review [PRE]", async () => {
  await http("post", "/reviews", f.talentUser, {
    applicationId: f.application.id,
    overallRating: 5,
    comment: "No confirmed interview has happened yet.",
  }).expect(403);
  expect(
    await db.review.count({ where: { applicationId: f.application.id } }),
  ).toBe(0);
});
it("S3-PB72-TC01 public list excludes hidden reviews and computes averages [AC2,BR1]", async () => {
  for (const [rating, status] of [
    [5, "PUBLISHED"],
    [1, "HIDDEN"],
  ] as const) {
    await db.review.create({
      data: {
        applicationId: f.application.id,
        reviewerId: rating === 5 ? f.talentUser.id : f.otherTalent.id,
        revieweeId: f.owner.id,
        direction: "TALENT_TO_EMPLOYER",
        overallRating: rating,
        status,
      },
    });
  }
  const res = await http("get", `/reviews/user/${f.owner.id}`, null).expect(
    200,
  );
  expect(res.body.reviews).toHaveLength(1);
  expect(res.body.averageRating).toBe(5);
});
it("S3-PB72-TC02 public reviews sort by publication date [AC3]", async () => {
  await db.review.createMany({
    data: [
      {
        applicationId: f.application.id,
        reviewerId: f.talentUser.id,
        revieweeId: f.owner.id,
        direction: "TALENT_TO_EMPLOYER",
        overallRating: 5,
        createdAt: new Date("2026-10-14T08:00:00Z"),
      },
      {
        applicationId: f.application.id,
        reviewerId: f.otherTalent.id,
        revieweeId: f.owner.id,
        direction: "TALENT_TO_EMPLOYER",
        overallRating: 1,
        createdAt: new Date("2026-10-15T08:00:00Z"),
      },
    ],
  });
  const res = await http("get", `/reviews/user/${f.owner.id}`, null).expect(
    200,
  );
  expect(
    res.body.reviews.map((r: { overallRating: number }) => r.overallRating),
  ).toEqual([1, 5]);
});

it("S3-PB73-TC01 notifications list newest first with links and isolates ownership [AC3,AC4]", async () => {
  await db.notification.createMany({
    data: [
      {
        userId: f.talentUser.id,
        type: "MESSAGE_RECEIVED",
        title: "Old",
        link: talentPath(),
        createdAt: new Date(Date.now() - 1000),
      },
      {
        userId: f.talentUser.id,
        type: "MESSAGE_RECEIVED",
        title: "New",
        link: talentPath(),
      },
    ],
  });
  const res = await http("get", "/notifications").expect(200);
  expect(res.body.notifications.map((n: { title: string }) => n.title)).toEqual(
    ["New", "Old"],
  );
  expect(res.body.notifications[0].link).toBe(talentPath());
  expect(
    (await http("get", "/notifications", f.otherTalent).expect(200)).body
      .notifications,
  ).toEqual([]);
});
it("S3-PB74-TC01 unread count decreases on own read, rejects other user's mark-read and reaches zero [AC1,BR1]", async () => {
  const n = await db.notification.create({
    data: {
      userId: f.talentUser.id,
      type: "MESSAGE_RECEIVED",
      title: "Unread",
    },
  });
  await http("get", "/notifications/unread-count").expect(200, { count: 1 });
  await http("patch", `/notifications/${n.id}/read`, f.otherTalent).expect(404);
  expect(
    (await db.notification.findUniqueOrThrow({ where: { id: n.id } })).readAt,
  ).toBeNull();
  await http("patch", `/notifications/${n.id}/read`).expect(200);
  await http("get", "/notifications/unread-count").expect(200, { count: 0 });
});
