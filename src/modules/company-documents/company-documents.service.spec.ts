import { CompanyDocumentsService } from "./company-documents.service";
import type { AuthenticatedUser } from "@/common/interfaces/authenticated-user.interface";

const owner = { id: "owner", role: "EMPLOYER" } as AuthenticatedUser;
const admin = { id: "admin", role: "ADMIN" } as AuthenticatedUser;
function setup() {
  const tx = {
    $queryRaw: jest.fn(),
    companyVerificationDocument: {
      findUnique: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
      create: jest
        .fn()
        .mockResolvedValue({ id: "doc", filename: "document.pdf" }),
    },
  };
  const prisma = {
    companyVerificationDocument: { findMany: jest.fn(), findFirst: jest.fn() },
    $transaction: jest.fn((fn) => fn(tx)),
  };
  const members = {
    resolveMembership: jest
      .fn()
      .mockResolvedValue({ employerId: "company", role: "OWNER" }),
  };
  return {
    tx,
    prisma,
    members,
    service: new CompanyDocumentsService(prisma as never, members as never),
  };
}
describe("PB83 private company attachments", () => {
  it("lists only the resolved company metadata, never contents or hashes", async () => {
    const { service, prisma } = setup();
    await service.list(owner);
    expect(prisma.companyVerificationDocument.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { employerId: "company" },
        select: { id: true, filename: true, byteLength: true, createdAt: true },
      }),
    );
  });
  it("rejects a client-selected foreign company and non-owner membership", async () => {
    const { service, members } = setup();
    await expect(service.list(owner, "other")).rejects.toMatchObject({
      status: 403,
    });
    members.resolveMembership.mockResolvedValue({
      employerId: "company",
      role: "RECRUITER",
    });
    await expect(service.list(owner)).rejects.toMatchObject({ status: 403 });
  });
  it("administrator lists a company explicitly, while download filters owner membership", async () => {
    const { service, prisma } = setup();
    await expect(service.list(admin)).rejects.toMatchObject({ status: 400 });
    await service.list(admin, "company");
    prisma.companyVerificationDocument.findFirst.mockResolvedValue(null);
    await expect(service.download(owner, "other-doc")).rejects.toMatchObject({
      status: 404,
    });
    expect(prisma.companyVerificationDocument.findFirst).toHaveBeenCalledWith({
      where: { id: "other-doc", employerId: "company" },
      select: { filename: true, contents: true },
    });
  });
  it("rejects missing files, HTML disguised as PDF and oversized buffers", async () => {
    const { service, tx } = setup();
    await expect(service.upload(owner)).rejects.toMatchObject({ status: 400 });
    for (const buffer of [
      Buffer.from("<html>not PDF</html>"),
      Buffer.alloc(5 * 1024 * 1024 + 1),
    ])
      await expect(
        service.upload(owner, {
          buffer,
          size: buffer.length,
          mimetype: "application/pdf",
          originalname: "file.pdf",
        }),
      ).rejects.toMatchObject({ status: 400 });
    expect(tx.companyVerificationDocument.create).not.toHaveBeenCalled();
  });
  it("deduplicates uploaded bytes under a transaction lock before checking capacity", async () => {
    const { service, tx } = setup();
    const buffer = Buffer.from(
      "%PDF-1.7\ncontrolled validation fixture\n%%EOF",
    );
    const file = {
      buffer,
      size: buffer.length,
      mimetype: "application/pdf",
      originalname: "unsafe\r\nname.pdf",
    };
    await service.upload(owner, file);
    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(tx.companyVerificationDocument.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          employerId: "company",
          filename: "unsafe__name.pdf",
          contents: buffer,
        }),
      }),
    );
    tx.companyVerificationDocument.findUnique.mockResolvedValue({
      id: "existing",
    });
    tx.companyVerificationDocument.count.mockResolvedValue(10);
    await expect(service.upload(owner, file)).resolves.toEqual({
      id: "existing",
    });
    expect(tx.companyVerificationDocument.create).toHaveBeenCalledTimes(1);
  });
  it("fails safely at the storage cap without writing a partial record", async () => {
    const { service, tx } = setup();
    tx.companyVerificationDocument.count.mockResolvedValue(10);
    const buffer = Buffer.from("%PDF-1.7\nfixture\n%%EOF");
    await expect(
      service.upload(owner, {
        buffer,
        size: buffer.length,
        mimetype: "application/pdf",
        originalname: "file.pdf",
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(tx.companyVerificationDocument.create).not.toHaveBeenCalled();
  });
});
