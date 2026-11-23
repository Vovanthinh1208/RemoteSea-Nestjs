import { Module } from "@nestjs/common";
import { CompanyModule } from "@/modules/company/company.module";
import {
  CompanyDocumentsController,
  CompanyDocumentUploadGuard,
} from "./company-documents.controller";
import { CompanyDocumentsService } from "./company-documents.service";
@Module({
  imports: [CompanyModule],
  controllers: [CompanyDocumentsController],
  providers: [CompanyDocumentsService, CompanyDocumentUploadGuard],
})
export class CompanyDocumentsModule {}
