import {
  Injectable,
  ForbiddenException,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import { PrismaService } from "@/core/database/prisma.service";
import { CompanyMembershipService } from "@/modules/company/company-membership.service";
import type { AuthenticatedUser } from "@/common/interfaces/authenticated-user.interface";

export const MAX_COMPANY_PDF_BYTES = 5 * 1024 * 1024;
const metadata = {
  id: true,
  filename: true,
  byteLength: true,
  createdAt: true,
} as const;
export interface CompanyPdfUpload {
  buffer: Buffer;
  size: number;
  mimetype: string;
  originalname: string;
}

@Injectable()
export class CompanyDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly memberships: CompanyMembershipService,
  ) {}
  async ownerCompany(user: AuthenticatedUser) {
    const membership =
      user.role === "EMPLOYER"
        ? await this.memberships.resolveMembership(user.id)
        : null;
    if (!membership || membership.role !== "OWNER")
      throw new ForbiddenException("Company OWNER access required");
    return membership.employerId;
  }
  async list(user: AuthenticatedUser, employerId?: string) {
    const company =
      user.role === "ADMIN" ? employerId : await this.ownerCompany(user);
    if (!company)
      throw new BadRequestException(
        "employerId is required for administrator review",
      );
    if (user.role !== "ADMIN" && employerId && employerId !== company)
      throw new ForbiddenException("Company OWNER access required");
    return this.prisma.companyVerificationDocument.findMany({
      where: { employerId: company },
      select: metadata,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 10,
    });
  }
  async upload(user: AuthenticatedUser, file?: CompanyPdfUpload) {
    const employerId = await this.ownerCompany(user);
    if (
      !file ||
      file.mimetype !== "application/pdf" ||
      file.size !== file.buffer.length ||
      file.size < 12 ||
      file.size > MAX_COMPANY_PDF_BYTES ||
      file.buffer.subarray(0, 5).toString() !== "%PDF-" ||
      !file.buffer.subarray(-1024).toString().includes("%%EOF")
    )
      throw new BadRequestException("Upload a PDF document up to 5 MiB");
    const filename =
      Array.from(file.originalname, (char) =>
        char.charCodeAt(0) < 32 ||
        char.charCodeAt(0) === 127 ||
        '/\\"'.includes(char)
          ? "_"
          : char,
      )
        .join("")
        .slice(0, 180) || "company-document.pdf";
    const sha256 = createHash("sha256").update(file.buffer).digest("hex");
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM employer_profiles WHERE id=${employerId} FOR UPDATE`;
      const existing = await tx.companyVerificationDocument.findUnique({
        where: { employerId_sha256: { employerId, sha256 } },
        select: metadata,
      });
      if (existing) return existing;
      if (
        (await tx.companyVerificationDocument.count({
          where: { employerId },
        })) >= 10
      )
        throw new BadRequestException(
          "A company can attach up to 10 verification documents",
        );
      return tx.companyVerificationDocument.create({
        data: {
          employerId,
          filename,
          sha256,
          byteLength: file.size,
          contents: file.buffer,
        },
        select: metadata,
      });
    });
  }
  async download(user: AuthenticatedUser, id: string) {
    const employerId =
      user.role === "ADMIN" ? undefined : await this.ownerCompany(user);
    const document = await this.prisma.companyVerificationDocument.findFirst({
      where: { id, ...(employerId && { employerId }) },
      select: { filename: true, contents: true },
    });
    if (!document) throw new NotFoundException("Document not found");
    return document;
  }
}
