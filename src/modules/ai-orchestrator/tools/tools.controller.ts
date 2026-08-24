import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { OrchestratorAuthGuard } from "../guards/orchestrator-auth.guard";
import { CurrentResource } from "@/common/authorization/current-resource.decorator";
import { Roles } from "@/core/decorators/roles.decorator";
import { RolesGuard } from "@/core/guards/roles.guard";
import { ApplicationAccessGuard } from "@/modules/employer/guards/application-access.guard";
import type { ApplicationWithJobOwner } from "@/modules/employer/guards/application-ownership.guard";
import { EmployerService } from "@/modules/employer/employer.service";
import { JobsService } from "@/modules/jobs/jobs.service";

// The AI Orchestrator's first live tools — every route here is deliberately
// read-only and reuses an existing, already-hardened guard + service method
// rather than a new authorization path: ApplicationAccessGuard is the exact
// class guarding GET /employer/applications/:id/{interview,ai-cv-analysis}
// for a real browser request, so a tool call is authorized identically to
// the human recruiter action it stands in for — same company/role check,
// same assigned-INTERVIEWER bypass, same 403/404 behavior. Nothing here
// queries Prisma directly or re-derives ownership.
@ApiTags("ai-orchestrator-tools")
@Controller("ai-orchestrator/tools")
@UseGuards(OrchestratorAuthGuard)
export class ToolsController {
  constructor(
    private readonly employerService: EmployerService,
    private readonly jobsService: JobsService,
  ) {}

  @Get("applications/:id")
  @UseGuards(RolesGuard, ApplicationAccessGuard)
  @Roles("EMPLOYER")
  getApplication(@CurrentResource() application: ApplicationWithJobOwner) {
    // Curated, not a raw Prisma dump — no talent email here (nothing calling
    // this tool needs it yet, and the spec is explicit: don't expose PII
    // that isn't needed for the task at hand).
    return {
      id: application.id,
      status: application.status,
      job: { title: application.job.title },
      talent: { name: application.talent.user.name },
    };
  }

  @Get("applications/:id/candidate-analysis")
  @UseGuards(RolesGuard, ApplicationAccessGuard)
  @Roles("EMPLOYER")
  getCandidateAnalysis(
    @CurrentResource() application: ApplicationWithJobOwner,
  ) {
    return this.employerService.getApplicationCvAnalysis(application);
  }

  @Get("applications/:id/interview")
  @UseGuards(RolesGuard, ApplicationAccessGuard)
  @Roles("EMPLOYER")
  getInterview(@CurrentResource() application: ApplicationWithJobOwner) {
    return this.employerService.getApplicationInterview(application);
  }

  // No RolesGuard/ownership guard — job detail is public data (same as
  // GET /jobs/:id, which has no guard at all), open to any authenticated
  // orchestrator context regardless of role.
  @Get("jobs/:id")
  getJob(@Param("id") id: string) {
    return this.jobsService.getActiveById(id);
  }
}
