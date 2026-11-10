import { collectPersonalData } from "./personal-data-collector";
import type { PrismaService } from "@/core/database/prisma.service";

function setup() {
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(0),
    $queryRaw: jest
      .fn()
      .mockResolvedValue([{ at: new Date("2026-11-10T00:00:00Z") }]),
    user: {
      findUnique: jest.fn().mockResolvedValue({
        id: "u",
        email: "unit@example.test",
        role: "TALENT",
      }),
    },
    talentProfile: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ id: "t", headline: "Engineer" }),
    },
    employerProfile: { findUnique: jest.fn().mockResolvedValue(null) },
    workExperience: { findMany: jest.fn().mockResolvedValue([]) },
    profileHighlight: { findMany: jest.fn().mockResolvedValue([]) },
    talentSkill: { findMany: jest.fn().mockResolvedValue([]) },
    application: { findMany: jest.fn().mockResolvedValue([]) },
    applicationStatusEvent: { findMany: jest.fn().mockResolvedValue([]) },
    message: { findMany: jest.fn().mockResolvedValue([]) },
    jobAlert: { findMany: jest.fn().mockResolvedValue([]) },
    job: { findMany: jest.fn().mockResolvedValue([]) },
    notificationPreference: { findUnique: jest.fn().mockResolvedValue(null) },
  };
  const prisma = { $transaction: jest.fn((fn) => fn(tx)) };
  return {
    tx,
    prisma,
    collect: () => collectPersonalData(prisma as unknown as PrismaService, "u"),
  };
}
describe("PB17 explicit collection boundary", () => {
  it("uses one read-only repeatable-read snapshot and no include-all queries", async () => {
    const { tx, prisma, collect } = setup();
    const result = await collect();
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "RepeatableRead",
      timeout: 20000,
      maxWait: 5000,
    });
    expect(tx.$executeRaw.mock.calls[0][0].join("")).toBe(
      "SET TRANSACTION READ ONLY",
    );
    expect(result?.exportSnapshotAt.toISOString()).toBe(
      "2026-11-10T00:00:00.000Z",
    );
    for (const model of [
      tx.user,
      tx.talentProfile,
      tx.employerProfile,
      tx.notificationPreference,
    ]) {
      for (const args of model.findUnique.mock.calls.map((call) => call[0])) {
        expect(args).toHaveProperty("where");
        expect(args).toHaveProperty("select");
        expect(JSON.stringify(args)).not.toContain('"include"');
      }
    }
    const select = tx.application.findMany.mock.calls[0][0].select;
    for (const key of [
      "notes",
      "comments",
      "scorecards",
      "cvAnalysis",
      "lastReminderSentAt",
      "cvAnalysisRegeneratedAt",
    ])
      expect(select).not.toHaveProperty(key);
    expect(select).toHaveProperty("rejectionReason", true);
  });
  it("filters each high-volume relation by the authenticated owner", async () => {
    const { tx, collect } = setup();
    await collect();
    expect(tx.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "u" } }),
    );
    for (const model of [
      tx.application,
      tx.workExperience,
      tx.profileHighlight,
      tx.talentSkill,
    ])
      expect(model.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { talent: { userId: "u" } } }),
      );
    expect(tx.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          senderId: "u",
          application: { OR: [{ talent: { userId: "u" } }] },
        },
      }),
    );
    expect(tx.jobAlert.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "u" } }),
    );
    expect(tx.notificationPreference.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "u" } }),
    );
  });
  it("reads beyond the first batch without truncation and preserves message text verbatim", async () => {
    const { tx, collect } = setup();
    const body =
      "Dữ liệu tiếng Việt <script>alert(1)</script>\naccessToken là tên biến hợp lệ trong nội dung.";
    const messages = Array.from({ length: 103 }, (_, i) => ({
      id: `m${String(i).padStart(3, "0")}`,
      applicationId: "a",
      body,
      createdAt: new Date(1000000 + i),
    }));
    tx.message.findMany
      .mockResolvedValueOnce(messages.slice(0, 100))
      .mockResolvedValueOnce(messages.slice(100));
    const result = await collect();
    expect(result?.messages).toHaveLength(103);
    expect(result?.messages[102]?.body).toBe(body);
    expect(tx.message.findMany.mock.calls[1][0]).toMatchObject({
      cursor: { id: "m099" },
      skip: 1,
      take: 100,
      orderBy: { id: "asc" },
    });
  });
});
