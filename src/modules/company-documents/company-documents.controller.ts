import {
  CanActivate,
  Injectable,
  ExecutionContext,
  Controller,
  Get,
  Post,
  Param,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  Header,
  Res,
  StreamableFile,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiConsumes,
  ApiBody,
  ApiResponse,
} from "@nestjs/swagger";
import type { Response, Request } from "express";
import { z } from "zod";
import { JwtAuthGuard } from "@/core/guards/jwt-auth.guard";
import { RolesGuard } from "@/core/guards/roles.guard";
import { Roles } from "@/core/decorators/roles.decorator";
import { CurrentUser } from "@/core/decorators/current-user.decorator";
import { ZodValidationPipe } from "@/core/pipes/zod-validation.pipe";
import { RateLimitService } from "@/common/services/rate-limit.service";
import type { AuthenticatedUser } from "@/common/interfaces/authenticated-user.interface";
import {
  CompanyDocumentsService,
  MAX_COMPANY_PDF_BYTES,
  type CompanyPdfUpload,
} from "./company-documents.service";

@Injectable()
export class CompanyDocumentUploadGuard implements CanActivate {
  constructor(
    private readonly documents: CompanyDocumentsService,
    private readonly rates: RateLimitService,
  ) {}
  async canActivate(context: ExecutionContext) {
    const user = context
      .switchToHttp()
      .getRequest<Request & { user: AuthenticatedUser }>().user;
    this.rates.enforce(`company-document-upload:${user.id}`, 6, 60_000);
    await this.documents.ownerCompany(user);
    return true;
  }
}
@ApiTags("company-documents")
@ApiBearerAuth()
@Controller("company-documents")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("EMPLOYER", "ADMIN")
export class CompanyDocumentsController {
  constructor(
    private readonly documents: CompanyDocumentsService,
    private readonly rates: RateLimitService,
  ) {}
  @Get()
  @Header("Cache-Control", "no-store")
  @ApiOperation({
    summary:
      "List private verification attachments; OWNER own company or ADMIN reviewing employerId",
  })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query("employerId", new ZodValidationPipe(z.string().cuid().optional()))
    employerId?: string,
  ) {
    this.rates.enforce(`company-document-list:${user.id}`, 60, 60_000);
    return this.documents.list(user, employerId);
  }
  @Post()
  @Roles("EMPLOYER")
  @UseGuards(CompanyDocumentUploadGuard)
  @UseInterceptors(
    FileInterceptor("file", {
      limits: {
        fileSize: MAX_COMPANY_PDF_BYTES,
        files: 1,
        fields: 0,
        parts: 2,
      },
    }),
  )
  @Header("Cache-Control", "no-store")
  @ApiOperation({
    summary:
      "Attach a private PDF for company verification (OWNER only); duplicate bytes are idempotent",
  })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      required: ["file"],
      properties: { file: { type: "string", format: "binary" } },
    },
  })
  @ApiResponse({ status: 413, description: "PDF exceeds 5 MiB" })
  upload(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file?: CompanyPdfUpload,
  ) {
    return this.documents.upload(user, file);
  }
  @Get(":id")
  @ApiOperation({
    summary:
      "Download private verification PDF; OWNER own company or ADMIN only",
  })
  @ApiResponse({
    status: 200,
    content: {
      "application/pdf": { schema: { type: "string", format: "binary" } },
    },
  })
  async download(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", new ZodValidationPipe(z.string().cuid())) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.rates.enforce(`company-document-download:${user.id}`, 30, 60_000);
    const doc = await this.documents.download(user, id);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="company-document.pdf"; filename*=UTF-8''${encodeURIComponent(doc.filename)}`,
    );
    return new StreamableFile(doc.contents);
  }
}
