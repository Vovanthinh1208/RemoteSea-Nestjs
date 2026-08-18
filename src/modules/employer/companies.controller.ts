import { Controller, Get, Param } from "@nestjs/common";
import { EmployerService } from "./employer.service";
import { ApiCompaniesTag, ApiGetCompanyProfile } from "./docs/employer.swagger";

// Separate controller (distinct "companies" path prefix, no guards) rather
// than a new route on EmployerController — that controller's routes are all
// self-service/authenticated ("my profile", "my jobs"); this one is the
// public-by-slug counterpart, same split as TalentController's `me` vs
// `:slug` routes but as two controllers instead of one, since "companies"
// isn't just a shorter alias for "employer" in the URL.
@ApiCompaniesTag()
@Controller("companies")
export class CompaniesController {
  constructor(private readonly employerService: EmployerService) {}

  @ApiGetCompanyProfile()
  @Get(":slug")
  async getPublicProfile(@Param("slug") slug: string) {
    return this.employerService.getPublicCompanyProfile(slug);
  }
}
