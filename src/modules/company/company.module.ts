import { Module } from "@nestjs/common";
import { CompanyMembershipService } from "./company-membership.service";
import { CompanyMembershipRepository } from "./company-membership.repository";

@Module({
  providers: [CompanyMembershipService, CompanyMembershipRepository],
  exports: [CompanyMembershipService],
})
export class CompanyModule {}
