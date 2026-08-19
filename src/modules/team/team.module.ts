import { Module } from "@nestjs/common";
import { TeamController } from "./team.controller";
import { TeamService } from "./team.service";
import { TeamRepository } from "./team.repository";
import { CompanyMemberOwnershipGuard } from "./guards/company-member-ownership.guard";
import { CompanyModule } from "@/modules/company/company.module";

// "Which company do I belong to, with what role" lives in CompanyModule, not
// here — Team is the invite/accept/manage-members *feature*, a consumer of
// that lookup like Jobs/Employer/Interviews, not its owner. Nothing outside
// this module depends on TeamService anymore.
@Module({
  imports: [CompanyModule],
  controllers: [TeamController],
  providers: [TeamService, TeamRepository, CompanyMemberOwnershipGuard],
})
export class TeamModule {}
